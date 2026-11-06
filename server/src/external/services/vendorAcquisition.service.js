import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';
import { VendorOrganization } from '../models/VendorOrganization.js';

// A bounded, first-achievement journal: no ad identifiers, credentials or contact details.
// Separate from VendorOrganization so analytics writes cannot change review CAS timestamps.
const schema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  achieved: [String],
  events: [{ _id: false, name: String, eventId: String, occurredAt: Date, claimedAt: Date }],
});
export const VendorAcquisition = externalConn.model('VendorAcquisition', schema);

export async function authAcquisitionReceipt(user, session, req) {
  if (user.accountType !== 'VENDOR' || !user.vendorOrganization ||
      !['/register', '/login', '/google', '/password/set', '/otp/verify', '/otp/email/verify', '/otp/widget-verify'].includes(req.path)) return;
  if (req.acquisitionCreated) {
    const event = { name: 'CompleteRegistration', eventId: randomUUID(), occurredAt: new Date() };
    const vendor = await VendorOrganization.findById(user.vendorOrganization).lean();
    const initial = vendor?.isProfileCompleted && vendor.businessName && vendor.category && vendor.location
      ? ['VendorOnboardingStarted', 'VendorBusinessInformationAdded', 'VendorProfileCompleted'] : [];
    const events = [event, ...initial.map(name => ({ name, eventId: randomUUID(), occurredAt: event.occurredAt }))];
    const journal = await VendorAcquisition.findOneAndUpdate({ vendor: user.vendorOrganization }, {
      $setOnInsert: { achieved: events.map(e => e.name), events },
    }, { upsert: true, new: true });
    return journal.events.find(e => e.name === 'CompleteRegistration');
  }
  // Refresh, identity restoration and surface switching are deliberately excluded.
  return { name: 'VendorLogin', eventId: randomUUID(), occurredAt: new Date() };
}

export async function observeVendorAcquisition(vendor, facts, evidenceTimes = {}) {
  // First observation of legacy accounts establishes a baseline, without backfilling conversions.
  const baseline = await VendorAcquisition.findOneAndUpdate({ vendor: vendor._id }, {
    $setOnInsert: { achieved: Object.keys(facts).filter(k => facts[k]), events: [] },
  }, { upsert: true, new: true }).lean();
  let changed = false;
  for (const [name, complete] of Object.entries(facts)) {
    if (!complete || baseline.achieved.includes(name)) continue;
    changed = true;
    await VendorAcquisition.updateOne({ vendor: vendor._id, achieved: { $ne: name } }, {
      $addToSet: { achieved: name },
      $push: { events: { name, eventId: randomUUID(), occurredAt: evidenceTimes[name] || new Date() } },
    });
  }
  const journal = changed ? await VendorAcquisition.findOne({ vendor: vendor._id }).lean() : baseline;
  return (journal?.events || []).map(({ name, eventId, occurredAt }) => ({ name, eventId, occurredAt }));
}

export async function claimVendorAcquisition(vendorId, consentSince) {
  const since = new Date(consentSince);
  if (!Number.isFinite(since.getTime()) || since > new Date() || Date.now() - since > 90 * 86400000) return [];
  const journal = await VendorAcquisition.findOne({ vendor: vendorId }).lean();
  const events = [];
  for (const event of journal?.events || []) {
    if (event.claimedAt || event.occurredAt < since) continue;
    const claimed = await VendorAcquisition.updateOne({ vendor: vendorId, events: { $elemMatch: { eventId: event.eventId, claimedAt: { $exists: false } } } }, {
      $set: { 'events.$.claimedAt': new Date() },
    });
    if (claimed.modifiedCount === 1) events.push({ name: event.name, eventId: event.eventId, occurredAt: event.occurredAt });
  }
  return events;
}
