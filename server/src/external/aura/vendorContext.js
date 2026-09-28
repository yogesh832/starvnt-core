import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorService } from '../models/VendorService.js';
import { VendorReview } from '../models/VendorReview.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { Notification } from '../models/Notification.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';

/**
 * CURRENT DATA for Vendor Aura+. Kept deliberately small: a large context
 * pushes Gemini past the 12s timeout. Every query is scoped to this vendor.
 *
 * generateVendorInsights() is intentionally not used: several of its messages are
 * hard-coded (fixed localities/venues) and Aura must only speak from real data.
 * evaluateVendorActivation() is the same recompute the dashboard runs on load.
 */

export const PAGES = [
  'dashboard', 'enquiries', 'quotes', 'bookings', 'calendar', 'portfolio', 'services', 'availability',
  'payments', 'reviews', 'analytics', 'messages', 'documents', 'profile', 'settings',
];

const isoDay = (d) => d.toISOString().slice(0, 10);
const place = (loc) => [loc?.locality, loc?.city].filter(Boolean).join(', ') || null;

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn('[vendor-aura] context part failed:', err?.message || err);
    return fallback;
  }
}

export async function buildVendorContext(vendor, { page = null } = {}) {
  const vendorId = vendor._id;
  const now = new Date();
  const today = isoDay(now);
  const in60 = isoDay(new Date(now.getTime() + 60 * 86400000));

  const [activation, enquiries, newEnquiryCount, quotes, quoteCounts, bookings, blockouts, services, reviews, documents, unread] =
    await Promise.all([
      safe(() => evaluateVendorActivation(vendorId), null),
      Opportunity.find({ vendor: vendorId, status: { $in: ['NEW', 'VIEWED'] } }).sort({ createdAt: -1 }).limit(10).lean(),
      Opportunity.countDocuments({ vendor: vendorId, status: 'NEW' }),
      Quote.find({ vendor: vendorId }).sort({ updatedAt: -1 }).limit(10).lean(),
      Quote.aggregate([{ $match: { vendor: vendorId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      CoreBooking.find({ vendorId, eventDate: { $gte: today } }).sort({ eventDate: 1 }).limit(10).lean(),
      VendorBlockout.find({ vendor: vendorId, date: { $gte: today, $lte: in60 } }).sort({ date: 1 }).limit(20).lean(),
      VendorService.find({ vendor: vendorId }).lean(),
      VendorReview.find({ vendor: vendorId, status: 'PUBLISHED' }).sort({ createdAt: -1 }).limit(20).lean(),
      VendorDocument.find({ vendor: vendorId }).lean(),
      Notification.countDocuments({ vendor: vendorId, isRead: false }),
    ]);

  const ratings = reviews.map((r) => r.rating).filter((n) => typeof n === 'number');

  return {
    today,
    currentPage: PAGES.includes(page) ? page : null,
    business: {
      name: vendor.businessName,
      category: vendor.category || null,
      status: vendor.status,
      profileCompletePercent: activation?.completionPercentage ?? null,
      missingForActivation: activation?.missingRequirements ?? [],
      rating: vendor.rating?.count ? { average: vendor.rating.average, count: vendor.rating.count } : null,
      workingHours: vendor.workingHours || null,
    },
    enquiries: {
      newCount: newEnquiryCount,
      open: enquiries.map((o) => ({
        service: o.serviceName,
        eventDate: o.eventDate,
        place: place(o.serviceLocation),
        guests: o.guestCount,
        status: o.status === 'NEW' ? 'new' : 'seen, not answered',
      })),
    },
    quotes: {
      counts: Object.fromEntries(quoteCounts.map((q) => [String(q._id).toLowerCase(), q.n])),
      latest: quotes.map((q) => ({
        ref: q.quoteReference,
        service: q.serviceName,
        eventDate: q.eventDate,
        total: q.pricingBreakdown?.totalAmount ?? null,
        status: String(q.status).toLowerCase(),
        validUntil: q.validUntil ? isoDay(new Date(q.validUntil)) : null,
      })),
    },
    upcomingBookings: bookings.map((b) => ({
      ref: b.bookingReference,
      customer: b.customerName || null,
      service: b.serviceName,
      eventDate: b.eventDate,
      place: place(b.serviceLocation),
      total: b.totalAmount ?? b.pricing?.totalAmount ?? null,
      booking: String(b.bookingStatus).toLowerCase(),
      payment: b.paymentStatus === 'PAYMENT_VERIFIED' ? 'advance verified' : String(b.paymentStatus).toLowerCase(),
      work: String(b.executionStatus).toLowerCase().replace(/_/g, ' '),
    })),
    blockedDates: blockouts.map((b) => ({ date: b.date, allDay: b.allDay, from: b.allDay ? null : b.startTime, to: b.allDay ? null : b.endTime, reason: b.reason })),
    services: services.map((s) => ({
      name: s.name,
      category: s.category,
      status: String(s.status).toLowerCase(),
      price: s.pricing?.basePrice ?? null,
      pricing: s.pricing ? `${String(s.pricing.pricingType).toLowerCase()} per ${s.pricing.unit}` : null,
    })),
    reviews: {
      recentCount: reviews.length,
      recentAverage: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      withoutReply: reviews.filter((r) => !r.vendorReply?.text).map((r) => ({ customer: r.customerName, rating: r.rating, service: r.serviceName })).slice(0, 5),
    },
    kycDocuments: documents.map((d) => ({ type: d.type, status: String(d.status).toLowerCase() })),
    unreadNotifications: unread,
  };
}
