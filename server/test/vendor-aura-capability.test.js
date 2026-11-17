import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorBlockout } from '../src/external/models/VendorBlockout.js';
import { saveCommitment } from '../src/external/services/commitments.service.js';
import { validateAction, executeAction } from '../src/external/aura/setupActions.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorAuraSession, VendorAuraMessage } from '../src/external/models/VendorAura.js';
import { registerLlmAdapter } from '../src/external/aura/llmAdapter.js';
import { VendorResource } from '../src/external/models/VendorResource.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';

let app, mongo;
const key = () => crypto.randomUUID();
test('Aura calendar updates bind the reviewed revision and preserve the partial-day interval', async () => {
  const { vendor } = await fixture();
  const actor = { id: vendor.owner, role: 'VENDOR' };
  const original = await saveCommitment(vendor._id, { date: '2027-02-10', endDate: '2027-02-11', allDay: false, startTime: '10:00', endTime: '12:00', reason: 'Original', idempotencyKey: key() }, actor);
  const context = { blockedDates: [{ id: String(original._id), revision: original.revision || 0, date: original.date, endDate: original.endDate, allDay: false, from: '10:00', to: '12:00', timezone: original.timezone, scope: 'BUSINESS', recordType: 'VENDOR_BLOCK' }] };
  const proposal = validateAction({ kind: 'block_date', blockout: { date: original.date, reason: 'Maintenance' } }, { context });
  assert.equal(proposal.action.blockoutId, String(original._id));
  assert.equal(proposal.action.blockout.allDay, false);
  assert.equal(proposal.action.blockout.endDate, '2027-02-11');
  await saveCommitment(vendor._id, { date: original.date, endDate: original.endDate, allDay: false, startTime: '10:00', endTime: '12:00', reason: 'Changed elsewhere', revision: original.revision || 0, idempotencyKey: key() }, actor, original._id);
  await assert.rejects(executeAction(vendor, proposal.action), error => error.code === 'STALE_REVISION');
  assert.equal((await VendorBlockout.findById(original._id)).reason, 'Changed elsewhere');
  const current = await VendorBlockout.findById(original._id);
  const fresh = { ...proposal.action, expectedRevision: current.revision };
  await executeAction(vendor, fresh);
  await executeAction(vendor, fresh); // Lost response retry must not append another update.
  const saved = await VendorBlockout.findById(original._id);
  assert.equal(saved.revision, current.revision + 1);
  assert.equal(saved.startTime, '10:00'); assert.equal(saved.endTime, '12:00');
  assert.equal(saved.endDate, '2027-02-11'); assert.equal(saved.reason, 'Maintenance');
  const foreign = await fixture();
  await assert.rejects(executeAction(foreign.vendor, fresh), error => error.code === 'CALENDAR_RECORD_CHANGED');
});

test('Aura calendar proposals do not guess missing dates or ambiguous records', () => {
  const block = { id: 'record', revision: 2, date: '2027-02-10', recordType: 'VENDOR_BLOCK', scope: 'BUSINESS' };
  const context = { blockedDates: [block, { ...block, id: 'second' }] };
  assert.ok(validateAction({ kind: 'block_date', blockout: { reason: 'Maintenance' } }, { context }).error);
  assert.ok(validateAction({ kind: 'block_date', blockout: { date: block.date, reason: 'Maintenance' } }, { context }).error);
  assert.ok(validateAction({ kind: 'block_date', blockout: { date: '2027-02-31', reason: 'Maintenance' } }, {}).error);
  const externalOnly = { blockedDates: [{ ...block, recordType: 'EXTERNAL_COMMITMENT' }] };
  assert.equal(validateAction({ kind: 'block_date', blockout: { date: block.date, reason: 'Maintenance' } }, { context: externalOnly }).action.isUpdate, false);
});
const auth = token => ({ Authorization: `Bearer ${token}` });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('vendor_aura_capability')), adminConn.openUri(mongo.getUri('vendor_aura_capability_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });
async function fixture() {
  const owner = await ExternalUser.create({ fullName: 'Vendor owner', email: `${key()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, ownerIdentityKey: owner._id, businessName: `Business ${key()}`, category: 'Photography', location: 'Pune', isProfileCompleted: true, status: 'ACTIVE', isCommerciallyActive: true, activationReview: { status: 'APPROVED' } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  const resource = await VendorResource.create({ vendor: vendor._id, name: 'Camera pool', type: 'EQUIPMENT', capacityUnits: 3 });
  const service = await VendorService.create({ vendor: vendor._id, name: 'Event photos', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 }, requiredResourceIds: [resource._id] });
  await VendorCapability.create({ vendor: vendor._id, vendorService: service._id, teamSize: 3, simultaneousEventLimit: 5 });
  const location = await OperatingLocation.create({ vendor: vendor._id, label: 'Private home base', address: 'Sensitive home address', city: 'Pune', coordinates: { lat: 18.52, lng: 73.85 }, isPrimary: true });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: service._id, coverageType: 'CITY', city: 'Pune' });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED', legalName: 'Verified Legal Name' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: 'https://example.test/public.jpg', status: 'PUBLISHED', visibility: 'PUBLIC' });
  return { owner, vendor, service, token };
}

test('Vendor Aura carries a standalone team size into the Hindi equipment reply and saves only after confirmation', async () => {
  const f = await fixture();
  const sessionId = key();
  const send = message => request(app).post('/api/vendor/aura/chat').set(auth(f.token)).send({ sessionId, message }).expect(200);
  const read = () => VendorCapability.findOne({ vendor: f.vendor._id, vendorService: f.service._id }).lean();
  const first = await send('Complete capacity, resources and coverage for the same active service');
  assert.match(first.body.reply, /team size/i);
  await send('you add this');
  const team = await send('15');
  assert.match(team.body.reply, /15/);
  assert.match(team.body.reply, /equipment/i);
  assert.equal(team.body.pending, null);
  const gear = await send('मेरे पास मेरा दो Sony के कैमरे हैं।');
  assert.equal(gear.body.pending.kind, 'capability');
  assert.match(gear.body.pending.summary, /15.*दो Sony के कैमरे/);
  assert.equal((await read()).teamSize, 3);
  const saved = await send('हाँ');
  assert.equal(saved.body.pending, null);
  assert.equal((await read()).teamSize, 15);
  assert.equal((await read()).simultaneousEventLimit, 5);
  assert.deepEqual((await read()).equipment, ['दो Sony के कैमरे']);
});

test('Vendor Aura resumes the repeated-team-size exchange and asks which active service to update', async () => {
  const f = await fixture();
  const second = await VendorService.create({
    vendor: f.vendor._id, name: 'Studio portraits', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 },
  });
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { 'activationReview.status': 'PENDING' } });
  const sessionId = key();
  await VendorAuraSession.create({ _id: sessionId, vendor: f.vendor._id, user: f.owner._id, language: 'hi' });
  await VendorAuraMessage.insertMany([
    ['model', 'Please tell me your team size and equipment details so I can set them up for you.'],
    ['user', '15'],
    ['model', 'Got it, team size is 15. What equipment do you use for your photography services?'],
    ['user', 'और ये देखवा के'],
    ['model', 'मैंने 15 सदस्यों की टीम नोट कर ली है। अब कृपया अपने मुख्य उपकरण (Equipment) जैसे कैमरे, ड्रोन या लेंस की जानकारी दें। अभी your team size चाहिए। कृपया बताइए।'],
    ['user', 'मेरे पास मेरा दो Sony के कैमरे हैं।'],
    ['model', 'समझ गई। अभी your team size चाहिए। कृपया बताइए।'],
  ].map(([role, content], index) => ({ session: sessionId, role, content, createdAt: new Date(1000 + index) })));
  const send = message => request(app).post('/api/vendor/aura/chat').set(auth(f.token)).send({ sessionId, message }).expect(200);
  const response = await send('15 मैंने पहले ही बता दिया।');
  assert.equal(response.body.pending, null);
  assert.match(response.body.reply, /Event photos.*Studio portraits|Studio portraits.*Event photos/);
  const selected = await send('Studio portraits');
  assert.match(selected.body.pending.summary, /Studio portraits.*15.*Sony/);
  const confirmed = await send('yes');
  assert.equal(confirmed.body.actions.some(action => action.to === '/vendor/readiness'), true);
  const other = await VendorCapability.findOne({ vendor: f.vendor._id, vendorService: second._id }).lean();
  assert.equal(other.teamSize, 15);
  assert.deepEqual(other.equipment, ['दो Sony के कैमरे']);
  assert.equal((await VendorCapability.findOne({ vendorService: f.service._id }).lean()).teamSize, 3);
});

test('Vendor Aura understands shorthand and uses AI to interpret service choices in the vendor’s language', async t => {
  const f = await fixture();
  const wedding = 'Wedding Photography & Cinematic Video';
  const preWedding = 'Pre-Wedding & Pahadi Concept Shoot';
  await VendorService.updateOne({ _id: f.service._id }, { $set: { name: wedding } });
  const second = await VendorService.create({
    vendor: f.vendor._id, name: preWedding, category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 },
  });
  const inactive = await VendorService.create({
    vendor: f.vendor._id, name: 'Wedding ceremony archive', category: 'Photography', status: 'PAUSED', pricing: { basePrice: 1000 },
  });
  const interpreted = [];
  registerLlmAdapter({
    async chat({ message }) {
      const choice = JSON.parse(message);
      interpreted.push(choice);
      const serviceName = choice.reply === 'शादी की रस्मों वाला' ? wedding : inactive.name;
      return { setupAction: { kind: 'capability', capability: { serviceName, teamSize: 99, equipment: ['Unverified gear'] } } };
    },
  });
  t.after(() => registerLlmAdapter(null));

  const start = async ({ legacyPrompt = false } = {}) => {
    const sessionId = key();
    const send = message => request(app).post('/api/vendor/aura/chat').set(auth(f.token)).send({ sessionId, message }).expect(200);
    await send('Complete capacity, resources and coverage for the same active service');
    await send('15');
    const choice = await send('मेरे पास मेरा दो Sony के कैमरे हैं।');
    assert.equal(choice.body.pending, null);
    assert.ok(choice.body.reply.includes(wedding));
    assert.ok(choice.body.reply.includes(preWedding));
    if (legacyPrompt) {
      await VendorAuraMessage.updateOne(
        { session: sessionId, role: 'model', content: choice.body.reply },
        { $set: { content: 'समझ गई। अभी the active service name चाहिए। कृपया बताइए।' } },
      );
    }
    return send;
  };

  for (const reply of ['photography', 'wedding photography', 'Film cinematic video वाली।']) {
    const send = await start({ legacyPrompt: reply.startsWith('Film') });
    const selected = await send(reply);
    assert.equal(selected.body.pending.kind, 'capability');
    assert.match(selected.body.pending.summary, /Wedding Photography & Cinematic Video.*15.*Sony/);
  }
  assert.deepEqual(interpreted, []);

  const send = await start();
  const ambiguous = await send('wedding');
  assert.equal(ambiguous.body.pending, null);
  const invalid = await send('पुरानी रस्मों वाला');
  assert.equal(invalid.body.pending, null);
  assert.equal(interpreted[0].reply, 'पुरानी रस्मों वाला');
  assert.deepEqual(interpreted[0].choices.map(choice => choice.name).sort(), [wedding, preWedding].sort());
  const selected = await send('शादी की रस्मों वाला');
  assert.equal(selected.body.pending.kind, 'capability');
  assert.match(selected.body.pending.summary, /Wedding Photography & Cinematic Video.*15.*Sony/);
  assert.equal(interpreted[1].reply, 'शादी की रस्मों वाला');
  assert.equal((await VendorCapability.findOne({ vendorService: f.service._id }).lean()).teamSize, 3);
  assert.equal(await VendorCapability.countDocuments({ vendorService: second._id }), 0);
  await send('हाँ');
  const saved = await VendorCapability.findOne({ vendorService: f.service._id }).lean();
  assert.equal(saved.teamSize, 15);
  assert.deepEqual(saved.equipment, ['दो Sony के कैमरे']);
});
