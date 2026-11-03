import crypto from 'node:crypto';
import { CustomerConsent, PrivacyRequest } from './models.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { verifiedContact } from './identity.service.js';
import { NotificationPreference } from '../notifications/preferences.models.js';

export const CUSTOMER_NOTICE = Object.freeze({ version: '2026-11-02.v1',
  collector: 'STARVNT', purposes: ['ECOSYSTEM', 'MARKETING', 'PERSONALIZATION'],
  text: 'STARVNT uses your account and booking information to provide event services. A vendor can access its own booking relationship; its private contacts are not shared across vendors. Ecosystem linking, personalized recommendations and marketing are optional and separately controlled. You can withdraw permission or request deletion from privacy settings. Commercial records may need to be retained with a recorded reason. Feedback does not require marketing permission.' });
export function foundationError(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
export async function setConsent(customer, input = {}) {
  const { purpose, channel = 'ALL', status, noticeVersion, revision, idempotencyKey } = input;
  const scope = input.vendorId ? `VENDOR:${input.vendorId}` : 'STARVNT';
  if (!CUSTOMER_NOTICE.purposes.includes(purpose) || !['ALL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'].includes(channel) || !['GRANTED', 'WITHDRAWN'].includes(status)) throw foundationError('INVALID_CONSENT', 'Choose a valid purpose, channel and decision.');
  if (purpose !== 'MARKETING' && channel !== 'ALL') throw foundationError('INVALID_CONSENT', 'This purpose applies to all channels.');
  if (purpose === 'MARKETING' && channel === 'ALL') throw foundationError('CHANNEL_REQUIRED', 'Marketing decisions must name a communication channel.');
  if (noticeVersion !== CUSTOMER_NOTICE.version) throw foundationError('NOTICE_CHANGED', 'Read the current customer notice before saving.', 409);
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 160 || !Number.isInteger(revision) || revision < 0) throw foundationError('INVALID_REVISION', 'A request key and current revision are required.');
  if (input.vendorId && !await VendorOrganization.exists({ _id: input.vendorId })) throw foundationError('VENDOR_NOT_FOUND', 'Vendor not found.', 404);
  const user = await ExternalUser.findById(customer);
  if (!user || user.status !== 'ACTIVE' || (status === 'GRANTED' && (user.privacy?.deletionRequestedAt || await PrivacyRequest.exists({ customer })))) throw foundationError('ACCOUNT_UNAVAILABLE', 'Account is unavailable.', 403);
  if (status === 'GRANTED' && purpose === 'ECOSYSTEM' && !verifiedContact(user, 'PHONE')) throw foundationError('VERIFIED_MOBILE_REQUIRED', 'Verify your mobile before enabling ecosystem linking.');
  const filter = { customer, scope, purpose, channel };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ scope, purpose, channel, status, noticeVersion, revision })).digest('hex');
  const prior = await CustomerConsent.findOne(filter).lean();
  const replay = prior?.history?.find(h => h.requestKey === idempotencyKey);
  if (replay) {
    if (replay.requestHash !== hash) throw foundationError('IDEMPOTENCY_CONFLICT', 'Request key was used for a different decision.', 409);
    return prior;
  }
  const entry = { actor: String(customer), action: status, at: new Date(), revision: revision + 1, requestKey: idempotencyKey, requestHash: hash, state: { status, noticeVersion } };
  const update = { $set: { status, noticeVersion }, $inc: { revision: 1 }, $push: { history: entry } };
  try {
    const row = await CustomerConsent.findOneAndUpdate({ ...filter, revision }, update, { upsert: !prior && revision === 0, new: true, runValidators: true });
    if (!row) throw foundationError('STALE_REVISION', 'Consent changed. Refresh and retry.', 409);
    return row;
  } catch (err) {
    if (err.code === 11000) {
      const row = await CustomerConsent.findOne(filter).lean();
      if (row?.history?.some(h => h.requestKey === idempotencyKey && h.requestHash === hash)) return row;
      throw foundationError('STALE_REVISION', 'Consent changed. Refresh and retry.', 409);
    }
    throw err;
  }
}

export async function hasPermission(customer, purpose, channel = 'ALL', scope = 'STARVNT') {
  const user = await ExternalUser.findById(customer).lean();
  if (!user || user.status !== 'ACTIVE' || user.privacy?.deletionRequestedAt || await PrivacyRequest.exists({ customer })) return false;
  const row = await CustomerConsent.findOne({ customer, scope, purpose, channel }).lean();
  return row?.status === 'GRANTED';
}

export async function communicationAllowed(customer, { purpose = 'TRANSACTIONAL', channel = 'PUSH', vendorId = null } = {}) {
  if (purpose === 'TRANSACTIONAL') return true;
  if (!['MARKETING', 'PERSONALIZATION'].includes(purpose)) return false;
  const preference = await NotificationPreference.findById(`CUSTOMER:${customer}`).lean();
  if (preference?.channels?.[channel] === false) return false;
  return hasPermission(customer, purpose, purpose === 'MARKETING' ? channel : 'ALL', vendorId ? `VENDOR:${vendorId}` : 'STARVNT');
}
