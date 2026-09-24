import mongoose from 'mongoose';
import { VendorService } from '../../external/models/VendorService.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { VendorBlockout } from '../../external/models/VendorBlockout.js';
import { VendorBookingSlot } from '../../external/models/VendorBookingSlot.js';
import { DemoListing } from '../models/index.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ORG_FIELDS = 'businessName location rating bio profilePicUrl';

/**
 * Read-only access to the vendor catalogue owned by Vendor OS.
 * Customers only ever see ACTIVE services of commercially active vendors.
 */
export async function listBookableServices({ city } = {}) {
  const orgFilter = { isCommerciallyActive: true };
  if (city) orgFilter.location = { $regex: escapeRegex(city), $options: 'i' };
  const orgs = await VendorOrganization.find(orgFilter).select(ORG_FIELDS).lean();
  if (!orgs.length) return [];
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  const services = await VendorService.find({ vendor: { $in: orgs.map((o) => o._id) }, status: 'ACTIVE' }).lean();
  return services.map((s) => ({ service: s, vendor: byId.get(String(s.vendor)) }));
}

export async function findBookableService(serviceId) {
  if (!mongoose.isValidObjectId(serviceId)) return null;
  const service = await VendorService.findOne({ _id: serviceId, status: 'ACTIVE' }).lean();
  if (!service) return null;
  const vendor = await VendorOrganization.findOne({ _id: service.vendor, isCommerciallyActive: true }).select(ORG_FIELDS).lean();
  return vendor ? { service, vendor } : null;
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
