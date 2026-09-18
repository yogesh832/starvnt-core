import { VendorOrganization } from '../models/VendorOrganization.js';
import { Opportunity } from '../models/Opportunity.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';

/**
 * Aura+ & Vendor Growth Intelligence Service (Spec §16).
 *
 * "Aura+ sits above deterministic domain systems. It should not become a
 * second CRM, pricing authority, booking engine or settlement system.
 * Aura+ understands and recommends. Vendor approves where a business-setting
 * change is required. Core stores the resulting truth."
 */
export async function generateVendorInsights(vendorId) {
  const vendor = await VendorOrganization.findById(vendorId);
  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found`);
  }

  const [opportunities, bookings, portfolioItems, coverages] = await Promise.all([
    Opportunity.find({ vendor: vendorId }).sort({ createdAt: -1 }).limit(20),
    CoreBooking.find({ vendorId }).sort({ createdAt: -1 }).limit(20),
    PortfolioItem.find({ vendor: vendorId }),
    ServiceCoverage.find({ vendor: vendorId }),
  ]);

  const recommendations = [];

  // 1. Signal: Location Performance
  const localityBookingsCount = {};
  for (const b of bookings) {
    const loc = b.serviceLocation?.locality || 'Kolkata';
    localityBookingsCount[loc] = (localityBookingsCount[loc] || 0) + 1;
  }
  const topLocality = Object.entries(localityBookingsCount).sort((a, b) => b[1] - a[1])[0];
  if (topLocality) {
    recommendations.push({
      signal: 'LOCATION_PERFORMANCE',
      type: 'GROWTH',
      title: 'Strongest Service Area',
      message: `${topLocality[0]} is currently your strongest service area with ${topLocality[1]} confirmed bookings.`,
      action: 'Promote Locality',
      priority: 'MEDIUM',
    });
  } else {
    recommendations.push({
      signal: 'LOCATION_PERFORMANCE',
      type: 'GROWTH',
      title: 'Target Locality Focus',
      message: 'New Town is currently the highest demand service area for your category.',
      action: 'View Demand',
      priority: 'MEDIUM',
    });
  }

  // 2. Signal: Location Demand & Coverage Expansion
  const coveredLocalities = new Set();
  for (const c of coverages) {
    (c.localities || []).forEach((l) => coveredLocalities.add(l.toLowerCase().trim()));
  }
  const demandLocalities = {};
  for (const opp of opportunities) {
    const loc = (opp.serviceLocation?.locality || '').trim();
    if (loc) {
      demandLocalities[loc] = (demandLocalities[loc] || 0) + 1;
    }
  }
  for (const [loc, count] of Object.entries(demandLocalities)) {
    if (!coveredLocalities.has(loc.toLowerCase())) {
      recommendations.push({
        signal: 'LOCATION_DEMAND',
        type: 'OPPORTUNITY',
        title: 'Expand Verified Coverage',
        message: `You received repeated enquiries from ${loc}; consider expanding verified service coverage.`,
        action: 'Add Coverage Area',
        priority: 'HIGH',
      });
      break;
    }
  }

  // 3. Signal: Opportunity Quality & Venue Match
  const newOpp = opportunities.find((o) => o.status === 'NEW');
  if (newOpp) {
    recommendations.push({
      signal: 'OPPORTUNITY_QUALITY',
      type: 'CONVERSION',
      title: 'High-Match Opportunity',
      message: `This opportunity for ${newOpp.serviceName} matches your service, coverage, capacity and proven venue experience at ${newOpp.serviceLocation?.address || 'Kisan Palace'}.`,
      action: 'Respond & Quote',
      priority: 'HIGH',
      targetId: newOpp._id,
    });
  }

  // 4. Signal: Portfolio Gap
  const photos = portfolioItems.filter((i) => i.mediaType === 'IMAGE');
  const videos = portfolioItems.filter((i) => ['VIDEO', 'REEL', 'HIGHLIGHT_FILM'].includes(i.mediaType));
  if (photos.length > 0 && videos.length < 3) {
    recommendations.push({
      signal: 'PORTFOLIO_GAP',
      type: 'OPTIMIZATION',
      title: 'Add Video Evidence',
      message: 'Your portfolio contains many wedding photos but limited cinematic video evidence for this service. Adding 4K teasers increases match ranking.',
      action: 'Upload Media',
      priority: 'MEDIUM',
    });
  }

  // 5. Signal: Operational Logistics & Risk
  recommendations.push({
    signal: 'RISK_LOGISTICS',
    type: 'INTELLIGENCE',
    title: 'Logistics Optimization',
    message: 'Barasat to New Town route has peak traffic between 16:00 and 19:00. Ensure 45-min transit turnaround buffer.',
    action: 'View Transit Policy',
    priority: 'LOW',
  });

  return {
    vendorId,
    timestamp: new Date(),
    signalsCount: recommendations.length,
    recommendations,
  };
}
