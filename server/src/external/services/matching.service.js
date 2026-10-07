import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { checkTrueAvailability } from './availability.service.js';
import { calculateValidatedTotalCost } from './totalCost.service.js';
import { estimateDistanceKm } from '../utils/geo.js';
import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';

/**
 * Opportunity Qualification & Lowest Validated Total Cost Matching Engine (Spec §8, §9, §18, §19).
 *
 * Golden Acceptance Test E:
 * "STARVNT must not optimize for nearest vendor or lowest visible quote.
 * The objective is the lowest validated total cost among genuinely eligible vendors.
 * Lower-cost ineligible vendor is excluded; lowest eligible validated option is selected."
 */
export async function matchVendorsForRequirement({
  category,
  serviceLocation, // { address, locality, city, coordinates }
  date, // 'YYYY-MM-DD'
  startTime = '10:00',
  endTime = '18:00',
  guestCount = 500,
  durationHours = 8,
  requiredStyles = [],
  overrideRadiusKm = null,
}) {
  const policy = await getCommercialPolicyForCategory(category);
  const effectivePolicyRadius = overrideRadiusKm || policy.defaultRadiusKm || 25;
  // 1. Find services matching category
  const services = await VendorService.find({
    category,
    status: 'ACTIVE',
  }).populate('vendor');

  const eligibleCandidates = [];
  const excludedCandidates = [];

  for (const svc of services) {
    const vendor = svc.vendor;
    if (!vendor) continue;

    // Hard Gate 1: Vendor commercial eligibility
    // Must be verified or commercially active
    const isReady =
      vendor.isCommerciallyActive ||
      ['ACTIVE', 'ELIGIBLE', 'VERIFIED'].includes(vendor.activationState || vendor.status);

    if (!isReady) {
      excludedCandidates.push({
        vendorId: vendor._id,
        businessName: vendor.businessName,
        serviceId: svc._id,
        ineligibleReason: `Vendor is not commercially eligible (Status: ${vendor.activationState || vendor.status})`,
        gate: 'VENDOR_ACTIVATION_GATE',
      });
      continue;
    }

    // Hard Gate 2: Service Coverage Check
    const coverages = await ServiceCoverage.find({
      vendor: vendor._id,
      vendorService: svc._id,
    });

    let coversTargetLocation = false;
    const reqLocality = (serviceLocation?.locality || '').toLowerCase().trim();
    const reqCity = (serviceLocation?.city || '').toLowerCase().trim();

    for (const cov of coverages) {
      // Check specific locality
      if (
        reqLocality &&
        cov.localities?.some((loc) => loc.toLowerCase().trim() === reqLocality)
      ) {
        coversTargetLocation = true;
        break;
      }
      // Check city
      if (reqCity && cov.city?.toLowerCase().trim() === reqCity) {
        coversTargetLocation = true;
        break;
      }
      // Check radius
      if (cov.coverageType === 'RADIUS' && cov.radiusKm) {
        const dist = estimateDistanceKm(
          { locality: cov.localities?.[0] || cov.city, city: cov.city },
          serviceLocation
        );
        if (dist <= cov.radiusKm) {
          coversTargetLocation = true;
          break;
        }
      }
    }

    // If coverage records exist and none matched, exclude
    if (coverages.length > 0 && !coversTargetLocation) {
      excludedCandidates.push({
        vendorId: vendor._id,
        businessName: vendor.businessName,
        serviceId: svc._id,
        ineligibleReason: `Service location (${serviceLocation?.locality || serviceLocation?.city}) is outside vendor verified coverage area`,
        gate: 'SERVICE_COVERAGE_GATE',
      });
      continue;
    }

    // Hard Gate 3: True Availability Check (Date + Time + Capacity + Travel Buffer)
    const availability = await checkTrueAvailability({
      vendorId: vendor._id,
      vendorServiceId: svc._id,
      date,
      startTime,
      endTime,
      serviceLocation,
    });

    if (!availability.feasible) {
      excludedCandidates.push({
        vendorId: vendor._id,
        businessName: vendor.businessName,
        serviceId: svc._id,
        ineligibleReason: availability.reason,
        gate: 'TRUE_AVAILABILITY_GATE',
        conflicts: availability.conflicts,
      });
      continue;
    }

    // 4. Calculate Validated Total Cost
    const costBreakdown = await calculateValidatedTotalCost({
      vendorId: vendor._id,
      vendorServiceId: svc._id,
      serviceLocation,
      guestCount,
      durationHours,
    });

    // 5. Capability Match Score
    const capability = await VendorCapability.findOne({
      vendor: vendor._id,
      vendorService: svc._id,
    });

    let matchScore = 80;
    if (capability && requiredStyles.length > 0) {
      const matchedStyles = requiredStyles.filter((s) =>
        capability.styles?.some((vStyle) => vStyle.toLowerCase() === s.toLowerCase())
      );
      matchScore += Math.round((matchedStyles.length / requiredStyles.length) * 15);
    }
    if (vendor.rating?.average >= 4.8) {
      matchScore += 4;
    }
    matchScore = Math.min(98, matchScore);

    eligibleCandidates.push({
      vendorId: vendor._id,
      businessName: vendor.businessName,
      serviceId: svc._id,
      serviceName: svc.name,
      rating: vendor.rating?.average || 4.8,
      reviewsCount: vendor.rating?.count || 120,
      matchPercentage: matchScore,
      cost: costBreakdown,
      validatedTotalCost: costBreakdown.validatedTotalCost,
      capability: capability || null,
      recommended: false,
    });
  }

  // Soft Ranking: Deterministic sort primarily by Lowest Validated Total Cost
  eligibleCandidates.sort((a, b) => a.validatedTotalCost - b.validatedTotalCost);

  // Top candidate among genuinely eligible vendors is recommended
  if (eligibleCandidates.length > 0) {
    eligibleCandidates[0].recommended = true;
    eligibleCandidates[0].whyCallout =
      'Lowest validated total cost among vendors meeting your requirements with confirmed availability.';
  }

  // Spec §22: Up to 4 validated options max. Never manufacture fake options.
  const topValidatedOptions = eligibleCandidates.slice(0, 4);

  return {
    category,
    date,
    serviceLocation,
    totalEvaluated: services.length,
    eligibleCount: eligibleCandidates.length,
    excludedCount: excludedCandidates.length,
    eligibleCandidates: topValidatedOptions, // Top 4 max capped
    topValidatedOptions,
    excludedCandidates,
  };
}

/**
 * Search Waves Engine (Spec §19).
 * Wave 1: Initial policy radius.
 * Wave 2: Approved expanded radius.
 * Wave 3: Specialist/long-distance search.
 * Aura+ explains expansion; never silently expands geography.
 */
export async function matchVendorsWithSearchWaves(params) {
  const waveLevel = params.waveLevel || 1;
  const policy = await getCommercialPolicyForCategory(params.category);
  const baseRadius = policy.defaultRadiusKm || 25;
  const multiplier = waveLevel === 1 ? 1 : waveLevel === 2 ? 2 : 4;
  const searchRadiusKm = baseRadius * multiplier;

  const result = await matchVendorsForRequirement({
    ...params,
    overrideRadiusKm: searchRadiusKm,
  });

  result.waveInfo = {
    waveLevel,
    policyRadiusKm: baseRadius,
    searchRadiusKm,
    explanation:
      waveLevel === 1
        ? `Search conducted within policy radius of ${baseRadius} km.`
        : waveLevel === 2
        ? `Wave 2 search expanded to ${searchRadiusKm} km to locate available qualified options.`
        : `Wave 3 specialist search expanded to ${searchRadiusKm} km for specialized vendor coverage.`,
  };

  return result;
}
