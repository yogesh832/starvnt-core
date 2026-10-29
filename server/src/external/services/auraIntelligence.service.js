import { VendorOrganization } from '../models/VendorOrganization.js';
import { Opportunity } from '../models/Opportunity.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';

/** Recommendations below use only passed, vendor-owned records. */
export function buildVendorRecommendations({ opportunities = [], bookings = [], coverages = [], now = new Date() }) {
  const recommendations = [];

  // 1. Signal: Location Performance
  const localityBookingsCount = {};
  for (const b of bookings.filter((item) => item.bookingStatus === 'CONFIRMED')) {
    const loc = b.serviceLocation?.locality || b.serviceLocation?.city;
    if (!loc) continue;
    localityBookingsCount[loc] = (localityBookingsCount[loc] || 0) + 1;
  }
  const topLocality = Object.entries(localityBookingsCount).sort((a, b) => b[1] - a[1])[0];
  if (topLocality) {
    recommendations.push({
      signal: 'LOCATION_PERFORMANCE',
      type: 'GROWTH',
      title: 'Bookings by service area',
      message: `${topLocality[0]} has the highest confirmed-booking count in the records inspected (${topLocality[1]}). This is a historical count, not a demand forecast.`,
      action: 'Review bookings',
      priority: 'MEDIUM',
    });
  }

  // 2. Signal: Location Demand & Coverage Expansion
  const coveredLocalities = new Set();
  for (const c of coverages) {
    (c.localities || []).forEach((l) => coveredLocalities.add(l.toLowerCase().trim()));
    if (c.city) coveredLocalities.add(c.city.toLowerCase().trim());
  }
  const demandLocalities = {};
  const recentWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  for (const opp of opportunities) {
    const createdAt = opp.createdAt ? new Date(opp.createdAt) : null;
    if (!createdAt || !Number.isFinite(createdAt.getTime()) || createdAt < recentWindowStart || createdAt > now) continue;
    const loc = (opp.serviceLocation?.locality || '').trim();
    if (loc) {
      demandLocalities[loc] = (demandLocalities[loc] || 0) + 1;
    }
  }
  for (const [loc, count] of Object.entries(demandLocalities)) {
    if (count >= 2 && !coveredLocalities.has(loc.toLowerCase())) {
      recommendations.push({
        signal: 'LOCATION_DEMAND',
        type: 'REVIEW',
        title: 'Review service-area coverage',
        message: `${count} recent enquiries list ${loc}. Review the saved coverage for this area; do not change coverage unless the business can serve it.`,
        action: 'Review coverage',
        priority: 'HIGH',
        evidence: { enquiryCount: count, locality: loc },
      });
      break;
    }
  }

  // 3. Signal: Opportunity Quality & Venue Match
  const newOpp = opportunities.find((o) => o.status === 'NEW');
  if (newOpp) {
    recommendations.push({
      signal: 'NEW_ENQUIRY',
      type: 'ACTION',
      title: 'Respond to a new enquiry',
      message: `A new enquiry for ${newOpp.serviceName || 'your service'} is recorded${newOpp.serviceLocation?.locality || newOpp.serviceLocation?.city ? ` for ${[newOpp.serviceLocation.locality, newOpp.serviceLocation.city].filter(Boolean).join(', ')}` : ''}. Review its details before deciding whether to quote.`,
      action: 'Open enquiry',
      priority: 'HIGH',
      targetId: newOpp._id,
      evidence: { opportunityId: String(newOpp._id), status: newOpp.status },
    });
  }

  return recommendations;
}

export async function generateVendorInsights(vendorId) {
  const vendor = await VendorOrganization.findById(vendorId);
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  const [opportunities, bookings, coverages] = await Promise.all([
    Opportunity.find({ vendor: vendorId }).sort({ createdAt: -1 }).limit(100).lean(),
    CoreBooking.find({ vendorId: { $in: [vendorId, String(vendorId)] } }).sort({ createdAt: -1 }).limit(100).lean(),
    ServiceCoverage.find({ vendor: vendorId }).lean(),
  ]);
  const recommendations = buildVendorRecommendations({ opportunities, bookings, coverages });
  return {
    vendorId: String(vendorId),
    timestamp: new Date().toISOString(),
    signalsCount: recommendations.length,
    recommendations,
  };
}
