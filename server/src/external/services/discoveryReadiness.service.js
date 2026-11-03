import { PortfolioItem } from '../models/PortfolioItem.js';
import { evaluateVendorActivation } from './vendorActivation.service.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { VendorReview } from '../models/VendorReview.js';

// Evidence is evaluated from source records. These observations do not award
// points, unlock benefits, or modify verification and matching decisions.
export async function vendorGrowthEvidence(vendorId) {
  const [readiness, approvedPortfolio, completed, verifiedReviews] = await Promise.all([
    evaluateVendorActivation(vendorId),
    PortfolioItem.countDocuments({ vendor: vendorId, visibility: 'PUBLIC', status: { $in: ['VERIFIED', 'BOOKING_PROVEN'] } }),
    CoreBooking.countDocuments({ vendorId, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED' }),
    VendorReview.countDocuments({ vendor: vendorId, isVerified: true, status: 'PUBLISHED', 'suspicionFlags.0': { $exists: false } }),
  ]);
  return {
    milestones: [
      { key: 'PROFILE', label: 'Business profile', complete: readiness.profileCompletion === 100, evidence: 'Saved business profile' },
      { key: 'VERIFICATION', label: 'Business verification', complete: readiness.readiness.verificationStatus === 'VERIFIED', evidence: 'Verification records' },
      { key: 'OPERATIONS', label: 'Operating readiness', complete: readiness.operatingReadiness === 'READY', evidence: 'Service configuration' },
      { key: 'PORTFOLIO', label: 'Verified portfolio', complete: approvedPortfolio > 0, evidence: 'Verified public portfolio items' },
      { key: 'COMPLETION', label: 'Verified service completion', complete: completed > 0, evidence: 'Core completion records' },
      { key: 'FEEDBACK', label: 'Verified feedback', complete: verifiedReviews > 0, evidence: 'Published verified reviews' },
    ],
    completedCoreBookings: completed, publishedVerifiedReviews: verifiedReviews,
    xp: null, credits: null, rewardsAvailable: false, evidenceOnly: true,
    matchingEligible: readiness.matchingEligible,
  };
}
