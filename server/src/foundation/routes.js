import { Router } from 'express';
import mongoose from 'mongoose';
import { requireCustomer } from '../customer/middleware/requireCustomer.js';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { asyncHandler as h } from '../customer/utils/http.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { ExternalSession } from '../external/models/ExternalSession.js';
import { verifyExternalAccessToken } from '../external/utils/tokens.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { CustomerEvent } from '../customer/models/index.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { verifyMobileOtp } from '../external/services/otp.service.js';
import { CustomerConsent, IdentityLink, PrivacyRequest } from './models.js';
import { CUSTOMER_NOTICE, setConsent, hasPermission, foundationError } from './consent.service.js';
import { recordVerifiedIdentity, verifiedContact, identityConflict, findPhoneIdentity } from './identity.service.js';
import { requestDeletion, processDeletion } from './privacy.service.js';
import { reconcileBookingBatch } from '../customer/services/bookingTruth.service.js';
import rateLimit from 'express-rate-limit';
import { recordAudit, auditContext } from '../admin/utils/audit.js';

export const foundationCustomerRoutes = Router();
foundationCustomerRoutes.use(requireCustomer);
foundationCustomerRoutes.get('/privacy/notice', (req, res) => res.json(CUSTOMER_NOTICE));
foundationCustomerRoutes.get('/privacy/consents', h(async (req, res) => res.json({ consents: await CustomerConsent.find({ customer: req.externalUser._id }).lean() })));
foundationCustomerRoutes.put('/privacy/consents', h(async (req, res) => res.json({ consent: await setConsent(req.externalUser._id, req.body) })));
foundationCustomerRoutes.post('/privacy/deletion', h(async (req, res) => res.status(202).json({ request: await requestDeletion(req.externalUser._id) })));
foundationCustomerRoutes.get('/privacy/deletion', h(async (req, res) => res.json({ request: await PrivacyRequest.findOne({ customer: req.externalUser._id }).select('-lastError').lean() })));

const verifyLimiter = rateLimit({ windowMs: 60000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
foundationCustomerRoutes.post('/identity/mobile/verify', verifyLimiter, h(async (req, res) => {
  const proof = await verifyMobileOtp(req.body?.phone, req.body?.otp);
  if (!proof.valid || !proof.phone) throw foundationError('INVALID_OTP', 'Mobile verification failed.');
  const other = await ExternalUser.exists({ phone: proof.phone, _id: { $ne: req.externalUser._id } });
  if (other) throw identityConflict();
  const user = req.externalUser;
  user.phone = proof.phone;
  await recordVerifiedIdentity(user, 'PHONE', proof.phone, proof.trustSource === 'DEVELOPMENT_OTP' ? 'DEVELOPMENT_OTP' : 'MOBILE_OTP');
  res.json({ ok: true, user: user.toSafeJSON() });
}));

foundationCustomerRoutes.get('/customer-360', h(async (req, res) => {
  const customer = req.externalUser._id;
  const [events, bookings, reviews, consents] = await Promise.all([
    CustomerEvent.find({ customer }).select('_id title eventType eventDate status').sort({ createdAt: -1 }).limit(200).lean(),
    CoreBooking.find({ customerId: customer }).select('_id vendorId serviceName eventDate bookingStatus executionStatus source customerEvent').sort({ createdAt: -1 }).limit(200).lean(),
    VendorReview.find({ customer }).select('_id vendor booking rating reviewText status').limit(200).lean(),
    CustomerConsent.find({ customer }).select('-history').lean(),
  ]);
  res.json({ customer: req.externalUser.toSafeJSON(), mobileVerified: verifiedContact(req.externalUser, 'PHONE'),
    nameVerification: 'SELF_REPORTED', events, bookings, reviews, consents,
    sources: ['STARVNT'], externalContactsIncluded: false, limitPerCollection: 200 });
}));

// A relationship link never transfers ownership or authorizes cross-account reads.
foundationCustomerRoutes.get('/identity/link-requests', h(async (req, res) => res.json({ requests: await IdentityLink.find({ $or: [{ customer: req.externalUser._id }, { otherCustomer: req.externalUser._id }] }).sort({ updatedAt: -1 }).limit(100).lean() })));
foundationCustomerRoutes.post('/identity/link-requests', verifyLimiter, h(async (req, res) => {
  let other;
  if (req.body?.otherAccessToken) {
    let payload;
    try { payload = verifyExternalAccessToken(req.body.otherAccessToken); } catch { throw foundationError('INVALID_IDENTITY_PROOF', 'Verify both accounts to request a link.', 401); }
    const session = await ExternalSession.findById(payload.sid);
    other = await ExternalUser.findById(payload.sub);
    if (!session || !other || session.revokedAt || session.expiresAt <= new Date() || String(session.user) !== String(other._id)) throw foundationError('INVALID_IDENTITY_PROOF', 'Both accounts must have valid ownership proof.', 403);
  } else {
    const proof = await verifyMobileOtp(req.body?.otherPhone, req.body?.otp);
    if (!proof.valid || !proof.phone || proof.trustSource === 'DEVELOPMENT_OTP') throw foundationError('INVALID_IDENTITY_PROOF', 'Verify the other account mobile with OTP.', 401);
    other = await findPhoneIdentity(proof.phone);
  }
  const customer = req.externalUser._id;
  if (!other || other.accountType !== 'CUSTOMER' || other.status !== 'ACTIVE' || String(other._id) === String(customer)) throw foundationError('INVALID_IDENTITY_PROOF', 'Both accounts must be active customer accounts.', 403);
  if (!verifiedContact(other, 'PHONE') || !verifiedContact(req.externalUser, 'PHONE')) throw foundationError('VERIFIED_MOBILE_REQUIRED', 'Verify both customer identities before requesting a link.');
  if (!await hasPermission(customer, 'ECOSYSTEM') || !await hasPermission(other._id, 'ECOSYSTEM')) throw foundationError('CONSENT_REQUIRED', 'Both customers must authorize ecosystem linking.', 403);
  let row = await IdentityLink.findOneAndUpdate({ customer, otherCustomer: other._id }, { $setOnInsert: { proofAt: new Date(), status: 'REQUESTED', history: [{ actor: String(customer), action: 'REQUESTED', at: new Date() }] } }, { upsert: true, new: true });
  if (['REVOKED', 'REJECTED'].includes(row.status)) row = await IdentityLink.findOneAndUpdate({ _id: row._id, status: row.status }, { $set: { proofAt: new Date(), status: 'REQUESTED' }, $push: { history: { actor: String(customer), action: 'REQUESTED_AGAIN', at: new Date(), reason: 'Fresh ownership proof and consent checked' } } }, { new: true });
  if (!row) throw foundationError('LINK_CHANGED', 'Link changed. Refresh and retry.', 409);
  res.status(202).json({ request: row });
}));
foundationCustomerRoutes.post('/identity/link-requests/:id/revoke', h(async (req, res) => {
  const row = await IdentityLink.findOneAndUpdate({ _id: req.params.id, $or: [{ customer: req.externalUser._id }, { otherCustomer: req.externalUser._id }], status: { $ne: 'REVOKED' } }, { $set: { status: 'REVOKED' }, $push: { history: { actor: String(req.externalUser._id), action: 'REVOKED', at: new Date() } } }, { new: true });
  if (!row) throw foundationError('LINK_NOT_FOUND', 'Link not found.', 404);
  res.json({ request: row });
}));

export const foundationAdminRoutes = Router();
foundationAdminRoutes.use(requireAdminAuth);
foundationAdminRoutes.get('/customers/export', requirePermission('customers.read', 'customerContacts.read', 'customerContacts.export'), h(async (req, res) => {
  const reason = String(req.query.reason || '').trim().slice(0, 500);
  if (!reason || (req.query.after && !mongoose.isValidObjectId(req.query.after))) throw foundationError('EXPORT_REASON_REQUIRED', 'Provide an export purpose and a valid cursor.');
  const filter = { accountType: 'CUSTOMER', ...(req.query.after ? { _id: { $gt: req.query.after } } : {}) };
  const rows = await ExternalUser.find(filter).sort({ _id: 1 }).limit(101).select('fullName email phone status sourceAttribution').lean();
  const customers = rows.slice(0, 100);
  await recordAudit({ ...auditContext(req), action: 'CUSTOMER_CONTACT_EXPORT', targetType: 'customers', targetId: customers.map(c => String(c._id)).join(','), reason });
  res.json({ customers, nextCursor: rows.length > 100 ? String(customers.at(-1)._id) : null, source: 'STARVNT_ACCOUNTS', excludesVendorPrivateContacts: true });
}));
foundationAdminRoutes.get('/privacy/requests', requirePermission('privacy.read'), h(async (req, res) => res.json({ requests: await PrivacyRequest.find().sort({ requestedAt: 1 }).limit(100).lean() })));
foundationAdminRoutes.get('/privacy/retention-due', requirePermission('privacy.read'), h(async (req, res) => res.json({ requests: await PrivacyRequest.find({ status: 'COMPLETED', retainedUntil: { $lte: new Date() } }).sort({ retainedUntil: 1 }).limit(100).lean() })));
foundationAdminRoutes.post('/privacy/requests/:id/retention-review', requirePermission('privacy.manage'), h(async (req, res) => {
  const until = new Date(req.body?.retainedUntil), reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason || !Number.isFinite(until.getTime()) || until <= new Date()) throw foundationError('RETENTION_DECISION_REQUIRED', 'Record a reason and a future review date.');
  const row = await PrivacyRequest.findOneAndUpdate({ _id: req.params.id, status: 'COMPLETED' }, { $set: { retainedUntil: until, retentionReason: reason }, $push: { history: { actor: String(req.admin._id), action: 'RETENTION_REVIEWED', reason, at: new Date(), state: { retainedUntil: until } } } }, { new: true });
  if (!row) throw foundationError('REQUEST_NOT_FOUND', 'Completed privacy request not found.', 404);
  await ExternalUser.updateOne({ _id: row.customer }, { $set: { 'privacy.retainedUntil': until, 'privacy.retentionReason': reason } });
  res.json({ request: row });
}));
foundationAdminRoutes.post('/privacy/requests/:id/process', requirePermission('privacy.manage'), h(async (req, res) => res.json({ request: await processDeletion(req.params.id, req.admin._id, req.body) })));
foundationAdminRoutes.post('/privacy/requests/:id/hold', requirePermission('privacy.manage'), h(async (req, res) => {
  if (typeof req.body?.hold !== 'boolean' || typeof req.body?.reason !== 'string' || !req.body.reason.trim() || req.body.reason.length > 500) throw foundationError('REASON_REQUIRED', 'A hold decision and reason are required.');
  const row = await PrivacyRequest.findOneAndUpdate({ _id: req.params.id, status: { $in: ['REQUESTED', 'APPROVED'] } }, { $set: { legalHold: req.body.hold, legalHoldReason: req.body.reason }, $push: { history: { actor: String(req.admin._id), action: req.body.hold ? 'HOLD' : 'HOLD_RELEASED', at: new Date(), reason: req.body.reason } } }, { new: true });
  if (!row) throw foundationError('REQUEST_CHANGED', 'Request is missing or already processing.', 409);
  res.json({ request: row });
}));
foundationAdminRoutes.get('/identity/link-requests', requirePermission('identity.read'), h(async (req, res) => res.json({ requests: await IdentityLink.find().limit(100).lean() })));
foundationAdminRoutes.post('/identity/link-requests/:id/decision', requirePermission('identity.link'), h(async (req, res) => {
  const status = req.body?.status;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!['LINKED', 'REJECTED', 'REVOKED'].includes(status) || !reason) throw foundationError('INVALID_DECISION', 'A decision and reason are required.');
  const before = await IdentityLink.findById(req.params.id).lean();
  if (!before) throw foundationError('LINK_NOT_FOUND', 'Link not found.', 404);
  if (status === 'LINKED' && (!await hasPermission(before.customer, 'ECOSYSTEM') || !await hasPermission(before.otherCustomer, 'ECOSYSTEM'))) throw foundationError('CONSENT_REQUIRED', 'Both customers must still authorize ecosystem linking.', 403);
  if (status === 'LINKED') {
    const owners = await ExternalUser.find({ _id: { $in: [before.customer, before.otherCustomer] }, status: 'ACTIVE' });
    if (owners.length !== 2 || owners.some(owner => !verifiedContact(owner, 'PHONE'))) throw foundationError('VERIFIED_MOBILE_REQUIRED', 'Both identities must still have verified mobiles.');
  }
  const row = await IdentityLink.findOneAndUpdate({ _id: before._id, status: status === 'LINKED' || status === 'REJECTED' ? 'REQUESTED' : 'LINKED' }, { $set: { status, reason }, $push: { history: { actor: String(req.admin._id), action: status, at: new Date(), reason } } }, { new: true });
  if (!row) throw foundationError('LINK_CHANGED', 'Link decision changed. Refresh.', 409);
  res.json({ request: row });
}));
foundationAdminRoutes.post('/bookings/reconcile', requirePermission('bookings.reconcile'), h(async (req, res) => res.json({ results: await reconcileBookingBatch() })));
