import { VendorService } from '../models/VendorService.js';
import { TravelPolicy } from '../models/TravelPolicy.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { estimateDistanceKm } from '../utils/geo.js';

/**
 * Lowest Validated Total Cost Calculator (Spec §8, §9).
 *
 * Formula:
 * BASE VENDOR PRICE
 * + TRAVEL
 * + EQUIPMENT TRANSPORT
 * + SETUP / DELIVERY
 * + TOLL / PARKING
 * + ACCOMMODATION / ALLOWANCES
 * + OTHER VERIFIED CHARGES
 * = VALIDATED TOTAL COST
 */
export async function calculateValidatedTotalCost({
  vendorId,
  vendorServiceId,
  serviceLocation, // { address, locality, city, coordinates }
  guestCount = 1,
  durationHours = 8,
  requiresOutstation = false,
}) {
  const service = await VendorService.findOne({ _id: vendorServiceId, vendor: vendorId });
  if (!service) {
    throw new Error(`Service not found: ${vendorServiceId} for vendor: ${vendorId}`);
  }

  // 1. Calculate Base Service Price
  let basePrice = service.pricing.basePrice;
  if (service.pricing.pricingType === 'PER_PERSON') {
    basePrice = service.pricing.basePrice * Math.max(1, guestCount);
  } else if (service.pricing.pricingType === 'HOURLY') {
    basePrice = service.pricing.basePrice * Math.max(1, durationHours);
  }

  // 2. Fetch Travel Policy
  let policy = await TravelPolicy.findOne({ vendor: vendorId });
  if (!policy) {
    policy = {
      freeRadiusKm: 15,
      perKmRate: 40,
      equipmentTransitFee: 0,
      tollAndParkingIncluded: false,
      outstationDailyAllowance: 1500,
      accommodationRequiredBeyondKm: 120,
    };
  }

  // 3. Find closest operational origin to calculate verified distance
  const locations = await OperatingLocation.find({ vendor: vendorId });
  let minDistanceKm = 10; // default local estimate if no operating location
  let closestOrigin = null;

  if (locations.length > 0) {
    minDistanceKm = Infinity;
    for (const loc of locations) {
      const dist = estimateDistanceKm(loc, serviceLocation);
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        closestOrigin = loc;
      }
    }
  }

  // 4. Calculate Distance-Based Travel
  const billableDistanceKm = Math.max(0, minDistanceKm - policy.freeRadiusKm);
  const travelCharge = Math.round(billableDistanceKm * policy.perKmRate);

  // 5. Equipment Transit Fee
  const equipmentTransit = policy.equipmentTransitFee || 0;

  // 6. Toll & Parking (verified estimate if not included)
  let tollsAndParking = 0;
  if (!policy.tollAndParkingIncluded && minDistanceKm > 20) {
    tollsAndParking = 300; // standard highway toll / parking allowance
  }

  // 7. Accommodation & Outstation Allowance
  let accommodationAllowance = 0;
  const isOutstation = requiresOutstation || minDistanceKm > policy.accommodationRequiredBeyondKm;
  if (isOutstation) {
    accommodationAllowance = policy.outstationDailyAllowance || 1500;
  }

  // 8. Conditional Charges from Service Pricing
  let conditionalTotal = 0;
  const appliedConditionalCharges = [];
  if (service.pricing.conditionalCharges?.length > 0) {
    for (const cc of service.pricing.conditionalCharges) {
      conditionalTotal += cc.amount;
      appliedConditionalCharges.push({ name: cc.name, amount: cc.amount });
    }
  }

  // Total deterministic calculation
  const validatedTotalCost =
    basePrice +
    travelCharge +
    equipmentTransit +
    tollsAndParking +
    accommodationAllowance +
    conditionalTotal;

  return {
    vendorId,
    vendorServiceId: service._id,
    serviceName: service.name,
    category: service.category,
    breakdown: {
      basePrice,
      distanceKm: minDistanceKm,
      freeRadiusKm: policy.freeRadiusKm,
      billableKm: billableDistanceKm,
      travelCharge,
      equipmentTransit,
      tollsAndParking,
      accommodationAllowance,
      conditionalCharges: appliedConditionalCharges,
    },
    originPoint: closestOrigin
      ? `${closestOrigin.label} (${closestOrigin.city})`
      : 'Primary Operating Studio',
    destinationPoint: serviceLocation?.locality || serviceLocation?.city || 'Service Location',
    validatedTotalCost,
  };
}
