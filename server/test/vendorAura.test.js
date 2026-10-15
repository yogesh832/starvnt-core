import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupFallback, FALLBACK_REPLY, listSessions } from '../src/external/aura/vendorAura.service.js';
import { VendorAuraSession } from '../src/external/models/VendorAura.js';
import { guardProfile } from '../src/external/aura/profileWriter.js';
import { createGeminiAdapter } from '../src/external/aura/geminiAdapter.js';

test('listing Aura history scopes the session query to the authenticated vendor before reading messages', async (t) => {
  const vendor = { _id: 'vendor-a' };
  let requestedVendor;
  t.mock.method(VendorAuraSession, 'aggregate', async (pipeline) => {
    requestedVendor = pipeline[0]?.$match?.vendor;
    // The test store contains histories from two different vendors.
    return [
      { vendor: 'vendor-a', sessionId: 'session-a' },
      { vendor: 'vendor-b', sessionId: 'session-b' },
    ].filter((row) => row.vendor === requestedVendor).map(({ sessionId }) => ({ sessionId }));
  });
  const result = await listSessions({ vendor });
  assert.equal(requestedVendor, vendor._id);
  assert.deepEqual(result.sessions, [{ sessionId: 'session-a' }]);
});

test('the reported Hinglish photography message gets actionable setup guidance during an outage', () => {
  const message = 'Mera photography ka business hai';
  const result = setupFallback(message, { category: 'Photography' }, {});
  assert.match(result.reply, /Photography/);
  assert.match(result.reply, /business name/);
  assert.match(result.reply, /city/);
  assert.doesNotMatch(result.reply, /Saved|latest numbers/);
  assert.equal(result.actions[0].to, '/vendor/profile');
  assert.deepEqual(guardProfile({}, message, { categoryMissing: true }), { category: 'Photography' });
});

test('setup guidance uses the actual next incomplete step without claiming activation', () => {
  const result = setupFallback('Help me complete my profile setup', {
    businessName: 'Lens House', category: 'Photography', location: 'Delhi',
  }, { profileSetup: { steps: [{ kind: 'profile', done: true }, { kind: 'services', done: false }] } });
  assert.match(result.reply, /service with a price/);
  assert.equal(result.actions[0].to, '/vendor/services');
  assert.doesNotMatch(result.reply, /you (?:are|can now be) (?:matched|active)|ready for enquiries/i);
});

test('provider outages retain pending confirmation and do not fabricate operational answers', () => {
  const pending = { kind: 'block_date', blockout: { date: '2026-10-20', reason: 'Holiday' } };
  assert.match(setupFallback('change this', {}, {}, pending).reply, /confirmation is still pending.*2026-10-20/);
  assert.equal(setupFallback('What is my rating?', {}, {}).reply, FALLBACK_REPLY);
});

test('settlement queries during an outage return verified numbers from context and payment action', () => {
  const context = {
    settlements: {
      settledAmount: 45000,
      pendingSettlementAmount: 15000,
      expectedReceivables: 20000,
    },
  };
  const result = setupFallback('Mera settlement status kya hai?', {}, context);
  assert.match(result.reply, /Total Settled is ₹45,000/);
  assert.match(result.reply, /Pending Settlement is ₹15,000/);
  assert.equal(result.actions[0].to, '/vendor/payments');
  assert.equal(result.actions[0].label, 'Payments & Settlements');
});

test('a missing routed model tries the default model, while auth errors stop immediately', async () => {
  const calls = [];
  const client = { models: { async generateContent({ model }) {
    calls.push(model);
    if (model === 'missing-model') throw Object.assign(new Error('Model not found'), { status: 404 });
    return { text: JSON.stringify({ reply: 'What is your brand name?' }) };
  } } };
  const result = await createGeminiAdapter({ client }).chat({ message: 'Photography', model: 'missing-model' });
  assert.equal(result.text, 'What is your brand name?');
  assert.ok(calls.length >= 2);
  let authCalls = 0;
  const denied = createGeminiAdapter({ client: { models: { async generateContent() {
    authCalls += 1;
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  } } } });
  await assert.rejects(denied.chat({ message: 'Hi', model: 'missing-model' }), /Forbidden/);
  assert.equal(authCalls, 1);
});

test('an empty provider answer recovers on the next model', async () => {
  const client = { models: { async generateContent({ model }) {
    return { text: JSON.stringify({ reply: model === 'empty-model' ? '' : 'Recovered' }) };
  } } };
  const result = await createGeminiAdapter({ client }).chat({ message: 'Hi', model: 'empty-model' });
  assert.equal(result.text, 'Recovered');
});

test('a failed partial stream is not retried and appended to the visible reply', async () => {
  let calls = 0;
  const client = { models: { async *generateContentStream() {
    calls += 1;
    yield { text: '{"reply":"Hello' };
    throw Object.assign(new Error('Connection lost'), { status: 503 });
  } } };
  const chunks = [];
  await assert.rejects(createGeminiAdapter({ client }).chat({
    message: 'Hi', model: 'stream-model', onChunk: (chunk) => chunks.push(chunk),
  }), /Connection lost/);
  assert.equal(calls, 1);
  assert.ok(chunks.join('').includes('Hello'));
});
