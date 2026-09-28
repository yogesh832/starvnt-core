import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanActions, isValidSessionId, FALLBACK_REPLY } from '../src/external/aura/vendorAura.service.js';
import { buildVendorSystemPrompt } from '../src/external/aura/vendorSystemPrompt.js';
import { registerLlmAdapter, getLlmAdapter } from '../src/external/aura/llmAdapter.js';

test('cleanActions keeps only known vendor pages, max 3, no duplicates', () => {
  const out = cleanActions([
    { label: 'Open quotes', to: '/vendor/quotes' },
    { label: 'Evil', to: 'https://evil.example/vendor/quotes' },
    { label: 'Admin', to: '/admin/users' },
    { label: 'Unknown page', to: '/vendor/secret' },
    { label: 'Quotes again', to: '/vendor/quotes/' },
    { label: '', to: '/vendor/bookings' },
    { label: 'Bookings', to: '/vendor/bookings' },
    { label: 'Reviews', to: '/vendor/reviews' },
    { label: 'Profile', to: '/vendor/profile' },
  ]);
  assert.deepEqual(out, [
    { label: 'Open quotes', to: '/vendor/quotes' },
    { label: 'Bookings', to: '/vendor/bookings' },
    { label: 'Reviews', to: '/vendor/reviews' },
  ]);
  assert.deepEqual(cleanActions(null), []);
  assert.equal(cleanActions([{ label: 'x'.repeat(80), to: '/vendor/dashboard' }])[0].label.length, 40);
});

test('session ids must be 8-80 safe characters', () => {
  assert.ok(isValidSessionId('abcd1234'));
  assert.ok(isValidSessionId('7f1c2a9e-4b1d-4c7e-9a0b-123456789abc'));
  assert.ok(!isValidSessionId('short'));
  assert.ok(!isValidSessionId('../../etc/passwd'));
  assert.ok(!isValidSessionId(undefined));
});

test('system prompt carries the rules and CURRENT DATA', () => {
  const prompt = buildVendorSystemPrompt({ today: '2026-09-28', enquiries: { newCount: 3 } });
  assert.match(prompt, /Answer only from CURRENT DATA/);
  assert.match(prompt, /never send, approve or edit quotes/);
  assert.match(prompt, /CURRENT DATA:\n\{"today":"2026-09-28","enquiries":\{"newCount":3\}\}/);
});

test('a registered adapter replaces Gemini', async () => {
  registerLlmAdapter({ chat: async () => ({ text: 'hi', actions: [] }) });
  assert.deepEqual(await getLlmAdapter().chat({}), { text: 'hi', actions: [] });
  assert.ok(FALLBACK_REPLY.length > 0);
});
