import { before, after, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import request from 'supertest';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';

let mongo, app, owner, other, vendor, photo;
const endpoint = '/api/customer/profile/picture';
const keys = ['CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const auth = person => ({ Authorization: `Bearer ${person.token}` });
function configured() { delete process.env.CLOUDINARY_URL; Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' }); }
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('profile_picture')), adminConn.openUri(mongo.getUri('profile_picture_admin'))]);
  app = createApp();
  async function person(accountType) {
    const user = await ExternalUser.create({ fullName: 'Photo customer', email: `${crypto.randomUUID()}@example.test`, accountType });
    const session = await ExternalSession.create({ user: user._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    return { user, token: signExternalAccessToken(user, session._id) };
  }
  [owner, other, vendor] = await Promise.all([person('CUSTOMER'), person('CUSTOMER'), person('VENDOR')]);
  photo = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#2563eb' } }).png().toBuffer();
});
after(async () => { mock.restoreAll(); for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; } await Promise.all([externalConn.close(), adminConn.close()]); await mongo.stop(); });

test('photo endpoints require a customer session before accepting media', async () => {
  for (const method of ['put', 'delete']) {
    await request(app)[method](endpoint).expect(401);
    await request(app)[method](endpoint).set(auth(vendor)).expect(403);
  }
});
test('Cloudinary upload stores a square normalized photo on the signed-in customer only', async () => {
  configured(); let uploaded, options;
  const upload = mock.method(cloudinary.uploader, 'upload_stream', (input, done) => {
    options = input; const chunks = [];
    return new Writable({ write(chunk, encoding, next) { chunks.push(chunk); next(); }, final(next) { uploaded = Buffer.concat(chunks); done(null, { secure_url: 'https://res.cloudinary.com/fixture/image/upload/avatar.jpg' }); next(); } });
  });
  try {
    const result = await request(app).put(endpoint).set(auth(owner)).attach('image', photo, 'photo.png').expect(200);
    assert.equal(result.body.profile.avatarUrl, 'https://res.cloudinary.com/fixture/image/upload/avatar.jpg');
    assert.equal(options.folder, `starvnt_customers/${owner.user._id}/profile`);
    const metadata = await sharp(uploaded).metadata();
    assert.equal(metadata.width, 400); assert.equal(metadata.height, 400); assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
    assert.equal((await ExternalUser.findById(other.user._id)).avatarUrl, '');
    assert.equal((await request(app).get('/api/auth/me').set(auth(owner)).expect(200)).body.user.avatarUrl, result.body.profile.avatarUrl);
  } finally { upload.mock.restore(); }
});
test('unreadable, disguised, oversized and multiple images are rejected', async () => {
  for (const file of [{ data: Buffer.from('<svg></svg>'), name: 'photo.png', contentType: 'image/png' }, { data: photo, name: 'photo.svg', contentType: 'image/svg+xml' }, { data: Buffer.alloc(5 * 1024 * 1024 + 1), name: 'huge.jpg', contentType: 'image/jpeg' }]) {
    await request(app).put(endpoint).set(auth(owner)).attach('image', file.data, { filename: file.name, contentType: file.contentType }).expect(400);
  }
  await request(app).put(endpoint).set(auth(owner)).attach('image', photo, 'a.png').attach('image', photo, 'b.png').expect(400);
});
test('missing configuration and provider failures retain the saved photo', async () => {
  const previous = (await ExternalUser.findById(owner.user._id)).avatarUrl;
  for (const key of keys) delete process.env[key];
  await request(app).put(endpoint).set(auth(owner)).attach('image', photo, 'photo.png').expect(503);
  configured();
  const upload = mock.method(cloudinary.uploader, 'upload_stream', (options, done) => new Writable({ write(chunk, encoding, next) { next(); }, final(next) { done(new Error('provider unavailable')); next(); } }));
  try { await request(app).put(endpoint).set(auth(owner)).attach('image', photo, 'photo.png').expect(502); }
  finally { upload.mock.restore(); }
  assert.equal((await ExternalUser.findById(owner.user._id)).avatarUrl, previous);
});
test('photo removal is repeatable and profile updates cannot inject an arbitrary photo URL', async () => {
  await request(app).patch('/api/customer/profile').set(auth(owner)).send({ avatarUrl: 'https://untrusted.example/image.jpg' }).expect(400);
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await request(app).delete(endpoint).set(auth(owner)).expect(200)).body.profile.avatarUrl, '');
});
