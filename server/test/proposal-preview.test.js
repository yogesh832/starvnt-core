import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { CustomerEvent, EventRequirement } from '../src/customer/models/index.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { Proposal, ProposalVersion } from '../src/proposals/models.js';
import { seedProposalDemo, DEMO_ACCOUNTS } from '../src/proposals/demo.js';
import { requestFinalGeneration } from '../src/proposals/proposal.service.js';
import { browserPath, closeRenderer } from '../src/proposals/render.service.js';
import mongoose from 'mongoose';
import { Quote } from '../src/external/models/Quote.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { EventManifest } from '../src/proposals/models.js';
import { buildManifest } from '../src/proposals/manifest.service.js';
import { createPreliminary } from '../src/proposals/proposal.service.js';
import { requireVendorPriceForPdf } from '../src/proposals/vendorPricing.service.js';
import { renderProposalVersion } from '../src/proposals/render.service.js';

let app, mongo;
const key = () => crypto.randomUUID();
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const HAS_BROWSER = Boolean(browserPath());

before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_preview')), adminConn.openUri(mongo.getUri('proposal_preview_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map((m) => m.init()));
}, { timeout: 120000 });
after(async () => { await closeRenderer(); await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });

async function customer(user) {
  user ||= await ExternalUser.create({ fullName: 'Preview Customer', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return { user, token: signExternalAccessToken(user, session._id) };
}
const preview = (token, eventId) => request(app).post('/api/customer/proposals/preview').set(auth(token)).send({ eventId });
async function vendorPrice(event, { status = 'SUBMITTED', total = 25000, expired = false, customerId = event.customer, category = 'venue' } = {}) {
  const vendor = new mongoose.Types.ObjectId(), vendorService = new mongoose.Types.ObjectId();
  const opportunity = await Opportunity.create({ vendor, vendorService, customer: event.customer, customerEvent: event._id, category, serviceName: 'Venue', eventDate: event.eventDate });
  return Quote.create({ opportunity: opportunity._id, vendor, vendorService, customer: customerId, category, serviceName: 'Venue', eventDate: event.eventDate, pricingBreakdown: { basePrice: total, totalAmount: total }, status, validUntil: new Date(Date.now() + (expired ? -1 : 7) * 86400000) });
}

test('an event with a vendor price gets a watermarked preliminary proposal; it is reused until the event changes', { timeout: 180000, skip: !HAS_BROWSER && 'needs a local Chrome/Edge' }, async () => {
  const { user, token } = await customer();
  const intruder = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'social', title: 'My social gathering', eventDate: '2026-11-30', city: 'Gopeshwar', guestCount: 300, status: 'planning' });
  await EventRequirement.create([{ event: event._id, category: 'venue', status: 'confirmed' }, { event: event._id, category: 'catering', status: 'confirmed', preferences: { menuStyle: 'Buffet' } }]);
  await vendorPrice(event);

  await preview(intruder.token, event._id).expect(404);
  await preview(token, null).expect(400);

  const first = (await preview(token, event._id).expect(200)).body;
  assert.equal(first.kind, 'PRELIMINARY');
  assert.equal(first.reused, false);
  const view = (await request(app).get(`/api/customer/proposals/${first.proposalId}`).set(auth(token)).expect(200)).body;
  assert.equal(view.kind, 'PRELIMINARY');
  assert.equal(view.hasPdf, true);
  assert.equal(view.canDecide, false, 'preliminary is never approvable');
  assert.equal(view.snapshot.budget, null, 'no unapproved pricing in a preview');
  const pdf = await request(app).get(`/api/customer/proposals/${first.proposalId}/versions/${first.version}/pdf`).set(auth(token)).expect(200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');

  const again = (await preview(token, event._id).expect(200)).body;
  assert.equal(again.reused, true);
  assert.equal(again.version, first.version);

  await CustomerEvent.updateOne({ _id: event._id }, { $set: { guestCount: 350 } });
  const updated = (await preview(token, event._id).expect(200)).body;
  assert.equal(updated.reused, false);
  assert.equal(updated.version, first.version + 1);
  assert.equal((await ProposalVersion.findOne({ proposal: first.proposalId, version: first.version }).lean()).status, 'SUPERSEDED');
  assert.equal(await ProposalVersion.countDocuments({ proposal: first.proposalId }), 2);
});

test('incomplete events get a clear list of missing details instead of a preview', { timeout: 60000 }, async () => {
  const { user, token } = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'My wedding', status: 'draft' });
  const res = await preview(token, event._id).expect(409);
  assert.equal(res.body.error, 'EVENT_DETAILS_INCOMPLETE');
  assert.ok(res.body.problems.length > 0);
  assert.equal(await Proposal.countDocuments({ event: event._id }), 0, 'nothing is created');
});

test('a final proposal is never replaced by a preview, whether sent or still in preparation', { timeout: 180000, skip: !HAS_BROWSER && 'needs a local Chrome/Edge' }, async () => {
  const demo = await seedProposalDemo();
  const { token, user } = await customer(await ExternalUser.findOne({ email: DEMO_ACCOUNTS.customer }));

  // Wedding: FINAL already sent → reused, no new version.
  const before = await ProposalVersion.countDocuments({ event: demo.events.wedding });
  const sent = (await preview(token, demo.events.wedding).expect(200)).body;
  assert.equal(sent.kind, 'FINAL');
  assert.equal(await ProposalVersion.countDocuments({ event: demo.events.wedding }), before);

  // Corporate: finance approves, admin generates a FINAL but has not sent it yet.
  const { CommercialApproval } = await import('../src/proposals/models.js');
  await CommercialApproval.updateOne({ event: demo.events.corporate, status: 'PENDING_APPROVAL' }, { $set: { status: 'APPROVED', approvedBy: new (await import('mongoose')).default.Types.ObjectId(), approvedAt: new Date() } });
  const final = await requestFinalGeneration(demo.events.corporate, { actor: 'admin', idempotencyKey: key() });
  const blocked = await preview(token, demo.events.corporate).expect(409);
  assert.equal(blocked.body.error, 'FINAL_IN_PREPARATION');
  assert.equal((await ProposalVersion.findById(final._id).lean()).status, 'APPROVED_FOR_GENERATION', 'admin final untouched');
  assert.ok(String(user._id));
});

test('events whose services are chosen but not yet confirmed still get a preview, listing them as pending', { timeout: 120000, skip: !HAS_BROWSER && 'needs a local Chrome/Edge' }, async () => {
  const { user, token } = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'institutional', title: 'My institutional event', eventDate: '2026-12-29', city: 'Dehradun', guestCount: 300, status: 'planning' });
  await EventRequirement.create([
    { event: event._id, category: 'venue', status: 'pending' },
    { event: event._id, category: 'catering', status: 'pending' },
    { event: event._id, category: 'invitation', status: 'missing' },
  ]);
  await vendorPrice(event);
  const res = (await preview(token, event._id).expect(200)).body;
  const view = (await request(app).get(`/api/customer/proposals/${res.proposalId}`).set(auth(token)).expect(200)).body;
  assert.deepEqual(view.snapshot.services.map((s) => [s.category, s.confirmed]).sort(), [['catering', false], ['venue', false]]);
  assert.ok(!view.snapshot.services.some((s) => s.category === 'invitation'), 'missing services are not shown');

  // The final-proposal rule is unchanged: a manifest with only pending services is invalid.
  const { manifestContent } = await import('../src/proposals/manifest.service.js');
  const content = await manifestContent(event._id);
  assert.ok(content.validation.errors.some((e) => e.code === 'NO_CONFIRMED_SERVICES'));
});

test('event details and customer budget cannot generate a PDF without a vendor price', async () => {
  const { user, token } = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'social', title: 'Waiting for vendor', eventDate: '2099-12-29', city: 'Kolkata', guestCount: 100, budget: 500000, status: 'planning' });
  await EventRequirement.create({ event: event._id, category: 'venue', status: 'pending', selectedOption: { price: 50000 } });
  const response = await preview(token, event._id).expect(409);
  assert.equal(response.body.error, 'VENDOR_PRICE_REQUIRED');
  assert.equal(await Proposal.countDocuments({ event: event._id }), 0);
  assert.equal(await ProposalVersion.countDocuments({ event: event._id }), 0);
  assert.equal(await EventManifest.countDocuments({ event: event._id }), 0);
});

test('draft, zero, expired, unrelated and other-customer quotes do not unlock PDF generation', async () => {
  const { user } = await customer();
  const other = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'social', title: 'Price gate', eventDate: '2099-12-29', city: 'Kolkata', guestCount: 100, status: 'planning' });
  await EventRequirement.create({ event: event._id, category: 'venue', status: 'confirmed' });
  await vendorPrice(event, { status: 'DRAFT' });
  await vendorPrice(event, { total: 0 });
  await vendorPrice(event, { expired: true });
  await vendorPrice(event, { customerId: other.user._id });
  await vendorPrice(event, { category: 'catering' });
  await assert.rejects(requireVendorPriceForPdf(event._id), { code: 'VENDOR_PRICE_REQUIRED' });
  const another = await CustomerEvent.create({ customer: user._id, eventType: 'social', eventDate: '2099-12-29' });
  await vendorPrice(another);
  await assert.rejects(requireVendorPriceForPdf(event._id), { code: 'VENDOR_PRICE_REQUIRED' });
  await vendorPrice(event);
  await requireVendorPriceForPdf(event._id);
});

test('direct preliminary generation and renderer retries cannot bypass the vendor-price gate', async () => {
  const { user } = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'social', title: 'Render guard', eventDate: '2099-12-29', city: 'Kolkata', guestCount: 100, status: 'planning' });
  await EventRequirement.create({ event: event._id, category: 'venue', status: 'confirmed' });
  await buildManifest(event._id);
  await assert.rejects(createPreliminary(event._id, { actor: String(user._id) }), { code: 'VENDOR_PRICE_REQUIRED' });
  const quote = await vendorPrice(event);
  const version = await createPreliminary(event._id, { actor: String(user._id) });
  await Quote.updateOne({ _id: quote._id }, { $set: { status: 'REJECTED' } });
  await assert.rejects(renderProposalVersion(version._id), { code: 'VENDOR_PRICE_REQUIRED' });
  const failed = await ProposalVersion.findById(version._id).lean();
  assert.ok(!failed.pdf?.storageKey);
});
