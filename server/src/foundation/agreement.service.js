import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AgreementVersion, VendorAgreement, relationshipTypes } from './agreement.models.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';

const fail = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const text = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const validId = value => mongoose.isValidObjectId(value);
const snapshot = version => ({ versionId: String(version._id), family: version.family, version: version.version, title: version.title, body: version.body, contentHash: version.contentHash, effectiveFrom: version.effectiveFrom, expiresAt: version.expiresAt || null });
const published = version => version?.state === 'PUBLISHED' && version.effectiveFrom <= new Date() && (!version.expiresAt || version.expiresAt > new Date());
async function audit(actor, row, action, fromState, revision = row.revision, state = row.state) {
  await recordBusinessAudit({ actorId: String(actor), actorType: 'ADMIN', action, resourceType: 'AGREEMENT', resourceId: String(row._id),
    fromState, toState: state, source: 'AGREEMENT_CORE', idempotencyKey: `agreement:${row._id}:${revision}`, why: action });
}
export async function createAgreementVersion(input, actor) {
  const family = text(input.family, 80), title = text(input.title, 160), body = typeof input.body === 'string' && input.body.length <= 200000 && input.body.trim() ? input.body : '';
  const requestKey = text(input.idempotencyKey, 160);
  const effectiveFrom = new Date(input.effectiveFrom), expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (requestKey.length < 8 || !family || !title || !body || !Number.isFinite(+effectiveFrom) || expiresAt && (!Number.isFinite(+expiresAt) || expiresAt <= effectiveFrom)
    || !Array.isArray(input.relationshipTypes) || !input.relationshipTypes.length || input.relationshipTypes.some(type => !relationshipTypes.includes(type))) throw fail('INVALID_AGREEMENT', 'Provide document text, dates and applicable relationship types.', 400);
  return withVendorSchedule(`agreement-family:${family}`, async () => {
    const requestHash = digest({ family, title, body, relationshipTypes: [...new Set(input.relationshipTypes)].sort(), effectiveFrom, expiresAt });
    const prior = await AgreementVersion.findOne({ createdBy: String(actor), requestKey });
    if (prior) {
      if (prior.requestHash !== requestHash) throw fail('AGREEMENT_REQUEST_CHANGED', 'A request key cannot create different document content.');
      await audit(actor, prior, 'AGREEMENT_DRAFT_CREATED', null, 0, 'DRAFT'); return prior;
    }
    const latest = await AgreementVersion.findOne({ family }).sort({ version: -1 }).select('version').lean();
    let row;
    try {
      row = await AgreementVersion.create({ family, title, body, relationshipTypes: [...new Set(input.relationshipTypes)], effectiveFrom, expiresAt,
        contentHash: digest(body), version: (latest?.version || 0) + 1, createdBy: String(actor), requestKey, requestHash, history: [{ actor: String(actor), action: 'DRAFT_CREATED', at: new Date(), revision: 0 }] });
    } catch (error) {
      if (error.code !== 11000) throw error;
      row = await AgreementVersion.findOne({ createdBy: String(actor), requestKey });
      if (!row || row.requestHash !== requestHash) throw fail('AGREEMENT_REQUEST_CHANGED', 'A request key cannot create different document content.');
    }
    await audit(actor, row, 'AGREEMENT_DRAFT_CREATED', null);
    return row;
  });
}
export async function transitionAgreementVersion(id, input, actor) {
  if (!validId(id)) throw fail('AGREEMENT_NOT_FOUND', 'Agreement version not found.', 404);
  return withVendorSchedule(`agreement-version:${id}`, async () => {
    const row = await AgreementVersion.findById(id);
    if (!row) throw fail('AGREEMENT_NOT_FOUND', 'Agreement version not found.', 404);
    const requestHash = digest(input), last = row.history.at(-1);
    if (Number.isInteger(input.expectedRevision) && row.revision === input.expectedRevision + 1 && last?.requestHash === requestHash && last.actor === String(actor)) {
      await audit(actor, row, `AGREEMENT_${input.action}`, null); return row;
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== row.revision) throw fail('AGREEMENT_VERSION_CONFLICT', 'Refresh the agreement before changing its review state.');
    const transitions = { SUBMIT_REVIEW: ['DRAFT', 'REVIEW'], APPROVE: ['REVIEW', 'APPROVED'], PUBLISH: ['APPROVED', 'PUBLISHED'], ARCHIVE: ['PUBLISHED', 'ARCHIVED'] };
    const transition = transitions[input.action];
    if (!transition || row.state !== transition[0]) throw fail('AGREEMENT_STATE_CONFLICT', 'This review action is not available.');
    if (['body', 'title', 'contentHash', 'effectiveFrom', 'relationshipTypes'].some(key => Object.hasOwn(input, key))) throw fail('AGREEMENT_IMMUTABLE', 'Create a new version to change document content.');
    if (input.action === 'APPROVE') {
      if (String(actor) === row.createdBy) throw fail('INDEPENDENT_LEGAL_REVIEW_REQUIRED', 'A different authorized reviewer must approve this version.', 403);
      const reference = text(input.legalReviewReference, 300);
      if (!reference || input.legalReviewConfirmed !== true) throw fail('LEGAL_REVIEW_EVIDENCE_REQUIRED', 'Record the authorized legal review reference and confirmation.');
      row.legalReview = { reviewedBy: String(actor), reference, at: new Date() };
    }
    if (input.action === 'PUBLISH' && (!row.legalReview?.reference || input.confirmPublication !== true)) throw fail('AGREEMENT_PUBLICATION_CONFIRMATION_REQUIRED', 'Confirm publication of the legally reviewed version.');
    const previous = row.state; row.state = transition[1]; row.revision++;
    row.history.push({ actor: String(actor), action: input.action, at: new Date(), revision: row.revision, requestHash });
    await row.save(); await audit(actor, row, `AGREEMENT_${input.action}`, previous);
    return row;
  });
}
async function scopeFor(vendorId, relationshipType, bookingId) {
  if (relationshipType !== 'MANAGED') return { vendorId: String(vendorId), relationshipType };
  if (!validId(bookingId)) throw fail('MANAGED_BOOKING_REQUIRED', 'Choose the vendor-owned managed booking.');
  const booking = await CoreBooking.findOne({ _id: bookingId, vendorId }).lean();
  if (!booking?.commercialSnapshot?.hash || !booking.requirementSnapshot || !booking.financialPolicySnapshot) throw fail('WORK_ORDER_CONTRACT_NOT_READY', 'Immutable commercial, requirement and policy snapshots are required before assigning a managed work order.');
  const commercial = booking.commercialSnapshot;
  if (!Number.isSafeInteger(commercial.vendorPayableMinor) || commercial.vendorPayableMinor < 0 || !commercial.vendorAllocationApprovalReference || !commercial.vendorScope || commercial.currency !== 'INR') throw fail('WORK_ORDER_ALLOCATION_NOT_APPROVED', 'An approved vendor allocation and disclosed work-order scope are required. Customer gross value is not automatically the vendor payable.');
  return { vendorId: String(vendorId), relationshipType, bookingId: String(booking._id), quotationHash: booking.commercialSnapshot.hash,
    amountMinor: commercial.vendorPayableMinor, currency: commercial.currency, eventDate: booking.eventDate,
    disclosedScope: commercial.vendorScope, requirementsHash: digest(booking.requirementSnapshot), policyHash: digest(booking.financialPolicySnapshot),
    commercialBindingHash: digest({ quotationHash: commercial.hash, totalAmount: booking.totalAmount, eventDate: booking.eventDate, pricing: booking.pricing }) };
}
export async function assignVendorAgreement(input, actor) {
  if (!validId(input.vendorId) || !validId(input.versionId) || !relationshipTypes.includes(input.relationshipType)) throw fail('INVALID_ASSIGNMENT', 'Choose a vendor, published version and applicable relationship type.', 400);
  return withVendorSchedule(`agreement-version:${input.versionId}`, async () => {
    const version = await AgreementVersion.findById(input.versionId);
    if (!published(version)) throw fail('AGREEMENT_NOT_PUBLISHED', 'Only a currently effective, published version can be assigned.');
    if (!version.relationshipTypes.includes(input.relationshipType)) throw fail('AGREEMENT_NOT_APPLICABLE', 'This version does not apply to that relationship.');
    if (!await VendorOrganization.exists({ _id: input.vendorId })) throw fail('VENDOR_NOT_FOUND', 'Vendor not found.', 404);
    const scope = await scopeFor(input.vendorId, input.relationshipType, input.bookingId);
    const referenceKey = `${input.relationshipType}:${scope.bookingId || 'VENDOR'}`;
    const row = await VendorAgreement.findOneAndUpdate({ vendor: input.vendorId, versionId: version._id, referenceKey }, { $setOnInsert: {
      relationshipType: input.relationshipType, snapshot: snapshot(version), scope, scopeHash: digest(scope), assignedBy: String(actor),
      history: [{ actor: String(actor), action: 'ASSIGNED', at: new Date(), revision: 0 }],
    } }, { upsert: true, new: true });
    if (row.scopeHash !== digest(scope)) throw fail('AGREEMENT_MATERIAL_CHANGE', 'Assign a revised document version for the changed commercial scope.');
    await audit(actor, row, 'AGREEMENT_ASSIGNED', null, 0, 'ASSIGNED'); return row;
  });
}
export async function acceptVendorAgreement(vendorId, actor, id, input) {
  if (!await VendorOrganization.exists({ _id: vendorId, owner: actor })) throw fail('VENDOR_OWNERSHIP_REQUIRED', 'Only the authorized vendor owner may submit this signatory declaration.', 403);
  if (!validId(id)) throw fail('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  const initial = await VendorAgreement.findOne({ _id: id, vendor: vendorId }).lean();
  if (!initial) throw fail('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  return withVendorSchedule(`agreement-version:${initial.versionId}`, async () => {
    const row = await VendorAgreement.findOne({ _id: id, vendor: vendorId });
    const name = text(input.signatoryFullName, 200), requestKey = text(input.idempotencyKey, 160);
    if (!name || requestKey.length < 8 || input.authorityConfirmed !== true) throw fail('SIGNATORY_AUTHORITY_REQUIRED', 'Provide the authorized signatory name and explicit authority declaration.', 400);
    const requestHash = digest({ name, requestKey, hash: input.expectedHash, scopeHash: input.expectedScopeHash, versionId: input.expectedVersionId, revision: input.expectedRevision });
    if (row.state === 'ACCEPTED') {
      if (row.acceptance?.actor === String(actor) && row.acceptance?.requestKey === requestKey && row.acceptance?.requestHash === requestHash) { await acceptanceAudit(actor, vendorId, row); return row; }
      throw fail('AGREEMENT_ALREADY_ACCEPTED', 'This accepted copy cannot be overwritten.');
    }
    const version = await AgreementVersion.findById(row.versionId);
    if (row.state !== 'ASSIGNED' || !published(version)) throw fail('AGREEMENT_UNAVAILABLE', 'This version is no longer available for acceptance.');
    if (input.expectedRevision !== row.revision || input.expectedHash !== row.snapshot.contentHash || input.expectedScopeHash !== row.scopeHash || String(input.expectedVersionId) !== String(row.versionId)) throw fail('AGREEMENT_VERSION_CONFLICT', 'Review the exact current document and scope before accepting.');
    if (digest(row.snapshot.body) !== row.snapshot.contentHash) throw fail('AGREEMENT_INTEGRITY_ERROR', 'The document requires an integrity review.');
    const currentScope = await scopeFor(vendorId, row.relationshipType, row.scope.bookingId);
    if (digest(currentScope) !== row.scopeHash) throw fail('AGREEMENT_MATERIAL_CHANGE', 'Commercial terms changed. A revised work order and new acceptance are required.');
    row.state = 'ACCEPTED'; row.revision++;
    row.acceptance = { actor: String(actor), signatoryFullName: name, authorityConfirmed: true, acceptedAt: new Date(), method: 'CLICK_TO_ACCEPT',
      documentHash: row.snapshot.contentHash, scopeHash: row.scopeHash, requestKey, requestHash };
    row.history.push({ actor: String(actor), action: 'ACCEPTED', at: new Date(), revision: row.revision });
    await row.save();
    await acceptanceAudit(actor, vendorId, row);
    return row;
  });
}
async function acceptanceAudit(actor, vendorId, row) {
  await recordBusinessAudit({ actorId: String(actor), actorType: 'EXTERNAL', organizationId: String(vendorId), action: 'VENDOR_AGREEMENT_ACCEPTED', resourceType: 'AGREEMENT', resourceId: String(row._id), fromState: 'ASSIGNED', toState: 'ACCEPTED', idempotencyKey: `agreement:${row._id}:${row.revision}`, source: 'AGREEMENT_CORE' });
}
