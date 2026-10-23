import { activityAnswer } from '../src/common/auraActivityAnswer.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { backfillFacts, parseProvidedCategories, parseCity } from '../src/customer/aura/factBackfill.js';
import { isCatalogLookupOnly, selectVendorRows, vendorTruthReply } from '../src/customer/aura/vendorTruth.js';

const requirement = 'mere bhai ka birthday hai, 15 november ko kapkote me ghar par. 50 log honge aur budget 30 hazaar hai. khana aur decoration hum kar lenge, bas photo aur video wala chahiye';
test('language instructions never overwrite event location in a full brief or short answer', () => {
  const brief = 'Date 2026-11-15 hai. Kapkote Uttarakhand, main market ke paas mere ghar par event hai. 50 guests hain aur budget 50000 rupees hai. Roman Hindi mein baat karo.';
  assert.equal(parseCity(brief), 'Kapkote');
  assert.equal(backfillFacts(brief, {}, { askedTopic: 'event.date' }).city, 'Kapkote');
  for (const text of ['Roman Hindi mein baat karo', 'Reply in Roman Hindi', 'Hindi mein bolo']) {
    assert.equal(parseCity(text), null);
    assert.equal(backfillFacts(text, {}, { askedTopic: 'event.city' }).city, undefined);
  }
  assert.equal(parseCity('in New Delhi, reply in English'), 'New Delhi');
});
test('a single Roman Hindi requirement retains the birthday and facts even with empty model extraction', () => {
  const x = backfillFacts(requirement, {}, { askedTopic: 'event.type', today: '2026-10-20' });
  assert.equal(x.eventType, 'birthday'); assert.equal(x.date, '2026-11-15');
  assert.equal(x.guestCount, 50); assert.equal(x.budget, 30000);
  assert.deepEqual(x.neededCategories, ['photography']);
  assert.deepEqual(new Set(x.providedCategories), new Set(['venue', 'catering', 'decor']));
  assert.equal(x.venueName, 'ghar');
});
test('mixed planning/search statements are saved, while pure catalogue questions stay read-only', () => {
  assert.equal(isCatalogLookupOnly(`${requirement}. photographer dhoondho`), false);
  assert.equal(isCatalogLookupOnly('Show birthday photography prices in Kapkote for 50 guests'), true);
  assert.equal(isCatalogLookupOnly('What photographers are free on 15 November?'), true);
  assert.deepEqual(parseProvidedCategories('shayad khana hum kar lenge?'), []);
});
test('vendor results exclude self-arranged services in a combined requirement', () => {
  const rows = ['decor', 'photography', 'catering', 'venue'].map(category => ({ category, vendor: `Stored ${category}`, price: 100 }));
  assert.deepEqual(selectVendorRows(rows, requirement).map(row => row.category), ['photography']);
});
test('all explicitly self-arranged services are persisted without being marked needed again', async () => {
  const calls = [];
  const code = transformSync(readFileSync(new URL('../src/customer/aura/extractionWriter.js', import.meta.url), 'utf8'), { format: 'cjs' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === './coreClient.js' ? { applyServiceStatement: async (_owner, _event, category, statement) => { calls.push({ category, ...statement }); return { applied: true }; } } : { HttpError: class extends Error {} }, module, module.exports);
  await module.exports.writeExtraction({ customerId: 'owner', event: { _id: 'event', status: 'draft' }, extracted: { providedCategories: ['venue', 'catering', 'decor'], neededCategories: ['photography', 'decor'] } });
  assert.deepEqual(calls.filter(row => row.kind === 'provided').map(row => row.category), ['venue', 'catering', 'decor']);
  assert.deepEqual(calls.filter(row => row.kind === 'needed').map(row => row.category), ['photography']);
});

test('comma-separated self-arranged services retain the whole list without swallowing an explicit need', () => {
  assert.deepEqual(new Set(parseProvidedCategories('venue, catering, decoration aur cake maine khud arrange kar liye hain. Photography chahiye.')),new Set(['venue','catering','decor','cake']));
  assert.deepEqual(parseProvidedCategories('photography chahiye, catering maine khud arrange kar liye hain'),['catering']);
  assert.deepEqual(parseProvidedCategories('catering maine khud arrange kar liye hain, photography chahiye'),['catering']);
  assert.deepEqual(parseProvidedCategories('venue, catering, decoration shayad maine arrange kar liye hain?'),[]);
});

test('Roman Hindi enquiry requests are actions and guide the chosen package rather than report empty activity', () => {
  const query = '18 hazaar wala Birthday Party Candid aur 4K Reel package sahi lag raha hai. iske vendor se baat kaise hogi? enquiry bhejni hai';
  assert.equal(activityAnswer(query, { items: [], counts: {} }, 'hinglish'), null);
  const rows = [{ vendor: 'Stored birthday studio', package: 'Birthday Party Candid & 4K Reel Package', price: 18000 }, { vendor: 'Other studio', package: 'Instant Polaroid Corner & Mini Photo Book', price: 12000 }];
  const selected = selectVendorRows(rows, query);
  assert.equal(selected.length, 1); assert.equal(selected[0].price, 18000);
  assert.deepEqual(selectVendorRows([rows[1]], query), [], 'A missing requested package must not return unrelated services');
  assert.match(vendorTruthReply(selected, { _id: 'event', city: 'Kapkote', status: 'planning' }, 'hinglish', query), /Select & enquire/);
  assert.doesNotMatch(vendorTruthReply(selected, { _id: 'event', status: 'planning' }, 'hinglish', query), /enquiry bhej di/);
});
