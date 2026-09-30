import mongoose from 'mongoose';
import { VendorService } from '../../external/models/VendorService.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { OperatingLocation } from '../../external/models/OperatingLocation.js';
import { ServiceCoverage } from '../../external/models/ServiceCoverage.js';
import { VendorBlockout } from '../../external/models/VendorBlockout.js';
import { VendorBookingSlot } from '../../external/models/VendorBookingSlot.js';
import { DemoListing } from '../models/index.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ORG_FIELDS = 'businessName location rating bio profilePicUrl';
const locationFields = ['city', 'locality', 'address', 'state', 'postalCode'];
const coverageFields = ['city', 'localities', 'state'];

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

/**
 * Read-only access to the vendor catalogue owned by Vendor OS.
 * Customers only ever see ACTIVE services of commercially active vendors.
 */
export async function listBookableServices({ city } = {}) {
  const regex = cityMatcher(city);
  const orgs = await VendorOrganization.find({ isCommerciallyActive: true }).select(ORG_FIELDS).lean();
  if (!orgs.length) return [];
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  const vendorIds = orgs.map((o) => o._id);
  const [services, locations, coverages] = await Promise.all([
    VendorService.find({ vendor: { $in: vendorIds }, status: 'ACTIVE' }).lean(),
    regex ? OperatingLocation.find({ vendor: { $in: vendorIds }, ...locationQuery(regex) }).lean() : [],
    regex ? ServiceCoverage.find({ vendor: { $in: vendorIds }, ...coverageQuery(regex) }).lean() : [],
  ]);
  const locationsByVendor = new Map();
  for (const loc of locations) {
    const key = String(loc.vendor);
    if (!locationsByVendor.has(key)) locationsByVendor.set(key, loc);
  }
  const coveragesByService = new Map(coverages.map((c) => [String(c.vendorService), c]));
  return services
    .map((s) => {
      const vendor = byId.get(String(s.vendor));
      if (!vendor) return null;
      if (!regex) return { service: s, vendor };
      const vendorId = String(vendor._id);
      const profileMatches = regex.test(vendor.location || '');
      const matchedLocation = locationsByVendor.get(vendorId);
      const matchedCoverage = coveragesByService.get(String(s._id));
      if (!profileMatches && !matchedLocation && !matchedCoverage) return null;
      return {
        service: s,
        vendor,
        matchedLocation: publicLocation(matchedLocation),
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
}

export async function findBookableService(serviceId, { city } = {}) {
  if (!mongoose.isValidObjectId(serviceId)) return null;
  const service = await VendorService.findOne({ _id: serviceId, status: 'ACTIVE' }).lean();
  if (!service) return null;
  const vendor = await VendorOrganization.findOne({ _id: service.vendor, isCommerciallyActive: true }).select(ORG_FIELDS).lean();
  if (!vendor) return null;
  if (!city) return { service, vendor };
  const regex = cityMatcher(city);
  const [matchedLocation, matchedCoverage] = await Promise.all([
    OperatingLocation.findOne({ vendor: vendor._id, ...locationQuery(regex) }).lean(),
    ServiceCoverage.findOne({ vendor: vendor._id, vendorService: service._id, ...coverageQuery(regex) }).lean(),
  ]);
  if (!regex.test(vendor.location || '') && !matchedLocation && !matchedCoverage) return null;
  return {
    service,
    vendor,
    matchedLocation: publicLocation(matchedLocation),
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
