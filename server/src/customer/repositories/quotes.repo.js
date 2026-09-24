import { CustomerQuote } from '../models/index.js';

/** Stale drafts expire lazily, on read. */
export function expireStaleDrafts(filter) {
  return CustomerQuote.updateMany({ ...filter, status: 'draft', validUntil: { $lt: new Date() } }, { $set: { status: 'expired' } });
}

export async function listForEvent(eventId) {
  await expireStaleDrafts({ event: eventId });
  return CustomerQuote.find({ event: eventId }).sort({ createdAt: -1 }).lean();
}

export async function findOwned(customerId, quoteId) {
  await expireStaleDrafts({ _id: quoteId, customer: customerId });
  return CustomerQuote.findOne({ _id: quoteId, customer: customerId }).lean();
}

export async function countDraftsForEvents(eventIds) {
  await expireStaleDrafts({ event: { $in: eventIds } });
  const rows = await CustomerQuote.aggregate([{ $match: { event: { $in: eventIds }, status: 'draft' } }, { $group: { _id: '$event', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

/** A new quote supersedes older drafts for the same event (marked cancelled, never deleted). */
export async function createSuperseding(data) {
  const superseded = await CustomerQuote.updateMany({ event: data.event, status: 'draft' }, { $set: { status: 'cancelled' } });
  const doc = await CustomerQuote.create(data);
  return { quote: doc.toObject(), supersededCount: superseded.modifiedCount };
}
