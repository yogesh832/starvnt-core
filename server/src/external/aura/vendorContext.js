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

// Primary categories offered on Profile & Hub (web BusinessPages ProfilePage select).
export const CATEGORIES = [
  'Cinematic Production', 'Photography', 'Videography', 'Decor & Styling', 'Catering',
  'Makeup & Styling', 'DJ & Music', 'Venue', 'Event Planning',
];

export const PAGES = [
  'dashboard', 'enquiries', 'quotes', 'bookings', 'calendar', 'portfolio', 'services', 'availability',
  'payments', 'reviews', 'analytics', 'messages', 'documents', 'profile', 'settings',
];

/**
 * Profile setup, in the same order and with the same checks as the dashboard's
 * 5-step onboarding (evaluateVendorActivation().checklist). Aura+ can fill the
 * first four from chat/voice (brand directly; the others after the vendor
 * confirms — see setupActions.js). The portfolio needs an upload on its page.
 */
export const SETUP_STEPS = [
  { key: 'profile', label: 'Brand name, category & city', short: 'Brand details', page: 'profile', to: '/vendor/profile', done: (c) => c.profile, auraCanFill: true },
  { key: 'services', label: 'At least one active service with a price', short: 'Add a service', page: 'services', to: '/vendor/services', done: (c) => c.services, auraCanFill: true },
  { key: 'capabilities', label: 'Team & equipment (capability)', short: 'Add team & gear', page: 'services', to: '/vendor/services?action=gear', done: (c) => c.capabilities, auraCanFill: true },
  { key: 'coverage', label: 'Operating location & coverage area', short: 'Set coverage area', page: 'services', to: '/vendor/services?action=coverage', done: (c) => c.locations && c.coverage, auraCanFill: true },
  { key: 'portfolio', label: 'At least one portfolio project', short: 'Add portfolio', page: 'portfolio', to: '/vendor/portfolio', done: (c) => c.portfolio },
];

/** Placeholder names given at sign-up ("<name>'s Studio") don't count as a real brand name. */
export function isAutoBusinessName(name) {
  return !name || name.endsWith("'s Studio") || name.endsWith(' Studios') || name.startsWith('Vendor ');
}

export function setupSummary(activation) {
  if (!activation?.checklist) return null;
  const steps = SETUP_STEPS.map((s) => ({ key: s.key, step: s.label, short: s.short, done: Boolean(s.done(activation.checklist)), page: s.page, to: s.to, auraCanFill: Boolean(s.auraCanFill) }));
  return { percent: activation.completionPercentage ?? null, complete: steps.every((s) => s.done), steps, nextStep: steps.find((s) => !s.done) || null };
}

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

async function fetchGoogleRating(googlePlaceId, businessName) {
  if (!googlePlaceId) return null;
  try {
    const key = process.env.GOOGLE_PLACES_API_KEY || '';
    if (key && !googlePlaceId.startsWith('place_') && !googlePlaceId.startsWith('osm_')) {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}?fields=id,displayName,rating,userRatingCount,reviews,googleMapsUri,formattedAddress&key=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const gData = await res.json();
      if (gData && !gData.error && typeof gData.rating === 'number') {
        return {
          source: 'GOOGLE_PLACES',
          rating: gData.rating,
          reviewCount: gData.userRatingCount,
          googleMapsUrl: gData.googleMapsUri,
          address: gData.formattedAddress,
          displayName: gData.displayName?.text || businessName,
          reviews: (gData.reviews || []).slice(0, 5).map((r) => ({
            author: r.authorAttribution?.displayName || 'Customer',
            rating: r.rating,
            time: r.relativePublishTimeDescription,
            text: r.text?.text || r.originalText?.text || '',
          })),
        };
      }
    }
  } catch (err) {
    console.warn('[vendorContext] Google Places fetch failed:', err?.message || err);
  }
  return null;
}

export async function buildVendorContext(vendor, { page = null } = {}) {
  const vendorId = vendor._id;
  const now = new Date();
  const today = isoDay(now);
  const in60 = isoDay(new Date(now.getTime() + 60 * 86400000));

  const [activation, enquiries, newEnquiryCount, quotes, quoteCounts, bookings, blockouts, services, reviews, documents, unread, googleRating] =
    await Promise.all([
      safe(() => evaluateVendorActivation(vendorId), null),
      Opportunity.find({ vendor: vendorId, status: { $in: ['NEW', 'VIEWED'] } }).populate('customer', 'fullName email phone').sort({ createdAt: -1 }).limit(10).lean(),
      Opportunity.countDocuments({ vendor: vendorId, status: 'NEW' }),
      Quote.find({ vendor: vendorId }).populate('customer', 'fullName email phone').sort({ updatedAt: -1 }).limit(10).lean(),
      Quote.aggregate([{ $match: { vendor: vendorId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      CoreBooking.find({ vendorId, eventDate: { $gte: today } }).sort({ eventDate: 1 }).limit(10).lean(),
      VendorBlockout.find({ vendor: vendorId, date: { $gte: today, $lte: in60 } }).sort({ date: 1 }).limit(20).lean(),
      VendorService.find({ vendor: vendorId }).lean(),
      VendorReview.find({ vendor: vendorId, status: 'PUBLISHED' }).sort({ createdAt: -1 }).limit(20).lean(),
      VendorDocument.find({ vendor: vendorId }).lean(),
      Notification.countDocuments({ vendor: vendorId, isRead: false }),
      safe(() => fetchGoogleRating(vendor.googlePlaceId, vendor.businessName), null),
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
      reasonCodes: activation?.reasonCodes ?? [],
      readiness: activation?.readiness ?? null,
      matchingEligible: Boolean(activation?.matchingEligible),
      leadActivationStatus: activation?.leadActivationStatus || 'INACTIVE',
      rating: vendor.rating?.count ? { average: vendor.rating.average, count: vendor.rating.count } : null,
      workingHours: vendor.workingHours || null,
    },
    profileSetup: (() => {
      const s = setupSummary(activation);
      if (!s) return null;
      return {
        percent: s.percent,
        complete: s.complete,
        steps: s.steps.map(({ key, step, done, page, auraCanFill }) => ({ kind: key, step, done, page, auraCanFill })),
        hasOperatingLocation: Boolean(activation.checklist.locations),
        hasCoverageArea: Boolean(activation.checklist.coverage),
        brand: {
          businessName: isAutoBusinessName(vendor.businessName) ? null : vendor.businessName,
          category: vendor.category || null,
          city: vendor.location || null,
          phone: vendor.phone || null,
          website: vendor.website || null,
          about: vendor.bio || null,
        },
        allowedCategories: CATEGORIES,
      };
    })(),
    enquiries: {
      newCount: newEnquiryCount,
      open: enquiries.map((o) => ({
        id: String(o._id),
        ref: o.opportunityReference || null,
        customer: o.customer?.fullName || o.customerName || null,
        customerId: o.customer?._id ? String(o.customer._id) : (o.customer ? String(o.customer) : null),
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
        id: String(q._id),
        ref: q.quoteReference,
        customer: q.customer?.fullName || q.customerName || null,
        customerId: q.customer?._id ? String(q.customer._id) : (q.customer ? String(q.customer) : null),
        service: q.serviceName,
        eventDate: q.eventDate,
        basePrice: q.pricingBreakdown?.basePrice ?? null,
        travelFee: q.pricingBreakdown?.travelFee ?? 0,
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
    googleBusiness: googleRating ? {
      connected: true,
      source: googleRating.source,
      name: googleRating.displayName,
      rating: googleRating.rating,
      reviewCount: googleRating.reviewCount,
      address: googleRating.address,
      googleMapsUrl: googleRating.googleMapsUrl,
      recentReviews: googleRating.reviews,
    } : {
      connected: Boolean(vendor.googlePlaceId),
      rating: null,
      reviewCount: 0,
    },
    reviews: {
      starvntCount: reviews.length,
      starvntAverage: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      googleRating: googleRating ? {
        source: googleRating.source,
        rating: googleRating.rating,
        reviewCount: googleRating.reviewCount,
        displayName: googleRating.displayName,
      } : null,
      recentCount: reviews.length,
      recentAverage: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      withoutReply: reviews.filter((r) => !r.vendorReply?.text).map((r) => ({ customer: r.customerName, rating: r.rating, service: r.serviceName })).slice(0, 5),
    },
    kycDocuments: documents.map((d) => ({ type: d.type, status: String(d.status).toLowerCase() })),
    unreadNotifications: unread,
  };
}
