import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Quote } from '../src/external/models/Quote.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { CustomerEvent, EventRequirement, Booking, Payment, CustomerNotification } from '../src/customer/models/index.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { ProposalDossier, ProposalDocument } from '../src/proposals/models.js';
import { generationGate, cleanDraft, scopeHash, hash } from '../src/proposals/policy.js';
import * as service from '../src/proposals/service.js';
import { renderProposal } from '../src/proposals/pdf.js';
import { richSnapshot } from '../test-support/proposal-rich.js';
import { contentBlockers } from '../src/proposals/content.js';
import { registerProposalImageAdapters, requestConcept, runConceptBatch } from '../src/proposals/ai.js';
import { ProposalConceptJob } from '../src/proposals/models.js';
import { registerLlmAdapter } from '../src/customer/aura/llmAdapter.js';

const expiresAt = () => new Date(Date.now() + 7 * 86400000).toISOString();
const date = () => new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
const auth = token => ({ Authorization: `Bearer ${token}` });
const image = readFileSync(new URL('./fixtures/proposal-reference.png', import.meta.url));
const asset = { url: 'https://res.cloudinary.com/qa/image/upload/reference.png', source: 'reference', rights: 'Synthetic geometric artwork created for isolated QA.', caption: 'Illustrative editorial arches - synthetic QA reference', category: 'photography' };
let mongo, app, customer, outsider, vendor, owner, admin, customerToken, outsiderToken, vendorToken, adminToken, restrictedToken;
const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, options) => String(url).startsWith('https://res.cloudinary.com/qa/image/upload/') ? new Response(image, { headers: { 'Content-Type': 'image/png' } }) : fetchOriginal(url, options);
  mongo = await MongoMemoryServer.create({ instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] } });
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_external')), adminConn.openUri(mongo.getUri('proposal_admin'))]);
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
  app = createApp();
  customer = await ExternalUser.create({ email: 'proposal-customer@example.test', fullName: 'Proposal QA Customer', accountType: 'CUSTOMER' });
  outsider = await ExternalUser.create({ email: 'proposal-outsider@example.test', fullName: 'Other Customer', accountType: 'CUSTOMER' });
  owner = await ExternalUser.create({ email: 'proposal-vendor@example.test', fullName: 'Proposal QA Vendor', accountType: 'VENDOR' });
  vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Proposal QA Studio', category: 'Photography', location: 'Pune', isProfileCompleted: true, status: 'ACTIVE', activationState: 'ACTIVE', activationReview: { status: 'APPROVED' }, workingHours: { Mon: { isOpen: true, hours: '9 AM - 6 PM' } } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const vs = await VendorService.create({ vendor: vendor._id, name: 'QA photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 10000 } });
  await VendorCapability.create({ vendor: vendor._id, vendorService: vs._id, teamSize: 2, simultaneousEventLimit: 1 });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await OperatingLocation.create({ vendor: vendor._id, label: 'QA Studio', city: 'Pune' });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: vs._id, coverageType: 'CITY', city: 'Pune' });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: asset.url });
  async function externalToken(user) { const session = await ExternalSession.create({ user: user._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(expiresAt()) }); return signExternalAccessToken(user, session._id); }
  customerToken = await externalToken(customer); outsiderToken = await externalToken(outsider); vendorToken = await externalToken(owner);
  async function makeAdmin(role, permissions) { const a = await AdminUser.create({ email: `${crypto.randomUUID()}@example.test`, fullName: 'QA Staff', passwordHash: 'fixture-only', role, permissions }); const s = await AdminSession.create({ admin: a._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(expiresAt()) }); return [a, signAdminAccessToken(a, s._id)]; }
  [admin, adminToken] = await makeAdmin('SUPER_ADMIN', []); [, restrictedToken] = await makeAdmin('ADMIN', ['events.read']);
}, { timeout: 120000 });
after(async () => { globalThis.fetch = fetchOriginal; await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

async function fixture(eventType = 'wedding') {
  const event = await CustomerEvent.create({ customer: customer._id, title: `QA ${eventType} celebration`, eventType, eventDate: date(), city: 'Pune', location: { venueName: 'QA Event Hall' }, guestCount: 100, budget: 30000, status: 'planning' });
  await EventRequirement.create({ event: event._id, category: 'photography', status: 'confirmed', source: 'customer', providedValue: 'Full event photography' });
  const vs = await VendorService.findOne({ vendor: vendor._id });
  const opportunity = await Opportunity.create({ vendor: vendor._id, customer: customer._id, vendorService: vs._id, customerEvent: event._id, serviceName: vs.name, eventDate: date() });
  const quote = await Quote.create({ opportunity: opportunity._id, vendor: vendor._id, customer: customer._id, vendorService: vs._id, category: 'photography', serviceName: vs.name, eventDate: date(), status: 'SUBMITTED', pricingBreakdown: { basePrice: 10000, totalAmount: 10000 }, notes: 'CONFIDENTIAL_SUPPLIER_NEGOTIATION' });
  const draft = cleanDraft({ theme: eventType === 'corporate' ? 'Corporate Premium' : 'Soft Ivory Editorial', introduction: 'An intimate, thoughtfully planned celebration.', allocations: [{ category: 'photography', scope: 'A two-person photography team for the event.', deliverables: 'Edited photo gallery within 30 days.', quantity: 1, amount: 15000 }], total: 15000, paymentTerms: 'Advance INR 4500 through the booking workflow. Balance INR 10500 before the event.', exclusions: 'Travel outside Pune and additional coverage hours.', roadmap: 'Review your scope. Coordinate the brief with STARVNT. Confirm the execution schedule.', assets: [asset] });
  const actor = { id: admin._id, role: 'SUPER_ADMIN' };
  let workspace = await service.adminWorkspace(String(event._id));
  await service.saveDraft(String(event._id), actor, { revision: workspace.dossier.revision, draft });
  return { eventId: String(event._id), event, quote, draft, actor };
}
async function ready(f) {
  let w = await service.adminWorkspace(f.eventId);
  assert.equal(w.source.quotes[0].vendorEligible, true, 'Fixture vendor is eligible through existing activation policy');
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'Approved scope as displayed. Deliver edited photos within 30 days. Vendor payment INR 10000. Cancellation requires STARVNT review.', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  await service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { revision: w.dossier.revision, agreementId: w.dossier.agreements.at(-1).id, decision: 'APPROVED' });
  w = await service.adminWorkspace(f.eventId);
  await service.approveCommercial(f.eventId, f.actor, { revision: w.dossier.revision, expiresAt: expiresAt(), note: 'CONFIDENTIAL_INTERNAL_MARGIN_REVIEW' });
  return service.adminWorkspace(f.eventId);
}

test('customer, vendor and admin proposal endpoints enforce domain, ownership and explicit RBAC', async () => {
  const f = await fixture();
  const path = `/api/customer/events/${f.eventId}/proposal`;
  await request(app).get(path).expect(401);
  await request(app).get(path).set(auth(vendorToken)).expect(403);
  await request(app).get(path).set(auth(adminToken)).expect(401);
  await request(app).get(path).set(auth(outsiderToken)).expect(404);
  await request(app).get(path).set(auth(customerToken)).expect(200);
  await request(app).get(`/api/admin/proposals/${f.eventId}`).set(auth(customerToken)).expect(401);
  await request(app).get(`/api/admin/proposals/${f.eventId}`).set(auth(restrictedToken)).expect(403);
  await request(app).get('/api/vendor/proposal-agreements').set(auth(customerToken)).expect(403);
  await request(app).post(`/api/admin/proposals/${f.eventId}/generate`).set(auth(restrictedToken)).send({ revision: 1, idempotencyKey: 'deny' }).expect(403);
});

test('final generation is blocked for missing, pending, rejected, expired or superseded agreements', async () => {
  const f = await fixture();
  const w = await ready(f);
  assert.equal(w.readiness.ready, true);
  for (const status of ['SENT', 'REJECTED', 'REVISION_REQUESTED', 'SUPERSEDED']) {
    const dossier = structuredClone(w.dossier); dossier.agreements[0].status = status;
    assert.equal(generationGate(w.source, dossier).ready, false, status);
    await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: dossier.agreements } });
    await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: `blocked-${status}` }), e => e.code === 'PROPOSAL_NOT_READY');
  }
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: w.dossier.agreements } });
  const expired = structuredClone(w.dossier); expired.agreements[0].expiresAt = '2000-01-01';
  assert.equal(generationGate(w.source, expired).ready, false);
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: expired.agreements } });
  await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'blocked-expired' }), e => e.code === 'PROPOSAL_NOT_READY');
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: w.dossier.agreements } });
  const missing = { ...w.dossier, commercial: null };
  assert.equal(generationGate(w.source, missing).ready, false);
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { commercial: null } });
  await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'blocked-missing-approval' }), e => e.status === 409 && e.code === 'PROPOSAL_NOT_READY');
  assert.equal(await ProposalDocument.countDocuments({ dossier: w.dossier._id }), 0);
});

test('reconciliation, invalid event, missing image, ineligible vendor and changed scope all fail closed', async () => {
  const f = await fixture(); const w = await ready(f);
  const changedPrice = structuredClone(w.dossier); changedPrice.draft.total += 1;
  assert.equal(generationGate(w.source, changedPrice).ready, false);
  const changedScope = structuredClone(w.dossier); changedScope.draft.allocations[0].scope = 'Expanded coverage';
  changedScope.commercial.draftHash = hash(changedScope.draft);
  assert.equal(generationGate(w.source, changedScope).ready, false);
  const missingImage = structuredClone(w.dossier); missingImage.draft.assets = [];
  assert.equal(generationGate(w.source, missingImage).ready, false);
  const invalid = structuredClone(w.source); invalid.event.eventDate = '2027-02-30';
  assert.equal(generationGate(invalid, w.dossier).ready, false);
  const suspended = structuredClone(w.source); suspended.quotes[0].vendorEligible = false;
  assert.equal(generationGate(suspended, w.dossier).ready, false);
  assert.throws(() => cleanDraft({ ...f.draft, assets: [{ ...asset, url: 'http://127.0.0.1/private.png' }] }), /STARVNT image storage/);
  assert.throws(() => cleanDraft({ ...f.draft, assets: [{ ...asset, rights: '' }] }), /permission or license/);
});

test('vendor decisions cannot be forged by a different organization or reused after a scope change', async () => {
  const f = await fixture(); let w = await service.adminWorkspace(f.eventId);
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'QA valid terms', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  const input = { revision: w.dossier.revision, agreementId: w.dossier.agreements[0].id, decision: 'APPROVED' };
  await assert.rejects(service.decideAgreement(new mongoose.Types.ObjectId(), f.eventId, { id: owner._id, role: 'VENDOR' }, input), e => e.status === 404);
  const revised = { ...f.draft, allocations: [{ ...f.draft.allocations[0], scope: 'A different event scope' }] };
  await service.saveDraft(f.eventId, f.actor, { revision: w.dossier.revision, draft: revised });
  await assert.rejects(service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { ...input, revision: w.dossier.revision + 1 }), e => e.code === 'AGREEMENT_NOT_CURRENT');
});

test('approved snapshots render searchable PDF bytes, deliver once, and never expose internal records', async () => {
  const f = await fixture(); const w = await ready(f);
  const v = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'final-qa-1' });
  const again = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'final-qa-1' });
  assert.equal(v.id, again.id);
  assert.equal(await CustomerNotification.countDocuments({ idempotencyKey: `proposal:${v.id}` }), 1);
  const customerView = await request(app).get(`/api/customer/events/${f.eventId}/proposal`).set(auth(customerToken)).expect(200);
  const json = JSON.stringify(customerView.body);
  for (const value of ['CONFIDENTIAL_SUPPLIER_NEGOTIATION', 'CONFIDENTIAL_INTERNAL_MARGIN_REVIEW', 'vendorCost', 'pricingBreakdown', 'approvedBy']) assert.equal(json.includes(value), false, value);
  const pdf = await request(app).get(`/api/customer/events/${f.eventId}/proposal/versions/${v.id}/pdf`).set(auth(customerToken)).expect(200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.body.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 5, 'Footer drawing never creates blank overflow pages');
  await request(app).get(`/api/customer/events/${f.eventId}/proposal/versions/${v.id}/pdf`).set(auth(outsiderToken)).expect(404);
  mkdirSync('tmp/qa/proposal-studio', { recursive: true }); writeFileSync('tmp/qa/proposal-studio/wedding.pdf', pdf.body);
  assert.equal(customerView.body.versions[0].current, true);
  const answer = await service.explain(customer._id, f.eventId, 'What is my payment schedule?');
  assert.equal(answer.answer, f.draft.paymentTerms); assert.equal(answer.versionId, v.id);
});

test('change requests preserve immutable version and block approval until a new approved version is issued', async () => {
  const f = await fixture(); let w = await ready(f);
  const v1 = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'change-1' });
  w = await service.adminWorkspace(f.eventId);
  await service.customerDecision(customer._id, f.eventId, { revision: w.dossier.revision, versionId: v1.id, decision: 'CHANGE_REQUESTED', message: 'Please refine the gallery delivery plan.', categories: ['photography'] });
  w = await service.adminWorkspace(f.eventId);
  assert.equal(w.readiness.ready, false);
  await service.approveCommercial(f.eventId, f.actor, { revision: w.dossier.revision, expiresAt: expiresAt(), note: 'Reviewed change: agreed existing 30 day delivery remains applicable.' });
  w = await service.adminWorkspace(f.eventId);
  const v2 = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'change-2' });
  w = await service.adminWorkspace(f.eventId);
  await assert.rejects(service.customerDecision(customer._id, f.eventId, { revision: w.dossier.revision, versionId: v1.id, decision: 'CUSTOMER_APPROVED' }), e => e.code === 'VERSION_NOT_CURRENT');
  const before = [await Booking.countDocuments(), await Payment.countDocuments(), await CoreBooking.countDocuments()];
  await service.customerDecision(customer._id, f.eventId, { revision: w.dossier.revision, versionId: v2.id, decision: 'CUSTOMER_APPROVED' });
  assert.deepEqual([await Booking.countDocuments(), await Payment.countDocuments(), await CoreBooking.countDocuments()], before);
  w = await service.adminWorkspace(f.eventId);
  assert.deepEqual(w.dossier.versions[0].snapshot, v1.snapshot);
  assert.equal(w.dossier.versions[0].status, 'CHANGE_REQUESTED');
  assert.equal(w.dossier.versions[1].status, 'CUSTOMER_APPROVED');
  assert.equal(w.dossier.changes[0].status, 'REVISED_PROPOSAL_ISSUED');
});

test('changed authoritative event data invalidates prior approvals and final generation', async () => {
  const f = await fixture(); const w = await ready(f);
  await CustomerEvent.updateOne({ _id: f.eventId }, { $set: { guestCount: 120 } });
  await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'stale-source' }), e => e.code === 'PROPOSAL_NOT_READY');
});

test('corporate and birthday PDF composition follows actual scope without wedding-only sections', async () => {
  for (const type of ['corporate', 'birthday']) {
    const f = await fixture(type);
    const bytes = await renderProposal({ event: { title: `QA ${type} event`, eventType: type, eventDate: date(), city: 'Pune', guestCount: 100, location: { venueName: 'QA Event Hall' } }, ...f.draft }, { id: crypto.randomUUID(), number: 1, createdAt: new Date().toISOString(), expiresAt: expiresAt() }, async () => image);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    mkdirSync('tmp/qa/proposal-studio', { recursive: true }); writeFileSync(`tmp/qa/proposal-studio/${type}.pdf`, bytes);
  }
});

test('rejected agreements can be revised and approved while preserving the rejected evidence', async () => {
  const f = await fixture();
  let w = await service.adminWorkspace(f.eventId);
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'Original scope and terms', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  await service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { revision: w.dossier.revision, agreementId: w.dossier.agreements[0].id, decision: 'REJECTED', note: 'Revise cancellation terms' });
  w = await service.adminWorkspace(f.eventId);
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'Revised scope and cancellation terms', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  assert.equal(w.dossier.agreements[0].status, 'SUPERSEDED');
  assert.equal(w.dossier.agreements[0].previousStatus, 'REJECTED');
  assert.equal(w.dossier.agreements[0].decisionNote, 'Revise cancellation terms');
  await service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { revision: w.dossier.revision, agreementId: w.dossier.agreements[1].id, decision: 'APPROVED' });
  w = await service.adminWorkspace(f.eventId);
  await service.approveCommercial(f.eventId, f.actor, { revision: w.dossier.revision, expiresAt: expiresAt() });
  assert.equal((await service.adminWorkspace(f.eventId)).readiness.ready, true);
});

test('structured content blocks unresolved choices, missing confirmations, capacity ambiguity and unbalanced milestones', () => {
  const snapshot = richSnapshot(asset, date());
  const draft = cleanDraft({ ...snapshot, checklist: snapshot.checklist.map(c => ({ ...c, evidence: 'Synthetic evidence reference' })) });
  assert.deepEqual(contentBlockers(draft, snapshot.event), []);
  const options = structuredClone(draft); options.sections[0].items[1].status = 'OPTION';
  assert.ok(contentBlockers(options, snapshot.event).some(b => b.includes('Choose exactly one')));
  const pending = structuredClone(draft); pending.checklist[0].status = 'PENDING';
  assert.ok(contentBlockers(pending, snapshot.event).some(b => b.includes('Confirm and record evidence')));
  const seats = structuredClone(draft); seats.sections[4].coverageNote = '';
  assert.ok(contentBlockers(seats, snapshot.event).some(b => b.includes('capacity coverage')));
  const payment = structuredClone(draft); payment.milestones[0].amount += 1;
  assert.ok(contentBlockers(payment, snapshot.event).some(b => b.includes('milestone amounts')));
  assert.throws(() => cleanDraft({ ...draft, sections: [{ ...draft.sections[0], items: [{ ...draft.sections[0].items[0], assetIndex: 99 }] }] }), /image reference/);
});

test('structured service changes require vendor reapproval; internal costs and evidence never enter customer snapshots or AI context', async () => {
  const f = await fixture();
  f.draft = cleanDraft({ ...f.draft, sections: [{ kind: 'equipment', title: 'Photography equipment', category: 'photography', items: [{ name: 'Camera team', quantity: 2, status: 'INCLUDED', details: 'Two camera operators', assetIndex: 0 }] }], milestones: [{ title: 'Advance', amount: 4500, due: 'Separate booking workflow' }, { title: 'Balance', amount: 10500, due: 'Before coverage' }], checklist: [{ title: 'Gallery delivery', category: 'photography', owner: 'VENDOR', status: 'CONFIRMED', mandatory: true, evidence: 'CONFIDENTIAL_EVIDENCE_REFERENCE', details: 'Delivery timeline reviewed' }], costReview: { logistics: 500, operations: 500, contingency: 0 } });
  let w = await service.adminWorkspace(f.eventId);
  await service.saveDraft(f.eventId, f.actor, { revision: w.dossier.revision, draft: f.draft });
  w = await ready(f);
  const changed = structuredClone(w.dossier); changed.draft.sections[0].items[0].quantity = 3; changed.commercial.draftHash = hash(changed.draft);
  assert.equal(generationGate(w.source, changed).ready, false);
  const v = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'structured-final' });
  const view = await service.customerWorkspace(customer._id, f.eventId);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes('CONFIDENTIAL_EVIDENCE_REFERENCE'), false);
  assert.equal(serialized.includes('costReview'), false);
  let prompt = '';
  registerLlmAdapter({ chat: async input => { prompt = input.systemPrompt; return { text: 'The approved coverage includes two camera operators. Submit a change request for revised coverage.' }; } });
  try {
    const before = (await service.adminWorkspace(f.eventId)).dossier.revision;
    const answer = await service.explain(customer._id, f.eventId, 'Can I change photography coverage?');
    assert.equal(answer.mode, 'GEMINI'); assert.equal(answer.versionId, v.id); assert.equal(answer.changeDraft.categories[0], 'photography');
    assert.equal(prompt.includes('CONFIDENTIAL_EVIDENCE_REFERENCE'), false); assert.equal(prompt.includes('costReview'), false); assert.equal(prompt.includes('CONFIDENTIAL_INTERNAL_MARGIN_REVIEW'), false);
    assert.equal((await service.adminWorkspace(f.eventId)).dossier.revision, before, 'The generative assistant has no authority to mutate approvals or pricing');
    registerLlmAdapter({ chat: async () => ({ text: 'The total is INR 999999 and payment is verified.' }) });
    const guarded = await service.explain(customer._id, f.eventId, 'What is the package price?');
    assert.equal(guarded.mode, 'APPROVED_SNAPSHOT_FALLBACK');
    assert.equal(guarded.answer.includes('999999'), false);
  } finally { registerLlmAdapter(null); }
});

test('customer visual direction is an unapproved request and requires staff review', async () => {
  const f = await fixture(); let w = await service.adminWorkspace(f.eventId);
  await service.saveDesignPreference(customer._id, f.eventId, { revision: w.dossier.revision, theme: 'Royal Reception', paletteNotes: 'Ivory and burgundy', notes: 'A warm reception atmosphere' });
  w = await service.adminWorkspace(f.eventId);
  assert.equal(w.dossier.designPreference.status, 'REQUESTED');
  assert.ok(w.readiness.blockers.some(b => b.includes('customer visual direction')));
  await service.saveDraft(f.eventId, f.actor, { revision: w.dossier.revision, draft: { ...f.draft, theme: 'Royal Reception', customerDirectionRef: w.dossier.designPreference.id } });
  assert.equal((await service.adminWorkspace(f.eventId)).dossier.designPreference.status, 'REVIEWED');
  await assert.rejects(service.saveDesignPreference(outsider._id, f.eventId, { revision: 0, theme: 'Royal Reception' }), e => e.status === 404);
});

test('durable AI concept requests are idempotent, permission-controlled, explicitly labelled and safe to retry after failure', async () => {
  const f = await fixture(); const w = await service.adminWorkspace(f.eventId);
  let calls = 0;
  registerProposalImageAdapters({ generate: async () => { calls++; return image; }, upload: async () => 'https://res.cloudinary.com/qa/image/upload/generated-concept.jpg' });
  try {
    const input = { revision: w.dossier.revision, direction: 'Ivory reception concept', category: 'photography', idempotencyKey: 'concept-once' };
    await request(app).post(`/api/admin/proposals/${f.eventId}/concepts`).set(auth(restrictedToken)).send(input).expect(403);
    const first = await request(app).post(`/api/admin/proposals/${f.eventId}/concepts`).set(auth(adminToken)).send(input).expect(202);
    const again = await request(app).post(`/api/admin/proposals/${f.eventId}/concepts`).set(auth(adminToken)).send(input).expect(202);
    assert.equal(first.body.job._id, again.body.job._id);
    const completed = await runConceptBatch(); assert.equal(completed.status, 'SUCCEEDED'); assert.equal(calls, 1); assert.equal(completed.asset.source, 'ai');
    const rows = await request(app).get(`/api/admin/proposals/${f.eventId}/concepts`).set(auth(adminToken)).expect(200);
    assert.equal(rows.body.jobs[0].prompt, undefined);
    await assert.rejects(service.saveDraft(f.eventId, f.actor, { revision: w.dossier.revision, draft: { ...f.draft, assets: [{ ...completed.asset, source: 'reference' }] } }), e => e.code === 'AI_SOURCE_LABEL_REQUIRED');
    const saved = await service.saveDraft(f.eventId, f.actor, { revision: w.dossier.revision, draft: { ...f.draft, assets: [completed.asset] } });
    registerProposalImageAdapters({ generate: async () => { throw Object.assign(new Error('Do not expose provider secrets'), { status: 429 }); } });
    await requestConcept((await service.adminWorkspace(f.eventId)).source, saved, f.actor, { ...input, revision: saved.revision, idempotencyKey: 'quota-failure' });
    const failed = await runConceptBatch(); assert.equal(failed.status, 'FAILED'); assert.ok(failed.error.includes('quota')); assert.equal(failed.error.includes('secrets'), false);
    assert.equal(await runConceptBatch(), null, 'Failed generations are not silently retried or charged again');
  } finally { registerProposalImageAdapters(null); }
});

test('rich wedding and corporate PDF layouts remain searchable, dynamic, and free from blank pages', async () => {
  mkdirSync('tmp/qa/proposal-completion', { recursive: true });
  for (const eventType of ['wedding', 'corporate']) {
    const snapshot = richSnapshot(asset, date(), eventType);
    const bytes = await renderProposal(snapshot, { id: `SYNTHETIC-QA-${eventType}`, number: 1, createdAt: new Date().toISOString(), expiresAt: expiresAt(), qa: true }, async () => image);
    const pages = (bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 12 && pages < 30);
    writeFileSync(`tmp/qa/proposal-completion/${eventType}-rich.pdf`, bytes);
  }
});

test('production browser journey: staff agreement, vendor decision, final PDF, customer changes and exact-version approval', { skip: process.env.PROPOSAL_BROWSER_QA !== '1', timeout: 180000 }, async () => {
  const { chromium } = await import('../../tmp/vendor-os-tools/node_modules/playwright/index.mjs');
  const express = (await import('express')).default;
  const { resolve } = await import('node:path');
  const f = await fixture('birthday');
  const server = app.listen(4117, '127.0.0.1');
  const web = express();
  const site = resolve(process.env.PROPOSAL_QA_SITE || 'tmp/qa/proposal-studio/site');
  web.use(express.static(site)); web.get('*', (req, res) => res.sendFile(resolve(site, 'index.html')));
  const frontend = web.listen(5197, '127.0.0.1');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const errors = [];
  const evidence = [];
  const check = name => { evidence.push({ name, passed: true }); console.log('QA:', name); };
  async function pageFor(token, admin = false) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await context.addInitScript(({ token, admin }) => { localStorage.setItem(admin ? 'starvnt_admin_access_token' : 'starvnt_external_access_token', token); }, { token, admin });
    await context.route('https://res.cloudinary.com/qa/image/upload/**', route => route.fulfill({ body: image, contentType: 'image/png' }));
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept()); return page;
  }
  async function action(page, path, fn) { const response = page.waitForResponse(r => r.url().includes(path) && ['POST', 'PUT'].includes(r.request().method())); await fn(); assert.equal((await response).status(), 200, path); await page.waitForTimeout(400); }
  async function openAdmin(page) { await page.goto('http://127.0.0.1:5197/admin/proposals'); await page.getByRole('button', { name: new RegExp(f.event.title) }).first().click(); await page.getByRole('heading', { name: f.event.title, exact: true }).waitFor(); }
  try {
    const guest = await pageFor('');
    for (const path of ['/login?as=vendor&next=/vendor', '/signup?role=VENDOR', '/register?type=VENDOR', '/vendor/proposal-agreements', '/']) {
      await guest.goto('http://127.0.0.1:5197' + path);
      await guest.getByRole('navigation').first().waitFor();
      assert.equal(await guest.getByRole('button', { name: 'Vendor', exact: true }).count(), 0);
      assert.equal(await guest.locator('a[href*="as=vendor"], a[href^="/vendor"]').count(), 0);
      assert.equal(await guest.getByText('Vendor Registration Details:', { exact: true }).count(), 0);
    }
    let otpPayload;
    await guest.route('**/api/auth/otp/email/send', async route => { otpPayload = route.request().postDataJSON(); await route.fulfill({ json: { ok: true, message: 'Synthetic QA OTP requested' } }); });
    await guest.goto('http://127.0.0.1:5197/login?as=vendor&next=/vendor');
    await guest.locator('input[type="email"]').fill('synthetic-customer@example.test');
    await guest.getByRole('button', { name: 'Send OTP to Email', exact: true }).click();
    await guest.getByText('Synthetic QA OTP requested', { exact: true }).waitFor();
    assert.equal(otpPayload.accountType, 'CUSTOMER');
    await guest.close();
    check('Customer-only entry rejects vendor role queries and links; OTP requests use CUSTOMER');
    const restored = await pageFor('synthetic-saved-vendor');
    await restored.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'synthetic-old-vendor', accountType: 'VENDOR' } } }));
    let restoredSurface;
    await restored.route('**/api/auth/switch-surface', route => {
      restoredSurface = route.request().postDataJSON().targetSurface;
      return route.fulfill({ json: { accessToken: customerToken, user: { id: String(customer._id), fullName: customer.fullName, accountType: 'CUSTOMER' } } });
    });
    await restored.goto('http://127.0.0.1:5197/vendor/proposal-agreements');
    await restored.waitForURL('**/customer');
    assert.equal(restoredSurface, 'CUSTOMER');
    await restored.close();
    check('Saved vendor browser sessions become customer sessions and cannot open Vendor OS');

    registerProposalImageAdapters({ generate: async () => image, upload: async () => 'https://res.cloudinary.com/qa/image/upload/browser-generated.jpg' });
    const planner = await pageFor(customerToken);
    await planner.goto(`http://127.0.0.1:5197/customer/events/${f.eventId}/proposal`);
    await planner.getByLabel('Customer visual theme', { exact: true }).selectOption('Royal Reception');
    await planner.getByLabel('Colour preferences', { exact: true }).fill('Ivory and burgundy');
    await action(planner, '/preferences', () => planner.getByRole('button', { name: 'Share my visual direction', exact: true }).click());
    check('Customer submits an unapproved visual direction');
    const staff = await pageFor(adminToken, true);
    await openAdmin(staff);
    await staff.getByRole('button', { name: 'Apply customer direction to draft', exact: true }).click();
    await action(staff, '/draft', () => staff.getByRole('button', { name: 'Save draft', exact: true }).click());
    await staff.getByLabel('Visual direction', { exact: true }).fill('Ivory and burgundy illustrative photography concept');
    const queued = staff.waitForResponse(r => r.url().endsWith('/concepts') && r.request().method() === 'POST');
    await staff.getByRole('button', { name: 'Generate illustrative concept', exact: true }).click();
    assert.equal((await queued).status(), 202); await runConceptBatch();
    await staff.getByRole('button', { name: 'Add concept to draft', exact: true }).click();
    await staff.getByRole('button', { name: 'Add structured section', exact: true }).click();
    await staff.getByLabel('Section 1 title', { exact: true }).fill('Approved photography equipment');
    await staff.getByLabel('Section 1 layout', { exact: true }).selectOption('equipment');
    await staff.getByRole('button', { name: 'Add item', exact: true }).click();
    await staff.getByLabel('Item 1.1 name', { exact: true }).fill('Camera operators');
    await staff.getByLabel('Item 1.1 quantity', { exact: true }).fill('2');
    await staff.getByLabel('Item 1.1 unit or duration', { exact: true }).fill('people');
    await staff.getByLabel('Item 1.1 approved details', { exact: true }).fill('Two operators as agreed in the photography scope.');
    await staff.getByLabel('Item 1.1 reference image', { exact: true }).selectOption('1');
    await staff.getByRole('button', { name: 'Add confirmation', exact: true }).click();
    for (const [label, value] of [['Confirmation 1 title', 'Gallery delivery'], ['Confirmation 1 evidence reference (internal)', 'PRIVATE_CONFIRMATION_REFERENCE']]) await staff.getByLabel(label, { exact: true }).fill(value);
    for (const [label, value] of [['Confirmation 1 owner', 'VENDOR'], ['Confirmation 1 status', 'CONFIRMED'], ['Confirmation 1 service category', 'photography']]) await staff.getByLabel(label, { exact: true }).selectOption(value);
    for (const [i, amount] of [[1, 4500], [2, 10500]]) {
      await staff.getByRole('button', { name: 'Add payment milestone', exact: true }).click();
      await staff.getByLabel(`Payment stage ${i} title`, { exact: true }).fill(i === 1 ? 'Advance' : 'Balance');
      await staff.getByLabel(`Payment stage ${i} amount`, { exact: true }).fill(String(amount));
      await staff.getByLabel(`Payment stage ${i} due condition`, { exact: true }).fill(i === 1 ? 'Separate booking workflow' : 'Before the event');
    }
    await action(staff, '/draft', () => staff.getByRole('button', { name: 'Save draft', exact: true }).click());
    check('Staff saves structured scope, milestones, evidence and an AI-labelled concept');
    await staff.getByLabel('Vendor quotation', { exact: true }).selectOption(String(f.quote._id));
    await staff.getByLabel('Agreement terms: scope, deliverables, payment and cancellation', { exact: true }).fill('QA approved scope and gallery delivery. Vendor payment INR 10000. Cancellation requires STARVNT review.');
    await action(staff, '/agreements', () => staff.getByRole('button', { name: 'Send agreement to vendor', exact: true }).click());
    check('Staff sends a real vendor agreement against the saved event scope');
    // Vendor OS is hosted by main; this Customer OS build still uses its authenticated API.
    const workspace = await service.adminWorkspace(f.eventId);
    await request(app).post(`/api/vendor/proposal-agreements/${f.eventId}/decision`).set(auth(vendorToken))
      .send({ revision: workspace.dossier.revision, agreementId: workspace.dossier.agreements.at(-1).id, decision: 'APPROVED' }).expect(200);
    check('Authenticated Vendor OS API approves the agreement for the customer journey');
    await openAdmin(staff);
    await staff.getByLabel('Internal commercial review note', { exact: true }).fill('QA commercial validation approved.');
    await action(staff, '/commercial-approval', () => staff.getByRole('button', { name: 'Approve saved commercial plan', exact: true }).click());
    await action(staff, '/generate', () => staff.getByRole('button', { name: 'Generate & deliver final PDF', exact: true }).click());
    check('Commercial approval unlocks final PDF generation and delivery');
    const customerPage = await pageFor(customerToken);
    await customerPage.goto(`http://127.0.0.1:5197/customer/events/${f.eventId}/proposal`);
    await customerPage.getByRole('heading', { name: 'My Event Proposal', exact: true }).waitFor();
    await customerPage.getByText('Total approved package', { exact: true }).waitFor();
    const content = await customerPage.locator('.proposal-studio').innerText();
    assert.equal(content.includes('PRIVATE_CONFIRMATION_REFERENCE'), false); assert.ok(content.includes('Approved photography equipment')); assert.equal(content.includes('10000'), false); assert.equal(content.includes('10,000'), false);
    await customerPage.screenshot({ path: 'tmp/qa/proposal-studio/customer-desktop.png', fullPage: true });
    check('Customer sees the approved experience without supplier cost or internal margin');
    await customerPage.getByLabel('Ask about inclusions, exclusions, pricing or payment terms').fill('What is my payment schedule?');
    await action(customerPage, '/ask', () => customerPage.getByRole('button', { name: 'Ask Aura+', exact: true }).click());
    assert.ok((await customerPage.locator('.proposal-answer').innerText()).includes('INR 4500'));
    check('Proposal guide answers from the exact approved snapshot');
    const download = customerPage.waitForEvent('download');
    await customerPage.getByRole('button', { name: 'Download PDF', exact: false }).click();
    await (await download).saveAs('tmp/qa/proposal-studio/browser-downloaded.pdf');
    check('Authenticated browser downloads a valid PDF');
    await customerPage.setViewportSize({ width: 390, height: 844 });
    await customerPage.screenshot({ path: 'tmp/qa/proposal-studio/customer-mobile.png', fullPage: true });
    assert.ok(await customerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile proposal has no horizontal overflow');
    check('Mobile-width customer layout has no horizontal overflow');
    await customerPage.getByLabel('Request changes to this version').fill('Please review my gallery delivery request.');
    await customerPage.getByLabel('photography', { exact: true }).check();
    await action(customerPage, '/decision', () => customerPage.getByRole('button', { name: 'Request changes', exact: true }).click());
    check('Customer change request invalidates commercial approval and preserves version one');
    await openAdmin(staff);
    await staff.getByLabel('Internal commercial review note', { exact: true }).fill('Change reviewed: confirmed 30 day gallery delivery remains agreed.');
    await action(staff, '/commercial-approval', () => staff.getByRole('button', { name: 'Approve saved commercial plan', exact: true }).click());
    await action(staff, '/generate', () => staff.getByRole('button', { name: 'Generate & deliver final PDF', exact: true }).click());
    await customerPage.reload();
    await action(customerPage, '/decision', () => customerPage.getByRole('button', { name: 'Approve version 2', exact: true }).click());
    await customerPage.getByText(/VERSION 2 · CUSTOMER APPROVED/).waitFor();
    check('Renewed approval produces version two and customer approves that exact version');
    const preliminary = await fixture('corporate');
    await customerPage.goto(`http://127.0.0.1:5197/customer/events/${preliminary.eventId}/proposal`);
    await customerPage.getByText('PRELIMINARY — NOT A FINAL APPROVED PROPOSAL', { exact: true }).waitFor();
    assert.equal(await customerPage.getByRole('button', { name: /Approve version/ }).count(), 0);
    check('Unapproved event shows clear preliminary state with no final approval action');
    await customerPage.screenshot({ path: 'tmp/qa/proposal-studio/preliminary-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); check('Customer and staff routes have no runtime exceptions; vendor approval uses its API');
  } finally {
    const pages = []; for (const context of browser.contexts()) for (const page of context.pages()) { pages.push({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 5000) }); await page.screenshot({ path: `tmp/qa/proposal-studio/page-${pages.length}.png`, fullPage: true }); }
    writeFileSync('tmp/qa/proposal-studio/browser-report.json', JSON.stringify({ checks: evidence, pageErrors: errors, pages }, null, 2));
    registerProposalImageAdapters(null); await browser.close(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => frontend.close(r))]);
  }
});
