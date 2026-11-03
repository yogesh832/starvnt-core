import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { VendorBlockout } from '../external/models/VendorBlockout.js';
import { Booking, Reservation } from '../customer/models/index.js';

async function duplicates(Model, field) {
  const groups = await Model.aggregate([
    { $match: { [field]: { $exists: true, $nin: [null, ''] } } },
    { $group: { _id: `$${field}`, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  return groups.map(g => ({ valueFingerprint: crypto.createHash('sha256').update(String(g._id)).digest('hex').slice(0, 12), ids: g.ids.map(String), count: g.count }));
}
/** No inference from names/categories; conflicts stop all backfills. */
export async function foundationMigration({ apply = false } = {}) {
  const conflicts = {};
  for (const [label, Model, field] of [
    ['phone', ExternalUser, 'phone'], ['googleId', ExternalUser, 'googleId'],
    ['vendorOwner', VendorOrganization, 'owner'], ['coreQuote', CoreBooking, 'quoteId'],
    ['coreReservation', CoreBooking, 'reservationId'], ['coreCustomerBooking', CoreBooking, 'customerBookingId'],
  ]) conflicts[label] = await duplicates(Model, field);
  conflicts.phoneFormatting = [];
  for await (const user of ExternalUser.find({ phone: { $exists: true, $nin: [null, ''] } }).select('_id phone').cursor()) {
    if (!/^\+[1-9]\d{7,14}$/.test(user.phone)) conflicts.phoneFormatting.push({ id: String(user._id), reason: 'Review non-canonical international phone formatting before backfill' });
  }
  const missingLinks = [];
  for await (const booking of Booking.find({ isDemo: { $ne: true }, $or: [{ coreBooking: null }, { 'coreSync.snapshot': null }] }).cursor()) {
    const reservation = await Reservation.findById(booking.reservation).lean();
    const links = [{ customerBookingId: booking._id }, { reservationId: booking.reservation }, ...(booking.coreBooking ? [{ _id: booking.coreBooking }] : []), ...(reservation?.quote ? [{ quoteId: String(reservation.quote) }] : [])];
    const matches = await CoreBooking.find({ customerId: booking.customer, $or: links }).select('_id vendorId').limit(2).lean();
    missingLinks.push({ bookingId: String(booking._id), reservationId: String(booking.reservation), coreId: matches.length === 1 ? String(matches[0]._id) : null, candidates: matches.length });
  }
  const claimed = new Map();
  for (const row of missingLinks.filter(r => r.coreId)) claimed.set(row.coreId, [...(claimed.get(row.coreId) || []), row.bookingId]);
  conflicts.plannedCoreLinks = [...claimed].filter(([, ids]) => ids.length > 1).map(([coreId, ids]) => ({ coreId, ids }));
  const blocked = Object.values(conflicts).some(rows => rows.length) || missingLinks.some(r => r.candidates !== 1);
  const report = { mode: apply ? 'APPLY' : 'DRY_RUN', status: blocked ? 'REVIEW_REQUIRED' : 'READY', conflicts, missingLinks, applied: false };
  if (!apply || blocked) return report;
  for (const [Model, field, bsonType] of [[ExternalUser, 'phoneIdentityKey', 'string'], [ExternalUser, 'googleIdentityKey', 'string'], [VendorOrganization, 'ownerIdentityKey', 'objectId'], [CoreBooking, 'customerBookingId', 'objectId'], [CoreBooking, 'reservationId', 'objectId']]) {
    await Model.collection.createIndex({ [field]: 1 }, { unique: true, partialFilterExpression: { [field]: { $type: bsonType } } });
  }
  // Repeatable additive keys. Do not manufacture verification/consent evidence.
  for await (const user of ExternalUser.find().cursor()) {
    const set = {};
    if (user.phone && !user.phoneIdentityKey) set.phoneIdentityKey = user.phone;
    if (user.googleId && !user.googleIdentityKey) set.googleIdentityKey = user.googleId;
    if (Object.keys(set).length) await ExternalUser.collection.updateOne({ _id: user._id, phone: user.phone ?? { $exists: false }, googleId: user.googleId }, { $set: set });
  }
  for await (const vendor of VendorOrganization.find({ ownerIdentityKey: { $exists: false } }).cursor()) {
    await VendorOrganization.collection.updateOne({ _id: vendor._id, owner: vendor.owner, ownerIdentityKey: { $exists: false } }, { $set: { ownerIdentityKey: vendor.owner } });
  }
  for (const row of missingLinks) {
    const core = await CoreBooking.findById(row.coreId).lean();
    const booking = await Booking.findById(row.bookingId).lean();
    if (!core || !booking || String(core.customerId) !== String(booking.customer)) throw new Error('MIGRATION_RECORD_CHANGED');
    const snapshot = Object.fromEntries(['quoteId', 'vendorId', 'vendorService', 'serviceName', 'eventDate', 'totalAmount', 'serviceLocation', 'pricing', 'category', 'financialPolicySnapshot', 'paymentStatus', 'executionStatus', 'settlementStatus', 'paymentSummary'].filter(k => core[k] !== undefined).map(k => [k, core[k]]));
    await CoreBooking.collection.updateOne({ _id: new mongoose.Types.ObjectId(row.coreId), customerBookingId: { $exists: false } }, { $set: { customerBookingId: new mongoose.Types.ObjectId(row.bookingId), reservationId: new mongoose.Types.ObjectId(row.reservationId) } });
    await Booking.updateOne({ _id: row.bookingId }, { $set: { coreBooking: row.coreId, vendor: core.vendorId, 'coreSync.snapshot': snapshot, 'coreSync.status': 'PENDING' } });
  }
  await CoreBooking.collection.updateMany({ source: { $exists: false } }, { $set: { source: 'STARVNT' } });
  await VendorBlockout.collection.updateMany({ source: { $exists: false } }, { $set: { source: 'VENDOR_PRIVATE' } });
  await VendorBlockout.collection.updateMany({ recordType: 'EXTERNAL_COMMITMENT', 'externalBooking.acquisitionChannel': { $exists: false } }, { $set: { 'externalBooking.acquisitionChannel': 'LEGACY_UNKNOWN' } });
  report.applied = true;
  return report;
}
