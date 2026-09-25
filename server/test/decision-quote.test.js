import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser, uniqueDate } from './helpers.js';

let app;
let models;
let VendorBlockout;
let ids = {};
let busyOrg;
let liveOrg;

before(async () => {
  ({ app, models } = await setup());
  const { seedDemoListings } = await import('../src/customer/seeds/demoListings.js');
  const { VendorOrganization } = await import('../src/external/models/VendorOrganization.js');
  const { VendorService } = await import('../src/external/models/VendorService.js');
  ({ VendorBlockout } = await import('../src/external/models/VendorBlockout.js'));
  await seedDemoListings();
  const owner = await makeUser('VENDOR');
  liveOrg = await VendorOrganization.create({ businessName: 'Premium Moments', owner: owner.user._id, location: 'Kolkata', isCommerciallyActive: true });
  busyOrg = await VendorOrganization.create({ businessName: 'Busy Lens', owner: owner.user._id, location: 'Kolkata', isCommerciallyActive: true });
  const [a, b, c] = await VendorService.create([
    { vendor: liveOrg._id, name: 'Wedding Photography', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 48000 } },
    { vendor: busyOrg._id, name: 'Budget Photos', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 30000 } },
    { vendor: liveOrg._id, name: 'Hourly Video', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'HOURLY', basePrice: 5000 } },
  ]);
  ids = { live: `vs_${a._id}`, busy: `vs_${b._id}`, hourly: `vs_${c._id}` };
});
after(teardown);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function planned(user, token, facts = {}) {
  const ev = await models.CustomerEvent.create({
    customer: user._id, eventType: 'wedding', title: 'My wedding', status: 'draft', eventDate: uniqueDate(), city: 'Kolkata', guestCount: 300, ...facts,
  });
  await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  return ev;
}
const select = (token, ev, category, optionId) =>
  request(app).post(`/api/customer/events/${ev._id}/requirements/${category}/select`).set(auth(token)).send({ optionId });

test('draft events block commerce', async () => {
  const { user, token } = await makeUser();
  const ev = await models.CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'D', status: 'draft', city: 'Kolkata' });
  const r = await select(token, ev, 'photography', 'demo_pho_01').expect(400);
  assert.equal(r.body.message, 'Please confirm your event details first');
  await request(app).post(`/api/customer/events/${ev._id}/quotes`).set(auth(token)).expect(400);
});

test('selection is validated and stays pending', async () => {
  const { user, token } = await makeUser();
  const other = await makeUser();
  const ev = await planned(user, token);
  await VendorBlockout.create({ vendor: busyOrg._id, date: ev.eventDate });

  assert.equal((await select(token, ev, 'photography', 'demo_cat_01').expect(400)).body.error, 'WRONG_CATEGORY');
  assert.equal((await select(token, ev, 'photography', ids.busy).expect(400)).body.error, 'OPTION_NOT_AVAILABLE');
  assert.equal((await select(token, ev, 'photography', ids.hourly).expect(400)).body.error, 'NO_PRICE');
  assert.equal((await select(token, ev, 'photography', 'demo_nope').expect(400)).body.error, 'OPTION_UNAVAILABLE');
  await select(other.token, ev, 'photography', 'demo_pho_01').expect(404);
  await request(app).post(`/api/customer/events/${ev._id}/requirements/photography/select`).set(auth(token)).send({}).expect(400);

  const ok = await select(token, ev, 'photographer', ids.live).expect(200);
  assert.equal(ok.body.requirement.status, 'pending');
  assert.equal(ok.body.requirement.selectedOptionId, ids.live);
  assert.equal(ok.body.requirement.selectedOption.vendorName, 'Premium Moments');

  const cleared = await select(token, ev, 'photography', null).expect(200);
  assert.equal(cleared.body.requirement.selectedOptionId, null);

  await models.EventRequirement.updateOne({ event: ev._id, category: 'catering' }, { $set: { status: 'booked' } });
  assert.equal((await select(token, ev, 'catering', 'demo_cat_01').expect(409)).body.error, 'REQUIREMENT_LOCKED');
});

test('arranging a service yourself or resetting clears the choice', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  await select(token, ev, 'decor', 'demo_dec_01').expect(200);
  const r = await request(app)
    .patch(`/api/customer/events/${ev._id}/requirements/decor`)
    .set(auth(token))
    .send({ status: 'customer_provided', providedValue: 'Bloom Decor' })
    .expect(200);
  assert.equal(r.body.requirement.selectedOptionId, null);
});

test('quote snapshots selections, supersedes older drafts and survives price changes', async () => {
  const { user, token } = await makeUser();
  const other = await makeUser();
  const ev = await planned(user, token);
  const quotes = `/api/customer/events/${ev._id}/quotes`;

  assert.equal((await request(app).post(quotes).set(auth(token)).expect(400)).body.error, 'NO_SELECTIONS');

  await select(token, ev, 'photography', ids.live).expect(200);
  await select(token, ev, 'catering', 'demo_cat_01').expect(200);
  const q1 = (await request(app).post(quotes).set(auth(token)).expect(201)).body.quote;
  assert.equal(q1.status, 'draft');
  assert.equal(q1.total, 48000 + 450000);
  assert.equal(q1.includesDemo, true);
  assert.ok(new Date(q1.validUntil) - Date.now() > 6.9 * 86400000);

  // Attention: a draft quote awaits a decision.
  const d = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  assert.ok(d.body.attention.some((a) => a.type === 'quote_awaiting_decision'));

  // Later price change never alters the quote.
  await models.DemoListing.updateOne({ externalRef: 'cat_01' }, { $set: { price: 999999 } });
  const again = await request(app).get(`/api/customer/quotes/${q1.id}`).set(auth(token)).expect(200);
  assert.equal(again.body.quote.total, 498000);
  await models.DemoListing.updateOne({ externalRef: 'cat_01' }, { $set: { price: 450000 } });

  const q2 = (await request(app).post(quotes).set(auth(token)).expect(201)).body.quote;
  const list = await request(app).get(quotes).set(auth(token)).expect(200);
  assert.equal(list.body.quotes.find((q) => q.id === q1.id).status, 'cancelled', 'older draft superseded, not deleted');
  assert.equal(list.body.quotes.find((q) => q.id === q2.id).status, 'draft');
  assert.equal(list.body.selections.length, 2);

  await request(app).get(`/api/customer/quotes/${q2.id}`).set(auth(other.token)).expect(404);
  await request(app).get('/api/customer/quotes/garbage').set(auth(token)).expect(404);

  // Stale drafts expire lazily and leave the attention list.
  await models.CustomerQuote.updateOne({ _id: q2.id }, { $set: { validUntil: new Date(Date.now() - 1000) } });
  const later = await request(app).get(quotes).set(auth(token)).expect(200);
  assert.equal(later.body.quotes.find((q) => q.id === q2.id).status, 'expired');
  const d2 = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  assert.ok(!d2.body.attention.some((a) => a.type === 'quote_awaiting_decision'));
});

test('a quote re-checks availability of every choice', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  await select(token, ev, 'photography', ids.live).expect(200);
  await VendorBlockout.create({ vendor: liveOrg._id, date: ev.eventDate });
  const r = await request(app).post(`/api/customer/events/${ev._id}/quotes`).set(auth(token)).expect(409);
  assert.equal(r.body.error, 'SELECTION_UNAVAILABLE');
  assert.deepEqual(r.body.categories, ['Photography']);
});

test('Aura+ has no way to select, quote, book or pay', async () => {
  const core = await import('../src/customer/aura/coreClient.js');
  const names = Object.keys(core).sort();
  // Writes Aura+ may make: event facts, plan statements, preferences, its own notes. Everything else is read-only.
  const writes = names.filter((n) => !/^(get|list|read|optionStats|compactOptions)/.test(n));
  assert.deepEqual(writes, ['applyServiceStatement', 'createDraftEvent', 'mergePreferences', 'patchEventFacts', 'setNote']);
});
