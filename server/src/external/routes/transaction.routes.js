import express from 'express';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { Notification } from '../models/Notification.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { activeAccountType } from '../models/ExternalUser.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { matchVendorsForRequirement } from '../services/matching.service.js';
import { createQuote, transitionQuote } from '../services/quoteStateMachine.service.js';
import { startService, submitCompletionEvidence, validateCompletionFromCore } from '../../admin/services/executionSettlement.service.js';
import * as razorpay from '../../customer/services/payments/razorpay.js';

const router = express.Router();
const ADVANCE_PERCENTAGE = 30;

function numberField(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function normalizePricingBreakdown(input = {}) {
  const basePrice = numberField(input.basePrice);
  const travelFee = numberField(input.travelFee);
  const equipmentFee = numberField(input.equipmentFee);
  const setupFee = numberField(input.setupFee);
  const additionalFee = numberField(input.additionalFee);
  const totalAmount = numberField(input.totalAmount) || basePrice + travelFee + equipmentFee + setupFee + additionalFee;
  return { basePrice, travelFee, equipmentFee, setupFee, additionalFee, totalAmount };
}

function quoteForCustomer(quote) {
  const total = Number(quote.pricingBreakdown?.totalAmount || 0);
  const advanceAmount = Math.ceil((total * ADVANCE_PERCENTAGE) / 100);
  return {
    id: String(quote._id),
    quoteReference: quote.quoteReference,
    serviceName: quote.serviceName,
    eventDate: quote.eventDate,
    serviceLocation: quote.serviceLocation,
    status: quote.status,
    vendorName: quote.vendor?.businessName || quote.vendorName || 'Vendor',
    vendorCategory: quote.vendor?.category || '',
    vendorLocation: quote.vendor?.location || '',
    pricingBreakdown: quote.pricingBreakdown,
    totalAmount: total,
    advancePercentage: quote.advancePayment?.percentage || ADVANCE_PERCENTAGE,
    advanceAmount: quote.advancePayment?.amount || advanceAmount,
    advanceStatus: quote.advancePayment?.status || 'NOT_STARTED',
    notes: quote.notes || '',
    history: Array.isArray(quote.history)
      ? quote.history.slice(-8).map((h) => ({
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          changedBy: h.changedBy,
          reason: h.reason,
          timestamp: h.timestamp,
        }))
      : [],
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
  };
}

function bookingForCustomer(booking) {
  return {
    id: String(booking._id),
    bookingReference: booking.bookingReference,
    vendorName: booking.vendorName || 'Vendor',
    customerName: booking.customerName || '',
    serviceName: booking.serviceName,
    category: booking.category,
    eventDate: booking.eventDate,
    serviceLocation: booking.serviceLocation,
    totalAmount: booking.totalAmount,
    paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus,
    settlementStatus: booking.settlementStatus,
    completionEvidence: booking.completionEvidence || [],
    validationAudit: booking.validationAudit || null,
    createdAt: booking.createdAt,
  };
}

async function completePaidVendorQuote({ quote, actorName, paymentId }) {
  const vendorName = quote.vendor?.businessName || '';
  const vendorCategory = quote.vendor?.category || '';
  quote.advancePayment.status = 'VERIFIED';
  quote.advancePayment.providerPaymentId = paymentId || quote.advancePayment.providerPaymentId || '';
  quote.advancePayment.paidAt = quote.advancePayment.paidAt || new Date();
  await quote.save();

  if (quote.status === 'SUBMITTED') {
    await transitionQuote(quote._id, 'APPROVED', {
      actor: actorName,
      reason: `Customer paid ${ADVANCE_PERCENTAGE}% Razorpay advance`,
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
  const paidAmount = Number(quote.advancePayment?.amount || Math.ceil((totalAmount * ADVANCE_PERCENTAGE) / 100));
  const booking = await CoreBooking.findOneAndUpdate(
    { quoteId: String(quote._id) },
    {
      $setOnInsert: {
        quoteId: String(quote._id),
        opportunityId: quote.opportunity ? String(quote.opportunity) : null,
        vendorId,
        customerId,
        serviceName: quote.serviceName || 'Event Service',
        eventDate: quote.eventDate || new Date().toISOString().split('T')[0],
        serviceLocation: quote.serviceLocation || {},
        pricing: quote.pricingBreakdown || { totalAmount },
        totalAmount,
        paymentSummary: {
          advancePercentage: ADVANCE_PERCENTAGE,
          advanceAmount: paidAmount,
          paidAmount,
          balanceAmount: Math.max(0, totalAmount - paidAmount),
          provider: quote.advancePayment?.provider || 'razorpay',
          providerOrderId: quote.advancePayment?.providerOrderId || '',
          providerPaymentId: paymentId || quote.advancePayment?.providerPaymentId || '',
          paidAt: quote.advancePayment?.paidAt || new Date(),
        },
        bookingStatus: 'CONFIRMED',
        settlementStatus: 'NOT_ELIGIBLE',
      },
      $set: {
        vendorName,
        customerName: actorName,
        category: vendorCategory,
        paymentSummary: {
          advancePercentage: ADVANCE_PERCENTAGE,
          advanceAmount: paidAmount,
          paidAmount,
          balanceAmount: Math.max(0, totalAmount - paidAmount),
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

  return { quote: approved, booking };
}

// ── OPPORTUNITIES (Spec §9, §10, Golden Test F) ──────────────────────────

/**
 * Transforms a structured customer requirement into actionable vendor opportunities.
 */
router.post('/opportunities/generate', requireExternalAuth, async (req, res, next) => {
  try {
    const {
      category,
      serviceLocation,
      date,
      startTime = '10:00',
      endTime = '18:00',
      guestCount = 500,
      durationHours = 8,
      requiredStyles = [],
      requiredCapability = '',
    } = req.body || {};

    if (!category || !date) {
      return res.status(400).json({ error: 'CATEGORY_AND_DATE_REQUIRED' });
    }

    // Run qualification & commercial matching engine
    const matchResult = await matchVendorsForRequirement({
      category,
      serviceLocation,
      date,
      startTime,
      endTime,
      guestCount,
      durationHours,
      requiredStyles,
    });

    const createdOpportunities = [];

    // Create an actionable Opportunity for each eligible candidate
    for (const candidate of matchResult.eligibleCandidates) {
      const opp = await Opportunity.create({
        vendor: candidate.vendorId,
        customer: req.externalUser._id,
        vendorService: candidate.serviceId,
        serviceName: candidate.serviceName,
        eventDate: date,
        serviceLocation: serviceLocation || {},
        guestCount,
        requiredCapability:
          requiredCapability ||
          `${candidate.capability?.styles?.join(', ') || 'Standard service'} (${guestCount} guests, ${durationHours} hrs)`,
        estimatedTravel: candidate.cost?.travelBreakdown?.originLocality
          ? `${candidate.cost.travelBreakdown.originLocality} -> ${serviceLocation?.locality || serviceLocation?.city || 'Venue'}`
          : `${serviceLocation?.locality || serviceLocation?.city || 'Local'}`,
        travelCost: candidate.cost?.travelCost || 0,
        status: 'NEW',
        action: 'Respond / Quote',
      });
      createdOpportunities.push(opp);

      // Create live notification for candidate vendor
      await Notification.create({
        vendor: candidate.vendorId,
        title: 'New Enquiry Received',
        message: `${candidate.serviceName} · ${date} · ${serviceLocation?.locality || 'New Town'} · ${guestCount} guests`,
        type: 'ENQUIRY',
        link: '/vendor/enquiries',
        metadata: { opportunityId: opp._id },
      });
    }

    res.json({
      ok: true,
      eligibleCount: matchResult.eligibleCount,
      excludedCount: matchResult.excludedCount,
      opportunities: createdOpportunities,
      matchingFunnel: matchResult,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Customer retrieves their generated opportunities (arrangements).
 */
router.get('/opportunities', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const filter = { customer: req.externalUser._id };
    if (req.query.status) filter.status = req.query.status;

    const opportunities = await Opportunity.find(filter)
      .populate('vendor', 'businessName category rating location')
      .populate('vendorService', 'name description pricing')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: opportunities.length, opportunities });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/demo/mahiman-enquiry', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const vendor = await VendorOrganization.findOne({
      businessName: { $regex: /^mahiman tent house$/i },
      category: 'DJ & Music',
    });
    if (!vendor) {
      return res.status(404).json({
        error: 'DEMO_VENDOR_NOT_FOUND',
        message: 'Mahiman Tent House vendor profile was not found.',
      });
    }

    const service =
      (await VendorService.findOne({ vendor: vendor._id, status: 'ACTIVE', category: 'DJ & Music' })) ||
      (await VendorService.findOne({ vendor: vendor._id, status: 'ACTIVE' }));
    if (!service) {
      return res.status(404).json({
        error: 'DEMO_VENDOR_SERVICE_NOT_FOUND',
        message: 'This vendor has no active service to quote yet.',
      });
    }

    const eventDate = req.body?.eventDate || '2026-11-26';
    const guestCount = Number(req.body?.guestCount || 150);
    const serviceLocation = {
      address: req.body?.address || 'Ritabagar celebration ground',
      locality: req.body?.locality || 'Ritabagar',
      city: req.body?.city || 'Ritabagar',
    };

    let opportunity = await Opportunity.findOne({
      vendor: vendor._id,
      customer: req.externalUser._id,
      vendorService: service._id,
      eventDate,
      status: { $in: ['NEW', 'VIEWED', 'RESPONDED'] },
    }).sort({ createdAt: -1 });

    if (!opportunity) {
      opportunity = await Opportunity.create({
        vendor: vendor._id,
        customer: req.externalUser._id,
        vendorService: service._id,
        serviceName: service.name || 'DJ & Music',
        eventDate,
        serviceLocation,
        guestCount,
        requiredCapability: 'Bollywood/Punjabi DJ setup with sound, mic and evening event support',
        estimatedTravel: `${vendor.location || 'Vendor base'} -> ${serviceLocation.locality}`,
        travelCost: 0,
        status: 'NEW',
        action: 'Respond / Quote',
      });

      await Notification.create({
        vendor: vendor._id,
        title: 'New Customer Enquiry',
        message: `${service.name || 'DJ & Music'} · ${eventDate} · ${serviceLocation.locality} · ${guestCount} guests`,
        type: 'ENQUIRY',
        link: '/vendor/enquiries',
        metadata: { opportunityId: opportunity._id },
      });
    }

    res.status(201).json({ ok: true, vendor, service, opportunity });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor retrieves their structured opportunities.
 */
router.get('/vendor/opportunities', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const filter = { vendor: vendorId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const opportunities = await Opportunity.find(filter)
      .populate('customer', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: opportunities.length, opportunities });
  } catch (err) {
    next(err);
  }
});

// ── QUOTE LIFECYCLE (Spec §9, Golden Test G) ──────────────────────────────

/**
 * Retrieves quotes for the authenticated user (vendor or customer).
 */
router.get('/quotes', requireExternalAuth, async (req, res, next) => {
  try {
    const filter = {};
    if (activeAccountType(req.externalUser) === 'VENDOR') {
      const vendorId = req.externalUser.vendorOrganization;
      if (!vendorId) {
        return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
      }
      filter.vendor = vendorId;
    } else {
      filter.customer = req.externalUser._id;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const quotes = await Quote.find(filter)
      .populate('customer', 'fullName email phone')
      .populate('vendor', 'businessName category location')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: quotes.length, quotes });
  } catch (err) {
    next(err);
  }
});

router.get('/customer/vendor-quotes', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const [opportunities, quotes, bookings] = await Promise.all([
      Opportunity.find({ customer: req.externalUser._id })
        .populate('vendor', 'businessName category location')
        .populate('vendorService', 'name pricing')
        .sort({ createdAt: -1 })
        .limit(20),
      Quote.find({ customer: req.externalUser._id })
        .populate('vendor', 'businessName category location')
        .sort({ createdAt: -1 })
        .limit(20),
      CoreBooking.find({ customerId: req.externalUser._id })
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    res.json({
      ok: true,
      opportunities,
      quotes: quotes.map(quoteForCustomer),
      bookings: bookings.map(bookingForCustomer),
      paymentsConfigured: razorpay.isConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/bookings/:id/verify-completion', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res) => {
  try {
    const booking = await CoreBooking.findOne({ _id: req.params.id, customerId: req.externalUser._id });
    if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
    if (booking.executionStatus !== 'COMPLETION_SUBMITTED') {
      return res.status(400).json({
        error: 'BOOKING_NOT_READY_FOR_CUSTOMER_VERIFICATION',
        message: 'The vendor must mark the work done before you can verify it.',
      });
    }

    const verified = await validateCompletionFromCore(
      booking._id,
      { approved: true, notes: req.body?.notes || 'Customer confirmed service completion' },
      req.externalUser.fullName || req.externalUser.email || 'CUSTOMER'
    );

    res.json({ ok: true, booking: bookingForCustomer(verified) });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'COMPLETION_VERIFICATION_FAILED', message: err.message });
  }
});

router.post('/customer/vendor-quotes/:id/negotiate', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    const counterBudget = req.body?.counterBudget ? Number(req.body.counterBudget) : null;
    
    if (!message && !counterBudget) return res.status(400).json({ error: 'MESSAGE_REQUIRED' });

    const quote = await Quote.findOne({ _id: req.params.id, customer: req.externalUser._id });
    if (!quote) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    if (quote.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'QUOTE_NOT_NEGOTIABLE', message: 'Only submitted quotes can be negotiated.' });
    }

    const reasonParts = [];
    if (counterBudget) reasonParts.push(`Proposed Budget: ₹${counterBudget}`);
    if (message) reasonParts.push(`Message: ${message}`);
    const fullReason = `Customer requested change - ${reasonParts.join(' | ')}`;

    quote.history.push({
      fromStatus: quote.status,
      toStatus: quote.status,
      changedBy: req.externalUser.fullName || req.externalUser.email,
      reason: fullReason,
      timestamp: new Date(),
    });
    
    // Vendor quote logic: If they negotiate, maybe it goes to DRAFT or stays SUBMITTED for vendor to re-review.
    // The previous code kept it as quote.status (SUBMITTED).
    await quote.save();

    await Notification.create({
      vendor: quote.vendor,
      title: 'Customer requested quote change',
      message: fullReason,
      type: 'QUOTE',
      link: '/vendor/quotes',
      metadata: { quoteId: quote._id },
    });

    res.json({ ok: true, quote: quoteForCustomer(await quote.populate('vendor', 'businessName category location')) });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/vendor-quotes/:id/pay-advance', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, customer: req.externalUser._id })
      .populate('vendor', 'businessName category location');
    if (!quote) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    if (quote.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'QUOTE_NOT_PAYABLE', message: 'This quote is not awaiting customer payment.' });
    }
    if (!razorpay.isConfigured()) {
      return res.status(503).json({ error: 'PAYMENT_NOT_CONFIGURED', message: 'Razorpay test keys are not configured on the server.' });
    }

    const total = Number(quote.pricingBreakdown?.totalAmount || 0);
    const amount = Math.ceil((total * ADVANCE_PERCENTAGE) / 100);
    if (!amount) return res.status(400).json({ error: 'INVALID_QUOTE_AMOUNT' });

    const order = await razorpay.createOrder({
      amount,
      receipt: `vq_${quote._id}`,
      notes: { quoteId: String(quote._id), customerId: String(req.externalUser._id), advancePercentage: ADVANCE_PERCENTAGE },
    });
    const orderId = order.id;
    quote.advancePayment = {
      percentage: ADVANCE_PERCENTAGE,
      amount,
      status: 'ORDER_CREATED',
      provider: 'razorpay',
      providerOrderId: orderId,
      providerPaymentId: '',
      paidAt: null,
    };
    await quote.save();

    res.json({
      ok: true,
      quote: quoteForCustomer(quote),
      checkout: {
        key: razorpay.publicKeyId(),
        orderId,
        amount: razorpay.toPaise(amount),
        currency: 'INR',
        name: 'STARVNT',
        description: `30% advance · ${quote.vendor?.businessName || 'Vendor'} · ${quote.serviceName}`,
        prefill: {
          name: req.externalUser.fullName || '',
          email: req.externalUser.email || '',
          contact: req.externalUser.phone || '',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/vendor-quotes/:id/reconcile-payment', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, customer: req.externalUser._id })
      .populate('vendor', 'businessName category location');
    if (!quote) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    const orderId = quote.advancePayment?.providerOrderId;
    if (!orderId) return res.status(400).json({ error: 'PAYMENT_ORDER_NOT_FOUND' });

    const amount = Number(quote.advancePayment?.amount || Math.ceil((Number(quote.pricingBreakdown?.totalAmount || 0) * ADVANCE_PERCENTAGE) / 100));
    const expectedPaise = razorpay.toPaise(amount);
    const payments = await razorpay.listOrderPayments(orderId);
    const captured = payments.find((payment) =>
      payment.order_id === orderId &&
      Number(payment.amount) === expectedPaise &&
      (payment.status === 'captured' || payment.captured === true)
    );
    if (!captured) {
      return res.status(402).json({
        error: 'PAYMENT_NOT_CAPTURED',
        message: 'Razorpay has not confirmed a captured payment for this order yet.',
      });
    }

    const result = await completePaidVendorQuote({
      quote,
      actorName: req.externalUser.fullName || req.externalUser.email,
      paymentId: captured.id,
    });

    res.json({ ok: true, quote: quoteForCustomer(result.quote), booking: result.booking });
  } catch (err) {
    res.status(err.statusCode || err.status || 400).json({ error: err.code || 'PAYMENT_RECONCILIATION_FAILED', message: err.message });
  }
});

router.post('/customer/vendor-quotes/:id/checkout-complete', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, customer: req.externalUser._id })
      .populate('vendor', 'businessName category location');
    if (!quote) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const orderId = quote.advancePayment?.providerOrderId;
    if (!orderId || razorpay_order_id !== orderId) {
      return res.status(400).json({ error: 'ORDER_MISMATCH' });
    }
    if (!razorpay.verifyCheckoutSignature({ orderId, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
      const amount = Number(quote.advancePayment?.amount || Math.ceil((Number(quote.pricingBreakdown?.totalAmount || 0) * ADVANCE_PERCENTAGE) / 100));
      const expectedPaise = razorpay.toPaise(amount);
      const payments = await razorpay.listOrderPayments(orderId).catch(() => []);
      const captured = payments.find((payment) =>
        payment.id === razorpay_payment_id &&
        Number(payment.amount) === expectedPaise &&
        (payment.status === 'captured' || payment.captured === true)
      );
      if (!captured) {
        quote.advancePayment.status = 'FAILED';
        await quote.save();
        return res.status(400).json({ error: 'PAYMENT_SIGNATURE_INVALID', message: 'Payment could not be verified.' });
      }
    }

    const result = await completePaidVendorQuote({
      quote,
      actorName: req.externalUser.fullName || req.externalUser.email,
      paymentId: razorpay_payment_id,
    });

    res.json({ ok: true, quote: quoteForCustomer(result.quote), booking: result.booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'PAYMENT_CONFIRMATION_FAILED', message: err.message });
  }
});

/**
 * Vendor-specific endpoint to retrieve quotes.
 */
router.get('/vendor/quotes', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const filter = { vendor: vendorId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const quotes = await Quote.find(filter)
      .populate('customer', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: quotes.length, quotes });
  } catch (err) {
    next(err);
  }
});

/**
 * Creates a new Quote proposal (DRAFT or SUBMITTED).
 */
router.post('/quotes', requireExternalAuth, async (req, res, next) => {
  try {
    const {
      opportunityId,
      customerId,
      vendorId: inputVendorId,
      vendorServiceId,
      serviceName,
      eventDate,
      serviceLocation,
      pricingBreakdown,
      notes,
      status = 'SUBMITTED',
    } = req.body || {};

    const resolvedVendorId =
      activeAccountType(req.externalUser) === 'VENDOR'
        ? req.externalUser.vendorOrganization
        : inputVendorId;

    if (!resolvedVendorId) {
      return res.status(400).json({ error: 'VENDOR_ID_REQUIRED' });
    }

    const normalizedPricing = normalizePricingBreakdown(pricingBreakdown);
    if (!normalizedPricing.basePrice || !normalizedPricing.totalAmount) {
      return res.status(400).json({
        error: 'INVALID_QUOTE_AMOUNT',
        message: 'Enter a valid quote amount before sending the offer.',
      });
    }

    const quote = await createQuote({
      opportunityId,
      vendorId: resolvedVendorId,
      customerId: customerId || req.externalUser._id,
      vendorServiceId,
      serviceName: serviceName || 'Event Service',
      eventDate,
      serviceLocation,
      pricingBreakdown: normalizedPricing,
      notes: String(notes || '').trim(),
      status,
      actor: req.externalUser.fullName || req.externalUser.email,
    });

    if (opportunityId) {
      await Opportunity.findOneAndUpdate(
        { _id: opportunityId, vendor: resolvedVendorId },
        { status: 'RESPONDED', action: 'Quote Sent' }
      );
    }

    res.status(201).json({ ok: true, quote });
  } catch (err) {
    next(err);
  }
});

router.post('/vendor/quotes/:id/revise', requireExternalAuth, requireAccountType('VENDOR'), async (req, res) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });

    const quote = await Quote.findOne({ _id: req.params.id, vendor: vendorId });
    if (!quote) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    if (!['DRAFT', 'SUBMITTED'].includes(quote.status)) {
      return res.status(400).json({
        error: 'QUOTE_NOT_EDITABLE',
        message: 'Only draft or submitted quotes can be revised.',
      });
    }

    const pricing = normalizePricingBreakdown(req.body?.pricingBreakdown || {});
    if (!pricing.basePrice || !pricing.totalAmount) {
      return res.status(400).json({
        error: 'INVALID_QUOTE_AMOUNT',
        message: 'Enter a valid revised quote amount.',
      });
    }

    const message = String(req.body?.notes || req.body?.message || '').trim();
    const previousStatus = quote.status;
    quote.pricingBreakdown = pricing;
    quote.notes = message;
    quote.status = 'SUBMITTED';
    quote.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    quote.advancePayment = {
      percentage: ADVANCE_PERCENTAGE,
      amount: 0,
      status: 'NOT_STARTED',
      provider: 'razorpay',
      providerOrderId: '',
      providerPaymentId: '',
      paidAt: null,
    };
    quote.history.push({
      fromStatus: previousStatus,
      toStatus: 'SUBMITTED',
      changedBy: req.externalUser.fullName || req.externalUser.email || 'Vendor',
      reason: message ? `Vendor revised offer: ${message}` : `Vendor revised offer to ₹${pricing.totalAmount.toLocaleString('en-IN')}`,
      timestamp: new Date(),
    });
    await quote.save();

    res.json({
      ok: true,
      quote: await quote.populate('customer', 'fullName email phone'),
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'QUOTE_REVISION_FAILED', message: err.message });
  }
});

/**
 * Fetches quote by ID.
 */
router.get('/quotes/:id', requireExternalAuth, async (req, res, next) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('vendor', 'businessName category rating location')
      .populate('customer', 'fullName email');

    if (!quote) {
      return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    }

    res.json({ ok: true, quote });
  } catch (err) {
    next(err);
  }
});

/**
 * Transitions quote status (Golden Test G).
 * Rejects illegal transitions server-side with controlled 400 and audit.
 */
router.post('/quotes/:id/transition', requireExternalAuth, async (req, res) => {
  try {
    const { targetStatus, reason } = req.body || {};
    if (!targetStatus) {
      return res.status(400).json({ error: 'TARGET_STATUS_REQUIRED' });
    }

    const quote = await transitionQuote(req.params.id, targetStatus, {
      actor: req.externalUser.fullName || req.externalUser.email,
      reason,
    });

    if (targetStatus === 'APPROVED') {
      await Notification.create({
        vendor: quote.vendor,
        title: 'Client Approved Your Quote! 🎉',
        message: `Quote for ${quote.serviceName} (${quote.eventDate}) approved at ₹${(quote.pricingBreakdown?.totalAmount || 0).toLocaleString()}. Core Booking created.`,
        type: 'QUOTE',
        link: '/vendor/bookings',
        metadata: { quoteId: quote._id },
      });
    }

    res.json({ ok: true, quote });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      error: err.code || 'INVALID_QUOTE_TRANSITION',
      message: err.message,
      details: err.details || null,
    });
  }
});

// ── VENDOR EXECUTION WORKSPACE (Spec §11, §17, Golden Test J) ──────────────

/**
 * Customer retrieves their confirmed bookings.
 */
router.get('/bookings', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const bookings = await CoreBooking.find({ customerId: req.externalUser._id }).sort({ eventDate: 1 })
      .populate('vendorId', 'businessName category')
      .populate('quoteId');
    res.json({ ok: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor retrieves their assigned bookings.
 */
router.get('/vendor/bookings', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const bookings = await CoreBooking.find({ vendorId }).sort({ eventDate: 1 });
    res.json({ ok: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor marks service execution as started.
 */
router.post('/vendor/bookings/:id/start', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    const booking = await startService(req.params.id, vendorId);
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'EXECUTION_ERROR', message: err.message });
  }
});

/**
 * Vendor submits completion evidence (Golden Test J).
 */
router.post(
  '/vendor/bookings/:id/submit-completion',
  requireExternalAuth,
  requireAccountType('VENDOR'),
  async (req, res) => {
    try {
      const vendorId = req.externalUser.vendorOrganization;
      const { deliverablesUrl, checklist, notes } = req.body || {};

      const booking = await submitCompletionEvidence(req.params.id, vendorId, {
        deliverablesUrl,
        checklist,
        notes,
      });

      res.json({ ok: true, booking });
    } catch (err) {
      res.status(err.statusCode || 400).json({ error: err.code || 'COMPLETION_ERROR', message: err.message });
    }
  }
);

/**
 * NON-NEGOTIABLE CORE AUTHORITY GUARDS:
 * Vendor cannot declare PAYMENT_VERIFIED, COMPLETION_VERIFIED, or SETTLEMENT_ELIGIBLE (Golden Test J, Spec §3, §11).
 */
router.post(
  '/vendor/bookings/:id/verify-completion',
  requireExternalAuth,
  requireAccountType('VENDOR'),
  (req, res) => {
    return res.status(403).json({
      error: 'CORE_AUTHORITY_VIOLATION',
      message: 'Vendor cannot declare COMPLETION_VERIFIED. Completion validation is strictly Core Platform authority.',
    });
  }
);

router.post(
  '/vendor/bookings/:id/verify-payment',
  requireExternalAuth,
  requireAccountType('VENDOR'),
  (req, res) => {
    return res.status(403).json({
      error: 'CORE_AUTHORITY_VIOLATION',
      message: 'Vendor cannot declare PAYMENT_VERIFIED. Payment verification is strictly Core Platform authority.',
    });
  }
);

export default router;
