import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser, scriptLlm, sid } from './helpers.js';

let app;
let models;
before(async () => ({ app, models } = await setup()));
after(teardown);

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const chat = (token, body) => request(app).post('/api/aura/chat').set(auth(token)).send(body);

test('golden path: draft → card → chips → skip → budget range → confirm → plan', async () => {
  const { token } = await makeUser();
  const s = sid();
  const llm = scriptLlm([
    // Live Gemini often returns only type + guests; the fallback parser fills the rest.
    { text: 'Lovely! I saved this on the card. Which city is it in?', extracted: { eventType: 'wedding', guestCount: 500 } },
    { text: 'Got it. Do you already have a venue?', extracted: { city: 'Kolkata' } },
    { text: 'Noted the venue.', extracted: { providedCategory: 'venue', providedValue: 'Kisan Palace' } },
    { text: 'No problem.', extracted: {} },
    { text: 'Budget range saved.', extracted: { budget: 1500000 } },
  ]);

  let r = await chat(token, { sessionId: s, message: "My daughter's wedding is on 26 November for 500 guests. We need photography and catering." }).expect(200);
  assert.ok(r.body.createdEventId);
  assert.equal(r.body.activeEvent.status, 'draft');
  assert.equal(r.body.understanding.facts.eventType.value, 'wedding');
  assert.equal(r.body.understanding.facts.guestCount.value, 500);
  assert.match(r.body.understanding.facts.date.value, /^\d{4}-11-26$/);
  assert.equal(r.body.understanding.facts.date.state, 'INFERRED', 'year was not stated');
  assert.deepEqual(r.body.understanding.services.needed.map((s) => s.category).sort(), ['catering', 'photography']);
  assert.equal(r.body.understanding.canConfirm, false);
  assert.equal(r.body.nextQuestion.topic, 'event.city');
  // Exactly one question, computed after this turn's writes, plus the year note.
  assert.match(r.body.reply, /assumed the year \d{4}/);
  assert.ok(r.body.reply.endsWith('Which city is the event in?'));
  // Draft stage keeps the prompt small: no vendor list.
  assert.match(llm.calls[0].systemPrompt, /"vendors":\[\]/);

  const eventId = r.body.activeEvent.id;
  r = await chat(token, { sessionId: s, message: 'It is in Kolkata' }).expect(200);
  assert.equal(r.body.understanding.facts.city.value, 'Kolkata');
  assert.equal(r.body.understanding.canConfirm, true);
  assert.equal(r.body.nextQuestion.topic, 'requirement.venue');

  r = await chat(token, { sessionId: s, message: 'My venue is Kisan Palace' }).expect(200);
  assert.deepEqual(r.body.understanding.services.provided, [{ category: 'venue', label: 'Venue', value: 'Kisan Palace' }]);
  assert.equal(r.body.nextQuestion.topic, 'event.budget', 'date and guests are known, so budget is next');

  r = await chat(token, { sessionId: s, message: 'Skip for now', skipTopic: 'event.budget' }).expect(200);
  assert.notEqual(r.body.nextQuestion?.topic, 'event.budget', 'skipped topics are never re-asked');

  r = await chat(token, { sessionId: s, message: '₹10–15 Lakh', budgetRange: 'w_10_15' }).expect(200);
  assert.equal(r.body.understanding.facts.budget.rangeLabel, '₹10–15 Lakh');
  assert.equal(r.body.understanding.facts.budget.value, null, 'the model\'s number is ignored when the chip is used');

  const c = await request(app).post(`/api/customer/events/${eventId}/confirm`).set(auth(token)).expect(200);
  assert.equal(c.body.event.status, 'planning');
  assert.equal(c.body.requirements.find((x) => x.category === 'venue').status, 'customer_provided');
  assert.equal(c.body.requirements.find((x) => x.category === 'photography').status, 'pending');

  const hist = await request(app).get(`/api/aura/sessions/${s}`).set(auth(token)).expect(200);
  assert.equal(hist.body.messages.length, 10);
  assert.equal(hist.body.activeEvent.id, eventId);
});

test('hallucination guards drop values the customer never said', async () => {
  const { token } = await makeUser();
  const s = sid();
  scriptLlm([
    { text: 'ok', extracted: { eventType: 'birthday' } },
    {
      text: 'ok',
      extracted: {
        providedCategory: 'venue',
        providedValue: 'Kisan Palace Gardens', // not in the message
        needsHelpCategory: 'makeup', // not mentioned
        tentativeCategory: 'entertainment',
        neededCategories: ['photography', 'catering'],
        city: 'Mumbai', // not in the message
      },
    },
  ]);
  await chat(token, { sessionId: s, message: "It's my son's birthday" }).expect(200);
  const r = await chat(token, { sessionId: s, message: 'The venue is Kisan Palace. Maybe a DJ. We need photography.' }).expect(200);
  assert.deepEqual(r.body.understanding.services.provided, [], 'value words must all appear in the message');
  assert.deepEqual(r.body.understanding.services.needed.map((x) => x.category), ['photography']);
  assert.equal(r.body.understanding.facts.city.value, null);
  const eventId = r.body.activeEvent.id;
  const note = await models.AuraContext.findOne({ event: eventId, field: 'tentative:entertainment' }).lean();
  assert.equal(note.state, 'INFERRED');
  const reqs = await models.EventRequirement.find({ event: eventId, category: 'entertainment' }).lean();
  assert.equal(reqs.length, 0, 'tentative is never business state');
});

test('a different event type creates a second draft; the same type does not duplicate', async () => {
  const { user, token } = await makeUser();
  const s = sid();
  scriptLlm([
    { text: 'ok', extracted: { eventType: 'wedding' } },
    { text: 'ok', extracted: { newEventType: 'wedding', newEventCity: 'Kolkata' } },
    { text: 'ok', extracted: { newEventType: 'birthday', photographyStyle: 'candid' } },
  ]);
  const first = await chat(token, { sessionId: s, message: 'Planning a wedding' }).expect(200);
  const same = await chat(token, { sessionId: s, message: 'The wedding is in Kolkata' }).expect(200);
  assert.equal(same.body.createdEventId, null);
  assert.equal(same.body.understanding.facts.city.value, 'Kolkata');
  const second = await chat(token, { sessionId: s, message: 'Also my birthday party, candid photos please' }).expect(200);
  assert.ok(second.body.createdEventId);
  assert.notEqual(second.body.activeEvent.id, first.body.activeEvent.id);
  assert.equal(second.body.activeEvent.eventType, 'birthday');
  const count = await models.CustomerEvent.countDocuments({ customer: user._id });
  assert.equal(count, 2);
  const prefs = await models.EventRequirement.find({ event: second.body.activeEvent.id, category: 'photography' }).lean();
  assert.ok(prefs.every((p) => !p.preferences?.style), 'style from the other event is dropped');
});

test('after confirmation Aura+ fills blanks only; a date in a question never moves the event', async () => {
  const { user, token } = await makeUser();
  const ev = await models.CustomerEvent.create({
    customer: user._id, eventType: 'wedding', title: 'W', status: 'planning', eventDate: '2090-11-26', city: 'Kolkata',
  });
  scriptLlm([{ text: 'Not confirmed yet.', extracted: { date: '2090-12-05', city: 'Pune', guestCount: 250 } }]);
  const r = await chat(token, { sessionId: sid(), eventId: String(ev._id), message: 'Is the photographer free on 5 Dec 2090 in Pune? We are 250 guests' }).expect(200);
  const fresh = await models.CustomerEvent.findById(ev._id).lean();
  assert.equal(fresh.eventDate, '2090-11-26');
  assert.equal(fresh.city, 'Kolkata');
  assert.equal(fresh.guestCount, 250, 'a blank fact may be filled');
  assert.deepEqual(r.body.skipped.map((s) => s.field).sort(), ['city', 'eventDate']);
  assert.ok(!/assumed the year/.test(r.body.reply));
});

test('sessions and events are customer-owned', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const s = sid();
  scriptLlm([{ text: 'ok', extracted: { eventType: 'puja' } }]);
  const r = await chat(a.token, { sessionId: s, message: 'Arrange a puja' }).expect(200);
  await request(app).get(`/api/aura/sessions/${s}`).set(auth(b.token)).expect(403);
  await chat(b.token, { sessionId: s, message: 'hello' }).expect(403);
  await chat(b.token, { sessionId: sid(), message: 'hello', eventId: r.body.activeEvent.id }).expect(404);
  await request(app).get(`/api/aura/sessions/${sid()}?eventId=${r.body.activeEvent.id}`).set(auth(b.token)).expect(404);
});

test('chip validation and LLM failure fallback', async () => {
  const { token } = await makeUser();
  const s = sid();
  scriptLlm([new Error('quota'), { text: 'ok', extracted: {} }]);
  // LLM down: the fallback parser still captures literal facts, but creates no event without a type.
  const r = await chat(token, { sessionId: s, message: 'For 200 guests' }).expect(200);
  assert.match(r.body.reply, /trouble/);
  assert.equal(r.body.activeEvent, null);
  await chat(token, { sessionId: s, message: 'x', skipTopic: 'drop table' }).expect(400);
  await chat(token, { sessionId: s, message: 'x', skipTopic: 'event.budget' }).expect(400); // no event yet
  await chat(token, { sessionId: s, message: '' }).expect(400);
  await request(app).post('/api/aura/chat').send({ sessionId: s, message: 'hi' }).expect(401);
});
