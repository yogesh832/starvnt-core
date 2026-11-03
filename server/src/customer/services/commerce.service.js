import { serviceMatchingEligible } from '../../common/vendorReadiness.js';
import { syncBookingTruth, cancelOwnedBooking } from './bookingTruth.service.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';
import { checkTrueAvailability } from '../../external/services/availability.service.js';
import { evaluateVendorActivation } from '../../external/services/vendorActivation.service.js';
import { VendorService } from '../../external/models/VendorService.js';
import mongoose from 'mongoose';
import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as quotesRepo from '../repositories/quotes.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import * as circleRepo from '../repositories/circle.repo.js';
import * as catalog from './catalog.service.js';
import * as razorpay from './payments/razorpay.js';
import { getOwnedEventOr404 } from './events.service.js';
import { assertCommerceAllowed, serializeQuote } from './decision.service.js';
import { HANDLED_STATUSES, serializeEvent } from './understanding.js';
import { categoryLabel, normalizeCategory, templateFor } from './planCatalog.js';
import { Quote } from '../../external/models/Quote.js';
import { ExternalUser } from '../../external/models/ExternalUser.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { Booking, LOCKED_REQUIREMENT_STATUSES } from '../models/index.js';
import { validateCompletionFromCore } from '../../admin/services/executionSettlement.service.js';
import { recordLifecycleEventMessage } from './circle.service.js';
import { HttpError, badRequest, conflict, notFound } from '../utils/http.js';
import { publicCoupon, validateCouponForPayment, recordCouponUsageOnce, normalizeCouponCode } from './coupon.service.js';
import { publishOutboxEvent } from '../../automation/services/outbox.service.js';

/**
 * Reserve → pay → verify → book (Blueprint §6, phases 9–10).
 * - Accepting a quote creates 48 h holds (reservations), never bookings.
 * - The browser callback only moves a payment to "processing".
 * - Only a signed webhook or an ops verification makes it "verified".
 * - A booking is confirmed only if the payment is verified AND the hold is
 *   live AND the date isn't taken; otherwise it waits "under review".
 */

import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';

const HOLD_HOURS = 48;
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const advanceOf = (total, percent = 0) => Math.ceil((Number(total || 0) * percent) / 100);
const packageTotalOf = (reservation) => reservation.packageTotal ?? reservation.amount;
const advanceAmountOf = (reservation) => reservation.packageTotal == null ? advanceOf(reservation.amount, reservation.advancePercent) : reservation.amount;
const balanceAmountOf = (reservation, paid = advanceAmountOf(reservation)) => Math.max(0, packageTotalOf(reservation) - paid);

// ── Serializers (customer-safe) ─────────────────────────────────────────────
export function serializeReservation(r) {
  const packageTotal = packageTotalOf(r);
  const advanceAmount = advanceAmountOf(r);
  return {
    id: String(r._id),
    category: r.category,
    label: categoryLabel(r.category),
    vendorName: r.vendorName,
    packageName: r.packageName,
    amount: advanceAmount,
    advanceAmount,
    packageTotal,
    advancePercent: r.advancePercent ?? null,
    balanceAmount: r.balanceAmount ?? balanceAmountOf(r, advanceAmount),
    isDemo: r.isDemo,
    status: r.status,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

export function serializePayment(p) {
  return {
    id: String(p._id),
    reservationId: String(p.reservation),
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt,
    verifiedAt: p.verifiedAt,
    failureReason: p.status === 'failed' ? p.failureReason || 'Payment failed' : null,
    coupon: p.coupon?.code ? {
      code: p.coupon.code,
      discountAmount: Number(p.coupon.discountAmount || 0),
      originalAmount: p.coupon.originalAmount,
      orderAmount: p.coupon.orderAmount,
    } : null,
  };
}

export function serializeBooking(b) {
  const packageTotal = b.amount;
  const paidAmount = b.paidAmount ?? b.amount;
  return {
    id: String(b._id),
    coreBookingId: b.coreBooking ? String(b.coreBooking) : null,
    source: b.source || 'STARVNT',
    reference: String(b._id).slice(-6).toUpperCase(),
    category: b.category,
    label: categoryLabel(b.category),
    vendorName: b.vendorName,
    packageName: b.packageName,
    amount: b.amount,
    packageTotal,
    paidAmount,
    balanceAmount: b.balanceAmount ?? Math.max(0, packageTotal - paidAmount),
    isDemo: b.isDemo,
    status: b.status,
    underReviewReason: b.status === 'pending' ? b.reviewReason || (b.coreSync?.status === 'PENDING' ? 'Booking confirmation is being reconciled with Core.' : null) : null,
    executionStatus: b.executionStatus,
    checkedInAt: b.checkedInAt,
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    evidence: b.completionEvidence?.note || b.completionEvidence?.photoUrls?.length ? b.completionEvidence : null,
    createdAt: b.createdAt,
  };
}

// ── Accept a quote → reservations ───────────────────────────────────────────
export async function acceptQuote(customerId, quoteId) {
  const quote = await quotesRepo.findOwned(customerId, quoteId).catch(() => null);
  if (!quote) throw notFound('Quote not found');
  const ids = quote.items.map(item => String(item.optionId || '').replace(/^vs_/, '')).filter(id => mongoose.isValidObjectId(id));
  const vendors = [...new Set((await VendorService.find({ _id: { $in: ids } }).select('vendor').lean()).map(s => String(s.vendor)))].sort();
  const acquire = index => index === vendors.length ? acceptQuoteLocked(customerId, quoteId) : withVendorSchedule(vendors[index], () => acquire(index + 1));
  return acquire(0);
}
async function acceptQuoteLocked(customerId, quoteId) {
  const quote = await quotesRepo.findOwned(customerId, quoteId).catch(() => null);
  if (!quote) throw notFound('Quote not found');
  const event = await getOwnedEventOr404(customerId, quote.event);
  assertCommerceAllowed(event);
  if (quote.status === 'expired') throw conflict('QUOTE_EXPIRED', 'This quote has expired. Please get a new quote.');
  if (quote.status !== 'draft') throw conflict('QUOTE_NOT_OPEN', 'This quote can no longer be accepted');

  // Re-check every item before holding anything.
  const problems = [];
  for (const item of quote.items) {
    const req = await reqRepo.findRequirement(event._id, item.category);
    if (req && LOCKED_REQUIREMENT_STATUSES.includes(req.status)) {
      problems.push(`${categoryLabel(item.category)} is already ${req.status}`);
      continue;
    }
    try {
      const o = await catalog.getOption(event, item.optionId);
      if (!catalog.isBookable(o)) problems.push(`${item.vendorName} is no longer available on your date`);
    } catch {
      problems.push(`${item.vendorName} is no longer offered`);
    }
  }
  if (problems.length) throw conflict('QUOTE_ITEMS_UNAVAILABLE', problems.join('. '), { problems });

  // Resolve every term before changing quote state or creating holds.
  const resolvedPolicies = await Promise.all(quote.items.map(async (item) => {
    const policy = await getCommercialPolicyForCategory(item.category);
    if (!policy.policyActive || !Number.isFinite(Number(policy.minimumReservationPercent))) {
      throw conflict('FINANCIAL_POLICY_NOT_APPROVED', `An approved advance payment policy is not available for ${categoryLabel(item.category)}.`, { category: item.category });
    }
    return policy;
  }));

  const accepted = await commerceRepo.acceptDraftQuote(customerId, quote._id);
  if (!accepted) throw conflict('QUOTE_NOT_OPEN', 'This quote can no longer be accepted');

  await commerceRepo.cancelPendingForRequirements(quote.items.map((i) => i.requirement));
  const expiresAt = new Date(Date.now() + HOLD_HOURS * 3600000);
  const reservations = await commerceRepo.createReservations(
    await Promise.all(
      quote.items.map(async (i, index) => {
        const policy = resolvedPolicies[index];
        const advancePercent = Number(policy.minimumReservationPercent);
        const advance = advanceOf(i.price, advancePercent);
        return {
          event: event._id,
          customer: customerId,
          quote: quote._id,
          quoteItem: i._id,
          requirement: i.requirement,
          category: i.category,
          optionId: i.optionId,
          vendorName: i.vendorName,
          packageName: i.packageName,
          packageTotal: i.price,
          advancePercent: advancePercent,
          financialPolicySnapshot: {
            policyId: policy.policyId, category: policy.policyCategory, version: policy.policyVersion,
            effectiveFrom: policy.effectiveFrom, authorId: policy.draftAuthorId, approverId: policy.approverId,
            advancePercent, vendorCancellationPenaltyPercent: policy.vendorCancellationPenaltyPercent,
            customerCancellationRefunds: policy.customerCancellationRefunds,
            settlementCondition: policy.settlementCondition, settlementDelayDays: policy.settlementDelayDays,
          },
          amount: advance,
          balanceAmount: Math.max(0, i.price - advance),
          isDemo: i.isDemo,
          status: 'pending_payment',
          expiresAt,
        };
      })
    )
  );
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType: 'customer',
    actorId: customerId,
    action: 'quote_accepted',
    details: { total: quote.total, itemCount: quote.items.length },
  });
  return { quote: serializeQuote(accepted), reservations: reservations.map(serializeReservation) };
}

function sanitizePackageName(name, category, vendorName) {
  if (!name || typeof name !== 'string') {
    return vendorName && vendorName !== 'Vendor' && vendorName !== 'Vendor Partner' ? `${vendorName} Package` : `${categoryLabel(category)} Package`;
  }
  if (name.includes('Event Enquiry') || name.startsWith('👤') || /^\s*customer/i.test(name)) {
    return vendorName && vendorName !== 'Vendor' && vendorName !== 'Vendor Partner' ? `${vendorName} Package` : `${categoryLabel(category)} Package`;
  }
  return name;
}

// ── Bookings & payments view ────────────────────────────────────────────────
export async function bookingsView(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [reservations, customerBookings, payments] = await Promise.all([
    commerceRepo.listReservations(event._id),
    commerceRepo.listBookings(event._id),
    commerceRepo.listPayments(event._id),
  ]);
  const linkedIds = customerBookings.flatMap(b => [b._id, b.quoteId, b.reservation]).filter(Boolean).map(String);
  const coreIds = customerBookings.map(b => b.coreBooking || b.coreBookingId).filter(Boolean);
  const references = customerBookings.map(b => b.reference).filter(Boolean);
  const coreBookings = await CoreBooking.find({ customerId, $or: [
    { customerEvent: event._id },
    ...(linkedIds.length ? [{ quoteId: { $in: linkedIds } }] : []),
    ...(coreIds.length ? [{ _id: { $in: coreIds } }] : []),
    ...(references.length ? [{ bookingReference: { $in: references } }] : []),
  ] }).sort({ createdAt: -1 }).lean();

  const mappedBookings = customerBookings.map((b) => {
    const serialized = serializeBooking(b);
    serialized.packageName = sanitizePackageName(serialized.packageName, b.category, b.vendorName);
    const cb = coreBookings.find(
      (c) =>
        String(c.customerBookingId) === String(b._id) || String(c._id) === String(b.coreBooking) ||
        (c.quoteId && (String(c.quoteId) === String(b._id) || String(c.quoteId) === String(b.quoteId) || String(c.quoteId) === String(b.reservation))) ||
        (b.coreBookingId && String(c._id) === String(b.coreBookingId)) ||
        (c.bookingReference && b.reference && c.bookingReference === b.reference)
    );
    if (cb) {
      serialized.reference = cb.bookingReference || serialized.reference;
      serialized.status = cb.bookingStatus === 'CONFIRMED' ? 'confirmed' : cb.bookingStatus === 'CANCELLED' ? 'cancelled' : 'pending';
      serialized.underReviewReason = null;
      serialized.executionStatus = cb.executionStatus || serialized.executionStatus || 'NOT_STARTED';
      serialized.completionEvidence = cb.completionEvidence || serialized.completionEvidence;
      if (cb.vendorName && cb.vendorName !== 'Vendor') {
        serialized.vendorName = cb.vendorName;
      }
      if (cb.serviceName) {
        serialized.packageName = sanitizePackageName(cb.serviceName, b.category, serialized.vendorName);
      }
      if (cb.paymentSummary) {
        serialized.balanceAmount = cb.paymentSummary.balanceAmount ?? serialized.balanceAmount;
        serialized.paidAmount = cb.paymentSummary.paidAmount ?? serialized.paidAmount;
      }
    }
    return serialized;
  });

  for (const cb of coreBookings) {
    const exists = mappedBookings.some(
      (mb) =>
        (cb.quoteId && (String(mb.id) === String(cb.quoteId) || String(mb.quoteId) === String(cb.quoteId) || String(mb.reservation) === String(cb.quoteId))) ||
        String(mb.id) === String(cb._id) ||
        (cb.bookingReference && mb.reference === cb.bookingReference)
    );
    if (!exists) {
      let catKey = normalizeCategory(cb.category) || normalizeCategory(cb.serviceName);
      if (!catKey) {
        if (/venue|ballroom|lawn|banquet|hall|resort|palace/i.test(cb.serviceName || '')) catKey = 'venue';
        else if (/photo|candid|shoot|album/i.test(cb.serviceName || '')) catKey = 'photography';
        else if (/cater|food|menu|buffet/i.test(cb.serviceName || '')) catKey = 'catering';
        else if (/decor|mandap|stage|flower/i.test(cb.serviceName || '')) catKey = 'decor';
        else if (/makeup|mua|hair|bridal/i.test(cb.serviceName || '')) catKey = 'makeup';
        else if (/sound|dj|music/i.test(cb.serviceName || '')) catKey = 'sound';
        else catKey = cb.category || 'venue';
      }

      mappedBookings.push({
        id: String(cb._id),
        reference: cb.bookingReference || String(cb._id).slice(-6).toUpperCase(),
        category: catKey,
        label: categoryLabel(catKey),
        vendorName: cb.vendorName && cb.vendorName !== 'Vendor' ? cb.vendorName : 'Vendor Partner',
        packageName: sanitizePackageName(cb.serviceName, catKey, cb.vendorName),
        amount: cb.totalAmount || 0,
        packageTotal: cb.totalAmount || 0,
        paidAmount: cb.paymentSummary?.paidAmount || 0,
        balanceAmount: cb.paymentSummary?.balanceAmount ?? 0,
        isDemo: false,
        status: cb.bookingStatus === 'CONFIRMED' ? 'confirmed' : cb.bookingStatus === 'CANCELLED' ? 'cancelled' : 'pending',
        underReviewReason: null,
        executionStatus: cb.executionStatus || 'NOT_STARTED',
        completionEvidence: cb.completionEvidence,
        createdAt: cb.createdAt,
      });
    }
  }
  const serializedReservations = reservations.map((r) => {
    const s = serializeReservation(r);
    const catKey = normalizeCategory(r.category);
    const hasConfirmedBooking = mappedBookings.some(
      (b) =>
        (b.reservation && String(b.reservation) === String(r._id)) ||
        (r.quote && b.quoteId && String(b.quoteId) === String(r.quote)) ||
        (r.requirement && b.requirement && String(b.requirement) === String(r.requirement)) ||
        (catKey && b.category && normalizeCategory(b.category) === catKey)
    );
    if (hasConfirmedBooking) {
      s.status = 'converted';
    }
    return s;
  });

  return {
    event: serializeEvent(event),
    paymentsConfigured: razorpay.isConfigured(),
    reservations: serializedReservations,
    bookings: mappedBookings,
    payments: payments.map(serializePayment),
  };
}

export async function cancelBooking(customerId, bookingId, body = {}) {
  return cancelOwnedBooking(customerId, bookingId, body);
}

export async function verifyBookingCompletion(customerId, bookingId, body = {}) {
  const isObjectId = mongoose.isValidObjectId(bookingId);
  const links = [
    ...(isObjectId ? [{ _id: bookingId }, { quoteId: bookingId }] : []),
    { bookingReference: bookingId },
  ];
  let coreBooking = await CoreBooking.findOne({ customerId, $or: links });
  if (!coreBooking) {
    const customerBooking = await commerceRepo.getBooking(bookingId);
    if (!customerBooking || String(customerBooking.customer) !== String(customerId)) throw notFound('Booking not found');
    const linked = [
      ...(customerBooking.coreBooking || customerBooking.coreBookingId ? [{ _id: customerBooking.coreBooking || customerBooking.coreBookingId }] : []),
      { quoteId: customerBooking._id },
      ...(customerBooking.reference ? [{ bookingReference: customerBooking.reference }] : []),
    ];
    coreBooking = await CoreBooking.findOne({ customerId, $or: linked });
    if (!coreBooking) throw badRequest('CORE_BOOKING_REQUIRED', 'This booking must be linked to Core before completion can be verified.');
  }
  if (coreBooking.executionStatus !== 'COMPLETION_SUBMITTED') {
    if (coreBooking.executionStatus === 'COMPLETION_VERIFIED') {
      return { ok: true, booking: coreBooking };
    }
    throw badRequest('BOOKING_NOT_READY', 'The vendor must submit completion evidence before you can verify completion.');
  }

  const verified = await validateCompletionFromCore(
    coreBooking._id,
    { approved: true, notes: body?.notes || 'Customer verified completion' },
    `CUSTOMER:${customerId}`
  );

  if (coreBooking.customerBookingId) {
    await Booking.updateOne({ _id: coreBooking.customerBookingId, customer: customerId }, { $set: { executionStatus: 'completed', completedAt: new Date() } });
  }

  if (coreBooking.vendorId) {
    await recordLifecycleEventMessage({
      vendorId: coreBooking.vendorId,
      customerId,
      eventId: coreBooking.customerEvent,
      bookingId: coreBooking._id,
      sender: 'CLIENT',
      senderName: 'Customer',
      text: `✓ Completion Verified: Customer verified proof of work for ${coreBooking.serviceName || 'booking'}. Remaining balance is ready for payout/settlement.`,
      type: 'completion',
    }).catch(() => null);
  }

  return { ok: true, booking: verified };
}

export async function previewReservationCoupon(customerId, eventId, reservationId, code) {
  const event = await getOwnedEventOr404(customerId, eventId);
  let reservation = await commerceRepo.findReservation(event._id, reservationId);
  if (!reservation) {
    const { Reservation } = await import('../models/index.js');
    if (mongoose.isValidObjectId(reservationId)) {
      reservation = await Reservation.findOne({
        event: event._id,
        $or: [{ _id: reservationId }, { quoteItem: reservationId }, { quote: reservationId }],
      });
    }
    if (!reservation) {
      const cb = (await CoreBooking.findById(reservationId).catch(() => null)) || (await Booking.findById(reservationId).catch(() => null));
      if (cb) {
        if (cb.reservation) reservation = await Reservation.findById(cb.reservation).catch(() => null);
        if (!reservation && cb.quoteId) reservation = await Reservation.findOne({ quote: cb.quoteId }).catch(() => null);
        if (!reservation) {
          const totalAmt = cb.totalAmount || cb.amount || 0;
          const paidAmt = cb.paymentSummary?.paidAmount || cb.paidAmount || 0;
          const balAmt = cb.paymentSummary?.balanceAmount ?? cb.balanceAmount ?? Math.max(0, totalAmt - paidAmt);
          reservation = {
            _id: cb._id,
            event: event._id,
            category: cb.category || 'venue',
            vendorName: cb.vendorName || 'Vendor Partner',
            packageName: cb.serviceName || cb.packageName || 'Service Package',
            amount: balAmt,
            packageTotal: totalAmt,
            advancePercent: 100,
            balanceAmount: balAmt,
            status: 'pending_balance',
            isDemo: false,
          };
        }
      }
    }
  }
  if (!reservation) throw notFound('Reservation not found');
  const isBalancePayment = reservation.status === 'converted' || reservation.status === 'pending_balance';
  if (!isBalancePayment && reservation.status !== 'pending_payment') throw conflict('RESERVATION_NOT_PAYABLE', 'This reservation is not awaiting payment');
  const baseAmount = isBalancePayment ? (reservation.balanceAmount ?? reservation.amount) : advanceAmountOf(reservation);
  const orderAmount = packageTotalOf(reservation);
  const { coupon, discountAmount } = await validateCouponForPayment(code, { orderAmount, baseAmount });
  return { ok: true, coupon: publicCoupon(coupon, { discountAmount, baseAmount, orderAmount }) };
}

// ── Pay a reservation (creates or reuses a Razorpay order) ──────────────────
export async function payReservation(customer, eventId, reservationId, body = {}, options = {}) {
  const customerId = customer._id;
  const event = await getOwnedEventOr404(customerId, eventId);
  assertCommerceAllowed(event);
  let reservation = await commerceRepo.findReservation(event._id, reservationId);
  if (!reservation) {
    const { Reservation } = await import('../models/index.js');
    if (mongoose.isValidObjectId(reservationId)) {
      reservation = await Reservation.findOne({
        $or: [{ _id: reservationId }, { quoteItem: reservationId }, { quote: reservationId }],
      });
    }
    if (!reservation) {
      const cb = (await CoreBooking.findById(reservationId).catch(() => null)) || (await Booking.findById(reservationId).catch(() => null));
      if (cb) {
        if (cb.reservation) reservation = await Reservation.findById(cb.reservation).catch(() => null);
        if (!reservation && cb.quoteId) reservation = await Reservation.findOne({ quote: cb.quoteId }).catch(() => null);
        if (!reservation) {
          const totalAmt = cb.totalAmount || cb.amount || 0;
          const paidAmt = cb.paymentSummary?.paidAmount || cb.paidAmount || 0;
          const balAmt = cb.paymentSummary?.balanceAmount ?? cb.balanceAmount ?? Math.max(0, totalAmt - paidAmt);
          reservation = {
            _id: cb._id,
            event: event._id,
            category: cb.category || 'venue',
            vendorName: cb.vendorName || 'Vendor Partner',
            packageName: cb.serviceName || cb.packageName || 'Service Package',
            amount: balAmt,
            packageTotal: totalAmt,
            advancePercent: 100,
            balanceAmount: balAmt,
            status: 'pending_balance',
            isDemo: false,
          };
        }
      }
    }
  }
  if (!reservation) throw notFound('Reservation not found for this event');
  if (reservation.status === 'expired') throw conflict('RESERVATION_EXPIRED', 'This hold has expired. Please get a new quote.');

  const isBalancePayment =
    reservation.status === 'converted' ||
    reservation.status === 'pending_balance' ||
    body.isBalance === true ||
    body.paymentType === 'balance';

  if (!isBalancePayment && reservation.status !== 'pending_payment') {
    throw conflict('RESERVATION_NOT_PAYABLE', 'This reservation is not awaiting payment');
  }

  const baseAmount = isBalancePayment
    ? (reservation.balanceAmount ?? reservation.amount)
    : advanceAmountOf(reservation);

  if (isBalancePayment && baseAmount <= 0) {
    throw conflict('ALREADY_PAID', 'This booking is fully paid and settled.');
  }

  if (!razorpay.isConfigured() && !options.skipRazorpay) {
    throw new HttpError(503, 'PAYMENT_NOT_CONFIGURED', 'Online payment is not set up yet. Please try again later.');
  }

  let payment = await commerceRepo.findOpenPaymentForReservation(reservation._id);
  const orderAmount = packageTotalOf(reservation);
  const { coupon, discountAmount } = await validateCouponForPayment(body.couponCode, { orderAmount, baseAmount });
  const payableAmount = Math.max(1, baseAmount - discountAmount);
  if (payment && payment.amount !== payableAmount && payment.status === 'pending') payment = null;
  if (payment && payment.status === 'pending' && normalizeCouponCode(payment.coupon?.code) !== normalizeCouponCode(coupon?.code)) payment = null;
  if (payment && ['paid', 'verified'].includes(payment.status)) throw conflict('ALREADY_PAID', 'This payment has already been verified.');
  if (!payment || !payment.providerOrderId) {
    let order;
    if (options.skipRazorpay || !razorpay.isConfigured()) {
      order = { id: `order_dev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` };
    } else {
      try {
        order = await razorpay.createOrder({
          amount: payableAmount,
          receipt: `res_${reservation._id}`,
          notes: {
            eventId: String(event._id),
            reservationId: String(reservation._id),
            paymentType: isBalancePayment ? 'balance' : 'advance',
            packageTotal: String(packageTotalOf(reservation)),
            advancePercent: String(reservation.advancePercent ?? ''),
            couponCode: coupon?.code || '',
            couponDiscount: discountAmount ? String(discountAmount) : '',
          },
        });
      } catch (err) {
        console.error('[payments] order failed:', err.message);
        throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not start the payment. Please try again.');
      }
    }
    payment = await commerceRepo.createPayment({
      event: event._id,
      customer: customerId,
      reservation: reservation._id,
      amount: payableAmount,
      currency: 'INR',
      status: 'pending',
      providerOrderId: order.id,
      coupon: coupon ? {
        code: coupon.code,
        discountAmount,
        originalAmount: baseAmount,
        orderAmount,
        usageRecorded: false,
      } : undefined,
    });
  }

  return {
    payment: serializePayment(payment),
    checkout: {
      key: razorpay.publicKeyId(),
      orderId: payment.providerOrderId,
      amount: razorpay.toPaise(payment.amount),
      currency: payment.currency,
      name: 'STARVNT',
      description: `${categoryLabel(reservation.category)} · ${reservation.vendorName}${payment.coupon?.code ? ` · ${payment.coupon.code}` : ''}`,
      prefill: { name: customer.fullName || '', email: customer.email || '', contact: customer.phone || '' },
    },
  };
}

/** The browser says checkout finished. Recorded, never trusted as proof. */
export async function checkoutComplete(customerId, eventId, paymentId, body = {}) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const payment = await commerceRepo.getPayment(paymentId);
  if (!payment || String(payment.event) !== String(event._id)) throw notFound('Payment not found');
  const ref = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.slice(0, 64) : null;
  const moved = await commerceRepo.movePayment(payment._id, ['pending'], { status: 'processing', ...(ref ? { providerRef: ref } : {}) });
  return { payment: serializePayment(moved || payment) };
}

export async function devVerifyReservationPayment(customer, eventId, reservationId) {
  if (!process.env.ENABLE_QA_PAYMENT_BYPASS || process.env.NODE_ENV === 'production') {
    throw notFound('Not found');
  }
  const { payment } = await payReservation(customer, eventId, reservationId, {}, { skipRazorpay: true });
  const result = await verifyPayment(payment.id, { actorType: 'ops', actorId: 'dev-test-success-button' });
  return { payment: serializePayment(result.payment), booking: result.booking ? serializeBooking(result.booking) : null };
}
// ── Verification & booking confirmation (webhook / ops only) ────────────────
async function markFailed(payment, reason, actor) {
  const moved = await commerceRepo.movePayment(payment._id, ['pending', 'processing', 'paid'], { status: 'failed', failureReason: reason });
  if (!moved) return null;
  await eventsRepo.appendHistory({ eventId: payment.event, ...actor, action: 'payment_failed', details: { amount: payment.amount } });
  
  await publishOutboxEvent({
    eventType: 'PAYMENT_FAILED',
    aggregateType: 'Payment',
    aggregateId: payment._id.toString(),
    payload: { paymentId: payment._id.toString(), reason, eventId: payment.event.toString() },
    idempotencyKey: `payment_failed_${payment._id}`
  });
  
  await circleRepo.notify({
    customerId: payment.customer,
    eventId: payment.event,
    type: 'payment',
    title: 'Payment failed',
    body: `Your payment of ${inr(payment.amount)} didn't go through. You can try again while the hold is active.`,
  });
  return moved;
}

async function maybeMarkEventBooked(eventId) {
  const event = await eventsRepo.findEventById(eventId);
  if (!event || event.status !== 'planning') return;
  const reqs = await reqRepo.listRequirements(event._id);
  const byCat = new Map(reqs.map((r) => [r.category, r]));
  const allHandled = templateFor(event.eventType).essential.every((c) => HANDLED_STATUSES.includes(byCat.get(c)?.status));
  if (!allHandled) return;
  const moved = await eventsRepo.setEventStatus(event._id, ['planning'], 'booked');
  if (moved) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'system', action: 'event_booked', details: {} });
    await circleRepo.notify({ customerId: event.customer, eventId: event._id, type: 'booking', title: 'All essentials booked', body: `${event.title} has every essential service booked.` });
  }
}

/**
 * Create the booking for a verified payment. Idempotent (one booking per
 * reservation). Confirmed only when the hold is live and the date is free.
 */
export async function confirmBookingFor(payment) {
  if (payment.status !== 'verified') throw conflict('PAYMENT_NOT_VERIFIED', 'Only verified payments can confirm a booking.');
  const reservation = await commerceRepo.getReservation(payment.reservation);
  const quote = reservation?.quote ? await Quote.findById(reservation.quote).select('vendor').lean() : null;
  const serviceId = String(reservation?.optionId || '').replace(/^vs_/, '');
  const service = !quote && mongoose.isValidObjectId(serviceId) ? await VendorService.findById(serviceId).select('vendor').lean() : null;
  const prior = await commerceRepo.findBookingForReservation(payment.reservation);
  const vendorId = quote?.vendor || service?.vendor || prior?.vendor;
  if (!vendorId) return confirmBookingLocked(payment);
  return withVendorSchedule(vendorId, assertLease => confirmBookingLocked(payment, vendorId, assertLease));
}
async function confirmBookingLocked(payment, vendorId = null, assertLease = async () => {}) {
  const reservation = await commerceRepo.getReservation(payment.reservation);
  const eventId = reservation ? reservation.event : payment.event;
  const event = await eventsRepo.findEventById(eventId);
  if (!event) return null;

  const resId = reservation ? reservation._id : payment.reservation;
  const existing = await commerceRepo.findBookingForReservation(resId);
  if (existing) {
    if (existing.status === 'cancelled') return existing;
    if (existing.coreSync?.snapshot) return syncBookingTruth(existing._id);
    // Demo / legacy records: recompute verified receipts, never increment on retry.
    const receipts = await commerceRepo.listPayments(eventId);
    const paid = receipts.filter(p => String(p.reservation) === String(resId) && p.status === 'verified').reduce((n, p) => n + p.amount, 0);
    return commerceRepo.updateBooking(existing._id, {}, { paidAmount: paid, balanceAmount: Math.max(0, existing.amount - paid) });
  }
  if (!reservation) return null;

  let reason = !vendorId && !reservation.isDemo ? 'The authoritative vendor could not be resolved' : reservation.isDemo && process.env.NODE_ENV === 'production' ? 'Demo bookings cannot be confirmed in production' : null;
  if (!reason && (reservation.status !== 'pending_payment' || reservation.expiresAt <= new Date())) reason = 'The hold expired before payment was verified';
  if (!reason) {
    const req = await reqRepo.findRequirement(event._id, reservation.category);
    if (req && LOCKED_REQUIREMENT_STATUSES.includes(req.status)) reason = `${categoryLabel(reservation.category)} is already ${req.status}`;
  }
  let vq = null;
  if (!reason) {
    if (reservation.quote) {
      vq = await Quote.findById(reservation.quote).populate('vendor').catch(() => null);
    }
    if (!vq) {
      try {
        const o = await catalog.getOption(event, reservation.optionId);
        if (!catalog.isBookable(o)) reason = 'The vendor is not available on your date';
      } catch {
        reason = 'The option is no longer offered';
      }
    }
  }
  if (!reason && event.eventDate && !vq) {
    const claimed = await commerceRepo.claimOptionDate(reservation.optionId, event.eventDate, event._id);
    if (!claimed) reason = 'The vendor was just booked by someone else for your date';
  }

  if (!reason && vendorId) {
    const readiness = await evaluateVendorActivation(vendorId);
    if (!serviceMatchingEligible(readiness, vq?.vendorService || String(reservation.optionId).replace(/^vs_/, ''))) reason = 'Vendor activation is not approved or operational requirements are incomplete';
    if (!reason) {
      const available = await checkTrueAvailability({ vendorId, vendorServiceId: vq?.vendorService || String(reservation.optionId).replace(/^vs_/, ''), date: event.eventDate, allDay: true, serviceLocation: vq?.serviceLocation || event.location, excludeReservationId: reservation._id });
      if (!available.feasible) reason = available.reason || 'Vendor schedule conflict';
    }
  }
  await assertLease();
  const customerUser = await ExternalUser.findById(event.customer);
  const totalAmount = packageTotalOf(reservation);
  const coreSnapshot = !reason && vendorId ? {
    ...(vq ? { quoteId: String(vq._id), opportunityId: vq.opportunity ? String(vq.opportunity) : undefined } : {}),
    vendorId, vendorService: vq?.vendorService || String(reservation.optionId).replace(/^vs_/, ''),
    vendorName: reservation.vendorName, customerName: customerUser?.fullName || 'Customer',
    serviceName: vq?.serviceName || reservation.packageName, category: reservation.category,
    eventDate: vq?.eventDate || event.eventDate, serviceLocation: vq?.serviceLocation || event.location || {},
    pricing: vq?.pricingBreakdown || { totalAmount }, totalAmount,
    financialPolicySnapshot: reservation.financialPolicySnapshot,
    paymentStatus: 'PAYMENT_VERIFIED', executionStatus: 'SERVICE_SCHEDULED', settlementStatus: 'NOT_ELIGIBLE',
    paymentSummary: { advancePercentage: reservation.advancePercent, advanceAmount: payment.amount,
      paidAmount: payment.amount, balanceAmount: Math.max(0, totalAmount - payment.amount),
      provider: payment.provider, providerOrderId: payment.providerOrderId, providerPaymentId: payment.providerRef,
      paidAt: payment.verifiedAt, couponCode: payment.coupon?.code, couponDiscountAmount: payment.coupon?.discountAmount || 0 },
    history: [{ actor: 'SYSTEM', action: 'CONFIRMED_FROM_VERIFIED_PAYMENT', at: new Date() }],
  } : null;
  const { booking, created } = await commerceRepo.createBooking({
    vendor: vendorId, coreSync: coreSnapshot ? { status: 'PENDING', snapshot: coreSnapshot } : { status: 'NOT_REQUIRED' },
    event: event._id,
    customer: event.customer,
    requirement: reservation.requirement,
    category: reservation.category,
    optionId: reservation.optionId,
    vendorName: reservation.vendorName,
    packageName: reservation.packageName,
    reservation: reservation._id,
    payment: payment._id,
    amount: packageTotalOf(reservation),
    paidAmount: payment.amount,
    balanceAmount: reservation.balanceAmount ?? balanceAmountOf(reservation, payment.amount),
    isDemo: reservation.isDemo,
    status: reason || coreSnapshot ? 'pending' : 'confirmed',
    reviewReason: reason,
  });
  if (!created) return booking;
  await commerceRepo.setReservationStatus(reservation._id, 'converted');

  if (coreSnapshot) {
    const synced = await syncBookingTruth(booking._id);
    Object.assign(booking, synced);
  }
  if (vq && !reason) {
    // Quote is a projection of the verified receipt, never the booking authority.
    vq.advancePayment = { ...(vq.advancePayment?.toObject?.() || {}),
      percentage: reservation.advancePercent, amount: payment.amount, status: 'VERIFIED',
      provider: payment.provider, providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerRef, paidAt: payment.verifiedAt };
    await vq.save();
  }

  const label = categoryLabel(reservation.category);
  if (!reason) {
    await reqRepo.upsertRequirement(event._id, reservation.category, { status: 'booked', source: 'system' }, { onlyIfStatusIn: ['missing', 'pending', 'customer_provided'] });
    await eventsRepo.appendHistory({
      eventId: event._id,
      actorType: 'system',
      action: 'booking_confirmed',
      details: {
        category: reservation.category,
        vendorName: reservation.vendorName,
        amount: packageTotalOf(reservation),
        paidAmount: payment.amount,
        balanceAmount: reservation.balanceAmount ?? balanceAmountOf(reservation, payment.amount),
      },
    });
    await circleRepo.notify({ customerId: event.customer, eventId: event._id, type: 'booking', title: `${label} booked`, body: `${reservation.vendorName} is confirmed for ${event.title}.` });
    await maybeMarkEventBooked(event._id);
  } else {
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'system', action: 'booking_under_review', details: { category: reservation.category } });
    await circleRepo.notify({
      customerId: event.customer,
      eventId: event._id,
      type: 'booking',
      title: `${label} booking under review`,
      body: `Your payment was received. ${reason}, so our team is reviewing it. We'll update you here.`,
    });
  }
  return booking;
}

/** Verify a payment (webhook or ops) and run booking confirmation. Idempotent. */
export async function verifyPayment(paymentId, { actorType, actorId }) {
  const payment = await commerceRepo.getPayment(paymentId);
  if (!payment) return null;
  if (payment.status === 'failed') return { payment, booking: null };
  const moved = await commerceRepo.movePayment(payment._id, ['pending', 'processing', 'paid'], {
    status: 'verified',
    verifiedAt: new Date(),
    verifiedBy: actorType === 'ops' ? `ops:${actorId}` : actorType,
  });
  const verified = moved || payment;
  if (verified.status === 'verified') {
    if (verified.coupon?.code && !verified.coupon?.usageRecorded) {
      const recorded = await recordCouponUsageOnce(verified.coupon.code, `payment:${verified._id}`);
      if (recorded) await commerceRepo.markCouponUsageRecorded(verified._id);
    }
    await eventsRepo.appendHistory({ eventId: payment.event, actorType, actorId, action: 'payment_verified', idempotencyKey: `payment_verified:${payment._id}`, details: { amount: payment.amount } });
    
    await publishOutboxEvent({
      eventType: 'PAYMENT_CONFIRMED',
      aggregateType: 'Payment',
      aggregateId: payment._id.toString(),
      payload: {
        paymentId: payment._id.toString(),
        eventId: payment.event.toString(),
        reservationId: payment.reservation.toString(),
        amount: payment.amount,
        currency: payment.currency
      },
      idempotencyKey: `payment_confirmed_${payment._id}`
    });
  }
  const booking = await confirmBookingFor(moved || payment);
  return { payment: moved || (await commerceRepo.getPayment(paymentId)), booking };
}

/** Signed Razorpay webhook. Duplicate deliveries are ignored. */
export async function handleRazorpayWebhook(rawBody, headers) {
  if (!razorpay.webhookConfigured()) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook secret not configured');
  if (!razorpay.verifyWebhookSignature(rawBody, headers['x-razorpay-signature'])) throw badRequest('INVALID_SIGNATURE', 'Invalid signature');

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw badRequest('INVALID_BODY', 'Invalid JSON');
  }
  const eventType = String(body.event || '');
  const providerEventId = headers['x-razorpay-event-id'] || body.id;
  if (!providerEventId) throw badRequest('MISSING_EVENT_ID', 'Missing event id');
  const delivery = await commerceRepo.recordWebhookEvent('razorpay', String(providerEventId), eventType, body);
  if (!delivery) {
    return { ok: true, duplicate: true };
  }

  try {
  const pay = body.payload?.payment?.entity || null;
  const order = body.payload?.order?.entity || null;
  const orderId = pay?.order_id || order?.id;
  const payment = orderId ? await commerceRepo.findPaymentByOrder(orderId) : null;
  if (!payment) { await commerceRepo.finishWebhookEvent(delivery); return { ok: true, ignored: true }; }

  const actor = { actorType: 'webhook', actorId: 'razorpay' };
  switch (eventType) {
    case 'payment.authorized':
      await commerceRepo.movePayment(payment._id, ['pending', 'processing'], { status: 'paid', ...(pay?.id ? { providerRef: pay.id } : {}) });
      break;
    case 'payment.captured':
    case 'order.paid': {
      const amount = eventType === 'order.paid' ? order?.amount_paid ?? order?.amount ?? pay?.amount : pay?.amount;
      const currency = (eventType === 'order.paid' ? order?.currency : pay?.currency) || pay?.currency;
      if (Number(amount) !== razorpay.toPaise(payment.amount) || currency !== payment.currency) {
        await markFailed(payment, 'Amount mismatch', actor);
        break;
      }
      if (pay?.id) await commerceRepo.movePayment(payment._id, ['pending', 'processing', 'paid'], { providerRef: pay.id });
      await verifyPayment(payment._id, actor);
      break;
    }
    case 'payment.failed':
      await markFailed(payment, pay?.error_description || 'Payment failed', actor);
      break;
    default:
      await commerceRepo.finishWebhookEvent(delivery);
      return { ok: true, ignored: true };
  }
  await commerceRepo.finishWebhookEvent(delivery);
  return { ok: true };
  } catch (err) { await commerceRepo.finishWebhookEvent(delivery, err); throw err; }
}
