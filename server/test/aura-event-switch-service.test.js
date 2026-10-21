import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as navigation from '../src/customer/aura/eventSwitch.js';
import * as language from '../src/common/auraLanguage.js';
import * as vendorTruth from '../src/customer/aura/vendorTruth.js';
import * as facts from '../src/customer/aura/factBackfill.js';
import * as activityAnswers from '../src/common/auraActivityAnswer.js';
import * as catalogMemory from '../src/customer/aura/catalogMemory.js';

function harness({ useLiteralFacts = false } = {}) {
  const activity = { scope: { role: 'customer' }, items: [], counts: { bookings: 0 } };
  const events = [
    { _id: 'a'.repeat(24), title: 'My birthday', eventType: 'birthday', city: 'Delhi', status: 'draft' },
    { _id: 'b'.repeat(24), title: 'My wedding', eventType: 'wedding', city: 'Mumbai', status: 'draft' },
    { _id: 'c'.repeat(24), title: 'Family wedding', eventType: 'wedding', city: 'Jaipur', status: 'draft' },
  ];
  const session = { customer: 'owner', event: events[0]._id, previousEvent: null, switchChoices: [] };
  const messages = [];
  const calls = { writes: 0, llm: 0, scope: [] };
  const vendors = Array.from({ length: 5 }, (_, index) => ({ id: `vs_${index}`, vendorId: `vendor-${index}`, vendor: `Stored Vendor ${index}`, category: 'photography', service: 'Photography', package: 'Stored package', price: 1000 + index, availability: 'no_event_date', isDemo: false }));
  const repo = {
    findSession: async () => ({ ...session }),
    setSessionEvent: async (_sid, eventId) => { if (eventId !== session.event) { session.previousEvent = session.event; session.event = eventId; session.catalogSearch = null; } session.switchChoices = []; },
    setSwitchChoices: async (_sid, ids) => { session.switchChoices = ids; },
    setCatalogSearch: async (_sid, search) => { session.catalogSearch = search; },
    recentMessages: async () => messages.slice(-12), listMessages: async () => messages,
    addMessages: async (_sid, rows) => { messages.push(...rows); },
  };
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  const modules = {
    '../repositories/aura.repo.js': repo,
    './coreClient.js': {
      readActivity: async () => structuredClone(activity),
      listEvents: async owner => { assert.equal(owner, 'owner'); return structuredClone(events); },
      getEvent: async (owner, id) => { calls.scope.push(owner); return owner === 'owner' ? structuredClone(events.find(event => event._id === id)) : null; },
      listRequirements: async () => [], listContext: async () => [],
      vendorCatalog: async scope => vendors.map(row => ({ ...row, ...(row.pricingType === 'PER_PERSON' ? { price: scope?.guestCount ? row.basePrice * scope.guestCount : null } : {}) })), catalogLocationHint: async text => /kapkote/i.test(text) ? 'Kapkote' : null,
      patchEventFacts() { calls.writes++; throw new Error('Event navigation must not write facts'); },
      createDraftEvent() { calls.writes++; throw new Error('Event navigation must not create a draft'); },
    },
    './llmAdapter.js': { getLlmAdapter: () => ({ chat: async () => { calls.llm++; return { text: 'Invented Photo Company is available for ₹999.', extracted: {} }; } }) },
    './contextBuilder.js': { buildContext: async ({ catalogScope }) => ({ prompt: { activity: structuredClone(activity), vendors: structuredClone(vendors), vendorSearch: { source: 'customer_catalog_api', city: catalogScope.city || null } } }) },
    './systemPrompt.js': { buildSystemPrompt: () => '' }, './extractionGuards.js': { applyGuards: extracted => ({ extracted, dropped: [] }) },
    './factBackfill.js': { ...facts, backfillFacts: useLiteralFacts ? facts.backfillFacts : (_text, extracted) => extracted }, './extractionWriter.js': { writeExtraction: async () => ({ written: [], skipped: [] }) },
    '../services/understanding.js': { buildUnderstanding: event => ({ facts: { title: event.title, guestCount: event.guestCount } }), nextQuestion: () => ({ topic: 'event.date', question: 'When is the event?' }), serializeEvent: event => ({ ...event, id: event._id }) },
    '../services/planCatalog.js': {}, '../utils/http.js': { notFound: message => httpError(404, message), forbidden: message => httpError(403, message), badRequest: (_code, message) => httpError(400, message) },
    '../../common/auraRouter.js': { classifyAuraRequest: () => ({ model: 'test', thinkingLevel: 'minimal' }) }, '../../common/streamUtils.js': { createPerformanceTracker: () => ({ markContextStart() {}, markContextEnd() {}, markGeminiStart() {}, markGenerationEnd() {}, getMetrics: () => ({}) }) },
    '../../common/auraActivityAnswer.js': activityAnswers, '../../common/auraLanguage.js': language, './eventSwitch.js': navigation, './vendorTruth.js': vendorTruth, './catalogMemory.js': catalogMemory,
  };
  const code = transformSync(readFileSync(new URL('../src/customer/aura/aura.service.js', import.meta.url), 'utf8'), { format: 'cjs', loader: 'js' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert.ok(modules[name], name); return modules[name]; }, module, module.exports);
  return { ...module.exports, activity, events, session, messages, calls, vendors, customer: { _id: 'owner' } };
}

test('draft catalogue questions use every matching API row without model claims or event writes', async () => {
  const h = harness();
  const result = await h.chat(h.customer, { sessionId: 'test-session', message: 'Show photographers in kapkote', budgetRange: 'untrusted-extra' });
  assert.equal(result.vendorSuggestions.length, 5, 'Must include more than the old top-three limit');
  assert.match(result.reply, /5 services from 5 vendors/);
  assert.match(result.reply, /Stored Vendor/);
  assert.doesNotMatch(result.reply, /Invented Photo Company|₹999/);
  assert.equal(result.vendorSearch.city, 'Kapkote');
  assert.equal(result.vendorSearch.scopeMatchesEvent, false, 'A search in another city must not link to service details scoped to the current event');
  assert.equal(h.events[0].city, 'Delhi', 'A catalogue search must not change event location');
  assert.equal(h.calls.writes, 0); assert.equal(h.calls.llm, 0);
  const reloaded = await h.getSession(h.customer, 'test-session');
  assert.equal(reloaded.vendorSuggestions.length, 5, 'Catalogue cards must survive reloading the conversation');
});

test('vendor planning statements replace invented model recommendations with catalogue truth', async () => {
  const h = harness();
  const result = await h.chat(h.customer, { sessionId: 'test-session', message: 'I need photography for this event' });
  assert.equal(h.calls.llm, 1);
  assert.match(result.reply, /Stored Vendor/);
  assert.doesNotMatch(result.reply, /Invented Photo Company|₹999/);
  assert.equal(result.vendorSuggestions.length, 5);
});

test('saved search cards survive later messages and refresh prices and event details from the API', async () => {
  const h = harness();
  h.events[0].guestCount = 100; h.events[0].updatedAt = '2026-10-19T10:00:00Z';
  Object.assign(h.vendors[0], { pricingType: 'PER_PERSON', basePrice: 10 });
  await h.chat(h.customer, { sessionId: 'test-session', message: 'Show photography prices in Delhi' });
  h.messages.push({ role: 'user', content: '200 guests' }, { role: 'model', content: 'Updated.' });
  h.events[0].guestCount = 200; h.events[0].updatedAt = '2026-10-19T10:01:00Z';
  const snapshot = await h.getSession(h.customer, 'test-session');
  assert.equal(snapshot.understanding.facts.guestCount, 200);
  assert.equal(snapshot.vendorSuggestions.length, 5, 'Follow-up facts must not erase the search cards');
  assert.equal(snapshot.vendorSuggestions.find(row => row.id === 'vs_0').price, 2000);
  h.vendors[0].basePrice = 20;
  const repriced = await h.getSession(h.customer, 'test-session');
  assert.equal(repriced.vendorSuggestions.find(row => row.id === 'vs_0').price, 4000, 'Vendor API changes must be visible without another chat turn');
  await h.chat(h.customer, { sessionId: 'test-session', message: 'Switch to My wedding', switchEventId: h.events[1]._id });
  const switched = await h.getSession(h.customer, 'test-session');
  assert.deepEqual(switched.vendorSuggestions, [], 'The old event search must not leak into another event');
});

test('manual and spoken switching share persisted state without creating or editing an event', async () => {
  const h = harness();
  const before = structuredClone(h.events);
  const result = await h.chat(h.customer, { sessionId: 'test-session', message: 'Switch to My wedding', eventId: h.events[0]._id, switchEventId: h.events[1]._id });
  assert.equal(result.activeEvent.id, h.events[1]._id);
  assert.equal(result.eventSwitched, true);
  assert.equal(h.calls.writes, 0); assert.equal(h.calls.llm, 0);
  const reload = await h.getSession(h.customer, 'test-session', { eventId: h.events[0]._id });
  assert.equal(reload.activeEvent.id, h.events[1]._id, 'Old screen scope must not undo the persisted switch');
  const previous = await h.chat(h.customer, { sessionId: 'test-session', message: 'go back to the previous event', eventId: h.events[1]._id });
  assert.equal(previous.activeEvent.id, h.events[0]._id);
  assert.deepEqual(h.events, before);
});

test('ambiguous voice requests persist choices for the following spoken answer and reload', async () => {
  const h = harness();
  const result = await h.chat(h.customer, { sessionId: 'test-session', message: 'switch to wedding' });
  assert.equal(result.eventSwitched, false); assert.equal(result.eventChoices.length, 2);
  assert.equal(result.nextQuestion, null); assert.equal(h.session.event, h.events[0]._id);
  const reloaded = await h.getSession(h.customer, 'test-session');
  assert.equal(reloaded.eventChoices.length, 2);
  const selected = await h.chat(h.customer, { sessionId: 'test-session', message: 'second one' });
  assert.equal(selected.activeEvent.id, h.events[2]._id);
  assert.deepEqual(h.session.switchChoices, []);
  assert.equal(h.calls.writes, 0);
});

test('manual switching validates IDs and cannot select an event outside the customer account', async () => {
  const h = harness();
  await assert.rejects(h.chat(h.customer, { sessionId: 'test-session', message: 'Switch', switchEventId: 'foreign-id' }), error => error.status === 400);
  await assert.rejects(h.chat(h.customer, { sessionId: 'test-session', message: 'Switch', switchEventId: 'f'.repeat(24) }), error => error.status === 404);
  await assert.rejects(h.chat({ _id: 'another-owner' }, { sessionId: 'test-session', message: 'switch event' }), error => error.status === 403);
  assert.equal(h.session.event, h.events[0]._id);
  assert.equal(h.calls.writes, 0);
});

test('customer operational questions and reloads read new saved states without extraction or model guesses', async () => {
  const h = harness();
  h.activity.items.push({ id: 'booking:core', kind: 'booking', title: 'Saved service', status: 'CONFIRMED', paymentStatus: 'PAYMENT_PENDING', href: '/customer/events/a/bookings' });
  const before = await h.chat(h.customer, { sessionId: 'test-session', message: 'Show my booking status' });
  assert.match(before.reply, /payment pending/);
  h.activity.items[0].paymentStatus = 'PAYMENT_VERIFIED';
  const reloaded = await h.getSession(h.customer, 'test-session');
  assert.equal(reloaded.activity.items[0].paymentStatus, 'PAYMENT_VERIFIED');
  const after = await h.chat(h.customer, { sessionId: 'test-session', message: 'Show my booking status' });
  assert.match(after.reply, /payment verified/);
  assert.equal(after.nextQuestion, null);
  assert.equal(h.calls.llm, 0); assert.equal(h.calls.writes, 0);
});

test('literal service facts continue from stored catalogue data without waiting for model generation', async () => {
  const h = harness({ useLiteralFacts: true });
  const result = await h.chat(h.customer, { sessionId: 'test-session', message: 'I need photography at my hotel' });
  assert.equal(h.calls.llm, 0);
  assert.equal(result.extracted.neededCategories[0], 'photography');
  assert.equal(result.vendorSuggestions.length, 5);
  assert.match(result.reply, /Stored Vendor/);
});
