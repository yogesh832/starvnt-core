export const readinessCalculationVersion = 'vendor-readiness/2026-11-16.1';

// Additive explanations of the existing activation evaluator, never a second
// source of eligibility or a substitute for source/provider verification.
export function readinessMetrics(value, financial, computedAt = new Date()) {
  const metric = (key, label, definition, result, complete, source, contributingFields, nextAction, pendingReason) => ({
    key, label, definition, value: result, complete, source, contributingFields,
    calculationVersion: readinessCalculationVersion, computedAt,
    pendingReason: complete ? null : pendingReason, nextAction: complete ? null : nextAction,
  });
  const c = value.checklist;
  return [
    metric('BUSINESS_PROFILE', 'Business Profile Completion', 'Share of business name, category and location present (three equally weighted fields).', value.profileCompletion, value.profileCompletion === 100,
      ['VendorOrganization'], ['businessName', 'category', 'location'], '/vendor/profile', 'Add the missing business name, category or location.'),
    metric('ONBOARDING', 'Onboarding Completion', 'Share of six setup groups complete: profile, active pricing, capacity/resources, location/coverage, working hours and portfolio. Verification and activation are separate.', value.completionPercentage, value.completionPercentage === 100,
      ['VendorOrganization', 'VendorService', 'VendorCapability', 'VendorResource', 'OperatingLocation', 'ServiceCoverage', 'PortfolioItem'], ['checklist.profile', 'checklist.services', 'checklist.capacity', 'checklist.resources', 'checklist.locations', 'checklist.coverage', 'checklist.availability', 'checklist.portfolio'], '/vendor/readiness', value.missingRequirements.join('; ') || 'Finish the outstanding setup groups.'),
    metric('PAN', 'PAN Verification', 'Current PAN verification state; a saved number, GST verification or profile completion does not verify PAN.', financial?.pan?.verificationStatus || 'NOT_SUBMITTED', financial?.pan?.verificationStatus === 'VERIFIED' && !financial?.identityReviewRequired,
      ['VendorFinancialProfile'], ['pan.verificationStatus', 'identityReviewRequired', 'pan.checkedAt'], '/vendor/profile?tab=documents', financial?.identityReviewRequired ? 'Identity changed. Submit the current legal identity for verification.' : 'Submit your legal name and PAN or resolve the displayed verification result.'),
    metric('GST', 'GST Status / Verification', 'Registration declaration and provider verification are distinct; a non-registered declaration is not a tax eligibility decision.', financial?.gst?.isRegistered ? financial.gst.verificationStatus : financial?.gst?.declaredAt ? 'DECLARED_NOT_REGISTERED' : 'DECLARATION_REQUIRED', financial?.gst?.isRegistered ? financial.gst.verificationStatus === 'VERIFIED' : Boolean(financial?.gst?.declaredAt),
      ['VendorFinancialProfile'], ['gst.isRegistered', 'gst.declaredAt', 'gst.verificationStatus'], '/vendor/profile?tab=documents', 'Complete the registration declaration or resolve GST verification.'),
    metric('BANK', 'Bank Verification', 'Successful bank verification from the financial record; saving account details is not verification.', financial?.bankAccount?.verificationStatus || 'NOT_SUBMITTED', c.bankVerified,
      ['VendorFinancialProfile'], ['bankAccount.verificationStatus', 'bankAccount.lastVerifiedAt'], '/vendor/profile?tab=documents', 'Submit bank details and complete provider verification; pending or provider errors remain unverified.'),
    metric('PORTFOLIO', 'Portfolio Completion', 'At least one saved portfolio item. Public visibility, rights approval and verified portfolio evidence are separate.', c.portfolio ? 'COMPLETE' : 'INCOMPLETE', c.portfolio,
      ['PortfolioItem'], ['vendor', '_id'], '/vendor/portfolio', 'Add a portfolio item.'),
    metric('OPERATIONS', 'Operating Readiness', 'At least one active service has valid pricing, linked capacity, coverage, availability and required resources.', value.operatingReadiness, value.operatingReadiness === 'READY',
      ['VendorService', 'VendorCapability', 'ServiceCoverage', 'OperatingLocation', 'VendorResource', 'VendorOrganization'], ['serviceReadiness', 'workingHours'], '/vendor/services', 'Resolve the service-specific operating requirements.'),
    metric('ACTIVATION', 'Account Activation', 'Current account and authorized activation review state, evaluated independently of setup percentages.', value.activationState, value.activationState === 'ACTIVE' && value.accountStatus === 'ACTIVE',
      ['VendorOrganization', 'ExternalUser'], ['activationState', 'activationReview', 'status', 'accountType'], '/vendor/readiness', value.accountStatus !== 'ACTIVE' ? 'The owner account is unavailable. Contact support.' : value.reviewFeedback || 'Complete readiness and request the authorized activation review.'),
    metric('MATCHING', 'Matching Eligibility', 'Existing activation policy requires owner availability, verified identity/bank, commercial readiness and authorized activation review.', value.matchingEligible ? 'ELIGIBLE' : 'LOCKED', value.matchingEligible,
      ['VendorOrganization', 'ExternalUser', 'VendorFinancialProfile', 'VendorDocument', 'VendorService', 'VendorCapability', 'ServiceCoverage', 'OperatingLocation', 'VendorResource', 'PortfolioItem'], ['accountStatus', 'checklist', 'commercialReadiness', 'activationReview'], '/vendor/readiness', value.missingRequirements.join('; ') || value.reviewFeedback || 'Authorized account activation review is pending.'),
    metric('MARKETING', 'Marketing Eligibility', 'Owner availability, marketing opt-in, profile, verification, approved activation and a published public portfolio are required. Recipient consent is checked separately for every delivery.', value.marketingEligible ? 'ELIGIBLE' : 'LOCKED', value.marketingEligible,
      ['VendorOrganization', 'ExternalUser', 'VendorFinancialProfile', 'VendorDocument', 'PortfolioItem'], ['accountStatus', 'growthPreferences.marketingOptIn', 'activationReview', 'visibility', 'status', 'checklist.verified'], '/vendor/readiness', 'Check marketing opt-in, public portfolio, verification and authorized activation. No delivery permission is implied.'),
  ];
}
