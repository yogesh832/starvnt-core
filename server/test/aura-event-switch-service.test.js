import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as navigation from '../src/customer/aura/eventSwitch.js';
import * as language from '../src/common/auraLanguage.js';

function harness() {
  const events = [
    { _id: 'a'.repeat(24), title: 'My birthday', eventType: 'birthday', city: 'Delhi', status: 'draft' },
    { _id: 'b'.repeat(24), title: 'My wedding', eventType: 'wedding', city: 'Mumbai', status: 'draft' },
    { _id: 'c'.repeat(24), title: 'Family wedding', eventType: 'wedding', city: 'Jaipur', status: 'draft' },
  ];
  const session = { customer: 'owner', event: events[0]._id, previousEvent: null, switchChoices: [] };
  const messages = [];
  const calls = { writes: 0, llm: 0, scope: [] };
  const repo = {
    findSession: async () => ({ ...session }),
    setSessionEvent: async (_sid, eventId) => { if (eventId !== session.event) { session.previousEvent = session.event; session.event = eventId; } session.switchChoices = []; },
    setSwitchChoices: async (_sid, ids) => { session.switchChoices = ids; },
    recentMessages: async () => messages.slice(-12), listMessages: async () => messages,
    addMessages: async (_sid, rows) => { messages.push(...rows); },
  };
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  const modules = {
    '../repositories/aura.repo.js': repo,
    './coreClient.js': {
      listEvents: async owner => { assert.equal(owner, 'owner'); return structuredClone(events); },
      getEvent: async (owner, id) => { calls.scope.push(owner); return owner === 'owner' ? structuredClone(events.find(event => event._id === id)) : null; },
      listRequirements: async () => [], listContext: async () => [],
      patchEventFacts() { calls.writes++; throw new Error('Event navigation must not write facts'); },
      createDraftEvent() { calls.writes++; throw new Error('Event navigation must not create a draft'); },
    },
    './llmAdapter.js': { getLlmAdapter: () => { calls.llm++; throw new Error('Switching must not depend on the model'); } },
    './contextBuilder.js': {}, './systemPrompt.js': {}, './extractionGuards.js': {}, './factBackfill.js': {}, './extractionWriter.js': {},
    '../services/understanding.js': { buildUnderstanding: event => ({ facts: { title: event.title } }), nextQuestion: () => ({ topic: 'event.date', question: 'When is the event?' }), serializeEvent: event => ({ ...event, id: event._id }) },
    '../services/planCatalog.js': {}, '../utils/http.js': { notFound: message => httpError(404, message), forbidden: message => httpError(403, message), badRequest: (_code, message) => httpError(400, message) },
    '../../common/auraRouter.js': {}, '../../common/streamUtils.js': { createPerformanceTracker: () => ({}) },
    '../../common/auraLanguage.js': language, './eventSwitch.js': navigation,
  };
  const code = transformSync(readFileSync(new URL('../src/customer/aura/aura.service.js', import.meta.url), 'utf8'), { format: 'cjs', loader: 'js' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert.ok(modules[name], name); return modules[name]; }, module, module.exports);
  return { ...module.exports, events, session, messages, calls, customer: { _id: 'owner' } };
}

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
