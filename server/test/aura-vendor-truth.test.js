import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as plan from '../src/customer/services/planCatalog.js';
import { isVendorRequest, isCatalogLookupOnly, selectVendorRows, vendorPrice, vendorTruthReply } from '../src/customer/aura/vendorTruth.js';

function load(path, modules) {
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)(name => { assert.ok(modules[name], name); return modules[name]; }, module, module.exports);
  return module.exports;
}

test('catalogue discovery retains every real matching service including planners and honest pricing', async () => {
  const real = Array.from({ length: 6 }, (_, i) => ({ service: { _id: `s${i}`, category: i === 5 ? 'Event Planning' : 'Photography', name: `Package ${i}`, pricing: { pricingType: i === 1 ? 'PER_PERSON' : 'FIXED', basePrice: i === 1 ? 850 : 1000 + i, unit: i === 1 ? 'guest' : 'event' } }, vendor: { _id: `v${i}`, businessName: `API Vendor ${i}` } }));
  const service = load('../src/customer/services/catalog.service.js', {
    '../repositories/catalog.repo.js': { listBookableServices: async () => real, listDemoListings: async () => [{ externalRef: 'fake', vendorName: 'Legacy demo', category: 'photography' }], vendorCommitments: async () => ({ blocked: new Set(['v0']), booked: new Set(['v2']) }), catalogPlaces: async () => ['Kapkote', 'New Town'] },
    '../repositories/commerce.repo.js': { bookedOptionDates: async () => [] }, './planCatalog.js': plan, '../utils/http.js': {},
  });
  const noDate = await service.auraCatalogOptions({ city: 'Kapkote' });
  assert.equal(noDate.length, 6);
  assert.ok(noDate.some(row => row.category === 'event_planning'));
  assert.equal(noDate.find(row => row.id === 'vs_s1').price, null);
  assert.equal(noDate.find(row => row.id === 'vs_s1').basePrice, 850);
  assert.ok(noDate.every(row => !row.isDemo && row.availability === 'no_event_date'));
  const dated = await service.auraCatalogOptions({ _id: 'event', city: 'Kapkote', guestCount: 100, eventDate: '2027-12-20' });
  assert.equal(dated.find(row => row.id === 'vs_s1').price, 85000);
  assert.equal(dated.find(row => row.id === 'vs_s0').availability, 'blocked');
  assert.equal(dated.find(row => row.id === 'vs_s2').availability, 'booked');
  assert.equal(await service.catalogLocationHint('show vendors in kapkote'), 'Kapkote');
  assert.equal(await service.catalogLocationHint('show New Town photographers'), 'New Town');
});

test('draft and no-event prompts receive the full catalogue rather than only required categories', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ vendorId: String(i), vendor: `Stored ${i}`, category: 'photography' }));
  const context = load('../src/customer/aura/contextBuilder.js', {
    './coreClient.js': { readActivity: async () => null, listRequirements: async () => [{ category: 'venue', status: 'customer_provided', preferences: {} }], listContext: async () => [], listEvents: async () => [], vendorCatalog: async () => rows },
    '../services/dates.js': { todayISO: () => '2026-10-19' }, '../services/planCatalog.js': plan,
    '../services/understanding.js': { buildContextStates: () => ({}), progressOf: () => ({}), eventTypeLabelOf: event => event.eventType, locationLabel: event => event?.city || '', serviceLocationText: () => '' }, '../services/summary.js': {},
  });
  for (const event of [null, { _id: 'draft', status: 'draft', city: 'Kapkote', eventType: 'birthday' }]) {
    const result = await context.buildContext({ customer: {}, event });
    assert.equal(result.prompt.vendors.length, 7);
    assert.equal(result.prompt.vendorSearch.source, 'customer_catalog_api');
  }
});

test('vendor results use exact stored names and amounts, distinguish base rates, and never infer availability', () => {
  const rows = [{ vendorId: 'one', vendor: 'Stored Studio', package: 'Photography', category: 'photography', price: 22000, availability: 'blocked' }, { vendorId: 'two', vendor: 'Stored Caterer', package: 'Feast', category: 'catering', price: null, basePrice: 850, unit: 'guest', availability: 'no_event_date' }];
  const reply = vendorTruthReply(rows, { city: 'Kapkote' });
  assert.match(reply, /Stored Studio/); assert.match(reply, /22,000/); assert.match(reply, /850 \/ guest; total not confirmed/);
  assert.match(reply, /Availability needs an event date/);
  assert.equal(selectVendorRows(rows, 'Show photographers').length, 1);
  assert.equal(selectVendorRows(rows, 'फोटोग्राफर दिखाओ').length, 1);
  assert.deepEqual(plan.categoriesMentioned('Show DJ prices'), ['sound']);
  assert.match(vendorPrice({ ...rows[0], requiresVendorConfirmation: true }), /needs vendor confirmation/);
  assert.match(vendorTruthReply([], { city: 'Kapkote' }), /no matching active services/);
});

test('service discovery is separated from booking truth and already arranged services', () => {
  assert.equal(isVendorRequest('What vendors are available in Kapkote?'), true);
  assert.equal(isCatalogLookupOnly('Show catering prices in Kapkote'), true);
  assert.equal(isVendorRequest('I already have a venue'), false);
  assert.equal(isVendorRequest('How much have I paid the photographer?'), false);
});
