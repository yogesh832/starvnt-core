import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseGuests, parseBudget, parseCity, parseStatedNeeds, backfillFacts } from '../src/customer/aura/factBackfill.js';
import { applyGuards } from '../src/customer/aura/extractionGuards.js';
import { nextQuestion } from '../src/customer/services/understanding.js';

const TODAY = '2026-09-25';

test('dates: formats, next occurrence, invalid dropped', () => {
  assert.deepEqual(parseDate('on 26 November', TODAY), { date: '2026-11-26', yearStated: false });
  assert.deepEqual(parseDate('Nov 26', TODAY), { date: '2026-11-26', yearStated: false });
  assert.deepEqual(parseDate('10th Dec 2026', TODAY), { date: '2026-12-10', yearStated: true });
  assert.deepEqual(parseDate('5 March', TODAY), { date: '2027-03-05', yearStated: false });
  assert.equal(parseDate('30 February 2027', TODAY), null);
  assert.equal(parseDate('no date here', TODAY), null);
});

test('guests, budget (not ranges), city', () => {
  assert.equal(parseGuests('500 guests'), 500);
  assert.equal(parseGuests('1,200 log aayenge'), 1200);
  assert.equal(parseBudget('budget is 10 lakh'), 1000000);
  assert.equal(parseBudget('my budget around ₹2.5 lakh'), 250000);
  assert.equal(parseBudget('50 hazaar ka budget'), 50000);
  assert.equal(parseBudget('budget 1 crore'), 10000000);
  assert.equal(parseBudget('budget ₹5–10 Lakh'), null);
  assert.equal(parseBudget('₹5-10 lakh budget'), null);
  assert.equal(parseBudget('I have 10 lakh'), null, 'must be tied to the word budget');
  assert.equal(parseCity('wedding in Kolkata on 5 March'), 'Kolkata');
  assert.equal(parseCity('in New Delhi'), 'New Delhi');
  assert.equal(parseCity('in November'), null);
  assert.equal(parseCity('shaadi 26 December 2026 ko Kolkata mein hai'), 'Kolkata');
  assert.equal(parseCity('party New Delhi me hogi'), 'New Delhi');
  assert.equal(parseCity('December mein shaadi hai'), null);
});

test('stated needs exclude hedged and negated sentences', () => {
  assert.deepEqual(parseStatedNeeds('We need photography and catering.').sort(), ['catering', 'photography']);
  assert.deepEqual(parseStatedNeeds('Maybe we need a DJ.'), []);
  assert.deepEqual(parseStatedNeeds('Shayad photographer chahiye'), []);
  assert.deepEqual(parseStatedNeeds("We don't need decoration."), []);
  assert.deepEqual(parseStatedNeeds('Decorator chahiye'), ['decor']);
});

test('backfill never overrides model values', () => {
  const x = backfillFacts('26 November, 500 guests, budget 10 lakh', { guestCount: 450 }, { today: TODAY });
  assert.equal(x.guestCount, 450);
  assert.equal(x.date, '2026-11-26');
  assert.equal(x.budget, 1000000);
});

test('guards: provided value must be in the message; asked topic counts as mentioned', () => {
  const g1 = applyGuards({ providedCategory: 'venue', providedValue: 'Kisan Palace Gardens' }, 'venue is Kisan Palace').extracted;
  assert.equal(g1.providedCategory, undefined);
  const g2 = applyGuards({ providedCategory: 'venue', providedValue: 'Kisan Palace' }, 'Kisan Palace', { askedTopic: 'requirement.venue' }).extracted;
  assert.equal(g2.providedValue, 'Kisan Palace');
  const g3 = applyGuards({ neededCategories: ['Photographer', 'decoration', 'spaceship'] }, 'need a photographer').extracted;
  assert.deepEqual(g3.neededCategories, ['photography']);
  const g4 = applyGuards({ city: 'not specified', guestCount: -3, date: '2026-13-01' }, 'hi').extracted;
  assert.deepEqual(g4, {});
});

test('clarification asks one question in order and honours skips', () => {
  // Order (prompt §12): type → date → city → guests → venue → area → budget → essentials → service locations.
  const ev = { eventType: 'birthday', status: 'draft', city: null, eventDate: null, guestCount: null, budget: null };
  assert.equal(nextQuestion(null, [], []).topic, 'event.type');
  assert.equal(nextQuestion(ev, [], []).topic, 'event.date');
  assert.match(nextQuestion(ev, [], []).question, /What date are you planning the birthday/);
  assert.equal(nextQuestion({ ...ev, eventDate: '2090-01-01' }, [], []).topic, 'event.city');
  assert.equal(nextQuestion({ ...ev, eventDate: '2090-01-01', city: 'Pune' }, [], []).topic, 'event.guest_count');
  const known = { ...ev, eventDate: '2090-01-01', city: 'Pune', guestCount: 40 };
  assert.equal(nextQuestion(known, [], []).topic, 'requirement.venue');
  assert.equal(nextQuestion({ ...known, location: { venueName: 'Kisan Palace' } }, [], []).topic, 'event.area');
  const skip = [{ field: 'skip:requirement.venue', value: true, state: 'KNOWN' }];
  const q = nextQuestion(known, [], skip);
  assert.equal(q.topic, 'event.budget');
  assert.equal(q.options[0].budgetRange, 'o_under_50k');

  // Service locations are asked for location-sensitive services only, never assumed.
  const all = { ...known, budget: 5000 };
  const handled = ['venue', 'catering', 'decor', 'cake'].map((c) => ({ category: c, status: 'customer_provided' }));
  const makeup = { category: 'makeup', status: 'pending', serviceLocation: { mode: 'unspecified' } };
  const lq = nextQuestion(all, [...handled, makeup], skip);
  assert.equal(lq.topic, 'location.makeup');
  assert.deepEqual(lq.options.map((o) => o.label), ['At the event venue', 'Somewhere else', 'Not decided yet']);
  assert.equal(nextQuestion(all, [...handled, { ...makeup, serviceLocation: { mode: 'custom', place: 'my hotel' } }], skip), null);
});

test('location parsing: venue, short answers, service locations, budget range', async () => {
  const { parseVenue, parseShortAnswer, parseServiceLocations, parseBudgetRange } = await import('../src/customer/aura/factBackfill.js');
  assert.equal(parseVenue('It is at Kisan Palace.'), 'Kisan Palace');
  assert.equal(parseVenue('No, the venue is actually ABC Banquet'), 'ABC Banquet');
  assert.equal(parseVenue('The venue is Kisan Palace. Maybe a DJ.'), 'Kisan Palace');
  assert.equal(parseVenue('Makeup will be at Hotel Hindustan'), null, 'another service is the subject');
  assert.equal(parseVenue('party at 7 pm'), null);
  assert.equal(parseShortAnswer('New Town.', 'event.area'), 'New Town');
  assert.equal(parseShortAnswer('New Town.', 'event.guest_count'), null, 'only for the question just asked');
  assert.equal(parseShortAnswer('Is New Town ok?', 'event.area'), null);
  assert.deepEqual(parseServiceLocations('Makeup will be at my hotel.'), [{ category: 'makeup', mode: 'custom', place: 'my hotel' }]);
  assert.deepEqual(parseServiceLocations('Guests will be picked up from Salt Lake and taken to the venue.'), [
    { category: 'transport', mode: 'custom', pickup: 'Salt Lake', drop: null, dropIsEventLocation: true },
  ]);
  assert.deepEqual(parseServiceLocations('Photography will be at the venue'), [{ category: 'photography', mode: 'event' }]);
  assert.deepEqual(parseBudgetRange('Budget is 10 to 15 lakh.'), { min: 1000000, max: 1500000 });
  assert.deepEqual(parseBudgetRange('5-8 lakh ka budget'), { min: 500000, max: 800000 });
  assert.equal(parseBudgetRange('budget 10 lakh'), null);
});
