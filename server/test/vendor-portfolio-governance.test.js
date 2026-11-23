import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { conversationLanguage } from '../src/common/auraLanguage.js';
import { buildVendorSystemPrompt } from '../src/external/aura/vendorSystemPrompt.js';

let mongo, app;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([
    externalConn.openUri(mongo.getUri('portfolio_gov_external')),
    adminConn.openUri(mongo.getUri('portfolio_gov_admin')),
  ]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
}, { timeout: 120000 });

after(async () => {
  await Promise.all([externalConn.close(), adminConn.close()]);
  await mongo?.stop();
});

async function createVendor(name = 'Vendor Org') {
  const user = await ExternalUser.create({
    fullName: 'Test Vendor Owner',
    email: `${crypto.randomUUID()}@example.test`,
    accountType: 'VENDOR',
  });
  const org = await VendorOrganization.create({
    owner: user._id,
    businessName: name,
  });
  user.vendorOrganization = org._id;
  await user.save();
  const session = await ExternalSession.create({
    user: user._id,
    refreshTokenHash: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 3600000),
  });
  return {
    user,
    org,
    authHeader: { Authorization: `Bearer ${signExternalAccessToken(user, session._id)}` },
  };
}

test('Aura system prompt forbids soliciting bank details and directs to secure KYC form', () => {
  const prompt = buildVendorSystemPrompt({ businessName: 'Test Studio', category: 'Photography' });
  assert.ok(prompt.includes('/vendor/profile?tab=documents'), 'Must point to secure documents form');
  assert.ok(prompt.includes('NEVER ask for, accept, or solicit sensitive banking or KYC details'), 'Must forbid bank account solicitation in chat');
  assert.ok(!prompt.includes('accountNumber, ifsc, accountHolderName, bankName'), 'Must not list bank details as conversational collection target');
});

test('conversationLanguage preserves user preferred language despite English loanwords', () => {
  // When user preferred language is Hindi, Devanagari text with loanwords retains 'hi'
  const langHi = conversationLanguage('मेरा booking details aur budget क्या है?', [], 'hi');
  assert.equal(langHi, 'hi');

  // When user preferred language is Hinglish, Roman script retains 'hinglish'
  const langHinglish = conversationLanguage('mera booking details aur budget kya hai?', [], 'hinglish');
  assert.equal(langHinglish, 'hinglish');

  // When user preferred language is Bengali, loanwords retain 'bn'
  const langBn = conversationLanguage('amar project portfolio dekhao', [], 'bn');
  assert.equal(langBn, 'bn');

  // Explicit switch command must switch to 'en'
  const langSwitch = conversationLanguage('please answer in english now', [], 'hi');
  assert.equal(langSwitch, 'en');
});

test('PATCH /api/vendor/portfolio/items/:id updates visibility, marketingPermission, and clientConsentVerified', async () => {
  const v1 = await createVendor('Studio One');
  const v2 = await createVendor('Studio Two');

  const item = await PortfolioItem.create({
    vendor: v1.org._id,
    vendorOrganization: v1.org._id,
    url: 'https://images.unsplash.com/photo-1519741497674-611481863552',
    title: 'Initial Grand Wedding',
    mediaType: 'IMAGE',
    visibility: 'PUBLIC',
    marketingPermission: false,
    clientConsentVerified: false,
    city: 'Kolkata',
  });

  // 1. Update as owner
  const res = await request(app)
    .patch(`/api/vendor/portfolio/items/${item._id}`)
    .set(v1.authHeader)
    .send({
      visibility: 'PRIVATE',
      marketingPermission: true,
      clientConsentVerified: true,
      title: 'Updated Grand Wedding',
    })
    .expect(200);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.item.visibility, 'PRIVATE');
  assert.equal(res.body.item.marketingPermission, true);
  assert.equal(res.body.item.clientConsentVerified, true);
  assert.equal(res.body.item.title, 'Updated Grand Wedding');

  // Verify in DB
  const dbItem = await PortfolioItem.findById(item._id);
  assert.equal(dbItem.visibility, 'PRIVATE');
  assert.equal(dbItem.marketingPermission, true);
  assert.equal(dbItem.clientConsentVerified, true);

  // 2. Cross-tenant attempt from v2 must fail with 404
  await request(app)
    .patch(`/api/vendor/portfolio/items/${item._id}`)
    .set(v2.authHeader)
    .send({
      visibility: 'PUBLIC',
    })
    .expect(404);

  // 3. Invalid visibility enum fails with 400
  await request(app)
    .patch(`/api/vendor/portfolio/items/${item._id}`)
    .set(v1.authHeader)
    .send({
      visibility: 'INVALID_STATUS',
    })
    .expect(400);
});
