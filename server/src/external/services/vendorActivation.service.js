import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { PortfolioItem } from '../models/PortfolioItem.js';

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

  const missingRequirements = [];

  // 1. Profile completeness check
  const hasProfile = Boolean(vendor.businessName && vendor.category);
  if (!hasProfile) {
    missingRequirements.push('Business profile details (name, category)');
  }

  // 2. Services check (must have at least one service with valid pricing)
  const services = await VendorService.find({ vendor: vendorId });
  const hasActiveService = services.some(
    (s) => s.status === 'ACTIVE' && s.pricing && s.pricing.basePrice > 0
  );
  if (!hasActiveService) {
    missingRequirements.push('At least one ACTIVE service with valid base pricing');
  }

  // 3. Capabilities check (at least one capability record)
  const capabilities = await VendorCapability.find({ vendor: vendorId });
  const hasCapability = capabilities.length > 0;
  if (!hasCapability) {
    missingRequirements.push('Category capability & team/format specifications');
  }

  // 4. Operating origin check
  const locations = await OperatingLocation.find({ vendor: vendorId });
  const hasLocation = locations.length > 0;
  if (!hasLocation) {
    missingRequirements.push('At least one Operating Location (studio/office/warehouse)');
  }

  // 5. Service coverage check
  const coverages = await ServiceCoverage.find({ vendor: vendorId });
  const hasCoverage = coverages.length > 0;
  if (!hasCoverage) {
    missingRequirements.push('Service coverage area defined');
  }

  // 6. Portfolio projects check
  const portfolioCount = await PortfolioItem.countDocuments({ vendor: vendorId });
  const hasPortfolio = portfolioCount > 0;
  if (!hasPortfolio) {
    missingRequirements.push('At least one Portfolio project or media showcase');
  }

  // Calculate profile completion percentage (0 - 100%)
  const steps = [
    hasProfile,
    hasActiveService,
    hasCapability,
    hasLocation && hasCoverage,
    hasPortfolio,
  ];
  const completedCount = steps.filter(Boolean).length;
  const completionPercentage = Math.round((completedCount / steps.length) * 100);

  // Determine state transitions
  let targetState = vendor.activationState || 'REGISTERED';
  const isModelComplete =
    hasProfile && hasActiveService && hasCapability && hasLocation && hasCoverage;

  if (!hasProfile) {
    targetState = 'PROFILE_INCOMPLETE';
  } else if (!vendor.verification?.isVerified) {
    // If profile is ready but admin has not marked verified
    targetState = isModelComplete ? 'ELIGIBLE' : 'VERIFICATION_PENDING';
  } else if (vendor.verification?.isVerified && !isModelComplete) {
    targetState = 'VERIFIED';
  } else if (vendor.verification?.isVerified && isModelComplete) {
    targetState = 'ACTIVE';
  }

  const isCommerciallyActive = targetState === 'ACTIVE';

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
    completionPercentage,
    is100Percent: completionPercentage === 100,
    checklist: {
      profile: hasProfile,
      services: hasActiveService,
      capabilities: hasCapability,
      locations: hasLocation,
      coverage: hasCoverage,
      portfolio: hasPortfolio,
      verified: Boolean(vendor.verification?.isVerified),
    },
    missingRequirements,
  };
}
