import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { PortfolioItem } from '../external/models/PortfolioItem.js';
import { ServiceCoverage } from '../external/models/ServiceCoverage.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { Quote } from '../external/models/Quote.js';
import { VendorService } from '../external/models/VendorService.js';
import { evaluateVendorActivation } from '../external/services/vendorActivation.service.js';
import { observeLaunchpad, launchpadCalculationVersion } from './launchpadEvidence.js';
import { config } from '../config.js';

/**
 * 30-Day Launchpad & Founding Partner Service
 * Implements the 30-day guided roadmap across 4 phases:
 * Phase 1: Build (Profile, Services, Portfolio)
 * Phase 2: Showcase (Coverage, Verification)
 * Phase 3: Get Ready (Matching readiness)
 * Phase 4: Grow (First enquiry/quote, First booking, First review)
 */
export async function getLaunchpadProgress(vendorId) {
  const vendor = await VendorOrganization.findById(vendorId).lean();
  if (!vendor) {
    const err = new Error('Vendor organization not found.');
    err.statusCode = 404;
    throw err;
  }

  const isFoundingPartner = Boolean(vendor.foundingPartner?.isFoundingPartner);
  const offerStartedAt = vendor.foundingPartner?.offerStartedAt || vendor.createdAt || new Date();
  const offerExpiresAt = vendor.foundingPartner?.offerExpiresAt || new Date(new Date(offerStartedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const totalDurationDays = 30;
  const elapsedMs = Math.max(0, now.getTime() - new Date(offerStartedAt).getTime());
  const daysElapsed = Math.min(totalDurationDays, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  const daysRemaining = Math.max(0, Math.ceil((new Date(offerExpiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

  // Query evidence in parallel
  const sources = await Promise.allSettled([
    () => evaluateVendorActivation(vendorId),
    () => PortfolioItem.countDocuments({ vendor: vendorId, visibility: 'PUBLIC' }),
    () => ServiceCoverage.countDocuments({ vendor: vendorId }),
    () => VendorService.countDocuments({ vendor: vendorId, status: 'ACTIVE', 'pricing.basePrice': { $gt: 0 } }),
    () => Quote.countDocuments({ vendor: vendorId, $or: [{ status: { $in: ['SUBMITTED', 'APPROVED', 'REJECTED'] } }, { 'history.toStatus': 'SUBMITTED' }] }),
    () => CoreBooking.countDocuments({ vendorId, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED' }),
    () => VendorReview.countDocuments({ vendor: vendorId, status: 'PUBLISHED', isVerified: true }),
  ].map(job => Promise.resolve().then(job)));
  const [activation, portfolioCount, coverageCount, servicesCount, quotesCount, bookingsCount, reviewsCount] = sources.map(source => source.status === 'fulfilled' ? source.value : null);

  const steps = [
    {
      key: 'BUILD_PROFILE',
      phase: 'Build',
      label: 'Complete business profile',
      description: 'Add business name, category and location. Operating setup and onboarding are separate metrics.',
      completed: activation?.profileCompletion === 100,
      actionLink: '/vendor/profile',
    },
    {
      key: 'ADD_SERVICES',
      phase: 'Build',
      label: 'Configure service catalog & pricing',
      description: 'Define your packages, offerings, and standard rates.',
      completed: servicesCount > 0,
      actionLink: '/vendor/services',
    },
    {
      key: 'UPLOAD_PORTFOLIO',
      phase: 'Build',
      label: 'Showcase your work',
      description: 'Upload high-resolution images or videos of past events.',
      completed: portfolioCount >= 1,
      actionLink: '/vendor/portfolio',
    },
    {
      key: 'CONFIGURE_COVERAGE',
      phase: 'Showcase',
      label: 'Set operating service coverage',
      description: 'Define travel radius and service areas on the map.',
      completed: coverageCount >= 1,
      actionLink: '/vendor/services',
    },
    {
      key: 'COMPLETE_VERIFICATION',
      phase: 'Showcase',
      label: 'Submit business verification',
      description: 'Verify your identity and bank details for trust and settlement.',
      completed: activation?.checklist.verified === true,
      actionLink: '/vendor/documents',
    },
    {
      key: 'OPERATIONS_READY',
      phase: 'Get Ready',
      label: 'Operations & matching eligibility',
      description: 'Meet platform readiness criteria to receive customer opportunities.',
      completed: activation?.matchingEligible === true,
      actionLink: '/vendor/readiness',
    },
    {
      key: 'FIRST_QUOTE',
      phase: 'Grow',
      label: 'Send your first quotation',
      description: 'Respond to an opportunity or generate a custom quote.',
      completed: quotesCount >= 1,
      actionLink: '/vendor/quotes',
    },
    {
      key: 'FIRST_BOOKING',
      phase: 'Grow',
      label: 'Receive your first STARVNT booking',
      description: 'A confirmed STARVNT Core booking with verified payment.',
      completed: bookingsCount >= 1,
      actionLink: '/vendor/bookings',
    },
    {
      key: 'FIRST_REVIEW',
      phase: 'Grow',
      label: 'Collect customer experience review',
      description: config.vendorQrEnabled ? 'Issue an Experience QR and collect verified customer feedback.' : 'Review published customer feedback.',
      completed: reviewsCount >= 1,
      actionLink: config.vendorQrEnabled ? '/vendor/experience-qr' : '/vendor/reviews',
    },
  ];

  const sourceIndex = [0, 3, 1, 2, 0, 0, 4, 5, 6];
  steps.forEach((step, index) => {
    const source = sources[sourceIndex[index]], ready = source.status === 'fulfilled';
    step.sourceStatus = ready ? 'READY' : 'UNAVAILABLE';
    if (!ready) step.completed = null;
    step.status = !ready ? 'UNKNOWN' : step.completed ? 'COMPLETE' : 'PENDING';
    step.responsibleRole = ['COMPLETE_VERIFICATION', 'OPERATIONS_READY'].includes(step.key) ? 'VENDOR_AND_AUTHORIZED_REVIEWER' : step.key === 'FIRST_BOOKING' ? 'CORE_BOOKING_AND_PAYMENT_VERIFICATION' : step.key === 'FIRST_REVIEW' ? 'CUSTOMER_AND_REVIEW_MODERATION' : 'VENDOR_OWNER';
    step.pendingReason = !ready ? 'Evidence source unavailable. Retry to determine this milestone.' : step.completed ? null : step.description;
    step.calculationVersion = launchpadCalculationVersion;
    step.computedAt = now;
    step.evidence = ready ? sourceIndex[index] === 0 ? { source: 'CANONICAL_ACTIVATION', metric: step.key, value: step.key === 'BUILD_PROFILE' ? activation.profileCompletion : step.key === 'COMPLETE_VERIFICATION' ? activation.checklist.verified : activation.matchingEligible, calculationVersion: activation.calculationVersion } : { source: ['ACTIVATION', 'PUBLIC_PORTFOLIO', 'SERVICE_COVERAGE', 'ACTIVE_PRICED_SERVICES', 'SENT_QUOTES', 'CONFIRMED_PAYMENT_VERIFIED_CORE_BOOKINGS', 'PUBLISHED_VERIFIED_REVIEWS'][sourceIndex[index]], count: source.value } : null;
  });
  let observations;
  try { observations = await observeLaunchpad(vendorId, steps, now); }
  catch { observations = null; }
  for (const step of steps) {
    const observation = observations?.get(step.key);
    step.historyStatus = observations ? 'AVAILABLE' : 'UNAVAILABLE';
    step.completionObservedAt = observation?.firstCompletedObservedAt || null;
    step.history = observation?.history || null;
    // Observation time is not the historical source completion time.
    step.completedAt = null;
  }
  const partial = steps.some(step => step.completed === null);

  const completedCount = steps.filter(s => s.completed).length;
  const progressPercent = partial ? null : Math.round((completedCount / steps.length) * 100);
  const isCompleted = completedCount === steps.length;

  return {
    calculationVersion: launchpadCalculationVersion, computedAt: now, partial, historyStatus: observations ? 'AVAILABLE' : 'UNAVAILABLE',
    isFoundingPartner,
    cohort: vendor.foundingPartner?.cohort || 'Alpha Cohort',
    offerStartedAt,
    offerExpiresAt,
    daysElapsed,
    daysRemaining,
    totalDurationDays,
    completedCount,
    totalSteps: steps.length,
    progressPercent,
    isCompleted,
    steps,
    phases: [
      { name: 'Build', steps: steps.filter(s => s.phase === 'Build') },
      { name: 'Showcase', steps: steps.filter(s => s.phase === 'Showcase') },
      { name: 'Get Ready', steps: steps.filter(s => s.phase === 'Get Ready') },
      { name: 'Grow', steps: steps.filter(s => s.phase === 'Grow') },
    ],
  };
}

export async function enrollFoundingPartner(vendorId, { cohort = 'Founding Partner 2026', durationDays = 30 } = {}) {
  const offerStartedAt = new Date();
  const offerExpiresAt = new Date(offerStartedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const vendor = await VendorOrganization.findByIdAndUpdate(
    vendorId,
    {
      $set: {
        'foundingPartner.isFoundingPartner': true,
        'foundingPartner.cohort': cohort,
        'foundingPartner.offerStartedAt': offerStartedAt,
        'foundingPartner.offerExpiresAt': offerExpiresAt,
      },
    },
    { new: true }
  );
  return vendor;
}
