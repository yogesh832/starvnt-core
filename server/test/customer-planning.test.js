import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { CustomerEvent, EventRequirement, EventHistory } from '../src/customer/models/index.js';
import { patchEvent, validateFacts } from '../src/customer/services/events.service.js';
import { explicitVenueArrangement } from '../src/customer/aura/venueEvidence.js';

let mongo, app, owner, stranger, vendor;
const key = () => crypto.randomUUID();
const auth = person => ({ Authorization: `Bearer ${person.token}` });
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await Promise.all([externalConn.openUri(mongo.getUri('planning_external')), adminConn.openUri(mongo.getUri('planning_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  async function person(accountType) {
    const user = await ExternalUser.create({ fullName: 'Planning test', email: `${key()}@example.test`, accountType });
    const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
    return { user, token: signExternalAccessToken(user, session._id) };
  }
  owner = await person('CUSTOMER'); stranger = await person('CUSTOMER'); vendor = await person('VENDOR');
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function create(extra = {}) {
  return (await request(app).post('/api/customer/event-drafts').set(auth(owner)).send({ eventType: 'wedding', idempotencyKey: key(), ...extra }).expect(201)).body;
}
const endpoint = draft => `/api/customer/events/${draft.event.id}/planning-draft`;
const payload = (draft, facts = {}, services = []) => ({ facts, services, expectedVersion: draft.planningVersion, idempotencyKey: key() });
async function save(draft, facts = {}, services = []) {
  return (await request(app).put(endpoint(draft)).set(auth(owner)).send(payload(draft, facts, services)).expect(200)).body;
}

test('type-only draft creation is owned, retry-safe and accepts no status/identity injection', async () => {
  const idempotencyKey = key(); const a = await create({ idempotencyKey }), b = await create({ idempotencyKey });
  assert.equal(a.event.id, b.event.id); assert.equal(a.event.status, 'draft'); assert.equal(a.event.eventDate, null);
  await request(app).post('/api/customer/event-drafts').set(auth(owner)).send({ eventType: 'birthday', idempotencyKey }).expect(409);
  await request(app).post('/api/customer/event-drafts').set(auth(owner)).send({ eventType: 'wedding', idempotencyKey: key(), status: 'booked' }).expect(400);
  await request(app).get(endpoint(a)).set(auth(stranger)).expect(404);
  await request(app).put(endpoint(a)).set(auth(stranger)).send(payload(a)).expect(404);
  await request(app).post('/api/customer/event-drafts').set(auth(vendor)).send({ eventType: 'wedding', idempotencyKey: key() }).expect(403);
  await request(app).get(endpoint(a)).expect(401);
});
test('save/resume keeps facts, dynamic service details and the same event ID', async () => {
  const a = await create(); const b = await save(a, { title: 'Our wedding', city: 'Kolkata', guestCount: 250, notes: 'Outdoor ceremony', budgetMin: 100000, budgetMax: 200000 }, [{ category: 'photography', status: 'pending', specialRequirements: 'Evening portraits' }]);
  const resumed = (await request(app).get(endpoint(a)).set(auth(owner)).expect(200)).body;
  assert.equal(resumed.event.id, a.event.id); assert.equal(resumed.event.title, 'Our wedding'); assert.equal(resumed.event.budgetMin, 100000);
  assert.equal(resumed.requirements[0].specialRequirements, 'Evening portraits'); assert.notEqual(a.planningVersion, b.planningVersion);
  assert.equal(await CustomerEvent.countDocuments({ _id: a.event.id }), 1);
});
test('lost save acknowledgement can be replayed; a reused key with changed payload is rejected', async () => {
  const a = await create(), body = payload(a, { notes: 'First save' });
  await request(app).put(endpoint(a)).set(auth(owner)).send(body).expect(200);
  await request(app).put(endpoint(a)).set(auth(owner)).send(body).expect(200);
  await request(app).put(endpoint(a)).set(auth(owner)).send({ ...body, facts: { notes: 'Different save' } }).expect(409);
  assert.equal(await EventHistory.countDocuments({ event: a.event.id, action: 'planning_draft_saved' }), 1);
});
test('manual and Aura fact changes invalidate stale draft saves', async () => {
  const a = await create(); await patchEvent(owner.user._id, a.event.id, { guestCount: 300 }, { actorType: 'aura' });
  await request(app).put(endpoint(a)).set(auth(owner)).send(payload(a, { guestCount: 100 })).expect(409);
  assert.equal((await CustomerEvent.findById(a.event.id)).guestCount, 300);
});
test('an acknowledged-save retry cannot adopt a newer version while keeping stale form facts', async () => {
  const a = await create(), body = payload(a, { notes: 'Original save' });
  const b = (await request(app).put(endpoint(a)).set(auth(owner)).send(body).expect(200)).body;
  await save(b, { notes: 'Newer editor changes' });
  await request(app).put(endpoint(a)).set(auth(owner)).send(body).expect(409);
  assert.equal((await CustomerEvent.findById(a.event.id)).notes, 'Newer editor changes');
});
test('concurrent editors cannot silently overwrite one another', async () => {
  const a = await create();
  const results = await Promise.all(['One', 'Two'].map(notes => request(app).put(endpoint(a)).set(auth(owner)).send(payload(a, { notes }))));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});
test('invalid and locked requirements roll back the entire save', async () => {
  const a = await create(); await EventRequirement.create({ event: a.event.id, category: 'venue', status: 'booked', source: 'system' });
  const current = (await request(app).get(endpoint(a)).set(auth(owner)).expect(200)).body;
  await request(app).put(endpoint(a)).set(auth(owner)).send(payload(current, { notes: 'Must not save' }, [{ category: 'photography', status: 'pending' }, { category: 'venue', status: 'missing' }])).expect(409);
  assert.equal(await EventRequirement.countDocuments({ event: a.event.id, category: 'photography' }), 0);
  assert.equal((await CustomerEvent.findById(a.event.id)).notes, null);
  await request(app).put(endpoint(current)).set(auth(owner)).send(payload(current, {}, [{ category: 'photography', status: 'pending' }, { category: 'not-a-service', status: 'pending' }])).expect(400);
});
test('venue name is a location fact; arranging it requires an explicit service declaration', async () => {
  const a = await create(), b = await save(a, { location: { venueName: 'Shortlisted hall' } });
  assert.equal(b.event.location.venueName, 'Shortlisted hall'); assert.equal(b.requirements.some(r => r.category === 'venue' && r.status === 'customer_provided'), false);
  const c = await save(b, {}, [{ category: 'venue', status: 'customer_provided', providedValue: 'Personally arranged hall' }]);
  assert.equal(c.requirements.find(r => r.category === 'venue').status, 'customer_provided');
  assert.equal(c.event.status, 'draft');
  await patchEvent(owner.user._id, a.event.id, { location: { venueName: 'Changed location name' } }, { actorType: 'aura' });
  assert.equal((await EventRequirement.findOne({ event: a.event.id, category: 'venue' })).providedValue, 'Personally arranged hall');
});
test('legacy manual creation no longer infers arrangement from a venue name', async () => {
  const response = await request(app).post('/api/customer/events').set(auth(owner)).send({ eventType: 'wedding', eventDate: '2028-10-20', city: 'Kolkata', location: { venueName: 'Considering this hall' }, services: [] }).expect(201);
  assert.equal(response.body.requirements.find(r => r.category === 'venue').status, 'missing');
});
test('saving facts alone never confirms inferred services', async () => {
  const a = await create(); await EventRequirement.create({ event: a.event.id, category: 'catering', status: 'customer_provided', source: 'aura_inferred' });
  const b = (await request(app).get(endpoint(a)).set(auth(owner)).expect(200)).body;
  const c = await save(b, { notes: 'Still planning' });
  assert.equal(c.requirements.find(r => r.category === 'catering').source, 'aura_inferred');
  assert.equal(c.progress.essentialsHandled, 0);
  const edited = await save(c, {}, [{ category: 'catering', status: 'customer_provided', specialRequirements: 'Vegetarian' }]);
  assert.equal(edited.requirements.find(r => r.category === 'catering').source, 'aura_inferred');
  const confirmed = await save(edited, {}, [{ category: 'catering', status: 'customer_provided', specialRequirements: 'Vegetarian', confirmSuggestion: true }]);
  assert.equal(confirmed.requirements.find(r => r.category === 'catering').source, 'customer');
});
test('unknown dates remain drafts and Core confirmation retains its existing requirements', async () => {
  const a = await create(); await request(app).post(`/api/customer/events/${a.event.id}/confirm`).set(auth(owner)).expect(400);
  const b = await save(a, { eventDate: '2028-10-20', city: 'Kolkata' });
  const result = await request(app).post(`/api/customer/events/${a.event.id}/confirm`).set(auth(owner)).expect(200);
  assert.equal(result.body.event.status, 'planning');
  await request(app).put(endpoint(b)).set(auth(owner)).send(payload(b, { notes: 'Too late' })).expect(409);
});
test('an unknown budget clears a saved range without inventing a zero budget', () => {
  const facts = validateFacts({ budget: null, budgetRange: null, budgetMin: null, budgetMax: null });
  assert.equal(facts.budget, null); assert.equal(facts.budgetMin, null); assert.equal(facts.budgetMax, null);
});
test('Aura requires explicit venue arrangement evidence, not a candidate name or another service booking', () => {
  for (const message of ['The venue is Kisan Palace', 'We shortlisted a hall', 'The venue is Kisan Palace and catering is already arranged', 'The venue is not booked', 'Can the venue be booked?']) assert.equal(explicitVenueArrangement(message, { venueName: 'Kisan Palace' }), false, message);
  for (const message of ['I have booked the venue', 'The hall is already arranged', 'Kisan Palace is booked']) assert.equal(explicitVenueArrangement(message, { venueName: 'Kisan Palace' }), true, message);
});
