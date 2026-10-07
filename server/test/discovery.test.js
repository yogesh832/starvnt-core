import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser, uniqueDate, scriptLlm, sid } from './helpers.js';

let app;
let models;
let seedDemoListings;
let demoCount;
let ids = {};
const DATE = uniqueDate();

before(async () => {
  ({ app, models } = await setup());
  ({ seedDemoListings, DEMO_LISTINGS: { length: demoCount } } = await import('../src/customer/seeds/demoListings.js'));
  const { VendorOrganization } = await import('../src/external/models/VendorOrganization.js');
  const { VendorService } = await import('../src/external/models/VendorService.js');
  const { VendorBlockout } = await import('../src/external/models/VendorBlockout.js');
  const { OperatingLocation } = await import('../src/external/models/OperatingLocation.js');

  const first = await seedDemoListings();
  assert.equal(first.inserted, demoCount);

  const owner = await makeUser('VENDOR');
  const live = await VendorOrganization.create({
    businessName: 'Premium Moments', owner: owner.user._id, location: 'Kolkata', isCommerciallyActive: true, status: 'VERIFIED', rating: { average: 5, count: 0 },
  });
  const busy = await VendorOrganization.create({
    businessName: 'Busy Lens', owner: owner.user._id, location: 'Kolkata', isCommerciallyActive: true, status: 'VERIFIED', rating: { average: 4.6, count: 12 },
  });
  const unverified = await VendorOrganization.create({ businessName: 'Hidden Studio', owner: owner.user._id, location: 'Kolkata', isCommerciallyActive: false });
  const multiCity = await VendorOrganization.create({
    businessName: 'Mahiman Tent House Test',
    owner: owner.user._id,
    location: 'Mumbai',
    isCommerciallyActive: true,
    status: 'VERIFIED',
  });
  const [a, b, c, d, e] = await VendorService.create([
    { vendor: live._id, name: 'Wedding Photography', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 48000, conditionalCharges: [{ name: 'Travel outside city', amount: 3000, condition: 'Beyond 30 km' }] }, deliverables: ['2 photographers'] },
    { vendor: busy._id, name: 'Budget Photos', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 30000 } },
    { vendor: unverified._id, name: 'Hidden', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 100 } },
    { vendor: live._id, name: 'Hourly Video', category: 'Photography', status: 'ACTIVE', pricing: { pricingType: 'HOURLY', basePrice: 5000 } },
    { vendor: multiCity._id, name: 'Delhi DJ Setup', category: 'Entertainment', status: 'ACTIVE', pricing: { pricingType: 'FIXED', basePrice: 22000 }, deliverables: ['DJ', 'Lighting'] },
  ]);
  await OperatingLocation.create({
    vendor: multiCity._id,
    label: 'Hari Nagar Branch',
    type: 'STUDIO',
    address: 'Hari Nagar, West, Delhi, West Delhi, Delhi, 110064, India',
    locality: 'Hari Nagar',
    city: 'Delhi',
    state: 'Delhi',
    postalCode: '110064',
    coordinates: { lat: 28.6296, lng: 77.1119 },
  });
  await VendorBlockout.create({ vendor: busy._id, date: DATE });
  ids = { live: `vs_${a._id}`, busy: `vs_${b._id}`, hidden: `vs_${c._id}`, hourly: `vs_${d._id}`, delhiDj: `vs_${e._id}` };
});
after(teardown);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function plannedWedding(user, token, facts = {}) {
  const ev = await models.CustomerEvent.create({
    customer: user._id, eventType: 'wedding', title: 'My wedding', status: 'draft', eventDate: DATE, city: 'Kolkata', guestCount: 300, ...facts,
  });
  await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  return ev;
}

test('demo seed is idempotent and refuses production', async () => {
  const again = await seedDemoListings();
  assert.equal(again.inserted, demoCount);
  assert.ok(again.removed >= demoCount);
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  await assert.rejects(seedDemoListings(), /production/);
  process.env.NODE_ENV = prev;
});

test('open categories with option counts', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token);
  const r = await request(app).get(`/api/customer/events/${ev._id}/services`).set(auth(token)).expect(200);
  const photo = r.body.categories.find((c) => c.category === 'photography');
  // live + busy + hourly (real) + demo photography rows; the unverified vendor never counts.
  assert.equal(photo.optionCount, 7);
  assert.equal(photo.lowestPrice, 30000);
});

test('options: honest availability, demo labels, no invented ratings, best value', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token);
  const r = await request(app).get(`/api/customer/events/${ev._id}/services?category=photographer`).set(auth(token)).expect(200);
  assert.equal(r.body.category, 'photography');
  const byId = new Map(r.body.options.map((o) => [o.id, o]));
  assert.ok(!byId.has(ids.hidden));
  assert.equal(byId.get(ids.busy).availability, 'blocked');
  assert.equal(byId.get(ids.live).availability, 'unconfirmed', 'no availability row means not confirmed');
  assert.equal(byId.get(ids.live).rating, null, 'average 5 with 0 reviews is not a rating');
  assert.equal(byId.get(ids.busy).rating, 4.6);
  assert.equal(byId.get(ids.hourly).price, null, 'hourly pricing has no single total');
  const demo = byId.get('demo_pho_02');
  assert.equal(demo.isDemo, true);
  assert.equal(demo.price, 64000);
  assert.equal(r.body.bestValueId, 'demo_corp_photo_del_01', 'lowest bookable total; the blocked cheaper vendor is excluded');
  assert.equal(r.body.options.at(-1).id, ids.busy, 'unbookable options sort last');

  // A draft without a date can still browse options.
  const noDate = await models.CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'No date', status: 'draft', city: 'Kolkata' });
  const d = await request(app).get(`/api/customer/events/${noDate._id}/services?category=photography`).set(auth(token)).expect(200);
  assert.ok(d.body.options.every((o) => o.availability === 'no_event_date'));
});

test('details, ownership and unknown options', async () => {
  const { user, token } = await makeUser();
  const other = await makeUser();
  const ev = await plannedWedding(user, token);
  const base = `/api/customer/events/${ev._id}/services`;

  const demo = await request(app).get(`${base}/demo_pho_02`).set(auth(token)).expect(200);
  assert.deepEqual(demo.body.option.costBreakdown, { base: 56000, travel: 4000, additional: 4000 });
  assert.match(demo.body.option.description, /development data only/);
  const real = await request(app).get(`${base}/${ids.live}`).set(auth(token)).expect(200);
  assert.equal(real.body.option.mayApply[0].amount, 3000);

  await request(app).get(`${base}/${ids.hidden}`).set(auth(token)).expect(404);
  await request(app).get(`${base}/demo_nope`).set(auth(token)).expect(404);
  await request(app).get(`${base}/garbage`).set(auth(token)).expect(404);
  await request(app).get(`${base}/${ids.live}`).set(auth(other.token)).expect(404);

  const delhi = await plannedWedding(user, token, { city: 'Delhi' });
  await request(app).get(`/api/customer/events/${delhi._id}/services/${ids.live}`).set(auth(token)).expect(404);
});

test('real vendors match by operating location, not only profile city', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token, {
    city: 'Delhi',
    eventType: 'corporate',
    location: { city: 'Delhi', locality: 'Hari Nagar', coordinates: { lat: 28.6307, lng: 77.1149 } },
  });
  const r = await request(app).get(`/api/customer/events/${ev._id}/services?category=entertainment`).set(auth(token)).expect(200);
  const byId = new Map(r.body.options.map((o) => [o.id, o]));
  assert.ok(byId.has(ids.delhiDj), 'vendor with a Delhi operating hub is discoverable for a Delhi event');
  assert.equal(byId.get(ids.delhiDj).vendorName, 'Mahiman Tent House Test');
  assert.equal(byId.get(ids.delhiDj).vendorLocation, 'Hari Nagar, Delhi, Delhi');
  assert.equal(byId.get(ids.delhiDj).location.coordinates.lat, 28.6296);
});

test('compare: 2–4 options of one service', async () => {
  const { user, token } = await makeUser();
  const ev = await plannedWedding(user, token);
  const url = (list) => `/api/customer/events/${ev._id}/services/compare?ids=${list.join(',')}`;
  const r = await request(app).get(url([ids.live, 'demo_pho_01', ids.busy])).set(auth(token)).expect(200);
  const s = Object.fromEntries(r.body.options.map((o) => [o.id, o.summary]));
  assert.equal(s[ids.live], 'Best value');
  assert.equal(s.demo_pho_01, '+₹12,000 vs best value');
  assert.equal(s[ids.busy], 'Not available');
  await request(app).get(url([ids.live])).set(auth(token)).expect(400);
  await request(app).get(url([ids.live, 'demo_cat_01'])).set(auth(token)).expect(400);
});

test('Aura+ sees compact options only once the event is confirmed', async () => {
  const { user, token } = await makeUser();
  const llm = scriptLlm([{ text: 'ok', extracted: {} }, { text: 'ok', extracted: {} }]);
  const draft = await models.CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'Draft', status: 'draft', city: 'Kolkata' });
  await request(app).post('/api/aura/chat').set(auth(token)).send({ sessionId: sid(), eventId: String(draft._id), message: 'hi' }).expect(200);
  assert.match(llm.calls[0].systemPrompt, /"vendors":\[\]/);

  const ev = await plannedWedding(user, token);
  await request(app).patch(`/api/customer/events/${ev._id}/requirements/photography`).set(auth(token)).send({ status: 'pending' }).expect(200);
  await request(app).post('/api/aura/chat').set(auth(token)).send({ sessionId: sid(), eventId: String(ev._id), message: 'Which photographer?' }).expect(200);
  const prompt = llm.calls[1].systemPrompt;
  assert.match(prompt, /"vendor":"Premium Moments"/);
  assert.match(prompt, /"isDemo":true/);
  assert.ok(!prompt.includes('Hidden Studio'));
});
