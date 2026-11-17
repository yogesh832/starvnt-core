import { createHash } from 'node:crypto';

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value?.toHexString) return value.toHexString();
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
export function quoteVersionRecord(quote, provenance = 'SUBMITTED_VERSION') {
  const value = quote.toObject ? quote.toObject() : quote;
  const content = canonical({ vendorId: String(value.vendor?._id || value.vendor), customerId: String(value.customer?._id || value.customer), vendorServiceId: String(value.vendorService?._id || value.vendorService),
    opportunityId: value.opportunity ? String(value.opportunity?._id || value.opportunity) : null,
    ...(value.creationEnquiryUpdatedAt ? { creationEnquiryUpdatedAt: value.creationEnquiryUpdatedAt } : {}),
    serviceName: value.serviceName, eventDate: value.eventDate, serviceLocation: value.serviceLocation,
    pricingBreakdown: value.pricingBreakdown, notes: value.notes, validUntil: value.validUntil,
    commercialSnapshot: value.commercialSnapshot, advancePolicySnapshot: value.advancePayment?.policySnapshot || null,
  });
  return { version: value.commercialSnapshot.version, content, contentHash: createHash('sha256').update(JSON.stringify(content)).digest('hex'), recordedAt: new Date(), provenance };
}
