import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanActions, isValidSessionId, FALLBACK_REPLY } from '../src/external/aura/vendorAura.service.js';
import { buildVendorSystemPrompt } from '../src/external/aura/vendorSystemPrompt.js';
import { registerLlmAdapter, getLlmAdapter } from '../src/external/aura/llmAdapter.js';
import { guardProfile, matchCategory, valueStatedIn } from '../src/external/aura/profileWriter.js';
import { setupSummary, isAutoBusinessName } from '../src/external/aura/vendorContext.js';

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

// ── Profile setup from chat ────────────────────────────────────────────────

test('profile values are saved only when the vendor stated them', () => {
  const msg = 'My business is Shutter Stories, I am a wedding photographer based in Kolkata';
  assert.deepEqual(guardProfile({ businessName: 'Shutter Stories', category: 'Photography', city: 'Kolkata' }, msg), {
    businessName: 'Shutter Stories',
    category: 'Photography',
    location: 'Kolkata',
  });
  // Invented values are dropped.
  assert.deepEqual(guardProfile({ businessName: 'Dream Weddings', city: 'Mumbai', category: 'Catering' }, msg), {});
  assert.deepEqual(guardProfile({ businessName: 'n/a' }, 'n/a'), {});
  assert.deepEqual(guardProfile(null, msg), {});
});

test('category maps what the vendor said onto the allowed list', () => {
  assert.equal(matchCategory('Makeup & Styling', 'main bridal makeup karti hoon'), 'Makeup & Styling');
  assert.equal(matchCategory('DJ & Music', 'we are a DJ team'), 'DJ & Music');
  assert.equal(matchCategory('Decor & Styling', 'Decor & Styling'), 'Decor & Styling');
  assert.equal(matchCategory('Venue', 'I do photography'), null);
  assert.ok(valueStatedIn('Kolkata', 'based in kolkata!'));
});

test('setup summary follows the dashboard checklist order', () => {
  const s = setupSummary({
    completionPercentage: 40,
    checklist: { profile: true, services: true, capabilities: false, locations: true, coverage: false, portfolio: false },
  });
  assert.equal(s.percent, 40);
  assert.equal(s.complete, false);
  assert.deepEqual(s.steps.map((x) => x.done), [true, true, false, false, false]);
  assert.equal(s.nextStep.key, 'capabilities');
  assert.equal(setupSummary(null), null);
  assert.ok(isAutoBusinessName("sourav kumar's Studio"));
  assert.ok(!isAutoBusinessName('Shutter Stories'));
});

test('after a save, re-asked questions are dropped from the model reply', async () => {
  const { withoutQuestions } = await import('../src/external/aura/vendorAura.service.js');
  assert.equal(withoutQuestions('Got it! Which city are you based in?'), 'Got it!');
  assert.equal(withoutQuestions('Which city?'), '');
  assert.equal(withoutQuestions('Nice name. Photography is popular here.'), 'Nice name. Photography is popular here.');
});
