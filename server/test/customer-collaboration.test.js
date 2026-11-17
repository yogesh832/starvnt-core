import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { recordVerifiedIdentity } from '../src/foundation/identity.service.js';
import { CustomerEvent, EventMessage } from '../src/customer/models/index.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { authorizeEventAccess, projectEventForActor } from '../src/customer/services/eventAccess.service.js';
import { EventCircleMember } from '../src/customer/models/eventCircle.models.js';
import { EventMedia } from '../src/customer/models/eventMedia.models.js';
import { eventMediaStorage } from '../src/customer/services/eventMediaStorage.service.js';
import { moderateEventMedia } from '../src/customer/services/eventMedia.service.js';

let mongo, app, owner, family, stranger, event, booking, photo;
const key = () => crypto.randomUUID();
const auth = user => ({ Authorization: `Bearer ${user.token}` });
async function person() {
  const user = await ExternalUser.create({ fullName: 'Circle fixture', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  await recordVerifiedIdentity(user, 'EMAIL', user.email, 'EMAIL_OTP');
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return { user, token: signExternalAccessToken(user, session._id) };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('circle')), adminConn.openUri(mongo.getUri('circle_core'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  owner = await person(); family = await person(); stranger = await person();
  event = await CustomerEvent.create({ customer: owner.user._id, title: 'Private celebration', eventType: 'wedding', eventDate: '2099-11-26', city: 'Kolkata', status: 'planning', location: { address: 'Private exact address', notes: 'Private access code', landmark: 'Private arrival' } });
  booking = await CoreBooking.create({ customerId: owner.user._id, customerEvent: event._id, vendorId: new mongoose.Types.ObjectId(), serviceName: 'Photography', eventDate: event.eventDate, totalAmount: 1000, paymentStatus: 'PENDING' });
  photo = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#2299ff' } }).png().toBuffer();
});
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
const url = suffix => `/api/customer/events/${event._id}/${suffix}`;

test('Circle requires a verified booking, invitations are owned, expire and cannot be accepted by another account', async () => {
  const invite = { email: family.user.email, role: 'PARTICIPANT', idempotencyKey: key() };
  assert.equal((await request(app).get(url('collaboration')).set(auth(owner)).expect(200)).body.unlocked, false);
  await request(app).post(url('circle/members')).set(auth(owner)).send(invite).expect(409);
  await CoreBooking.updateOne({ _id: booking._id }, { paymentStatus: 'PAYMENT_VERIFIED' });
  await request(app).get(url('collaboration')).set(auth(stranger)).expect(404);
  const created = await request(app).post(url('circle/members')).set(auth(owner)).send(invite).expect(201);
  const repeated = await request(app).post(url('circle/members')).set(auth(owner)).send(invite).expect(201);
  assert.equal(created.body.member.id, repeated.body.member.id);
  const accept = `/api/customer/circle-invitations/${created.body.member.id}/accept`;
  await request(app).post(accept).set(auth(stranger)).send({ idempotencyKey: key() }).expect(404);
  await EventCircleMember.updateOne({ _id: created.body.member.id }, { expiresAt: new Date(0) });
  await request(app).post(accept).set(auth(family)).send({ idempotencyKey: key() }).expect(409);
  await EventCircleMember.updateOne({ _id: created.body.member.id }, { expiresAt: new Date(Date.now() + 86400000) });
  await request(app).post(accept).set(auth(family)).send({ idempotencyKey: key() }).expect(200);
  const member = (await request(app).get(url('collaboration')).set(auth(family)).expect(200)).body;
  assert.equal(member.role, 'PARTICIPANT');
  assert.equal(member.event.location, undefined);
  assert.deepEqual(member.members, []);
  await request(app).post(url('circle/members')).set(auth(family)).send({ ...invite, email: stranger.user.email, idempotencyKey: key() }).expect(403);
});

test('Circle messages are contextual and replay-safe, with private prebooking conversations excluded', async () => {
  await EventMessage.create({ event: event._id, senderType: 'customer', body: 'Private quote negotiation' });
  const body = { body: 'Welcome to our event', idempotencyKey: key() };
  const results = await Promise.all([1, 2].map(() => request(app).post(url('circle/messages')).set(auth(family)).send(body)));
  assert.ok(results.every(r => r.status === 201));
  assert.equal(results[0].body.message.id, results[1].body.message.id);
  await request(app).post(url('circle/messages')).set(auth(family)).send({ ...body, body: 'Different content' }).expect(409);
  const response = await request(app).get(url('circle/messages')).set(auth(family)).expect(200);
  assert.equal(response.body.messages.length, 1);
  assert.ok(!JSON.stringify(response.body).includes('Private quote negotiation'));
  await request(app).get(url('circle/messages') + '?bookingId=' + new mongoose.Types.ObjectId()).set(auth(family)).expect(404);
});

test('concurrent first invitations cannot overwrite an existing role or create multiple memberships', async () => {
  const email = `invite-race-${key()}@example.test`;
  const results = await Promise.all(['VIEWER', 'COORDINATOR'].map(role => request(app).post(url('circle/members')).set(auth(owner)).send({ email, role, idempotencyKey: key() })));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 1);
  const saved = await EventCircleMember.findOne({ event: event._id, email }).lean();
  assert.equal(saved.history.length, 1);
  assert.equal(saved.role, results.find(result => result.status === 201).body.member.role);
});

test('submitted media cannot reach Live or Memory before explicit review, and revoked sharing denies direct files', async t => {
  const mockUpload = t.mock.method(eventMediaStorage, 'upload', async () => ({ publicId: 'private-fixture', resourceType: 'image', format: 'jpg', mime: 'image/jpeg', bytes: photo.length }));
  const mockRead = t.mock.method(eventMediaStorage, 'read', async () => new Response(photo, { headers: { 'Content-Type': 'image/jpeg' } }));
  try {
    const form = () => request(app).post(url('media')).set(auth(family)).field('idempotencyKey', uploadKey).field('caption', 'Our celebration').field('rightsConfirmed', 'true').attach('file', photo, { filename: 'photo.png', contentType: 'image/png' });
    const uploadKey = key();
    const pending = await form().expect(201), repeated = await form().expect(201);
    assert.equal(pending.body.asset.id, repeated.body.asset.id);
    assert.equal(pending.body.asset.state, 'PENDING');
    const assetId = pending.body.asset.id;
    const filePath = `/api/customer/event-media/${assetId}/file`;
    await request(app).get(filePath).set(auth(stranger)).expect(404);
    const publication = await request(app).put(url('publication')).set(auth(owner)).send({ idempotencyKey: key(), expectedVersion: 0, liveEnabled: true, memoryShared: true }).expect(200);
    const token = publication.body.shareToken;
    const publicPath = `/api/event-publications/${token}/live`;
    assert.equal((await request(app).get(publicPath).expect(200)).body.assets.length, 0);
    await request(app).get(`${publicPath}/media/${assetId}/file`).expect(404);
    const review = { idempotencyKey: key(), expectedVersion: pending.body.asset.version, decision: 'APPROVE', privacy: true, rights: true, safety: true, liveEligible: true, memoryIncluded: true };
    await request(app).post(url(`media/${assetId}/review`)).set(auth(family)).send(review).expect(403);
    await request(app).post(url(`media/${assetId}/review`)).set(auth(owner)).send({ ...review, safety: false }).expect(400);
    const approved = await request(app).post(url(`media/${assetId}/review`)).set(auth(owner)).send(review).expect(200);
    assert.equal((await request(app).get(publicPath).expect(200)).body.assets.length, 1);
    assert.equal((await request(app).get(url('memory')).set(auth(owner)).expect(200)).body.assets.length, 1);
    await request(app).get(`${publicPath}/media/${assetId}/file`).expect(200);
    await request(app).post(url(`media/${assetId}/review`)).set(auth(owner)).send({ decision: 'WITHDRAW', expectedVersion: approved.body.asset.version, idempotencyKey: key() }).expect(200);
    await request(app).get(`${publicPath}/media/${assetId}/file`).expect(404);
    assert.equal((await request(app).get(publicPath).expect(200)).body.assets.length, 0);
    await request(app).put(url('publication')).set(auth(owner)).send({ expectedVersion: publication.body.publication.version, idempotencyKey: key(), liveEnabled: false, memoryShared: false }).expect(200);
    await request(app).get(publicPath).expect(404);
    assert.equal(await EventMedia.countDocuments({ event: event._id }), 1);
    const evidence = await request(app).post(url('media')).set(auth(owner))
      .field('purpose', 'CASE_EVIDENCE').field('bookingId', String(booking._id)).field('idempotencyKey', key())
      .field('rightsConfirmed', 'true').attach('file', photo, { filename: 'evidence.png', contentType: 'image/png' }).expect(201);
    const evidenceId = evidence.body.asset.id;
    await request(app).get(`/api/customer/event-media/${evidenceId}/file`).set(auth(family)).expect(404);
    await request(app).post(url(`media/${evidenceId}/review`)).set(auth(owner)).send({ ...review, idempotencyKey: key(), expectedVersion: evidence.body.asset.version }).expect(403);
    const gallery = await request(app).get(url('media')).set(auth(owner)).expect(200);
    assert.ok(!gallery.body.assets.some(asset => asset.id === evidenceId));
  } finally { mockUpload.mock.restore(); mockRead.mock.restore(); }
});

test('revoking membership or cancelling booking removes message and media access immediately', async () => {
  const membership = await EventCircleMember.findOne({ event: event._id, user: family.user._id });
  await request(app).post(url(`circle/members/${membership._id}/revoke`)).set(auth(owner)).send({ idempotencyKey: key() }).expect(200);
  await request(app).get(url('circle/messages')).set(auth(family)).expect(404);
  await request(app).get(url('media')).set(auth(family)).expect(404);
  await EventCircleMember.updateOne({ _id: membership._id }, { state: 'ACTIVE' });
  await CoreBooking.updateOne({ _id: booking._id }, { bookingStatus: 'CANCELLED' });
  await request(app).get(url('circle/messages')).set(auth(family)).expect(409);
  await request(app).get(url('media')).set(auth(family)).expect(409);
  await request(app).get(url('memory')).set(auth(owner)).expect(200);
});

test('vendor projection uses its service location and reveals arrival instructions only near the event', async () => {
  await CoreBooking.updateOne({ _id: booking._id }, { bookingStatus: 'CONFIRMED', serviceLocation: { address: 'Booked service address' } });
  const access = await authorizeEventAccess({ id: new mongoose.Types.ObjectId(), type: 'VENDOR', vendorId: booking.vendorId }, event._id);
  const projected = projectEventForActor(access);
  assert.equal(projected.location.address, 'Booked service address');
  assert.equal(projected.location.accessInstructions, undefined);
  assert.ok(!JSON.stringify(projected).includes('Private exact address'));
});

test('a staff read projection cannot grant media moderation permissions', async () => {
  const actor = { id: new mongoose.Types.ObjectId(), type: 'ADMIN', permissions: ['operations.read'] };
  const access = await authorizeEventAccess(actor, event._id);
  assert.equal(access.permissions.includes('moderate'), false);
  const asset = await EventMedia.create({
    event: event._id, uploader: owner.user._id, uploaderType: 'CUSTOMER', kind: 'UPDATE', state: 'PUBLISHED',
    caption: 'Approved fixture', rightsConfirmed: true, requestKey: key(), requestHash: key(),
  });
  await assert.rejects(() => moderateEventMedia(actor, event._id, asset._id, {
    decision: 'APPROVE', expectedVersion: asset.__v, idempotencyKey: key(), privacy: true, safety: true, rights: true,
  }), error => error.status === 403);
});
