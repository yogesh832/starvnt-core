import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser, uniqueDate, scriptLlm, sid } from './helpers.js';

let app;
let models;
before(async () => ({ app, models } = await setup()));
after(teardown);

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const create = (token, body) => request(app).post('/api/customer/events').set(auth(token)).send(body);
const chat = (token, body) => request(app).post('/api/aura/chat').set(auth(token)).send(body);

const FULL_LOCATION = {
  country: 'India',
  state: 'West Bengal',
  city: 'Kolkata',
  area: 'New Town',
  venueName: 'Kisan Palace',
  address: 'Plot 12, Action Area 1',
  pincode: '700156',
  landmark: 'Near Eco Park',
  notes: 'Entry from gate 2',
};

test('manual wedding: full location, budget range, services with details and service locations', async () => {
  const { token } = await makeUser();
  const r = await create(token, {
    eventType: 'wedding',
    title: "My Daughter's Wedding",
    eventDate: uniqueDate(),
    guestCount: 500,
    budgetRange: 'w_10_15',
    location: FULL_LOCATION,
    specialRequirements: 'Wheelchair access for grandparents',
    services: [
      { category: 'photography', status: 'pending', details: { deliverables: 'Photos + Video', coverageHours: 10, styles: ['Candid'] }, serviceLocation: { mode: 'event' } },
      { category: 'decoration', status: 'pending', details: { scope: ['Stage', 'Floral'] } },
      { category: 'catering', status: 'customer_provided' },
      { category: 'makeup', status: 'pending', details: { makeupFor: 'Bride', people: 3 }, serviceLocation: { mode: 'custom', place: "Bride's hotel" } },
      { category: 'transport', status: 'pending', serviceLocation: { mode: 'custom', pickup: "Bride's home", dropIsEventLocation: true } },
    ],
  }).expect(201);

  const e = r.body.event;
  assert.equal(e.status, 'planning');
  assert.equal(e.title, "My Daughter's Wedding");
  assert.deepEqual(
    { ...e.location, coordinates: undefined },
    { country: 'India', state: 'West Bengal', city: 'Kolkata', locality: 'New Town', venueName: 'Kisan Palace', address: 'Plot 12, Action Area 1', pincode: '700156', landmark: 'Near Eco Park', notes: 'Entry from gate 2', coordinates: undefined }
  );
  assert.equal(e.locationLabel, 'Kisan Palace, New Town, Kolkata');
  assert.equal(e.budgetRangeLabel, '₹10–15 Lakh');
  assert.equal(e.specialRequirements, 'Wheelchair access for grandparents');

  const req = (c) => r.body.requirements.find((x) => x.category === c);
  // The venue name in the location is the same fact as the venue plan item.
  assert.equal(req('venue').status, 'customer_provided');
  assert.equal(req('venue').providedValue, 'Kisan Palace');
  assert.equal(req('catering').status, 'customer_provided');
  assert.equal(req('catering').providedValue, null, 'arranged without a name is honest, not invented');
  assert.deepEqual(req('photography').preferences, { deliverables: 'Photos + Video', coverageHours: 10, styles: ['Candid'] });
  assert.equal(req('photography').serviceLocation.mode, 'event');
  assert.deepEqual(req('makeup').serviceLocation, { mode: 'custom', place: "Bride's hotel", address: null, locality: null, city: null, pickup: null, drop: null, dropIsEventLocation: false, notes: null });
  assert.equal(req('transport').serviceLocation.pickup, "Bride's home");
  assert.equal(req('transport').serviceLocation.dropIsEventLocation, true);
  // Event location is never copied into services that didn't say so.
  assert.equal(req('decor').serviceLocation.mode, 'unspecified');
});

test('manual form: corporate, birthday, puja and an unknown event type', async () => {
  const { token } = await makeUser();
  const base = { eventDate: uniqueDate(), location: { city: 'Pune' } };
  for (const [eventType, essential] of [['corporate', 'sound'], ['birthday', 'cake'], ['puja', 'ceremony']]) {
    const r = await create(token, { ...base, eventType }).expect(201);
    assert.equal(r.body.event.eventType, eventType);
    assert.ok(r.body.requirements.some((x) => x.category === essential && x.tier === 'essential'));
  }
  const other = await create(token, { ...base, eventType: 'other', customType: 'Housewarming' }).expect(201);
  assert.equal(other.body.event.eventTypeLabel, 'Housewarming');
  assert.equal(other.body.event.title, 'My housewarming');
});

test('manual form validates location, details and service locations before writing', async () => {
  const { user, token } = await makeUser();
  const before = await models.CustomerEvent.countDocuments({ customer: user._id });
  const base = { eventType: 'wedding', eventDate: uniqueDate(), location: { city: 'Kolkata' } };
  await create(token, { ...base, location: { city: 'Kolkata', pincode: '12' } }).expect(400);
  await create(token, { ...base, location: { city: 'Kolkata', galaxy: 'Milky Way' } }).expect(400);
  await create(token, { ...base, services: [{ category: 'photography', status: 'pending', details: { coverageHours: 'all day' } }] }).expect(400);
  await create(token, { ...base, services: [{ category: 'makeup', status: 'pending', serviceLocation: { mode: 'custom' } }] }).expect(400);
  await create(token, { ...base, services: [{ category: 'makeup', status: 'pending', serviceLocation: { mode: 'somewhere' } }] }).expect(400);
  await create(token, { ...base, location: { area: 'New Town' } }).expect(400); // city is still required
  assert.equal(await models.CustomerEvent.countDocuments({ customer: user._id }), before, 'no half-created events');
});

test('plan options expose service fields from the Vendor OS taxonomy', async () => {
  const { token } = await makeUser();
  const r = await request(app).get('/api/customer/plan-options?eventType=wedding').set(auth(token)).expect(200);
  const style = r.body.serviceFields.photography.find((f) => f.key === 'styles');
  assert.ok(style.options.includes('Candid') && style.options.includes('Pre-wedding'));
  const birthday = await request(app).get('/api/customer/plan-options?eventType=birthday').set(auth(token)).expect(200);
  assert.ok(!birthday.body.serviceFields.photography.find((f) => f.key === 'styles').options.includes('Pre-wedding'));
  assert.ok(r.body.locationSensitive.includes('makeup'));
});

test('edit: location changes keep the venue in step; protected status stays protected', async () => {
  const { token } = await makeUser();
  const created = await create(token, { eventType: 'birthday', eventDate: uniqueDate(), location: { city: 'Pune' } }).expect(201);
  const id = created.body.event.id;
  const r = await request(app)
    .patch(`/api/customer/events/${id}`)
    .set(auth(token))
    .send({ guestCount: 60, location: { venueName: 'Sky Lounge', area: 'Baner', pincode: '411045' } })
    .expect(200);
  assert.equal(r.body.event.locationLabel, 'Sky Lounge, Baner, Pune');
  assert.equal(r.body.event.location.pincode, '411045');
  assert.equal(r.body.requirements.find((x) => x.category === 'venue').providedValue, 'Sky Lounge');
  // A partial location update never wipes the other fields.
  const r2 = await request(app).patch(`/api/customer/events/${id}`).set(auth(token)).send({ location: { landmark: 'Opp. mall' } }).expect(200);
  assert.equal(r2.body.event.location.venueName, 'Sky Lounge');
  assert.equal(r2.body.event.location.landmark, 'Opp. mall');
  await request(app).patch(`/api/customer/events/${id}`).set(auth(token)).send({ status: 'booked' }).expect(400);

  // Service location and details from the plan page.
  const s = await request(app)
    .patch(`/api/customer/events/${id}/requirements/makeup`)
    .set(auth(token))
    .send({ serviceLocation: { mode: 'custom', place: 'Home' }, details: { people: 2 } })
    .expect(200);
  assert.equal(s.body.requirement.status, 'pending', 'details for a new service add it as needed');
  assert.equal(s.body.requirement.serviceLocation.place, 'Home');
});

test('Aura+ conversation fills the same event step by step (prompt §27)', async () => {
  const { user, token } = await makeUser();
  const s = sid();
  // A terse model: the guards + fallback parser must still capture what was said.
  scriptLlm([
    { text: 'A wedding, lovely!', extracted: { eventType: 'wedding' } },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: { area: 'New Town' } },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: {} },
    { text: 'Noted.', extracted: { providedCategory: 'catering' } },
    { text: 'Updated.', extracted: {} },
  ]);
  const say = (message) => chat(token, { sessionId: s, message }).expect(200);

  let r = await say('I want a wedding.');
  const eventId = r.body.activeEvent.id;
  let u = r.body.understanding;
  assert.equal(r.body.nextQuestion.topic, 'event.date', 'asks for the date first');
  assert.equal(u.facts.city.value, null);
  assert.equal(u.facts.guestCount.value, null);
  assert.equal(u.facts.location.value, null);
  assert.deepEqual(u.services.needed, [], 'nothing assumed');
  assert.ok(u.services.suggested.some((x) => x.category === 'photography'), 'suggestions are shown as suggestions');

  r = await say('I am planning it in Kolkata.');
  assert.equal(r.body.understanding.facts.city.value, 'Kolkata');
  r = await say('It is at Kisan Palace.');
  assert.equal(r.body.understanding.facts.location.venueName, 'Kisan Palace');
  r = await say('New Town.');
  assert.equal(r.body.understanding.facts.location.locality, 'New Town');
  r = await say('26 November 2026.');
  assert.equal(r.body.understanding.facts.date.value, '2026-11-26');
  assert.equal(r.body.understanding.facts.date.state, 'KNOWN', 'the year was stated');
  r = await say('500 guests.');
  assert.equal(r.body.understanding.facts.guestCount.value, 500);
  r = await say('Budget is 10 to 15 lakh.');
  assert.equal(r.body.understanding.facts.budget.rangeLabel, '₹10–15 Lakh');
  r = await say('I need photography and decoration.');
  assert.deepEqual(r.body.understanding.services.needed.map((x) => x.category).sort(), ['decor', 'photography']);
  r = await say('Makeup will be at my hotel.');
  const makeup = r.body.understanding.services.needed.find((x) => x.category === 'makeup');
  assert.equal(makeup.location, 'my hotel');
  r = await say('Catering is already arranged.');
  u = r.body.understanding;
  assert.ok(u.services.provided.some((x) => x.category === 'catering'));
  assert.ok(!u.services.suggested.some((x) => x.category === 'catering'), 'no longer suggested');

  r = await say('No, the venue is actually ABC Banquet.');
  u = r.body.understanding;
  assert.equal(u.facts.location.value, 'ABC Banquet, New Town, Kolkata');
  assert.equal(u.services.provided.find((x) => x.category === 'venue').value, 'ABC Banquet');
  assert.equal(r.body.activeEvent.id, eventId);
  assert.equal(await models.CustomerEvent.countDocuments({ customer: user._id }), 1, 'one event, never one per message');
  assert.equal(u.canConfirm, true);
});

test('Aura+ never invents venue, address, pincode or city; questions never overwrite', async () => {
  const { user, token } = await makeUser();
  const s = sid();
  scriptLlm([
    { text: 'ok', extracted: { eventType: 'birthday' } },
    { text: 'ok', extracted: { venueName: 'Grand Hotel', address: '12 Park Street', pincode: '700016', city: 'Mumbai', landmark: 'Near metro' } },
  ]);
  await chat(token, { sessionId: s, message: "It's my son's birthday" }).expect(200);
  const r = await chat(token, { sessionId: s, message: 'Can you suggest a good place?' }).expect(200);
  const loc = r.body.understanding.facts.location;
  assert.equal(loc.venueName, null);
  assert.equal(loc.address, null);
  assert.equal(loc.pincode, null);
  assert.equal(r.body.understanding.facts.city.value, null);
  assert.ok(['venueName', 'address', 'pincode', 'landmark'].every((k) => r.body.dropped.includes(k)));

  const ev = await models.CustomerEvent.create({
    customer: user._id, eventType: 'wedding', title: 'W', status: 'planning', eventDate: uniqueDate(), city: 'Kolkata', location: { venueName: 'ABC Banquet' },
  });
  scriptLlm([{ text: 'Availability is not confirmed yet.', extracted: { venueName: 'Kisan Palace' } }]);
  const q = await chat(token, { sessionId: sid(), eventId: String(ev._id), message: 'Is Kisan Palace free on that day?' }).expect(200);
  assert.equal(q.body.understanding.facts.location.venueName, 'ABC Banquet');
  assert.ok(q.body.skipped.some((x) => x.field === 'location.venueName' && x.reason === 'question'));
});

test('service-location chip and transport route from chat', async () => {
  const { token } = await makeUser();
  const created = await create(token, {
    eventType: 'wedding', eventDate: uniqueDate(), location: { city: 'Kolkata', venueName: 'Kisan Palace' },
    services: [{ category: 'makeup', status: 'pending' }],
  }).expect(201);
  const id = created.body.event.id;
  scriptLlm([{ text: 'ok', extracted: {} }, { text: 'ok', extracted: {} }]);
  let r = await chat(token, { sessionId: sid(), eventId: id, message: 'At the event venue', serviceLocation: { category: 'makeup', mode: 'event' } }).expect(200);
  assert.match(r.body.understanding.services.needed.find((x) => x.category === 'makeup').location, /^At the event location/);
  r = await chat(token, { sessionId: sid(), eventId: id, message: 'Guests will be picked up from Salt Lake and taken to the venue.' }).expect(200);
  const transport = r.body.understanding.services.needed.find((x) => x.category === 'transport');
  assert.equal(transport.location, 'from Salt Lake to event location');
  await chat(token, { sessionId: sid(), eventId: id, message: 'x', serviceLocation: { category: 'makeup', mode: 'custom' } }).expect(400);
});
