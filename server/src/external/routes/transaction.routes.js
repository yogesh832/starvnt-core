import express from 'express';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { VendorMessageThread } from '../models/VendorMessageThread.js';
import { notifyCustomer, notifyVendor } from '../../notifications/notification.service.js';
import mongoose from 'mongoose';
import { Booking, EventMessage, CustomerEvent, EventRequirement, EventHistory, Reservation } from '../../customer/models/index.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { activeAccountType } from '../models/ExternalUser.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { matchVendorsForRequirement } from '../services/matching.service.js';
import { createQuote, transitionQuote } from '../services/quoteStateMachine.service.js';
import { startService, submitCompletionEvidence, validateCompletionFromCore } from '../../admin/services/executionSettlement.service.js';
import { recordLifecycleEventMessage } from '../../customer/services/circle.service.js';
import * as razorpay from '../../customer/services/payments/razorpay.js';
import { validateCouponForPayment, recordCouponUsageOnce } from '../../customer/services/coupon.service.js';

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
  const couponDiscountAmount = Number(quote.advancePayment?.couponDiscountAmount || 0);
  const payableAdvance = quote.advancePayment?.amount || Math.max(1, advanceAmount - couponDiscountAmount);
  return {
    id: String(quote._id),
    quoteReference: quote.quoteReference,
    opportunityId: quote.opportunity ? String(quote.opportunity) : null,
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
    advanceAmount: payableAdvance,
    originalAdvanceAmount: quote.advancePayment?.originalAdvanceAmount || advanceAmount,
    coupon: quote.advancePayment?.couponCode ? {
      code: quote.advancePayment.couponCode,
      discountAmount: couponDiscountAmount,
    } : null,
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
  if (quote.advancePayment?.couponCode && !quote.advancePayment?.couponUsageRecorded) {
    await recordCouponUsageOnce(quote.advancePayment.couponCode);
    quote.advancePayment.couponUsageRecorded = true;
  }
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
          couponCode: quote.advancePayment?.couponCode || '',
          couponDiscountAmount: Number(quote.advancePayment?.couponDiscountAmount || 0),
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

      // Create live notification for candidate vendor through central notification service.
      await notifyVendor({
        vendorId: candidate.vendorId,
        title: 'New Enquiry Received',
        message: `${candidate.serviceName} · ${date} · ${serviceLocation?.locality || 'New Town'} · ${guestCount} guests`,
        type: 'ENQUIRY',
        priority: 'HIGH',
        link: '/vendor/enquiries',
        idempotencyKey: `vendor.enquiry.${opp._id}`,
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

      await notifyVendor({
        vendorId: vendor._id,
        title: 'New Customer Enquiry',
        message: `${service.name || 'DJ & Music'} · ${eventDate} · ${serviceLocation.locality} · ${guestCount} guests`,
        type: 'ENQUIRY',
        priority: 'HIGH',
        link: '/vendor/enquiries',
        idempotencyKey: `vendor.enquiry.${opportunity._id}`,
        metadata: { opportunityId: opportunity._id },
      });
    }

    await recordLifecycleEventMessage({
      vendorId: vendor._id,
      customerId: req.externalUser._id,
      eventId: opportunity.customerEvent,
      opportunityId: opportunity._id,
      sender: 'CLIENT',
      senderName: req.externalUser.fullName || req.externalUser.email || 'Customer',
      text: `📩 New Enquiry Sent to ${vendor.businessName}: ${service.name || 'DJ & Music'} for event date ${eventDate} (${guestCount} guests) at ${serviceLocation.address || 'service venue'}.`,
      type: 'enquiry',
    }).catch(() => null);

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

    // Cross-check with existing quotes to ensure accurate RESPONDED status
    const oppIds = opportunities.map((o) => o._id);
    const existingQuotes = await Quote.find({ vendor: vendorId, opportunity: { $in: oppIds } }).select('opportunity status').lean().catch(() => []);
    const quotedOppMap = new Map(existingQuotes.map((q) => [String(q.opportunity), q.status]));

    const enrichedOpps = opportunities.map((o) => {
      const plain = o.toObject();
      const quoteStatus = quotedOppMap.get(String(o._id));
      if (quoteStatus || plain.status === 'RESPONDED') {
        plain.status = 'RESPONDED';
        plain.quoteStatus = quoteStatus || 'SUBMITTED';
      }
      return plain;
    });

    res.json({ ok: true, count: enrichedOpps.length, opportunities: enrichedOpps });
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

    const formattedBudget = counterBudget ? ('₹' + Number(counterBudget).toLocaleString('en-IN')) : null;
    const formattedOriginal = quote.pricingBreakdown?.totalAmount
      ? ('₹' + Number(quote.pricingBreakdown.totalAmount).toLocaleString('en-IN'))
      : null;

    let completeMessage = '';
    if (counterBudget && message) {
      completeMessage = `💬 Counter Quote Proposal: ${formattedBudget}${formattedOriginal ? ' (Original Quote: ' + formattedOriginal + ')' : ''}\n\n"${message}"\n\nThis is my proposed budget for ${quote.serviceName}. Can we do it within this budget? Is this acceptable to you? Please review and send a revised quotation if possible. Thank you!`;
    } else if (counterBudget) {
      completeMessage = `💬 Counter Quote Proposal: ${formattedBudget}${formattedOriginal ? ' (Original Quote: ' + formattedOriginal + ')' : ''}\n\nThis is my proposed budget for ${quote.serviceName}. Can we do it within this budget? Is this acceptable to you? Please review and send a revised quotation if possible. Thank you!`;
    } else {
      completeMessage = `💬 Quote Negotiation Request:\n\n"${message}"\n\nCould you please review and send a revised quotation based on my request? Thank you!`;
    }

    const reasonParts = [];
    if (counterBudget) reasonParts.push(`Proposed Budget: ₹${counterBudget}`);
    if (message) reasonParts.push(`Message: ${message}`);
    const fullReason = `Customer requested change - ${reasonParts.join(' | ')}`;

    quote.history.push({
      fromStatus: quote.status,
      toStatus: quote.status,
      changedBy: req.externalUser.fullName || req.externalUser.email || 'Customer',
      reason: fullReason,
      timestamp: new Date(),
    });
    await quote.save();

    // Find or create direct contextual thread in VendorMessageThread
    let thread = await VendorMessageThread.findOne({
      vendor: quote.vendor,
      $or: [
        { customer: quote.customer },
        ...(quote.opportunity ? [{ opportunity: quote.opportunity }] : []),
      ],
    });

    if (!thread) {
      thread = new VendorMessageThread({
        vendor: quote.vendor,
        customer: quote.customer,
        opportunity: quote.opportunity || null,
        clientName: req.externalUser.fullName || req.externalUser.email || 'Client',
        clientPhone: req.externalUser.phone || '',
        clientEmail: req.externalUser.email || '',
        eventName: quote.serviceName || 'Event Service',
        eventType: 'Quote Negotiation',
        eventDate: quote.eventDate || '',
        venueLocation: quote.serviceLocation?.address || quote.serviceLocation?.city || '',
        messages: [
          {
            sender: 'SYSTEM',
            senderName: 'STARVNT Core',
            text: `Quote ${quote.quoteReference || ''} was submitted for ${quote.serviceName}${formattedOriginal ? ' at ' + formattedOriginal : ''}.`,
            isRead: true,
            createdAt: new Date(Date.now() - 1000),
          },
        ],
      });
    }

    const newMsg = {
      sender: 'CLIENT',
      senderName: req.externalUser.fullName || 'Client',
      text: completeMessage,
      isRead: false,
      metadata: {
        type: 'COUNTER_QUOTE',
        quoteId: quote._id,
        quoteReference: quote.quoteReference,
        counterBudget,
        originalAmount: quote.pricingBreakdown?.totalAmount,
        customerNote: message,
      },
      createdAt: new Date(),
    };

    thread.messages.push(newMsg);
    thread.lastMessageText = completeMessage;
    thread.lastMessageAt = new Date();
    thread.unreadVendorCount = (thread.unreadVendorCount || 0) + 1;
    await thread.save();

    // Create vendor notification linking directly to chat thread.
    await notifyVendor({
      vendorId: quote.vendor,
      title: 'Customer requested quote change',
      message: fullReason,
      type: 'MESSAGE',
      priority: 'HIGH',
      link: '/vendor/messages',
      idempotencyKey: `vendor.quote.counter.${quote._id}.${thread._id}.${thread.messages.length}`,
      metadata: {
        quoteId: quote._id,
        threadId: thread._id,
        counterBudget,
        note: message,
      },
    });

    // If linked to an opportunity with customer event, sync to Event Circle as well
    if (quote.opportunity) {
      try {
        const opp = await Opportunity.findById(quote.opportunity).lean();
        if (opp?.customerEvent) {
          await EventMessage.create({
            event: opp.customerEvent,
            senderType: 'customer',
            senderCustomer: req.externalUser._id,
            senderName: req.externalUser.fullName || 'You',
            body: completeMessage,
          });
        }
      } catch (e) {
        console.warn('[Negotiate] EventMessage sync skipped:', e.message);
      }
    }

    res.json({ ok: true, quote: quoteForCustomer(await quote.populate('vendor', 'businessName category location')), threadId: thread._id });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/vendor-quotes/:id/accept', requireExternalAuth, requireAccountType('CUSTOMER'), async (req, res, next) => {
  try {
    const quote = await Quote.findOne({ _id: req.params.id, customer: req.externalUser._id })
      .populate('vendor', 'businessName category location');
    if (!quote) return res.status(404).json({ error: 'QUOTE_NOT_FOUND', message: 'Quote not found.' });

    // Locate customer's event
    let event = null;
    if (req.body?.eventId) {
      event = await CustomerEvent.findOne({ _id: req.body.eventId, customer: req.externalUser._id });
    }
    if (!event && quote.opportunity) {
      const opp = await Opportunity.findById(quote.opportunity).lean();
      if (opp?.customerEvent) {
        event = await CustomerEvent.findOne({ _id: opp.customerEvent, customer: req.externalUser._id });
      }
    }
    if (!event) {
      event = await CustomerEvent.findOne({
        customer: req.externalUser._id,
        status: { $in: ['draft', 'planning'] },
      }).sort({ updatedAt: -1 });
    }

    if (quote.status === 'SUBMITTED') {
      await transitionQuote(quote._id, 'APPROVED', {
        actor: req.externalUser.fullName || req.externalUser.email || 'Customer',
        reason: 'Customer accepted vendor offer',
      });
      quote.status = 'APPROVED';
      await quote.save();

      await notifyVendor({
        vendorId: quote.vendor?._id || quote.vendor,
        title: 'Client approved your quote',
        message: `${req.externalUser.fullName || 'Client'} accepted your quote for ${quote.serviceName} (${quote.eventDate}) at ₹${(quote.pricingBreakdown?.totalAmount || 0).toLocaleString('en-IN')}. Advance payment reservation opened.`,
        type: 'QUOTE',
        priority: 'HIGH',
        link: '/vendor/bookings',
        idempotencyKey: `vendor.quote.approved.${quote._id}`,
        metadata: { quoteId: quote._id },
      });
    } else if (quote.status !== 'APPROVED') {
      return res.status(400).json({
        error: 'QUOTE_NOT_ACCEPTABLE',
        message: 'Only submitted quotes can be accepted.',
      });
    }

    let reservation = null;
    if (event) {
      const category = quote.vendor?.category || 'other';
      let reqDoc = await EventRequirement.findOne({ event: event._id, category });
      if (!reqDoc) {
        reqDoc = await EventRequirement.create({
          event: event._id,
          category,
          status: 'confirmed',
          source: 'customer',
          providedValue: quote.serviceName,
          selectedOptionId: quote.vendorService ? `vs_${quote.vendorService}` : `quote_${quote._id}`,
          selectedOption: {
            vendorName: quote.vendor?.businessName || 'Vendor',
            packageName: quote.serviceName,
            price: quote.pricingBreakdown?.totalAmount || 0,
            isDemo: false,
          },
        });
      } else {
        reqDoc.status = 'confirmed';
        reqDoc.selectedOptionId = quote.vendorService ? `vs_${quote.vendorService}` : `quote_${quote._id}`;
        reqDoc.selectedOption = {
          vendorName: quote.vendor?.businessName || 'Vendor',
          packageName: quote.serviceName,
          price: quote.pricingBreakdown?.totalAmount || 0,
          isDemo: false,
        };
        await reqDoc.save();
      }

      await Reservation.updateMany(
        { requirement: reqDoc._id, status: 'pending_payment' },
        { $set: { status: 'cancelled' } }
      );

      const total = Number(quote.pricingBreakdown?.totalAmount || 0);
      const advance = quote.advancePayment?.amount || Math.ceil((total * ADVANCE_PERCENTAGE) / 100);
      const expiresAt = new Date(Date.now() + 48 * 3600000);

      reservation = await Reservation.findOne({
        event: event._id,
        customer: req.externalUser._id,
        quote: quote._id,
      });

      if (reservation) {
        reservation.category = category;
        reservation.requirement = reqDoc._id;
        reservation.vendorName = quote.vendor?.businessName || 'Vendor';
        reservation.packageName = quote.serviceName;
        reservation.packageTotal = total;
        reservation.advancePercent = quote.advancePayment?.percentage || ADVANCE_PERCENTAGE;
        reservation.amount = advance;
        reservation.balanceAmount = Math.max(0, total - advance);
        reservation.isDemo = false;
        reservation.status = 'pending_payment';
        reservation.expiresAt = expiresAt;
        await reservation.save();
      } else {
        reservation = await Reservation.create({
          event: event._id,
          customer: req.externalUser._id,
          quote: quote._id,
          quoteItem: new mongoose.Types.ObjectId(),
          requirement: reqDoc._id,
          category,
          optionId: quote.vendorService ? `vs_${quote.vendorService}` : `quote_${quote._id}`,
          vendorName: quote.vendor?.businessName || 'Vendor',
          packageName: quote.serviceName,
          packageTotal: total,
          advancePercent: quote.advancePayment?.percentage || ADVANCE_PERCENTAGE,
          amount: advance,
          balanceAmount: Math.max(0, total - advance),
          isDemo: false,
          status: 'pending_payment',
          expiresAt,
        });
      }

      await EventHistory.create({
        event: event._id,
        actorType: 'customer',
        actorId: String(req.externalUser._id),
        action: 'quote_accepted',
        details: { quoteId: quote._id, total, vendorName: quote.vendor?.businessName },
      });
    }

    res.json({
      ok: true,
      quote: quoteForCustomer(quote),
      eventId: event?._id,
      reservationId: reservation?._id,
    });
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
    const originalAdvanceAmount = Math.ceil((total * ADVANCE_PERCENTAGE) / 100);
    const { coupon, discountAmount } = await validateCouponForPayment(req.body?.couponCode, {
      orderAmount: total,
      baseAmount: originalAdvanceAmount,
    });
    const amount = Math.max(1, originalAdvanceAmount - discountAmount);
    if (!amount) return res.status(400).json({ error: 'INVALID_QUOTE_AMOUNT' });

    const order = await razorpay.createOrder({
      amount,
      receipt: `vq_${quote._id}`,
      notes: {
        quoteId: String(quote._id),
        customerId: String(req.externalUser._id),
        advancePercentage: ADVANCE_PERCENTAGE,
        couponCode: coupon?.code || '',
        couponDiscount: discountAmount ? String(discountAmount) : '',
      },
    });
    const orderId = order.id;
    quote.advancePayment = {
      percentage: ADVANCE_PERCENTAGE,
      amount,
      status: 'ORDER_CREATED',
      provider: 'razorpay',
      providerOrderId: orderId,
      providerPaymentId: '',
      couponCode: coupon?.code || '',
      couponDiscountAmount: discountAmount,
      originalAdvanceAmount,
      couponUsageRecorded: false,
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

    const vendorOrg = await VendorOrganization.findById(resolvedVendorId).lean().catch(() => null);
    const vendorName = vendorOrg?.businessName || 'Vendor Partner';
    const totalAmount = Number(quote.pricingBreakdown?.totalAmount || 0);
    const advanceAmount = Number(quote.advanceAmount || Math.ceil((totalAmount * ADVANCE_PERCENTAGE) / 100));

    await recordLifecycleEventMessage({
      vendorId: resolvedVendorId,
      customerId: quote.customer,
      eventId: quote.event,
      opportunityId: quote.opportunity,
      quoteId: quote._id,
      sender: 'VENDOR',
      senderName: vendorName,
      text: `📄 Quote Received: ${vendorName} sent a quote offer for ${quote.serviceName || 'Service Package'} — Total ₹${totalAmount.toLocaleString('en-IN')} (Advance: ₹${advanceAmount.toLocaleString('en-IN')}). Review proposal and accept in quotes.`,
      type: 'quote',
    }).catch(() => null);

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

    const rawMessage = String(req.body?.notes || req.body?.message || '').trim();
    let cleanMessage = rawMessage;
    while (/^(Vendor revised offer:\s*|Revised proposal in response to customer counter offer:\s*|Customer requested change\s*-\s*)/i.test(cleanMessage)) {
      cleanMessage = cleanMessage.replace(/^(Vendor revised offer:\s*|Revised proposal in response to customer counter offer:\s*|Customer requested change\s*-\s*)/i, '').trim();
    }
    const reasonText = cleanMessage
      ? `Vendor revised offer: ${cleanMessage}`
      : `Vendor revised offer to ₹${pricing.totalAmount.toLocaleString('en-IN')}`;

    const previousStatus = quote.status;
    quote.pricingBreakdown = pricing;
    quote.notes = cleanMessage || reasonText;
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
      reason: reasonText,
      timestamp: new Date(),
    });
    await quote.save();

    // Sync notification and chat thread message
    try {
      await notifyCustomer({
        customerId: quote.customer,
        title: 'Vendor Revised Offer',
        body: `${quote.vendor?.businessName || 'Vendor'} sent a revised quotation for ${quote.serviceName}: ₹${pricing.totalAmount.toLocaleString('en-IN')}.`,
        type: 'quote',
        priority: 'HIGH',
        actionUrl: '/customer/events',
        idempotencyKey: `customer.quote.revised.${quote._id}.${quote.history.length}`,
        payload: { quoteId: quote._id },
      });

      const thread = await VendorMessageThread.findOne({
        vendor: quote.vendor,
        customer: quote.customer,
      });
      if (thread) {
        const text = `📄 Vendor Revised Quotation:\nTotal: ₹${pricing.totalAmount.toLocaleString('en-IN')}${cleanMessage ? '\nNotes: ' + cleanMessage : ''}`;
        thread.messages.push({
          sender: 'VENDOR',
          senderName: req.externalUser.fullName || 'Vendor',
          text,
          isRead: false,
          metadata: {
            type: 'QUOTE_REVISION',
            quoteId: quote._id,
            totalAmount: pricing.totalAmount,
          },
          createdAt: new Date(),
        });
        thread.lastMessageText = text;
        thread.lastMessageAt = new Date();
        thread.unreadClientCount = (thread.unreadClientCount || 0) + 1;
        await thread.save();
      }
    } catch (e) {
      console.warn('[ReviseQuote] Thread message sync skipped:', e.message);
    }

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
      await notifyVendor({
        vendorId: quote.vendor,
        title: 'Client approved your quote',
        message: `Quote for ${quote.serviceName} (${quote.eventDate}) approved at ₹${(quote.pricingBreakdown?.totalAmount || 0).toLocaleString()}. Core Booking created.`,
        type: 'QUOTE',
        priority: 'HIGH',
        link: '/vendor/bookings',
        idempotencyKey: `vendor.quote.transition.approved.${quote._id}`,
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

    // Auto-sync any APPROVED/BOOKED/ACCEPTED quotes for this vendor into CoreBooking if missing
    try {
      const approvedQuotes = await Quote.find({
        vendor: vendorId,
        status: { $in: ['APPROVED', 'BOOKED', 'ACCEPTED'] },
      }).populate('customer', 'fullName email phone').lean();

      for (const q of approvedQuotes) {
        const existing = await CoreBooking.findOne({
          $or: [{ quoteId: String(q._id) }, { quoteId: q._id }],
        });
        if (!existing) {
          const totalAmount = q.pricingBreakdown?.totalAmount || q.amount || 0;
          const advanceAmount = q.advancePayment?.amount || q.pricingBreakdown?.advanceAmount || Math.round(totalAmount * 0.2);
          const customerName = q.customer?.fullName || q.customer?.email || 'Customer';
          await CoreBooking.create({
            quoteId: String(q._id),
            quoteReference: q.quoteReference || `QT-${String(q._id).slice(-6)}`,
            bookingReference: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
            opportunityId: q.opportunity ? String(q.opportunity) : null,
            vendorId: q.vendor,
            customerId: q.customer?._id || q.customer,
            serviceName: q.serviceName || 'Event Service',
            eventDate: q.eventDate || new Date().toISOString().split('T')[0],
            serviceLocation: q.serviceLocation || {},
            pricing: q.pricingBreakdown || { totalAmount },
            totalAmount,
            bookingStatus: 'CONFIRMED',
            paymentStatus: 'PAYMENT_VERIFIED',
            executionStatus: 'SERVICE_SCHEDULED',
            settlementStatus: 'NOT_ELIGIBLE',
            customerName,
            vendorName: 'Vendor',
            category: q.category || 'Service',
            paymentSummary: {
              advancePercentage: q.advancePayment?.percentage || 20,
              advanceAmount,
              paidAmount: advanceAmount,
              balanceAmount: Math.max(0, totalAmount - advanceAmount),
            },
          }).catch((e) => console.warn('[vendor/bookings auto-sync notice]:', e.message));
        }
      }
    } catch (syncErr) {
      console.warn('[vendor/bookings sync error]:', syncErr.message);
    }

    const bookings = await CoreBooking.find({
      $or: [{ vendorId }, { vendorId: String(vendorId) }],
    }).sort({ eventDate: 1 });
    res.json({ ok: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
});

async function resolveCustomerEventAndBooking(coreBooking) {
  let eventId = coreBooking?.customerEvent || null;
  let custBooking = null;
  let customerId = coreBooking?.customerId || null;

  if (coreBooking?.quoteId) {
    custBooking = await Booking.findOne({
      $or: [
        { _id: coreBooking.quoteId },
        { reservation: coreBooking.quoteId },
        { customer: coreBooking.customerId, category: coreBooking.category },
      ],
    }).lean().catch(() => null);
  }

  if (!custBooking && coreBooking?.customerId && coreBooking?.category) {
    custBooking = await Booking.findOne({
      customer: coreBooking.customerId,
      category: coreBooking.category,
    }).sort({ createdAt: -1 }).lean().catch(() => null);
  }

  if (custBooking) {
    if (custBooking.event) eventId = custBooking.event;
    if (custBooking.customer) customerId = custBooking.customer;
  }

  if (!eventId && coreBooking?.quoteId) {
    const vq = await Quote.findById(coreBooking.quoteId).lean().catch(() => null);
    if (vq?.customerEvent) eventId = vq.customerEvent;
    if (vq?.customer) customerId = customerId || vq.customer;
    if (!eventId && vq?.opportunity) {
      const opp = await Opportunity.findById(vq.opportunity).lean().catch(() => null);
      if (opp?.customerEvent) eventId = opp.customerEvent;
      if (opp?.customer) customerId = customerId || opp.customer;
    }
  }

  if (!eventId && coreBooking?.opportunityId) {
    const opp = await Opportunity.findById(coreBooking.opportunityId).lean().catch(() => null);
    if (opp?.customerEvent) eventId = opp.customerEvent;
    if (opp?.customer) customerId = customerId || opp.customer;
  }

  if (!eventId && customerId) {
    const latestEvent = await CustomerEvent.findOne({ customer: customerId, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .lean()
      .catch(() => null);
    if (latestEvent) eventId = latestEvent._id;
  }

  if (!customerId && eventId) {
    const ev = await CustomerEvent.findById(eventId).lean().catch(() => null);
    if (ev?.customer) customerId = ev.customer;
  }

  return { eventId, custBooking, customerId };
}

/**
 * Vendor marks service execution as started.
 */
router.post('/vendor/bookings/:id/start', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    const booking = await startService(req.params.id, vendorId);

    // Sync status and notify customer
    try {
      const vendorOrg = await VendorOrganization.findById(vendorId).lean();
      const vendorName = vendorOrg?.businessName || booking.vendorName || 'Vendor';
      const serviceName = booking.serviceName || 'Event Service';
      const text = `🚀 Service Commenced (Check-in Done): We have started working on your service (${serviceName}).`;

      const { eventId, custBooking, customerId } = await resolveCustomerEventAndBooking(booking);
      const targetCustomerId = customerId || booking.customerId;

      // Save resolved eventId back onto core booking if missing
      if (eventId && !booking.customerEvent) {
        booking.customerEvent = eventId;
        await booking.save().catch(() => null);
      }

      // 0. Sync CustomerBooking
      if (custBooking) {
        await Booking.updateOne(
          { _id: custBooking._id },
          { $set: { executionStatus: 'SERVICE_STARTED', startedAt: new Date() } }
        ).catch(() => null);
      } else if (targetCustomerId && booking.category) {
        await Booking.updateMany(
          { customer: targetCustomerId, category: booking.category },
          { $set: { executionStatus: 'SERVICE_STARTED', startedAt: new Date() } }
        ).catch(() => null);
      }

      // 1. Post to VendorMessageThread
      if (targetCustomerId) {
        await VendorMessageThread.findOneAndUpdate(
          {
            $or: [
              { customerBooking: booking._id },
              { vendor: vendorId, customer: targetCustomerId },
            ],
          },
          {
            $set: {
              lastMessageText: text,
              lastMessageAt: new Date(),
              status: 'ACTIVE',
            },
            $push: {
              messages: {
                sender: 'VENDOR',
                senderName: vendorName,
                text,
                isRead: false,
                createdAt: new Date(),
              },
            },
            $inc: { unreadClientCount: 1 },
          }
        ).catch(() => null);
      }

      // 2. Post to EventMessage (Circle chat) with structured payload
      if (eventId) {
        await EventMessage.create({
          event: eventId,
          booking: custBooking?._id || booking._id,
          senderType: 'vendor',
          senderName: vendorName,
          body: text,
          payload: {
            type: 'SERVICE_STARTED',
            bookingId: booking._id,
            eventId,
            vendorName,
            serviceName,
            actionUrl: `/customer/events/${eventId}/bookings`,
            actionLabel: 'View Booking',
          },
        }).catch((e) => console.warn('[startService EventMessage err]:', e.message));
      }

      // 3. Send HIGH priority Notification to Customer
      if (targetCustomerId) {
        await notifyCustomer({
          customerId: targetCustomerId,
          eventId,
          bookingId: custBooking?._id || booking._id,
          type: 'message',
          priority: 'HIGH',
          title: `🚀 Service Started - ${vendorName}`,
          body: text,
          actionUrl: eventId ? `/customer/events/${eventId}/bookings` : `/customer/bookings`,
          idempotencyKey: `start-work-${booking._id}-${Date.now()}`,
          payload: {
            bookingId: custBooking?._id || booking._id,
            coreBookingId: booking._id,
            eventId,
          },
        }).catch((e) => console.warn('[startService notifyCustomer err]:', e.message));
      }
    } catch (notifyErr) {
      console.warn('[startService notify notice]:', notifyErr.message);
    }

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
      const { deliverablesUrl, checklist, notes, files, photos, videos } = req.body || {};

      const booking = await submitCompletionEvidence(req.params.id, vendorId, {
        deliverablesUrl,
        checklist,
        notes,
        files,
        photos,
        videos,
      });

      // Notify customer with High Priority to review evidence, verify completion, and pay balance
      try {
        const vendorOrg = await VendorOrganization.findById(vendorId).lean();
        const vendorName = vendorOrg?.businessName || booking.vendorName || 'Vendor';
        const refName = booking.bookingReference || `BK-${String(booking._id).slice(-4)}`;
        const evidenceUrl = deliverablesUrl || (photos && photos[0]) || (videos && videos[0]) || '';

        const textParts = [
          `📸 Work Marked Done & Completion Evidence Uploaded for ${refName} by ${vendorName}.`,
          notes ? `Notes: ${notes}` : '',
          evidenceUrl ? `Proof: ${evidenceUrl}` : '',
          `Please inspect the uploaded evidence assets and verify completion to unlock settlement.`,
        ];
        const text = textParts.filter(Boolean).join('\n');

        const { eventId, custBooking, customerId } = await resolveCustomerEventAndBooking(booking);
        const targetCustomerId = customerId || booking.customerId;

        // Save resolved eventId back onto core booking if missing
        if (eventId && !booking.customerEvent) {
          booking.customerEvent = eventId;
          await booking.save().catch(() => null);
        }

        // 1. Sync CustomerBooking
        if (custBooking) {
          await Booking.updateOne(
            { _id: custBooking._id },
            { $set: { executionStatus: 'COMPLETION_SUBMITTED', completedAt: new Date(), completionEvidence: booking.completionEvidence } }
          ).catch(() => null);
        } else if (targetCustomerId && booking.category) {
          await Booking.updateMany(
            { customer: targetCustomerId, category: booking.category },
            { $set: { executionStatus: 'COMPLETION_SUBMITTED', completedAt: new Date(), completionEvidence: booking.completionEvidence } }
          ).catch(() => null);
        }

        // 2. Post to VendorMessageThread
        if (targetCustomerId) {
          await VendorMessageThread.findOneAndUpdate(
            {
              $or: [
                { customerBooking: booking._id },
                { vendor: vendorId, customer: targetCustomerId },
              ],
            },
            {
              $set: {
                lastMessageText: `Work marked done for ${refName}. Evidence uploaded!`,
                lastMessageAt: new Date(),
                status: 'ACTIVE',
              },
              $push: {
                messages: {
                  sender: 'VENDOR',
                  senderName: vendorName,
                  text,
                  isRead: false,
                  createdAt: new Date(),
                },
              },
              $inc: { unreadClientCount: 1 },
            }
          ).catch(() => null);
        }

        // 3. Post to EventMessage (Circle chat) with evidence assets & action payload
        if (eventId) {
          await EventMessage.create({
            event: eventId,
            booking: custBooking?._id || booking._id,
            senderType: 'vendor',
            senderName: vendorName,
            body: text,
            payload: {
              type: 'EVIDENCE_SUBMITTED',
              bookingId: booking._id,
              eventId,
              vendorName,
              deliverablesUrl: deliverablesUrl || '',
              photos: photos || [],
              videos: videos || [],
              notes: notes || '',
              actionUrl: `/customer/events/${eventId}/bookings?inspect=${booking._id}`,
              actionLabel: 'Review & Verify Evidence',
            },
          }).catch((e) => console.warn('[submitCompletion EventMessage err]:', e.message));
        }

        // 4. Send HIGH PRIORITY Notification to Customer
        if (targetCustomerId) {
          await notifyCustomer({
            customerId: targetCustomerId,
            eventId,
            bookingId: custBooking?._id || booking._id,
            type: 'completion',
            priority: 'HIGH',
            title: `🚨 Completion Evidence Uploaded - Action Required`,
            body: `Work marked done by ${vendorName}. Proof of work attached! Inspect evidence & verify completion.`,
            actionUrl: eventId ? `/customer/events/${eventId}/bookings?inspect=${booking._id}` : `/customer/bookings`,
            idempotencyKey: `submit-completion-${booking._id}-${Date.now()}`,
            payload: {
              bookingId: custBooking?._id || booking._id,
              coreBookingId: booking._id,
              eventId,
              evidenceUrl,
              photos: photos || [],
              videos: videos || [],
            },
          }).catch((e) => console.warn('[submitCompletion notifyCustomer err]:', e.message));
        }
      } catch (notifyErr) {
        console.warn('[submitCompletion notify notice]:', notifyErr.message);
      }

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
