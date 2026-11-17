import { requestHash, workflowError } from '../../admin/services/bookingWorkflow.service.js';

const FIELDS = ['basePrice', 'travelFee', 'equipmentFee', 'setupFee', 'additionalFee'];
export function confirmedPricing(input) {
  const values = Object.fromEntries(FIELDS.map(key => [key, Number(input[key] ?? 0)]));
  if (Object.values(values).some(value => !Number.isFinite(value) || value < 0 || Math.round(value * 100) / 100 !== value)) throw workflowError('INVALID_QUOTE_AMOUNT', 'Confirm each charge as a nonnegative amount with two decimal places.');
  const totalPaise = Object.values(values).reduce((sum, value) => sum + Math.round(value * 100), 0);
  if (!Number.isSafeInteger(totalPaise) || Object.values(values).some(value => !Number.isSafeInteger(Math.round(value * 100)))) throw workflowError('INVALID_QUOTE_AMOUNT', 'The itemized amounts exceed the supported exact-currency range.');
  if (!totalPaise || Math.round(Number(input.totalAmount) * 100) !== totalPaise) throw workflowError('QUOTE_TOTAL_MISMATCH', 'The confirmed total must equal the itemized charges.');
  return { ...values, totalAmount: totalPaise / 100 };
}
export function commercialSnapshot(quote, pricing, version = 1) {
  const confirmed = confirmedPricing(pricing);
  return { version, source: 'VENDOR_CONFIRMED', currency: 'INR', pricing: confirmed, hash: requestHash(confirmed),
    vendorId: String(quote.vendor), vendorServiceId: String(quote.vendorService), eventDate: quote.eventDate,
    confirmedAt: new Date(), expiresAt: quote.validUntil, provenance: Object.fromEntries(FIELDS.map(key => [key, 'VENDOR_QUOTE'])) };
}
export function assertCommercialSnapshot(quote, expectedVersion, requireVersion = false) {
  const snapshot = quote.commercialSnapshot;
  if (!snapshot || snapshot.source !== 'VENDOR_CONFIRMED' || snapshot.hash !== requestHash(confirmedPricing(quote.pricingBreakdown))) throw workflowError('VENDOR_COST_CONFIRMATION_REQUIRED', 'Ask the vendor to confirm and itemize the total cost.', 409);
  if (new Date(snapshot.expiresAt) <= new Date() || quote.validUntil <= new Date()) throw workflowError('QUOTE_EXPIRED', 'The confirmed quote has expired.', 409);
  if ((requireVersion || expectedVersion != null) && Number(expectedVersion) !== snapshot.version) throw workflowError('COMMERCIAL_VERSION_CONFLICT', 'The quote has changed. Review the new confirmed total before accepting.', 409);
  return snapshot;
}
