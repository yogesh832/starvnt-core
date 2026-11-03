import { observeVendorAcquisition } from './vendorAcquisition.service.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { VendorResource } from '../models/VendorResource.js';
import { vendorVerification } from '../../common/vendorVerification.js';
import { activationDecision } from '../../common/activationPolicy.js';
import { ExternalUser } from '../models/ExternalUser.js';
import { coverageConfigured, validBusinessCoordinates } from '../../common/vendorReadiness.js';

const REASON_LABELS = {
  PROFILE_INCOMPLETE: 'Brand profile details are incomplete',
  KYC_PENDING: 'PAN/GST/KYC identity verification is pending',
  BANK_VERIFICATION_PENDING: 'Bank account verification is pending',
  SERVICE_INCOMPLETE: 'At least one active service with valid pricing is required',
  CAPACITY_NOT_CONFIGURED: 'Capability, team size or capacity is not configured',
  OPERATIONAL_RESOURCES_MISSING: 'Operational team/equipment/resources are not declared',
  AVAILABILITY_NOT_CONFIGURED: 'Operational availability is not configured',
  COVERAGE_MISSING: 'Service coverage area is missing',
  OPERATING_LOCATION_MISSING: 'Operating location is missing',
  PORTFOLIO_MISSING: 'Portfolio project or media showcase is missing',
  COMMERCIAL_PROFILE_INCOMPLETE: 'Commercial profile is incomplete',
  SERVICE_CONFIGURATION_INCOMPLETE: 'Complete capacity, resources and coverage for the same active service',
  ACCOUNT_UNAVAILABLE: 'The vendor owner account is disabled or missing',
};

const RESOURCE_REQUIRED_CATEGORIES = new Set([
  'Photography',
  'Videography',
  'Cinematic Production',
  'Catering',
  'Decoration',
  'Decor & Styling',
  'DJ_Production',
  'DJ & Music',
  'Transport',
  'Venue',
  'Corporate_Production',
  'Anchor_Host',
]);

function hasOpenWorkingHours(workingHours) {
  if (!workingHours || typeof workingHours !== 'object') return false;
  return Object.values(workingHours).some((day) => day?.isOpen === true || (day?.isOpen === undefined && /full|am|pm|\d/i.test(String(day?.hours || ''))));
}

function reasonLabels(codes) {
  return codes.map((code) => REASON_LABELS[code] || code);
}

/**
 * Vendor Activation State Machine & Readiness Evaluator.
 * Implements Spec §3, §4, §20, §21 (Golden Acceptance Test A):
 *
 * Lifecycle:
 * DRAFT -> REGISTERED -> PROFILE_INCOMPLETE -> VERIFICATION_PENDING -> VERIFIED -> ELIGIBLE -> ACTIVE
 *
 * "ACTIVE is not a profile checkbox. A vendor/service becomes commercially active
 * only when the required service model is sufficiently complete: capability,
 * coverage, availability, pricing and required verification."
 */
export async function evaluateVendorActivation(vendorId) {
  const vendor = await VendorOrganization.findById(vendorId);
  if (!vendor) {
    throw new Error(`Vendor not found: ${vendorId}`);
  }

  const reasonCodes = new Set();
  const owner = await ExternalUser.findById(vendor.owner).select('status accountType roles').lean();
  const accountStatus = owner && (owner.accountType === 'VENDOR' || owner.roles?.includes('VENDOR')) ? owner.status : owner ? 'WRONG_ACCOUNT_TYPE' : 'MISSING';
  if (accountStatus !== 'ACTIVE') reasonCodes.add('ACCOUNT_UNAVAILABLE');

  // Check if financial profile or verified documents exist to auto-pass identity.
  // Bank verification is mandatory for vendor verification/commercial matching.
  const finProfile = await VendorFinancialProfile.findOne({ vendor: vendorId });
  const hasVerifiedDoc = await VendorDocument.exists({ vendor: vendorId, status: 'VERIFIED', type: { $in: ['PAN', 'GST', 'BUSINESS_REG', 'ID_PROOF'] } });
  const verification = vendorVerification(finProfile, Boolean(hasVerifiedDoc));
  const hasVerifiedIdentity = verification.identityVerified;
  const hasVerifiedBank = verification.bankVerified;
  const isFinancialVerified = hasVerifiedIdentity && hasVerifiedBank;
  const identityVerificationSource = verification.identitySource;
  const bankVerificationSource = hasVerifiedBank ? 'BANK_VERIFICATION' : 'NOT_VERIFIED';

  if (!hasVerifiedIdentity) {
    reasonCodes.add('KYC_PENDING');
  }

  if (!hasVerifiedBank) {
    reasonCodes.add('BANK_VERIFICATION_PENDING');
  }


  // 1. Profile completeness check (Brand & City)
  let hasProfile = false;
  if (vendor.isProfileCompleted === true) {
    hasProfile = true;
  } else if (vendor.isProfileCompleted === false) {
    hasProfile = false;
  } else {
    // For legacy/unmigrated documents: verify non-placeholder brand, category and operating location
    const isAutoPlaceholder =
      !vendor.businessName ||
      vendor.businessName.endsWith("'s Studio") ||
      vendor.businessName.endsWith(" Studios") ||
      vendor.businessName.startsWith("Vendor ");
    hasProfile = Boolean(vendor.businessName && !isAutoPlaceholder && vendor.category && vendor.location);
  }

  if (!hasProfile) {
    reasonCodes.add('PROFILE_INCOMPLETE');
  }
  hasProfile = hasProfile && Boolean(vendor.businessName?.trim() && vendor.category?.trim() && vendor.location?.trim());
  if (!hasProfile) reasonCodes.add('PROFILE_INCOMPLETE');

  // 2. Services check (must have at least one service with valid pricing)
  const services = await VendorService.find({ vendor: vendorId });
  const hasActiveService = services.some(
    (s) => s.status === 'ACTIVE' && s.pricing && s.pricing.basePrice > 0
  );
  if (!hasActiveService) {
    reasonCodes.add('SERVICE_INCOMPLETE');
  }

  // 3. Capabilities check (at least one capability record)
  const capabilities = await VendorCapability.find({ vendor: vendorId });
  const hasCapability = capabilities.length > 0;
  const hasCapacity = capabilities.some((c) => Number(c.teamSize || 0) > 0 && Number(c.simultaneousEventLimit || 0) > 0);
  if (!hasCapability || !hasCapacity) {
    reasonCodes.add('CAPACITY_NOT_CONFIGURED');
  }

  const resources = await VendorResource.find({ vendor: vendorId, status: { $ne: 'RETIRED' } }).lean();
  const activeCategories = new Set(services.filter((s) => s.status === 'ACTIVE').map((s) => s.category));
  const resourcesRequired = [...activeCategories].some((category) => RESOURCE_REQUIRED_CATEGORIES.has(category));
  const hasOperationalResources =
    !resourcesRequired ||
    resources.length > 0 ||
    capabilities.some((c) => Number(c.teamSize || 0) > 0 || (c.equipment || []).length > 0);
  if (!hasOperationalResources) {
    reasonCodes.add('OPERATIONAL_RESOURCES_MISSING');
  }

  // 4. Operating origin check
  const locations = await OperatingLocation.find({ vendor: vendorId, operatingStatus: { $ne: 'INACTIVE' } });
  const hasLocation = locations.some(l => validBusinessCoordinates(l.coordinates));
  if (!hasLocation) {
    reasonCodes.add('OPERATING_LOCATION_MISSING');
  }

  // 5. Service coverage check
  const coverages = await ServiceCoverage.find({ vendor: vendorId });
  const hasCoverage = coverages.length > 0;
  if (!hasCoverage) {
    reasonCodes.add('COVERAGE_MISSING');
  }

  const hasAvailability = hasOpenWorkingHours(vendor.workingHours);
  if (!hasAvailability) {
    reasonCodes.add('AVAILABILITY_NOT_CONFIGURED');
  }

  // 6. Portfolio projects check
  const firstPortfolio = await PortfolioItem.findOne({ vendor: vendorId }).sort({ createdAt: 1 }).select('createdAt').lean();
  const hasPortfolio = Boolean(firstPortfolio);
  if (!hasPortfolio) {
    reasonCodes.add('PORTFOLIO_MISSING');
  }
  const serviceReadiness = services.filter(s => s.status !== 'ARCHIVED').map(service => {
    const capability = capabilities.find(c => String(c.vendorService) === String(service._id));
    const ownCoverage = coverages.filter(c => String(c.vendorService) === String(service._id));
    const findings = [];
    if (service.status !== 'ACTIVE' || !(service.pricing?.basePrice > 0)) findings.push('ACTIVE_PRICING_REQUIRED');
    if (!capability || !(capability.teamSize > 0 && capability.simultaneousEventLimit > 0)) findings.push('SERVICE_CAPACITY_REQUIRED');
    if (!ownCoverage.some(c => coverageConfigured(c, locations))) findings.push('SERVICE_COVERAGE_REQUIRED');
    if (!hasLocation) findings.push('OPERATING_LOCATION_MISSING');
    if (!hasAvailability) findings.push('AVAILABILITY_NOT_CONFIGURED');
    if ((service.requiredResourceIds || []).some(id => !resources.some(r => String(r._id) === String(id) && !['MAINTENANCE', 'RETIRED'].includes(r.status)))) findings.push('RESOURCE_NOT_AVAILABLE');
    return { serviceId: String(service._id), name: service.name, operatingReady: findings.length === 0, reasonCodes: findings };
  });
  const operatingReady = serviceReadiness.some(s => s.operatingReady);
  if (!operatingReady) reasonCodes.add('SERVICE_CONFIGURATION_INCOMPLETE');

  // 6 Operational Profile Setup Steps for Profile Completion (0 - 100%)
  const steps = [
    hasProfile,
    hasActiveService,
    hasCapability && hasCapacity && hasOperationalResources,
    hasLocation && hasCoverage,
    hasAvailability,
    hasPortfolio,
  ];
  const completedCount = steps.filter(Boolean).length;
  const completionPercentage = Math.round((completedCount / steps.length) * 100);

  const hasSubmittedDoc = await VendorDocument.exists({ vendor: vendorId, status: { $in: ['SUBMITTED', 'PENDING'] } });
  const verificationStatus = isFinancialVerified
    ? 'VERIFIED'
    : (hasVerifiedIdentity || hasVerifiedBank || Boolean(hasSubmittedDoc))
    ? 'UNDER_REVIEW'
    : 'NOT_SUBMITTED';

  // Determine state transitions
  const isModelComplete =
    hasProfile &&
    hasActiveService &&
    hasCapability &&
    hasCapacity &&
    hasOperationalResources &&
    hasLocation &&
    hasCoverage &&
    hasAvailability;
  const commercialReadiness = isModelComplete && hasPortfolio && completionPercentage === 100 && operatingReady;
  const { activationState: targetState, matchingEligible } = activationDecision(accountStatus === 'ACTIVE' ? vendor : { ...vendor.toObject(), status: 'SUSPENDED' }, { hasProfile, isFinancialVerified, commercialReadiness });
  const leadActivationStatus = matchingEligible ? 'ACTIVE' : 'INACTIVE';

  const isCommerciallyActive = matchingEligible;
  const hasPublishedPortfolio = await PortfolioItem.exists({ vendor: vendorId, visibility: 'PUBLIC', status: { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } });
  const marketingEligible = Boolean(accountStatus === 'ACTIVE' && vendor.growthPreferences?.marketingOptIn && hasProfile && isFinancialVerified && vendor.activationReview?.status === 'APPROVED' && !['REJECTED', 'SUSPENDED'].includes(targetState) && hasPublishedPortfolio);


  // Operational evidence is persisted independently of advertising consent. No Meta requests here.
  const submission = vendor.activationHistory?.find(h => h.action === 'SUBMITTED');
  const approval = vendor.activationHistory?.find(h => h.action === 'APPROVE');
  const evidenceDates = [hasProfile && vendor.updatedAt, ...services.map(s => s.updatedAt), ...capabilities.map(c => c.updatedAt), ...locations.map(l => l.updatedAt), ...coverages.map(c => c.updatedAt), firstPortfolio?.createdAt].filter(Boolean).map(d => new Date(d).getTime());
  const acquisitionEvents = await observeVendorAcquisition(vendor, {
    VendorOnboardingStarted: hasProfile || hasActiveService || hasCapability || hasLocation || hasPortfolio,
    VendorBusinessInformationAdded: hasProfile,
    VendorProfileCompleted: hasProfile,
    VendorPortfolioUploaded: hasPortfolio,
    VendorOnboardingCompleted: completionPercentage === 100,
    SubmitApplication: Boolean(submission),
    VendorVerified: vendor.activationReview?.status === 'APPROVED' && vendor.status === 'ACTIVE',
  }, {
    VendorOnboardingStarted: evidenceDates.length ? new Date(Math.min(...evidenceDates)) : vendor.createdAt,
    VendorBusinessInformationAdded: vendor.updatedAt,
    VendorProfileCompleted: vendor.updatedAt,
    VendorPortfolioUploaded: firstPortfolio?.createdAt,
    VendorOnboardingCompleted: evidenceDates.length ? new Date(Math.max(...evidenceDates)) : vendor.updatedAt,
    SubmitApplication: submission?.at,
    VendorVerified: approval?.at || vendor.activationReview?.reviewedAt,
  }).catch(() => []); // Analytics must never break readiness, auth or approval.


  return {
    acquisitionEvents,
    vendorId: vendor._id,
    businessName: vendor.businessName,
    brandName: vendor.brandName || vendor.businessName,
    legalBusinessName: finProfile?.pan?.verificationStatus === 'VERIFIED' ? finProfile.pan.legalName || null : finProfile?.gst?.verificationStatus === 'VERIFIED' ? finProfile.gst.legalName || null : null,
    accountStatus, operatingReadiness: operatingReady ? 'READY' : 'INCOMPLETE', marketingEligible,
    marketingOptIn: Boolean(vendor.growthPreferences?.marketingOptIn), serviceReadiness,
    profileCompletion: Math.round([vendor.businessName?.trim(), vendor.category?.trim(), vendor.location?.trim()].filter(Boolean).length / 3 * 100),
    activationState: targetState,
    lastStatusUpdate: vendor.activationReview?.reviewedAt || vendor.activationReview?.requestedAt || vendor.updatedAt,
    reviewFeedback: vendor.activationReview?.reason || vendor.manualReview?.notes || vendor.manualReview?.reason || '',
    isCommerciallyActive,
    isModelComplete,
    commercialReadiness,
    matchingEligible,
    leadActivationStatus,
    readiness: {
      profileCompletion: Math.round([vendor.businessName?.trim(), vendor.category?.trim(), vendor.location?.trim()].filter(Boolean).length / 3 * 100),
      accountStatus, operatingReadiness: operatingReady ? 'READY' : 'INCOMPLETE', marketingEligibility: marketingEligible ? 'ELIGIBLE' : 'LOCKED',
      onboardingStatus: completionPercentage === 100 ? 'COMPLETE' : 'INCOMPLETE',
      verificationStatus,
      identityVerificationSource,
      bankVerificationSource,
      availabilityStatus: hasAvailability ? 'CONFIGURED' : 'NOT_CONFIGURED',
      operationalResourceSource: hasOperationalResources ? 'VENDOR_DECLARED' : 'MISSING',
      operationalResourceVerificationStatus: 'SELF_DECLARED',
      commercialReadiness: commercialReadiness ? 'READY' : 'INCOMPLETE',
      matchingEligibility: matchingEligible ? 'ELIGIBLE' : 'LOCKED',
      leadActivationStatus,
    },
    completionPercentage,
    is100Percent: completionPercentage === 100,
    checklist: {
      profile: hasProfile,
      services: hasActiveService,
      capabilities: hasCapability,
      capacity: hasCapacity,
      resources: hasOperationalResources,
      locations: hasLocation,
      coverage: hasCoverage,
      availability: hasAvailability,
      portfolio: hasPortfolio,
      verified: isFinancialVerified,
      identityVerified: hasVerifiedIdentity,
      bankVerified: hasVerifiedBank,
    },
    reasonCodes: [...reasonCodes],
    missingRequirements: reasonLabels([...reasonCodes]),
  };
}
