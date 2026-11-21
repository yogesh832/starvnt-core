import { EVENT_TYPE_LABELS } from '../customer/services/planCatalog.js';
import { hashOf } from './utils.js';

/**
 * Customer-safe projection. Built from an ALLOW-LIST: every field below is
 * copied explicitly. Vendor prices (agreement.pricing, lineItem.unitPrice),
 * internal costs and margin are never read here, so they cannot leak.
 */
export function toCustomerSnapshot({ manifest, agreements = [], commercial = null, kind = 'FINAL', visuals = {} }) {
  const info = manifest.eventInfo || {};
  const agreementByCategory = new Map(agreements.map((a) => [a.category, a]));

  const services = manifest.requirements
    .filter((r) => r.status === 'included')
    .map((r) => {
      const a = agreementByCategory.get(r.category);
      return {
        category: r.category,
        label: r.label,
        confirmed: Boolean(a),
        summary: a?.scope?.summary || '',
        items: (a?.scope?.lineItems || []).map((li) => ({ name: li.name, quantity: li.quantity, unit: li.unit || '', notes: li.notes || '' })),
        deliverables: [...(a?.scope?.deliverables || [])],
        exclusions: [...(a?.scope?.exclusions || [])],
        preferences: plainPreferences(r.details),
      };
    });

  const pending = manifest.requirements.filter((r) => r.status === 'pending')
    .flatMap((r) => (r.pendingItems.length ? r.pendingItems : [`Confirm ${r.label}`]).map((item) => ({ category: r.category, label: r.label, item })));
  const customerProvided = manifest.requirements.filter((r) => r.status === 'customer_provided').map((r) => ({ category: r.category, label: r.label }));

  const cf = commercial?.customerFacing;
  const budget = cf ? {
    currency: cf.currency || 'INR',
    packageTotal: cf.packageTotal,
    taxes: { included: cf.taxes?.included !== false, amount: cf.taxes?.amount || 0, note: cf.taxes?.note || '' },
    allocations: (cf.allocations || []).map((a) => ({ category: a.category, label: a.label, scopeSummary: a.scopeSummary, quantity: a.quantity, amount: a.amount, deliverables: [...(a.deliverables || [])], exclusions: [...(a.exclusions || [])] })),
    unallocated: { amount: cf.unallocated?.amount || 0, explanation: cf.unallocated?.explanation || '' },
    paymentSchedule: (cf.paymentSchedule || []).map((p) => ({ label: p.label, percent: p.percent, amount: p.amount, dueRule: p.dueRule })),
  } : null;

  return {
    kind,
    event: {
      type: info.type,
      typeLabel: EVENT_TYPE_LABELS[info.type] || info.type || 'Event',
      title: info.title || '',
      date: info.date,
      city: info.city,
      venueName: info.venueName,
      address: info.address,
      guestCount: info.guestCount,
      theme: info.theme,
      colourPalette: [...(info.colourPalette || [])],
      specialRequirements: info.specialRequirements,
    },
    services,
    // Approved images only, each with its mandatory source label.
    visuals: Object.fromEntries(Object.entries(visuals || {}).map(([section, list]) => [section, list.map((v) => ({ assetId: v.assetId, sourceType: v.sourceType, label: v.label, caption: v.caption || '' }))])),
    pending,
    customerProvided,
    budget,
    exclusions: [...(cf?.exclusions || []), ...services.flatMap((s) => s.exclusions)].filter((v, i, arr) => arr.indexOf(v) === i),
    notes: [...(cf?.notes || [])],
    terms: cf?.terms ? {
      cancellation: cf.terms.cancellation || '',
      postponement: cf.terms.postponement || '',
      scopeChange: cf.terms.scopeChange || '',
      customerResponsibilities: [...(cf.terms.customerResponsibilities || [])],
    } : null,
    references: {
      manifestVersion: manifest.version,
      agreementVersions: agreements.map((a) => ({ category: a.category, version: a.version })),
      commercialApprovedAt: commercial?.approvedAt || null,
    },
  };
}

function plainPreferences(details = {}) {
  return Object.fromEntries(
    Object.entries(details || {})
      .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === 'string')))
      .slice(0, 30)
  );
}

export function snapshotHash(snapshot) {
  return hashOf(snapshot);
}
