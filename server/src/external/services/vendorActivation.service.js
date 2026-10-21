import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { VendorResource } from '../models/VendorResource.js';

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
  return Object.values(workingHours).some((day) => day?.isOpen === true || /open|full|am|pm|\d/i.test(String(day?.hours || '')));
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

  // Check if financial profile or verified documents exist to auto-pass identity.
  // Bank verification is mandatory for vendor verification/commercial matching.
  const finProfile = await VendorFinancialProfile.findOne({ vendor: vendorId });
  const hasVerifiedDoc = await VendorDocument.exists({ vendor: vendorId, status: 'VERIFIED' });
  const hasVerifiedIdentity =
    finProfile?.pan?.verificationStatus === 'VERIFIED' ||
    finProfile?.gst?.verificationStatus === 'VERIFIED' ||
    finProfile?.gst?.isRegistered === false ||
    Boolean(hasVerifiedDoc);
  const hasVerifiedBank = finProfile?.bankAccount?.verificationStatus === 'VERIFIED';
  const isFinancialVerified = hasVerifiedIdentity && hasVerifiedBank;
  const identityVerificationSource = finProfile?.pan?.verificationStatus === 'VERIFIED'
    ? 'PAN_VERIFICATION'
    : finProfile?.gst?.verificationStatus === 'VERIFIED'
    ? 'GST_VERIFICATION'
    : finProfile?.gst?.isRegistered === false
    ? 'GST_NOT_REGISTERED_DECLARATION'
    : hasVerifiedDoc
    ? 'ADMIN_APPROVED_DOCUMENT'
    : 'NOT_VERIFIED';
  const bankVerificationSource = hasVerifiedBank ? 'BANK_VERIFICATION' : 'NOT_VERIFIED';

  if (!hasVerifiedIdentity) {
    reasonCodes.add('KYC_PENDING');
  }

  if (!hasVerifiedBank) {
    reasonCodes.add('BANK_VERIFICATION_PENDING');
  }

  if (isFinancialVerified && !vendor.verification?.isVerified) {
    vendor.verification = {
      ...(vendor.verification?.toObject?.() || vendor.verification || {}),
      isVerified: true,
      verifiedAt: vendor.verification?.verifiedAt || new Date(),
      notes: 'Auto-verified via financial identity and bank verification',
    };
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
  const locations = await OperatingLocation.find({ vendor: vendorId });
  const hasLocation = locations.length > 0;
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
  const portfolioCount = await PortfolioItem.countDocuments({ vendor: vendorId });
  const hasPortfolio = portfolioCount > 0;
  if (!hasPortfolio) {
    reasonCodes.add('PORTFOLIO_MISSING');
  }

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
  const commercialReadiness = isModelComplete && hasPortfolio && completionPercentage === 100;
  const matchingEligible = isFinancialVerified && commercialReadiness;
  const leadActivationStatus = matchingEligible ? 'ACTIVE' : 'INACTIVE';

  let targetState = vendor.activationState || 'REGISTERED';
  if (!hasProfile) {
    targetState = 'PROFILE_INCOMPLETE';
  } else if (!isFinancialVerified) {
    targetState = 'VERIFICATION_PENDING';
  } else if (isFinancialVerified && !isModelComplete) {
    targetState = 'VERIFIED';
  } else if (matchingEligible) {
    targetState = 'ACTIVE';
  } else {
    targetState = 'ELIGIBLE';
  }

  const isCommerciallyActive = matchingEligible;

  vendor.activationState = targetState;
  vendor.status = targetState;
  vendor.isCommerciallyActive = isCommerciallyActive;
  await vendor.save();

  return {
    vendorId: vendor._id,
    businessName: vendor.businessName,
    activationState: targetState,
    isCommerciallyActive,
    isModelComplete,
    commercialReadiness,
    matchingEligible,
    leadActivationStatus,
    readiness: {
      profileCompletion: completionPercentage,
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
