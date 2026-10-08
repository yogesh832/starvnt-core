import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { checkTrueAvailability } from './availability.service.js';
import { calculateValidatedTotalCost } from './totalCost.service.js';
import { estimateDistanceKm } from '../utils/geo.js';
import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';
import { evaluateVendorActivation } from './vendorActivation.service.js';

const EXTENDED_FALLBACK_RADIUS_KM = 150;

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
  const extendedServiceCandidates = [];
  const excludedCandidates = [];
  const readinessByVendor = new Map();

  for (const svc of services) {
    const vendor = svc.vendor;
    if (!vendor) continue;

    // Hard Gate 1: Vendor commercial eligibility.
    // Core readiness is authoritative; profile completion alone is not enough.
    const vendorKey = String(vendor._id);
    let readiness = readinessByVendor.get(vendorKey);
    if (!readinessByVendor.has(vendorKey)) {
      readiness = await evaluateVendorActivation(vendor._id).catch(() => null);
      readinessByVendor.set(vendorKey, readiness);
    }
    const isReady = Boolean(readiness?.matchingEligible);

    if (!isReady) {
      excludedCandidates.push({
        vendorId: vendor._id,
        businessName: vendor.businessName,
        serviceId: svc._id,
        ineligibleReason: readiness?.missingRequirements?.join(', ') || `Vendor is not commercially eligible (Status: ${vendor.activationState || vendor.status})`,
        reasonCodes: readiness?.reasonCodes || ['COMMERCIAL_PROFILE_INCOMPLETE'],
        readiness: readiness?.readiness || null,
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
    let extendedService = null;
    const reqLocality = (serviceLocation?.locality || '').toLowerCase().trim();
    const reqCity = (serviceLocation?.city || '').toLowerCase().trim();

    for (const cov of coverages) {
      if (cov.coverageType === 'RADIUS' && cov.radiusKm) {
        const dist = estimateDistanceKm(
          { locality: cov.localities?.[0] || cov.city, city: cov.city },
          serviceLocation
        );
        if (dist <= cov.radiusKm) {
          coversTargetLocation = true;
          break;
        }
        const fallbackLimit = cov.outstationAllowed ? Math.max(EXTENDED_FALLBACK_RADIUS_KM, cov.radiusKm * 3) : EXTENDED_FALLBACK_RADIUS_KM;
        if (dist <= fallbackLimit && (!extendedService || dist < extendedService.distanceKm)) {
          extendedService = {
            label: `Extended Service — ${Math.round(dist)} km away`,
            distanceKm: Math.round(dist * 10) / 10,
            configuredRadiusKm: cov.radiusKm,
            fallbackLimitKm: fallbackLimit,
            requiresVendorConfirmation: true,
            note: 'Outside configured service coverage. Vendor must confirm travel/logistics and final cost before this can become a valid quote.',
            fallbackFlow: [
              'coverage',
              'availability',
              'capacity',
              'operational_feasibility',
              'travel_logistics',
              'validated_total_cost',
              'vendor_confirmation',
            ],
          };
        }
        continue;
      }

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
    }

    // If coverage records exist and none matched, exclude
    if (coverages.length > 0 && !coversTargetLocation && !extendedService) {
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

    const candidatePayload = {
      vendorId: vendor._id,
      businessName: vendor.businessName,
      serviceId: svc._id,
      serviceName: svc.name,
      rating: vendor.rating?.count ? vendor.rating.average : null,
      reviewsCount: vendor.rating?.count || 0,
      matchPercentage: matchScore,
      cost: costBreakdown,
      validatedTotalCost: costBreakdown.validatedTotalCost,
      capability: capability || null,
      recommended: false,
      explainability: {
        coverage: coversTargetLocation ? 'standard_coverage' : 'extended_service_fallback',
        availability: 'feasible',
        capacity: availability.capacity || 'not_reported',
        cost: {
          validatedTotalCost: costBreakdown.validatedTotalCost,
          travelCost: costBreakdown.travelCost || 0,
        },
        capabilityScore: matchScore,
        factors: [
          'configured coverage evaluated before proximity',
          'availability and travel buffer checked',
          'validated total cost calculated before ranking',
          requiredStyles.length ? 'requested styles compared with vendor capability' : 'no style-specific preference supplied',
        ],
      },
    };

    if (coversTargetLocation || coverages.length === 0) {
      eligibleCandidates.push(candidatePayload);
    } else {
      extendedServiceCandidates.push({
        ...candidatePayload,
        recommended: false,
        coverageStatus: 'EXTENDED_SERVICE_REQUIRED',
        extendedService,
        whyCallout: 'Fallback only: outside normal coverage and requires explicit vendor confirmation.',
      });
    }
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
  const fallbackExtendedOptions = eligibleCandidates.length === 0
    ? extendedServiceCandidates.sort((a, b) => a.validatedTotalCost - b.validatedTotalCost).slice(0, 4)
    : [];

  return {
    category,
    date,
    serviceLocation,
    totalEvaluated: services.length,
    eligibleCount: eligibleCandidates.length,
    excludedCount: excludedCandidates.length,
    eligibleCandidates: topValidatedOptions, // Top 4 max capped
    topValidatedOptions,
    extendedServiceCandidates: fallbackExtendedOptions,
    excludedCandidates,
  };
}

/**
 * Search Waves Engine (Spec §19).
 * Wave 1: Initial policy radius.
 * Wave 2: Broader fallback discovery only; configured vendor coverage is not rewritten.
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
