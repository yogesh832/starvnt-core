import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { vendorPriceFixture } from './helpers/vendorPriceFixture.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { CustomerEvent, EventRequirement } from '../src/customer/models/index.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { ProposalVersion } from '../src/proposals/models.js';
import { registerImageGenerator, SOURCE_LABELS, conceptPrompt } from '../src/proposals/assets.service.js';
import { renderProposalVersion, browserPath, closeRenderer, readStoredPdf, pdfText } from '../src/proposals/render.service.js';

let app, mongo;
const key = () => crypto.randomUUID();
const HAS_BROWSER = Boolean(browserPath());
const S = '/api/admin/proposal-studio';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const image = (width, height = Math.round(width * 0.6), color = { r: 120, g: 30, b: 50 }) => sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_assets')), adminConn.openUri(mongo.getUri('proposal_assets_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map((m) => m.init()));
}, { timeout: 120000 });
after(async () => { registerImageGenerator(null); await closeRenderer(); await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });

async function adminToken(permissions) {
  const user = await AdminUser.create({ fullName: 'Asset Admin', email: `${key()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions });
  const session = await AdminSession.create({ admin: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return signAdminAccessToken(user, session._id);
}
async function customer() {
  const user = await ExternalUser.create({ fullName: 'Customer', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return { user, token: signExternalAccessToken(user, session._id) };
}

test('vendor photos and AI concepts need approval and carry fixed source labels into the proposal and PDF', { timeout: 180000 }, async () => {
  const admin = await adminToken(['proposals.read', 'proposals.compose', 'proposals.publish', 'assets.read', 'assets.manage']);
  const viewer = await adminToken(['proposals.read', 'assets.read']);
  const { user, token } = await customer();
  const intruder = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'Reception', eventDate: '2027-05-10', city: 'Kolkata', guestCount: 200, status: 'planning', theme: 'Royal Luxury' });
  await vendorPriceFixture(event, 'decor');
  await EventRequirement.create([{ event: event._id, category: 'decor', status: 'confirmed', preferences: { theme: 'Royal Luxury' } }, { event: event._id, category: 'catering', status: 'confirmed' }]);
  const m = await request(app).post(`${S}/events/${event._id}/manifest`).set(auth(admin)).expect(201);
  await request(app).post(`${S}/manifests/${m.body.manifest._id}/freeze`).set(auth(admin)).expect(200);

  // Validation: not an image, too small, missing licence, read-only admin.
  const upload = (t, fields, file, name = 'photo.jpg') => { let r = request(app).post(`${S}/assets`).set(auth(t)); for (const [k, v] of Object.entries(fields)) r = r.field(k, v); return file ? r.attach('file', file, name) : r; };
  assert.equal((await upload(admin, { sourceType: 'STARVNT_PHOTO', category: 'cover', eventId: String(event._id), licence: 'STARVNT' }, Buffer.from('not an image'), 'x.jpg').expect(400)).body.error, 'INVALID_IMAGE');
  assert.equal((await upload(admin, { sourceType: 'STARVNT_PHOTO', category: 'cover', eventId: String(event._id), licence: 'STARVNT' }, await image(300)).expect(400)).body.error, 'IMAGE_TOO_SMALL');
  assert.equal((await upload(admin, { sourceType: 'STARVNT_PHOTO', category: 'cover', eventId: String(event._id) }, await image(1200)).expect(400)).body.error, 'LICENCE_REQUIRED');
  assert.equal((await upload(admin, { sourceType: 'AI_CONCEPT', category: 'cover', eventId: String(event._id), licence: 'x' }, await image(1200)).expect(400)).body.error, 'INVALID_SOURCE_TYPE', 'AI images can only come from the generator');
  await upload(viewer, { sourceType: 'STARVNT_PHOTO', category: 'cover', eventId: String(event._id), licence: 'STARVNT' }, await image(1200)).expect(403);

  const photo = (await upload(admin, { sourceType: 'STARVNT_PHOTO', category: 'cover', eventId: String(event._id), licence: 'STARVNT Entertainment, own photography', caption: 'Stage at a 2025 reception' }, await image(2400, 1400)).expect(201)).body.asset;
  assert.equal(photo.status, 'PENDING');
  assert.equal(photo.label, SOURCE_LABELS.STARVNT_PHOTO);
  assert.ok(photo.width <= 2000, 'stored images are normalised');

  // AI concept: prompt is built from the frozen manifest, label is fixed.
  let seenPrompt = '';
  registerImageGenerator(async ({ prompt }) => { seenPrompt = prompt; return image(1024, 768, { r: 200, g: 170, b: 110 }); });
  const ai = (await request(app).post(`${S}/assets/generate`).set(auth(admin)).send({ eventId: String(event._id), category: 'decor', prompt: 'golden arch' }).expect(201)).body.asset;
  assert.equal(ai.sourceType, 'AI_CONCEPT');
  assert.equal(ai.label, SOURCE_LABELS.AI_CONCEPT);
  assert.match(seenPrompt, /Royal Luxury/);
  assert.match(seenPrompt, /200 guests/);
  assert.match(seenPrompt, /No people's faces/);
  registerImageGenerator(async () => { throw new Error('quota exceeded'); });
  assert.equal((await request(app).post(`${S}/assets/generate`).set(auth(admin)).send({ eventId: String(event._id), category: 'decor' }).expect(502)).body.error, 'AI_IMAGE_FAILED');

  // Pending images never reach a proposal.
  const pre1 = (await request(app).post(`${S}/events/${event._id}/preliminary`).set(auth(admin)).send({}).expect(201)).body.version;
  assert.deepEqual(pre1.snapshot.visuals, {});

  await request(app).post(`${S}/assets/${ai.id}/decision`).set(auth(admin)).send({ decision: 'REJECT' }).expect(400);
  await request(app).post(`${S}/assets/${photo.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
  await request(app).post(`${S}/assets/${ai.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
  await request(app).post(`${S}/assets/${ai.id}/decision`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(409);

  const pre2 = (await request(app).post(`${S}/events/${event._id}/preliminary`).set(auth(admin)).send({}).expect(201)).body.version;
  assert.equal(pre2.snapshot.visuals.cover[0].label, SOURCE_LABELS.STARVNT_PHOTO);
  assert.equal(pre2.snapshot.visuals.decor[0].label, SOURCE_LABELS.AI_CONCEPT);

  if (HAS_BROWSER) {
    const r = await renderProposalVersion(pre2._id);
    assert.equal(r.qaPassed, true);
    const v = await ProposalVersion.findById(pre2._id).lean();
    assert.ok(v.qa.checks.find((c) => c.key === 'all_approved_images_present').passed);
    const { text } = await pdfText(await readStoredPdf(v.pdf.storageKey));
    const flat = text.replace(/\s+/g, ' ');
    assert.ok(flat.includes('AI-generated concept'), 'AI label printed in the PDF');
    assert.ok(flat.includes('STARVNT event photograph'), 'photo label printed in the PDF');
  } else {
    await ProposalVersion.updateOne({ _id: pre2._id }, { $set: { status: 'GENERATED', qa: { passed: true, checks: [] } } });
  }
  await request(app).post(`${S}/versions/${pre2._id}/publish`).set(auth(admin)).expect(200);

  // Customer sees only images inside their visible proposal.
  const list = (await request(app).get('/api/customer/proposals').set(auth(token)).expect(200)).body.proposals;
  const pid = list[0].proposalId;
  const ok = await request(app).get(`/api/customer/proposals/${pid}/versions/${pre2.version}/assets/${photo.id}`).set(auth(token)).expect(200);
  assert.equal(ok.headers['content-type'], 'image/jpeg');
  await request(app).get(`/api/customer/proposals/${pid}/versions/${pre2.version}/assets/${photo.id}`).set(auth(intruder.token)).expect(404);
  const other = (await upload(admin, { sourceType: 'ILLUSTRATIVE', category: 'catering', licence: 'Stock licence #123' }, await image(1200)).expect(201)).body.asset;
  await request(app).get(`/api/customer/proposals/${pid}/versions/${pre2.version}/assets/${other.id}`).set(auth(token)).expect(404);
});

test('customers can share reference images only for their own events, and they wait for review', { timeout: 120000 }, async () => {
  const admin = await adminToken(['assets.read', 'assets.manage']);
  const { user, token } = await customer();
  const intruder = await customer();
  const event = await CustomerEvent.create({ customer: user._id, eventType: 'birthday', eventDate: '2027-03-01', city: 'Pune', guestCount: 40, status: 'planning' });

  await request(app).post(`/api/customer/events/${event._id}/references`).set(auth(intruder.token)).attach('file', await image(1000), 'ref.jpg').expect(404);
  const ref = (await request(app).post(`/api/customer/events/${event._id}/references`).set(auth(token)).field('caption', 'Love this balloon wall').attach('file', await image(1000), 'ref.jpg').expect(201)).body.reference;
  assert.equal(ref.status, 'PENDING');
  const mine = (await request(app).get(`/api/customer/events/${event._id}/references`).set(auth(token)).expect(200)).body.references;
  assert.equal(mine.length, 1);
  await request(app).get(`/api/customer/references/${ref.id}/file`).set(auth(token)).expect(200);
  await request(app).get(`/api/customer/references/${ref.id}/file`).set(auth(intruder.token)).expect(404);

  const queue = (await request(app).get(`${S}/assets?eventId=${event._id}&status=PENDING`).set(auth(admin)).expect(200)).body.assets;
  assert.equal(queue[0].sourceType, 'CUSTOMER_REFERENCE');
  assert.equal(queue[0].label, SOURCE_LABELS.CUSTOMER_REFERENCE);
});

test('concept prompt uses only manifest facts', () => {
  const prompt = conceptPrompt({ eventInfo: { type: 'corporate', theme: 'Corporate Premium', colourPalette: ['navy', 'gold'], guestCount: 250, city: 'Kolkata' }, requirements: [{ category: 'corporate_production', details: { stage: '40 ft LED' } }] }, 'corporate_production');
  assert.match(prompt, /Corporate Premium/);
  assert.match(prompt, /navy, gold/);
  assert.match(prompt, /40 ft LED/);
  assert.match(prompt, /No people's faces, no text, no logos/);
});
