import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser, uniqueDate } from './helpers.js';

let app;
let models;
let VendorOrganization;
let VendorService;
before(async () => {
  ({ app, models } = await setup());
  ({ VendorOrganization } = await import('../src/external/models/VendorOrganization.js'));
  ({ VendorService } = await import('../src/external/models/VendorService.js'));

  const owner = await makeUser('VENDOR');
  const live = await VendorOrganization.create({
    businessName: 'Premium Moments', owner: owner.user._id, location: 'Kolkata, West Bengal',
    isCommerciallyActive: true, status: 'VERIFIED', rating: { average: 5, count: 0 },
  });
  const liveCaterer = await VendorOrganization.create({
    businessName: 'Rajwada Caterers', owner: owner.user._id, location: 'Salt Lake, Kolkata', isCommerciallyActive: true, status: 'VERIFIED',
  });
  const unverified = await VendorOrganization.create({
    businessName: 'Cheap Test Studio', owner: owner.user._id, location: 'Kolkata', isCommerciallyActive: false, status: 'ELIGIBLE',
  });
  await VendorService.create([
    { vendor: live._id, name: 'Wedding Photography', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 48000 } },
    { vendor: live._id, name: 'Draft package', category: 'Photography', status: 'DRAFT', pricing: { pricingType: 'FIXED', basePrice: 1000 } },
    { vendor: liveCaterer._id, name: 'Standard Thali', category: 'Catering', status: 'ACTIVE', pricing: { pricingType: 'PER_PERSON', basePrice: 800, unit: 'plate' } },
    { vendor: unverified._id, name: 'Too good to be true', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 500 } },
  ]);
});
after(teardown);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function plannedWedding(user, token, facts = {}) {
  const ev = await models.CustomerEvent.create({
    customer: user._id, eventType: 'wedding', title: 'My wedding', status: 'draft',
    eventDate: uniqueDate(), city: 'Kolkata', guestCount: 300, budget: 1000000, ...facts,
  });
  await models.EventRequirement.create({ event: ev._id, category: 'venue', status: 'customer_provided', source: 'customer', providedValue: 'Kisan Palace' });
  await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  return ev;
}

test('draft dashboard: understanding, attention, steps; home lists it', async () => {
  const { user, token } = await makeUser();
  const ev = await models.CustomerEvent.create({ customer: user._id, eventType: 'birthday', title: 'My birthday', status: 'draft' });
  const d = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  assert.ok(d.body.understanding);
  assert.equal(d.body.attentionCount, 1);
  assert.equal(d.body.attention[0].type, 'draft_to_confirm');
  assert.equal(d.body.steps[0].state, 'current');
  const h = await request(app).get('/api/customer/home').set(auth(token)).expect(200);
  assert.equal(h.body.activeEvents.length, 1);
  assert.equal(h.body.attention.length, 1);
  assert.equal(h.body.unreadUpdates, 0);
});

test('summary: only verified, active, in-city options; honest estimates', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token);
  const d = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  const item = (c) => d.body.summary.items.find((i) => i.category === c);

  assert.equal(item('photography').optionCount, 1, 'unverified and draft services are excluded');
  assert.equal(item('photography').estimatedCost, 48000);
  assert.equal(item('catering').estimatedCost, 800 * 300, 'per-person price × guests');
  assert.equal(item('venue').estimatedCost, null, 'handled services have no estimate');
  assert.equal(item('decor').optionCount, 0);

  const b = d.body.summary.budget;
  assert.equal(b.target, 1000000);
  assert.equal(b.committedCost, 0);
  assert.equal(b.estimatedCost, 48000 + 240000);
  assert.equal(b.remaining, 1000000 - 288000);
  assert.ok(b.servicesWithoutEstimate.includes('Decoration'));
  assert.equal(b.estimateUsesDemoData, false);

  assert.deepEqual(d.body.steps.map((s) => s.state), ['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(d.body.understanding, null);
  assert.equal(d.body.attentionCount, 0);
  assert.equal(d.body.summary.progressPercent, Math.round((1 / 7) * 100));
});

test('options follow the event city', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token, { city: 'Delhi' });
  const r = await request(app).get(`/api/customer/events/${ev._id}/requirements`).set(auth(token)).expect(200);
  assert.equal(r.body.requirements.find((x) => x.category === 'photography').optionCount, 0);
});

test('requirements: customer rules, locks, closed events, add service', async () => {
  const { user, token } = await makeUser();
  const other = await makeUser();
  const ev = await plannedWedding(user, token);
  const url = (c) => `/api/customer/events/${ev._id}/requirements/${c}`;

  let r = await request(app).get(`/api/customer/events/${ev._id}/requirements`).set(auth(token)).expect(200);
  assert.equal(r.body.counts.essential, 7);
  assert.equal(r.body.counts.optional, 3);

  r = await request(app).patch(url('photography')).set(auth(token)).send({ status: 'pending' }).expect(200);
  assert.equal(r.body.requirement.status, 'pending');
  await request(app).patch(url('decor')).set(auth(token)).send({ status: 'customer_provided' }).expect(400);
  r = await request(app).patch(url('decor')).set(auth(token)).send({ status: 'customer_provided', providedValue: 'Bloom Decor' }).expect(200);
  assert.equal(r.body.requirement.providedValue, 'Bloom Decor');
  r = await request(app).patch(url('decor')).set(auth(token)).send({ status: 'missing' }).expect(200);
  assert.equal(r.body.requirement.providedValue, null, 'reset clears the arranged name');

  await request(app).patch(url('photography')).set(auth(token)).send({ status: 'booked' }).expect(400);
  await request(app).patch(url('spaceship')).set(auth(token)).send({ status: 'pending' }).expect(400);
  await request(app).patch(url('photography')).set(auth(token)).send({ status: 'pending', selectedVendorService: 'x' }).expect(400);
  await request(app).patch(url('photography')).set(auth(other.token)).send({ status: 'pending' }).expect(404);

  await models.EventRequirement.updateOne({ event: ev._id, category: 'catering' }, { $set: { status: 'booked' } });
  const locked = await request(app).patch(url('catering')).set(auth(token)).send({ status: 'missing' }).expect(409);
  assert.equal(locked.body.error, 'REQUIREMENT_LOCKED');

  // Adding a service by a synonym creates the row once.
  r = await request(app).patch(url('dj')).set(auth(token)).send({ status: 'pending' }).expect(200);
  assert.equal(r.body.requirement.category, 'entertainment');
  assert.equal(r.body.requirement.tier, 'recommended');

  await models.CustomerEvent.updateOne({ _id: ev._id }, { $set: { status: 'completed' } });
  const closed = await request(app).patch(url('photography')).set(auth(token)).send({ status: 'missing' }).expect(400);
  assert.equal(closed.body.error, 'EVENT_CLOSED');
});

test('history is customer-safe and whitelisted', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token);
  await request(app).patch(`/api/customer/events/${ev._id}/requirements/photography`).set(auth(token)).send({ status: 'pending' }).expect(200);
  await models.EventHistory.create({ event: ev._id, actorType: 'ops', actorId: 'operator-ravi', action: 'internal_settlement_note', details: { operator: 'Ravi', ledgerId: 'L-99' } });

  const r = await request(app).get(`/api/customer/events/${ev._id}/history`).set(auth(token)).expect(200);
  const texts = r.body.history.map((h) => h.text);
  assert.ok(texts.includes('Event plan created'));
  assert.ok(texts.includes('Photography: needs help finding'));
  const raw = JSON.stringify(r.body);
  assert.ok(!raw.includes('Ravi') && !raw.includes('L-99') && !raw.includes('operator'), 'no internal details leak');
  assert.ok(r.body.history.every((h) => Object.keys(h).sort().join() === 'actor,at,group,text'));
});
