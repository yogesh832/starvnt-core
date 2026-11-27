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

test('any event gets a watermarked preliminary proposal on demand; it is reused until the event changes', { timeout: 180000, skip: !HAS_BROWSER && 'needs a local Chrome/Edge' }, async () => {
  const { user, token } = await customer();
  const intruder = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'social', title: 'My social gathering', eventDate: '2026-11-30', city: 'Gopeshwar', guestCount: 300, status: 'planning' });
  await EventRequirement.create([{ event: event._id, category: 'venue', status: 'confirmed' }, { event: event._id, category: 'catering', status: 'confirmed', preferences: { menuStyle: 'Buffet' } }]);

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
  const res = (await preview(token, event._id).expect(200)).body;
  const view = (await request(app).get(`/api/customer/proposals/${res.proposalId}`).set(auth(token)).expect(200)).body;
  assert.deepEqual(view.snapshot.services.map((s) => [s.category, s.confirmed]).sort(), [['catering', false], ['venue', false]]);
  assert.ok(!view.snapshot.services.some((s) => s.category === 'invitation'), 'missing services are not shown');

  // The final-proposal rule is unchanged: a manifest with only pending services is invalid.
  const { manifestContent } = await import('../src/proposals/manifest.service.js');
  const content = await manifestContent(event._id);
  assert.ok(content.validation.errors.some((e) => e.code === 'NO_CONFIRMED_SERVICES'));
});
