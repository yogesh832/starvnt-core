import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { PortfolioItem } from '../external/models/PortfolioItem.js';
import { ServiceCoverage } from '../external/models/ServiceCoverage.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { VendorBlockout } from '../external/models/VendorBlockout.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { QuoteProposal } from '../external/models/QuoteProposal.js';
import { vendorGrowthEvidence } from '../external/services/discoveryReadiness.service.js';
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
  const [evidence, portfolioCount, coverageCount, quotesCount, bookingsCount, reviewsCount] = await Promise.all([
    vendorGrowthEvidence(vendorId).catch(() => ({ matchingEligible: false, milestones: [] })),
    PortfolioItem.countDocuments({ vendor: vendorId, visibility: 'PUBLIC' }),
    ServiceCoverage.countDocuments({ vendor: vendorId }),
    QuoteProposal.countDocuments({ vendorId }),
    Promise.all([
      CoreBooking.countDocuments({ vendorId, bookingStatus: 'CONFIRMED' }),
      VendorBlockout.countDocuments({ vendor: vendorId, recordType: 'EXTERNAL_COMMITMENT' })
    ]).then(([core, ext]) => core + ext),
    VendorReview.countDocuments({ vendor: vendorId, status: 'PUBLISHED' }),
  ]);

  const steps = [
    {
      key: 'BUILD_PROFILE',
      phase: 'Build',
      label: 'Complete business profile',
      description: 'Add business name, category, location, bio, and working hours.',
      completed: Boolean(vendor.isProfileCompleted || (vendor.businessName && vendor.location && vendor.bio)),
      actionLink: '/vendor/profile',
    },
    {
      key: 'ADD_SERVICES',
      phase: 'Build',
      label: 'Configure service catalog & pricing',
      description: 'Define your packages, offerings, and standard rates.',
      completed: coverageCount > 0 || (vendor.category && vendor.businessName),
      actionLink: '/vendor/business',
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
      actionLink: '/vendor/business',
    },
    {
      key: 'COMPLETE_VERIFICATION',
      phase: 'Showcase',
      label: 'Submit business verification',
      description: 'Verify your identity and bank details for trust and settlement.',
      completed: Boolean(vendor.verification?.isVerified || vendor.verificationLadderLevel !== 'SELF_DECLARED'),
      actionLink: '/vendor/verification',
    },
    {
      key: 'OPERATIONS_READY',
      phase: 'Get Ready',
      label: 'Operations & matching eligibility',
      description: 'Meet platform readiness criteria to receive customer opportunities.',
      completed: Boolean(evidence.matchingEligible),
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
      label: 'Record your first booking',
      description: 'Manage confirmed STARVNT bookings or external client events.',
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

  const completedCount = steps.filter(s => s.completed).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const isCompleted = completedCount === steps.length;

  return {
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
