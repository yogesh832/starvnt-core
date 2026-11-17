import { createHash } from 'node:crypto';
const canonical = value => value instanceof Date ? value.toISOString() : value?.toHexString ? value.toHexString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
export const quoteCreationHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function prepareQuoteCreationEffects(quote) {
  const snapshot = {
    quoteId: String(quote._id), vendorId: String(quote.vendor?._id || quote.vendor), customerId: String(quote.customer?._id || quote.customer),
    opportunityId: quote.opportunity ? String(quote.opportunity?._id || quote.opportunity) : null,
    quoteReference: quote.quoteReference, serviceName: quote.serviceName,
    version: quote.commercialSnapshot.version, totalAmount: quote.pricingBreakdown.totalAmount,
  };
  return { state: 'PENDING', snapshot, hash: quoteCreationHash(snapshot) };
}
export function quoteCreationCommand(vendorId, command) {
  if (!command) return null;
  if (typeof command.key !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(command.key) || !command.actorId || !command.intent) throw Object.assign(new Error('Supply a valid quote request identifier.'), { code: 'INVALID_QUOTE_REQUEST_KEY', statusCode: 400 });
  const actor = String(command.actorId?._id || command.actorId);
  return { key: command.key, actor, hash: createHash('sha256').update(JSON.stringify(canonical({ vendorId: String(vendorId?._id || vendorId), actorId: actor, intent: command.intent }))).digest('hex') };
}
export const quoteCreationConflict = () => Object.assign(new Error('This quote request identifier already belongs to different content or an actor. Review the existing quote before creating another offer.'), { code: 'QUOTE_REQUEST_CHANGED', statusCode: 409 });
