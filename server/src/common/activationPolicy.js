// Readiness never grants activation. Only an authorised review does that.
export function activationDecision(vendor, { hasProfile, isFinancialVerified, commercialReadiness }) {
  const restricted = vendor.isRestricted && (!vendor.restrictedUntil || new Date(vendor.restrictedUntil) > new Date());
  if (restricted || vendor.status === 'SUSPENDED') return { activationState: 'SUSPENDED', matchingEligible: false };
  if (vendor.status === 'REJECTED' || vendor.activationReview?.status === 'REJECTED') return { activationState: 'REJECTED', matchingEligible: false };
  if (vendor.activationReview?.status === 'INFORMATION_REQUESTED') return { activationState: 'PROFILE_INCOMPLETE', matchingEligible: false };
  if (!hasProfile) return { activationState: 'PROFILE_INCOMPLETE', matchingEligible: false };
  if (!isFinancialVerified) return { activationState: 'VERIFICATION_PENDING', matchingEligible: false };
  if (!commercialReadiness) return { activationState: 'PROFILE_INCOMPLETE', matchingEligible: false };
  const approved = vendor.activationReview?.status === 'APPROVED';
  return { activationState: approved ? 'ACTIVE' : vendor.activationReview?.requestedAt ? 'UNDER_REVIEW' : 'DRAFT', matchingEligible: approved };
}
