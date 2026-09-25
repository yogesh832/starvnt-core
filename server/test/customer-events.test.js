import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser, uniqueDate } from './helpers.js';

let app;
let models;
before(async () => ({ app, models } = await setup()));
after(teardown);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function draftFor(user, facts = {}) {
  return models.CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'My wedding', status: 'draft', ...facts });
}

test('customer API requires a customer login', async () => {
  await request(app).get('/api/customer/events').expect(401);
  const vendor = await makeUser('VENDOR');
  await request(app).get('/api/customer/events').set(auth(vendor.token)).expect(403);
});

test('profile: read and update allowed fields only', async () => {
  const { token } = await makeUser();
  const r = await request(app).get('/api/customer/profile').set(auth(token)).expect(200);
  assert.equal(r.body.profile.accountType, 'CUSTOMER');
  const u = await request(app).patch('/api/customer/profile').set(auth(token)).send({ fullName: 'Ananya Roy' }).expect(200);
  assert.equal(u.body.profile.fullName, 'Ananya Roy');
  await request(app).patch('/api/customer/profile').set(auth(token)).send({ accountType: 'VENDOR' }).expect(400);
});

test('another customer\'s event is 404, not 403', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const ev = await draftFor(a.user);
  await request(app).get(`/api/customer/events/${ev._id}`).set(auth(b.token)).expect(404);
  await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(b.token)).send({ city: 'Pune' }).expect(404);
  await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(b.token)).expect(404);
  await request(app).get('/api/customer/events/not-an-id').set(auth(b.token)).expect(404);
  const list = await request(app).get('/api/customer/events').set(auth(b.token)).expect(200);
  assert.equal(list.body.events.length, 0);
});

test('customers can never set status; facts are validated before writing', async () => {
  const { user, token } = await makeUser();
  const ev = await draftFor(user);
  await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(token)).send({ status: 'booked' }).expect(400);
  const bad = await request(app)
    .patch(`/api/customer/events/${ev._id}`)
    .set(auth(token))
    .send({ city: 'Kolkata', guestCount: -5, eventDate: '2020-01-01' })
    .expect(400);
  assert.ok(bad.body.fields.guestCount);
  assert.ok(bad.body.fields.eventDate);
  const fresh = await models.CustomerEvent.findById(ev._id).lean();
  assert.equal(fresh.city, null, 'nothing written when any field is invalid');
  assert.equal(fresh.status, 'draft');
});

test('budget range and exact budget replace each other', async () => {
  const { user, token } = await makeUser();
  const ev = await draftFor(user, { budget: 500000 });
  let r = await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(token)).send({ budgetRange: 'w_20_plus' }).expect(200);
  assert.equal(r.body.event.budget, null);
  assert.equal(r.body.event.budgetMin, 2000000);
  assert.equal(r.body.event.budgetMax, null);
  assert.equal(r.body.understanding.facts.budget.rangeLabel, '₹20 Lakh+');
  r = await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(token)).send({ budget: 900000 }).expect(200);
  assert.equal(r.body.event.budget, 900000);
  assert.equal(r.body.event.budgetMin, null);
  await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(token)).send({ budgetRange: 'nope' }).expect(400);
});

test('confirm: needs type + date + city, is idempotent and keeps customer-provided services', async () => {
  const { user, token } = await makeUser();
  const ev = await draftFor(user);
  const miss = await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(400);
  assert.deepEqual(miss.body.missing.map((m) => m.field), ['eventDate', 'city']);

  await models.EventRequirement.create({ event: ev._id, category: 'venue', status: 'customer_provided', source: 'customer', providedValue: 'Kisan Palace' });
  await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(token)).send({ eventDate: uniqueDate(), city: 'Kolkata' }).expect(200);

  const ok = await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  assert.equal(ok.body.event.status, 'planning');
  assert.equal(ok.body.alreadyConfirmed, false);
  const venue = ok.body.requirements.find((r) => r.category === 'venue');
  assert.equal(venue.status, 'customer_provided');
  assert.equal(venue.providedValue, 'Kisan Palace');
  const count = ok.body.requirements.length;
  assert.ok(count >= 7);

  const again = await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  assert.equal(again.body.alreadyConfirmed, true);
  assert.equal(again.body.requirements.length, count);
  const history = await models.EventHistory.find({ event: ev._id, action: 'event_confirmed' });
  assert.equal(history.length, 1);
  assert.ok(ok.body.progress.progressPercent > 0, 'provided venue counts as handled');
});

test('closed events are read-only', async () => {
  const { user, token } = await makeUser();
  const ev = await draftFor(user, { status: 'completed' });
  const r = await request(app).patch(`/api/customer/events/${ev._id}`).set(auth(token)).send({ city: 'Delhi' }).expect(400);
  assert.equal(r.body.error, 'EVENT_CLOSED');
});

test('plan options expose templates and budget ranges', async () => {
  const { token } = await makeUser();
  const r = await request(app).get('/api/customer/plan-options?eventType=birthday').set(auth(token)).expect(200);
  assert.deepEqual(r.body.template.essential, ['venue', 'catering', 'decor', 'cake']);
  assert.equal(r.body.budgetRanges[0].label, 'Under ₹50K');
});
