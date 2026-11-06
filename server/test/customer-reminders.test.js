import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { CustomerEvent, CustomerNotification } from '../src/customer/models/index.js';
import { CustomerReminder } from '../src/notifications/preferences.models.js';
import { createReminder } from '../src/notifications/reminders.service.js';
import { runReminderBatch } from '../src/notifications/reminders.worker.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';

let mongo, app, owner, stranger, partner, event, other, foreign;
const key = () => crypto.randomUUID(), auth = person => ({ Authorization: `Bearer ${person.token}` });
const future = () => new Date(Date.now() + 86400000).toISOString();
const command = (extra = {}) => ({ eventId: String(event._id), title: 'Review my saved plan', dueAt: future(), idempotencyKey: key(), ...extra });
const post = (body, person = owner) => request(app).post('/api/customer/reminders').set(auth(person)).send(body);
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('reminders')), adminConn.openUri(mongo.getUri('reminders_admin'))]);
  app = createApp(); await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  async function person(accountType) { const user = await ExternalUser.create({ fullName: 'Reminder fixture', email: `${key()}@example.test`, accountType }); const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) }); return { user, token: signExternalAccessToken(user, session._id) }; }
  owner = await person('CUSTOMER'); stranger = await person('CUSTOMER'); partner = await person('VENDOR');
  const makeEvent = customer => CustomerEvent.create({ customer, eventType: 'wedding', title: key(), status: 'planning' });
  event = await makeEvent(owner.user._id); other = await makeEvent(owner.user._id); foreign = await makeEvent(stranger.user._id);
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

test('create is owned, side-effect-free until due, and supports existing native request keys', async () => {
  const before = await CustomerNotification.countDocuments(), body = command({ idempotencyKey: `${Date.now()}-${Math.random()}` });
  const { body: result } = await post(body).expect(201);
  assert.equal(result.reminder.event, String(event._id)); assert.equal(result.reminder.status, 'PENDING');
  assert.equal(await CustomerNotification.countDocuments(), before);
  await post(command({ eventId: String(foreign._id) })).expect(404);
  await post(command(), partner).expect(403);
  await request(app).post('/api/customer/reminders').send(command()).expect(401);
});
test('lost acknowledgement can be replayed after due time or cancellation without another reminder', async () => {
  const body = command(); const first = await post(body).expect(201);
  const replay = await createReminder(owner.user._id, body, { now: new Date(Date.parse(body.dueAt) + 10000) });
  assert.equal(replay.reminder._id, first.body.reminder._id);
  await request(app).delete(`/api/customer/reminders/${replay.reminder._id}`).set(auth(owner)).expect(200);
  const cancelled = await post(body).expect(201); assert.equal(cancelled.body.reminder.status, 'CANCELLED');
  assert.equal(await CustomerReminder.countDocuments({ customer: owner.user._id, idempotencyKey: body.idempotencyKey }), 1);
  await post({ ...body, title: 'Different command' }).expect(409);
});
test('concurrent same-key commands create one row; changed commands cannot reuse that key', async () => {
  const body = command(); const responses = await Promise.all([post(body), post(body)]);
  assert.ok(responses.every(row => row.status === 201)); assert.equal(responses[0].body.reminder._id, responses[1].body.reminder._id);
  const raceKey = key(), race = await Promise.all([post(command({ idempotencyKey: raceKey, title: 'One' })), post(command({ idempotencyKey: raceKey, title: 'Two' }))]);
  assert.deepEqual(race.map(row => row.status).sort(), [201, 409]);
});
test('invalid calendar times, unzoned times, non-string titles and status injection are rejected', async () => {
  for (const extra of [{ title: {} }, { dueAt: '2028-02-30T10:00:00Z' }, { dueAt: '2028-10-20T24:00:00Z' }, { dueAt: '2028-10-20T10:00:00' }, { eventId: 'not-an-id' }, { status: 'DELIVERED' }, { recurrence: 'yearly' }, { idempotencyKey: '' }]) await post(command(extra)).expect(400);
  await post(command({ dueAt: new Date(Date.now() - 1000).toISOString() })).expect(400);
});
test('completed and cancelled events reject new reminders, matching the existing worker lifecycle', async () => {
  for (const status of ['completed', 'cancelled']) {
    const closed = await CustomerEvent.create({ customer: owner.user._id, title: key(), eventType: 'wedding', status });
    const result = await post(command({ eventId: String(closed._id) })).expect(409); assert.equal(result.body.error, 'EVENT_NOT_ACTIVE');
  }
});
test('cancellation is owned, idempotent and cannot overwrite a processing or finished reminder', async () => {
  const { body } = await post(command()).expect(201), path = `/api/customer/reminders/${body.reminder._id}`;
  await request(app).delete(path).set(auth(stranger)).expect(404);
  await request(app).delete(path).set(auth(owner)).expect(200);
  await request(app).delete(path).set(auth(owner)).expect(200);
  for (const status of ['PROCESSING', 'DELIVERED', 'SUPPRESSED']) {
    const row = await CustomerReminder.create({ customer: owner.user._id, event: event._id, title: key(), dueAt: future(), status, idempotencyKey: key() });
    await request(app).delete(`/api/customer/reminders/${row._id}`).set(auth(owner)).expect(409);
    assert.equal((await CustomerReminder.findById(row._id)).status, status);
  }
  await request(app).delete('/api/customer/reminders/invalid').set(auth(owner)).expect(404);
});
test('scoped cursor pages use stable due-time/ID ordering and reject changed or foreign scopes', async () => {
  const at = future(); await CustomerReminder.insertMany(Array.from({ length: 31 }, (_, index) => ({ customer: owner.user._id, event: other._id, title: `Page ${index}`, dueAt: at, idempotencyKey: key() })));
  const path = `/api/customer/reminders?eventId=${other._id}&limit=25`;
  const first = await request(app).get(path).set(auth(owner)).expect(200), cursor = first.body.nextCursor;
  assert.equal(first.body.reminders.length, 25); assert.ok(cursor);
  const second = await request(app).get(`${path}&cursor=${cursor}`).set(auth(owner)).expect(200);
  assert.equal(second.body.reminders.length, 6); assert.equal(second.body.nextCursor, null);
  assert.equal(new Set([...first.body.reminders, ...second.body.reminders].map(row => row._id)).size, 31);
  assert.ok(first.body.reminders.every(row => row.event === String(other._id) && row.eventTitle === other.title));
  await request(app).get(`${path}&cursor=${cursor}&status=all`).set(auth(owner)).expect(400);
  await request(app).get(`/api/customer/reminders?cursor=${cursor}`).set(auth(stranger)).expect(400);
  await request(app).get('/api/customer/reminders?cursor=bnVsbA').set(auth(owner)).expect(400);
  await request(app).get('/api/customer/reminders?limit=101').set(auth(owner)).expect(400);
  const legacy = await request(app).get('/api/customer/reminders').set(auth(owner)).expect(200); assert.ok(legacy.body.reminders.length > 25);
});
test('list filters do not disclose another customer event or reminder', async () => {
  await request(app).get(`/api/customer/reminders?eventId=${foreign._id}`).set(auth(owner)).expect(404);
  await request(app).get('/api/customer/reminders?status=all').set(auth(partner)).expect(403);
  await request(app).get('/api/customer/reminders').expect(401);
});
test('closing an event before delivery cancels its reminder without notification', async () => {
  const closing = await CustomerEvent.create({ customer: owner.user._id, eventType: 'wedding', status: 'cancelled' });
  const row = await CustomerReminder.create({ customer: owner.user._id, event: closing._id, title: key(), dueAt: new Date(Date.now() - 1000), idempotencyKey: key() });
  await runReminderBatch(); assert.equal((await CustomerReminder.findById(row._id)).status, 'CANCELLED');
  assert.equal(await CustomerNotification.countDocuments({ idempotencyKey: `reminder:${row._id}` }), 0);
});
test('shared preferences retain separate customer and vendor owners', async () => {
  const vendor = await VendorOrganization.create({ owner: partner.user._id, businessName: 'Preference fixture' });
  partner.user.vendorOrganization = vendor._id; await partner.user.save();
  const initial = await request(app).get('/api/vendor/notification-preferences').set(auth(partner)).expect(200);
  await request(app).put('/api/vendor/notification-preferences').set(auth(partner)).send({ ...initial.body.policy, timezone: 'Europe/London' }).expect(200);
  const saved = await request(app).get('/api/vendor/notification-preferences').set(auth(partner)).expect(200);
  const customer = await request(app).get('/api/customer/notification-preferences').set(auth(owner)).expect(200);
  assert.equal(saved.body.policy.timezone, 'Europe/London'); assert.equal(customer.body.policy.timezone, 'Asia/Kolkata');
  await request(app).get('/api/vendor/notification-preferences').set(auth(owner)).expect(403);
});
test('cancellation racing the worker either wins before processing or reports that processing won', async () => {
  const row = await CustomerReminder.create({ customer: owner.user._id, event: event._id, title: 'Cancellation race', dueAt: new Date(Date.now() - 1000), idempotencyKey: key() });
  const [response] = await Promise.all([request(app).delete(`/api/customer/reminders/${row._id}`).set(auth(owner)), runReminderBatch()]);
  const saved = await CustomerReminder.findById(row._id), count = await CustomerNotification.countDocuments({ idempotencyKey: `reminder:${row._id}` });
  if (saved.status === 'CANCELLED') { assert.equal(response.status, 200); assert.equal(count, 0); }
  else { assert.equal(saved.status, 'DELIVERED'); assert.equal(response.status, 409); assert.equal(count, 1); }
});
