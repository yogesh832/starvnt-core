import mongoose from 'mongoose';
import { VendorService } from '../../external/models/VendorService.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { OperatingLocation } from '../../external/models/OperatingLocation.js';
import { ServiceCoverage } from '../../external/models/ServiceCoverage.js';
import { VendorBlockout } from '../../external/models/VendorBlockout.js';
import { VendorBookingSlot } from '../../external/models/VendorBookingSlot.js';
import { PortfolioItem } from '../../external/models/PortfolioItem.js';
import { DemoListing } from '../models/index.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ORG_FIELDS = 'businessName location rating bio profilePicUrl';
const locationFields = ['city', 'locality', 'address', 'state', 'postalCode'];
const coverageFields = ['city', 'localities', 'state'];

function coordsOf(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

function haversineKm(a, b) {
  if (!a || !b) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

function cityMatcher(city) {
  if (!city) return null;
  return new RegExp(escapeRegex(city), 'i');
}

function locationQuery(regex) {
  return { $or: locationFields.map((field) => ({ [field]: regex })) };
}

function coverageQuery(regex) {
  return { $or: coverageFields.map((field) => ({ [field]: regex })) };
}

function publicLocation(loc) {
  if (!loc) return null;
  return {
    label: loc.label || '',
    address: loc.address || '',
    locality: loc.locality || '',
    city: loc.city || '',
    state: loc.state || '',
    postalCode: loc.postalCode || '',
    coordinates: loc.coordinates || null,
  };
}

function nearestLocation(locations, origin) {
  if (!locations?.length) return null;
  if (!origin) return locations.find((loc) => loc.isPrimary) || locations[0];
  let best = null;
  for (const loc of locations) {
    const distanceKm = haversineKm(origin, coordsOf(loc.coordinates));
    if (distanceKm == null) continue;
    if (!best || distanceKm < best.distanceKm) best = { loc, distanceKm };
  }
  return best?.loc || locations.find((loc) => loc.isPrimary) || locations[0];
}

/**
 * Read-only access to the vendor catalogue owned by Vendor OS.
 * Customers only ever see ACTIVE services of commercially active vendors.
 */
export async function listBookableServices({ city, coordinates } = {}) {
  const regex = cityMatcher(city);
  const origin = coordsOf(coordinates);
  const orgs = await VendorOrganization.find({ isCommerciallyActive: true }).select(ORG_FIELDS).lean();
  if (!orgs.length) return [];
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  const vendorIds = orgs.map((o) => o._id);
  const [services, locations, coverages, portfolioDocs] = await Promise.all([
    VendorService.find({ vendor: { $in: vendorIds }, status: 'ACTIVE' }).lean(),
    OperatingLocation.find({ vendor: { $in: vendorIds } }).lean(),
    ServiceCoverage.find({ vendor: { $in: vendorIds } }).lean(),
    PortfolioItem.find({ vendor: { $in: vendorIds } }).lean(),
  ]);
  const locationsByVendor = new Map();
  for (const loc of locations) {
    const key = String(loc.vendor);
    if (!locationsByVendor.has(key)) locationsByVendor.set(key, []);
    locationsByVendor.get(key).push(loc);
  }
  const portfolioByVendor = new Map();
  for (const p of portfolioDocs) {
    const key = String(p.vendor);
    if (!portfolioByVendor.has(key)) portfolioByVendor.set(key, []);
    portfolioByVendor.get(key).push(p);
  }
  const coveragesByService = new Map(coverages.map((c) => [String(c.vendorService), c]));

  const mapped = services
    .map((s) => {
      const vendor = byId.get(String(s.vendor));
      if (!vendor) return null;
      const vendorId = String(vendor._id);
      const matchedCoverage = coveragesByService.get(String(s._id));
      const vendorLocations = locationsByVendor.get(vendorId) || [];
      const matchedLocation = nearestLocation(vendorLocations, origin);
      const portfolio = portfolioByVendor.get(vendorId) || [];
      if (!regex && !origin) return { service: s, vendor, matchedLocation: publicLocation(matchedLocation), matchedCoverage, portfolio, isExactMatch: true };

      const profileMatches = regex ? regex.test(vendor.location || '') : false;
      const locationTextMatches = Boolean(regex && matchedLocation && locationFields.some((field) => regex.test(String(matchedLocation[field] || ''))));
      const coverageTextMatches = Boolean(
        regex &&
          matchedCoverage &&
          (regex.test(String(matchedCoverage.city || '')) ||
            regex.test(String(matchedCoverage.state || '')) ||
            (matchedCoverage.localities || []).some((loc) => regex.test(String(loc || ''))))
      );
      const radiusKm = Number(matchedCoverage?.radiusKm || 40);
      const distanceKm = haversineKm(origin, coordsOf(matchedLocation?.coordinates));
      const coordinateMatches = distanceKm != null && distanceKm <= Math.max(radiusKm, 10);
      const isExactMatch = Boolean(profileMatches || locationTextMatches || coverageTextMatches || coordinateMatches);

      return {
        service: s,
        vendor,
        matchedLocation: publicLocation(matchedLocation),
        portfolio,
        isExactMatch,
        distanceKm,
        matchedCoverage: matchedCoverage
          ? {
              city: matchedCoverage.city || '',
              state: matchedCoverage.state || '',
              localities: matchedCoverage.localities || [],
              radiusKm: matchedCoverage.radiusKm || null,
              outstationAllowed: Boolean(matchedCoverage.outstationAllowed),
            }
          : null,
      };
    })
    .filter(Boolean);

  const hasExactByCategory = new Map();
  for (const item of mapped) {
    if (item.isExactMatch) {
      hasExactByCategory.set(item.service.category, true);
    }
  }

  return mapped.filter((item) => {
    if (!regex && !origin) return true;
    const catHasExact = hasExactByCategory.get(item.service.category);
    if (catHasExact) return item.isExactMatch;
    const isEligibleRegional = Boolean(
      item.matchedCoverage?.outstationAllowed ||
        (item.distanceKm != null && item.distanceKm <= 300) ||
        (regex &&
          ((item.matchedLocation?.state && regex.test(item.matchedLocation.state)) ||
            (item.matchedCoverage?.state && regex.test(item.matchedCoverage.state))))
    );
    if (isEligibleRegional) {
      item.isRegionalMatch = true;
      return true;
    }
    return false;
  });
}

export async function findBookableService(serviceId, { city, coordinates } = {}) {
  if (!mongoose.isValidObjectId(serviceId)) return null;
  const service = await VendorService.findOne({ _id: serviceId, status: 'ACTIVE' }).lean();
  if (!service) return null;
  const vendor = await VendorOrganization.findOne({ _id: service.vendor, isCommerciallyActive: true }).select(ORG_FIELDS).lean();
  if (!vendor) return null;
  const origin = coordsOf(coordinates);
  if (!city && !origin) {
    const matchedLocation = await OperatingLocation.findOne({ vendor: vendor._id }).sort({ isPrimary: -1 }).lean();
    const matchedCoverage = await ServiceCoverage.findOne({ vendor: vendor._id, vendorService: service._id }).lean();
    return { service, vendor, matchedLocation: publicLocation(matchedLocation), matchedCoverage, isExactMatch: true };
  }
  const regex = cityMatcher(city);
  const [matchedLocation, matchedCoverage] = await Promise.all([
    OperatingLocation.find({ vendor: vendor._id }).lean(),
    ServiceCoverage.findOne({ vendor: vendor._id, vendorService: service._id }).lean(),
  ]);
  const loc = Array.isArray(matchedLocation) ? nearestLocation(matchedLocation, origin) : matchedLocation;
  const profileMatches = regex ? regex.test(vendor.location || '') : false;
  const locationTextMatches = Boolean(regex && loc && locationFields.some((field) => regex.test(String(loc[field] || ''))));
  const coverageTextMatches = Boolean(
    regex &&
      matchedCoverage &&
      (regex.test(String(matchedCoverage.city || '')) ||
        regex.test(String(matchedCoverage.state || '')) ||
        (matchedCoverage.localities || []).some((locality) => regex.test(String(locality || ''))))
  );
  const radiusKm = Number(matchedCoverage?.radiusKm || 40);
  const distanceKm = haversineKm(origin, coordsOf(loc?.coordinates));
  const coordinateMatches = distanceKm != null && distanceKm <= Math.max(radiusKm, 10);
  const isExactMatch = Boolean(profileMatches || locationTextMatches || coverageTextMatches || coordinateMatches);
  if (!isExactMatch) return null;

  return {
    service,
    vendor,
    matchedLocation: publicLocation(loc),
    isExactMatch: true,
    isRegionalMatch: false,
    matchedCoverage: matchedCoverage
      ? {
          city: matchedCoverage.city || '',
          state: matchedCoverage.state || '',
          localities: matchedCoverage.localities || [],
          radiusKm: matchedCoverage.radiusKm || null,
          outstationAllowed: Boolean(matchedCoverage.outstationAllowed),
        }
      : null,
  };
}

export function listDemoListings() {
  return DemoListing.find({ isActive: true }).lean();
}

export function findDemoListing(ref) {
  return DemoListing.findOne({ externalRef: ref, isActive: true }).lean();
}

/** Vendors that declared a blockout, or already have a live commitment, on `date`. */
export async function vendorCommitments(vendorIds, date) {
  if (!vendorIds.length || !date) return { blocked: new Set(), booked: new Set() };
  const [blockouts, slots] = await Promise.all([
    VendorBlockout.find({ vendor: { $in: vendorIds }, date }).select('vendor').lean(),
    VendorBookingSlot.find({ vendor: { $in: vendorIds }, date, status: { $in: ['CONFIRMED', 'SCHEDULED', 'IN_PROGRESS'] } })
      .select('vendor')
      .lean(),
  ]);
  return {
    blocked: new Set(blockouts.map((b) => String(b.vendor))),
    booked: new Set(slots.map((s) => String(s.vendor))),
  };
}
