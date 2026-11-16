import { ExternalUser } from '../models/ExternalUser.js';
import { withVendorSchedule } from './scheduleLock.js';
import { serviceMatchingEligible } from '../../common/vendorReadiness.js';
import { evaluateVendorActivation } from './vendorActivation.service.js';
import { checkTrueAvailability } from './availability.service.js';
import { Quote } from '../models/Quote.js';
import { Opportunity } from '../models/Opportunity.js';
import { Reservation } from '../../customer/models/index.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { transitionQuote } from './quoteStateMachine.service.js';
import { recordCouponUsageOnce } from '../../customer/services/coupon.service.js';
import { recordLifecycleEventMessage } from '../../customer/services/circle.service.js';
import * as razorpay from '../../customer/services/payments/razorpay.js';


function quoteAdvancePercentage(quote) {
  const percent = Number(quote?.advancePayment?.percentage);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : 0;
}

function quoteAdvanceAmount(quote, total = Number(quote?.pricingBreakdown?.totalAmount || 0)) {
  return Math.ceil((total * quoteAdvancePercentage(quote)) / 100);
}

function quoteFinancialPolicySnapshot(quote) {
  const snapshot = quote?.advancePayment?.policySnapshot;
  if (!snapshot || snapshot.source !== 'APPROVED') return null;
  return {
    policyId: snapshot.policyId || null,
    category: snapshot.category || quote.category || 'Global',
    version: snapshot.version,
    effectiveFrom: snapshot.effectiveFrom || null,
    authorId: snapshot.authorId || null,
    approverId: snapshot.approverId || null,
    advancePercent: quoteAdvancePercentage(quote),
    ...(snapshot.terms || {}),
  };
}

export async function completePaidVendorQuote(args) {
  const vendorId = args.quote.vendor?._id || args.quote.vendor;
  return withVendorSchedule(vendorId, async assertLease => {
    const quote = await Quote.findById(args.quote._id).populate('vendor', 'businessName category location');
    if (!quote || quote.advancePayment?.providerOrderId !== args.quote.advancePayment?.providerOrderId) throw new Error('Payment order changed. Reconcile the current order.');
    return completePaidVendorQuoteLocked({ ...args, quote }, assertLease);
  });
}
async function completePaidVendorQuoteLocked({ quote, actorName, paymentId }, assertLease) {
  const vendorName = quote.vendor?.businessName || '';
  const vendorCategory = quote.vendor?.category || '';
  quote.advancePayment.status = 'VERIFIED';
  quote.advancePayment.providerPaymentId = paymentId || quote.advancePayment.providerPaymentId || '';
  quote.advancePayment.paidAt = quote.advancePayment.paidAt || new Date();
  if (quote.advancePayment?.couponCode && !quote.advancePayment?.couponUsageRecorded) {
    await recordCouponUsageOnce(quote.advancePayment.couponCode, `quote:${quote._id}`);
    quote.advancePayment.couponUsageRecorded = true;
  }
  await quote.save();

  const existingBooking = await CoreBooking.findOne({ quoteId: String(quote._id) }).lean();
  if (existingBooking) return { quote, booking: existingBooking };
  if (!existingBooking) {
    const vendorId = quote.vendor?._id || quote.vendor;
    const readiness = await evaluateVendorActivation(vendorId);
    const hold = await Reservation.findOne({ quote: quote._id, customer: quote.customer?._id || quote.customer }).select('_id').lean();
    const available = await checkTrueAvailability({ vendorId, vendorServiceId: quote.vendorService, date: quote.eventDate, allDay: true, serviceLocation: quote.serviceLocation, excludeReservationId: hold?._id });
    if (!serviceMatchingEligible(readiness, quote.vendorService) || !available.feasible) {
      quote.bookingReview = { status: 'CONFLICT_REVIEW', reason: !serviceMatchingEligible(readiness, quote.vendorService) ? 'Vendor activation requires review' : available.reason, updatedAt: new Date() };
      await quote.save();
      const error = new Error('Payment is verified, but this booking requires schedule or activation review. Contact support.');
      error.statusCode = 409; error.code = 'PAYMENT_VERIFIED_BOOKING_REVIEW'; throw error;
    }
  }
  await assertLease();
  if (quote.status === 'SUBMITTED') {
    await transitionQuote(quote._id, 'APPROVED', {
      actor: actorName,
      reason: `Customer paid ${quoteAdvancePercentage(quote)}% Razorpay advance`,
    });
  } else if (quote.status !== 'APPROVED') {
    const err = new Error('This quote cannot be approved from its current state.');
    err.statusCode = 409;
    err.code = 'QUOTE_NOT_APPROVABLE';
    throw err;
  }

  const vendorId = quote.vendor?._id || quote.vendor;
  const customerId = quote.customer?._id || quote.customer;
  const totalAmount = Number(quote.pricingBreakdown?.totalAmount || 0);
  const paidAmount = Number(quote.advancePayment?.amount || quoteAdvanceAmount(quote, totalAmount));
  const bookingOpportunity = quote.opportunity ? await Opportunity.findById(quote.opportunity).select('customerEvent').lean() : null;
  const booking = await CoreBooking.findOneAndUpdate(
    { quoteId: String(quote._id) },
    {
      $setOnInsert: {
        quoteId: String(quote._id),
        opportunityId: quote.opportunity ? String(quote.opportunity) : null,
        customerEvent: bookingOpportunity?.customerEvent || null,
        vendorId,
        vendorService: quote.vendorService,
        customerId,
        serviceName: quote.serviceName || 'Event Service',
        eventDate: quote.eventDate || new Date().toISOString().split('T')[0],
        serviceLocation: quote.serviceLocation || {},
        pricing: quote.pricingBreakdown || { totalAmount },
        totalAmount,
        financialPolicySnapshot: quoteFinancialPolicySnapshot(quote),
        bookingStatus: 'CONFIRMED',
        settlementStatus: 'NOT_ELIGIBLE',
      },
      $set: {
        vendorName,
        customerName: actorName,
        category: vendorCategory,
        paymentSummary: {
          advancePercentage: quoteAdvancePercentage(quote),
          advanceAmount: paidAmount,
          paidAmount,
          balanceAmount: Math.max(0, totalAmount - paidAmount),
          couponCode: quote.advancePayment?.couponCode || '',
          couponDiscountAmount: Number(quote.advancePayment?.couponDiscountAmount || 0),
          provider: quote.advancePayment?.provider || 'razorpay',
          providerOrderId: quote.advancePayment?.providerOrderId || '',
          providerPaymentId: paymentId || quote.advancePayment?.providerPaymentId || '',
          paidAt: quote.advancePayment?.paidAt || new Date(),
        },
        paymentStatus: 'PAYMENT_VERIFIED',
        executionStatus: 'SERVICE_SCHEDULED',
      },
    },
    { new: true, upsert: true }
  );

  const approved = await Quote.findById(quote._id)
    .populate('vendor', 'businessName category location');

  await recordLifecycleEventMessage({
    vendorId,
    customerId,
    eventId: booking.customerEvent,
    bookingId: booking._id,
    quoteId: quote._id,
    sender: 'SYSTEM',
    senderName: 'STARVNT Core',
    text: `✓ Booking Confirmed! Booking #${booking.bookingReference || String(booking._id).slice(-6).toUpperCase()} confirmed for ${booking.serviceName || 'Service'}. Total: ₹${totalAmount.toLocaleString('en-IN')}, Paid Advance: ₹${paidAmount.toLocaleString('en-IN')}, Remaining Balance: ₹${Math.max(0, totalAmount - paidAmount).toLocaleString('en-IN')}. Execution workspace activated.`,
    type: 'booking',
  }).catch(() => null);

  return { quote: approved, booking };
}


export async function reconcileVendorQuotePayment({ quote, actorName, paymentId }) {
  const orderId = quote.advancePayment?.providerOrderId;
  const amount = Number(quote.advancePayment?.amount || 0);
  const captured = await razorpay.findCapturedOrderPayment({ orderId, amount, paymentId });
  if (!captured) {
    const error = new Error('Razorpay has not confirmed a captured payment for this order yet. Check the status again shortly.');
    error.statusCode = 402; error.code = 'PAYMENT_NOT_CAPTURED'; throw error;
  }
  return completePaidVendorQuote({ quote, actorName, paymentId: captured.id });
}

export async function reconcileVendorQuoteWebhook(orderId) {
  if (!orderId) return false;
  const quote = await Quote.findOne({ 'advancePayment.providerOrderId': orderId }).populate('vendor', 'businessName category location');
  if (!quote) return false;
  try {
    const customer = await ExternalUser.findById(quote.customer).select('fullName email').lean();
    await reconcileVendorQuotePayment({ quote, actorName: customer?.fullName || customer?.email || 'Customer' });
  } catch (error) {
    // The money is recorded even when schedule/activation prevents confirmation.
    // A retry will not resolve that conflict; keep the booking in ops review.
    if (error.code !== 'PAYMENT_VERIFIED_BOOKING_REVIEW') throw error;
  }
  return true;
}
