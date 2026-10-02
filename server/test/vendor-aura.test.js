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
  assert.match(prompt, /block dates on the vendor's calendar/);
  assert.match(prompt, /create a new quote for an enquiry\/customer or revise an existing quote/);
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

// ── Setup actions (service / team & gear / location / coverage) ─────────────
test('setup actions use only numbers the vendor said, and need a confirmation', async () => {
  const { validateAction, describeAction, readConfirmation, amountsIn } = await import('../src/external/aura/setupActions.js');
  const vendor = { category: 'Photography', businessName: 'Shutter Stories', location: 'Kolkata' };
  const services = [{ _id: 's1', name: 'Wedding photography', status: 'ACTIVE' }];

  assert.deepEqual(amountsIn('45,000 or 45k or 1.5 lakh or 20 hazar'), [45000, 45000, 150000, 20000]);

  // Model dropped the price → read from what the vendor said; FIXED_PER_EVENT → FIXED.
  const svc = validateAction({ kind: 'service', service: { name: 'Wedding photography', pricingType: 'FIXED_PER_EVENT' } }, { said: 'starting price 45000 per event', vendor, services: [] });
  assert.equal(svc.action.service.basePrice, 45000);
  assert.equal(svc.action.service.pricingType, 'FIXED');
  assert.match(describeAction(svc.action), /₹45,000 per event/);
  // An invented price is rejected.
  assert.equal(validateAction({ kind: 'service', service: { name: 'X', basePrice: 99000 } }, { said: 'price 45000', vendor, services: [] }).error, 'the base price');

  const cap = validateAction({ kind: 'capability', capability: { equipment: ['Sony A7IV'] } }, { said: '4 log hain team mein', vendor, services });
  assert.equal(cap.action.capability.teamSize, 4);
  assert.equal(validateAction({ kind: 'capability', capability: { teamSize: 4 } }, { said: '4 log', vendor, services: [] }).error, 'a service first (add one before team & gear)');

  const cov = validateAction({ kind: 'coverage', coverage: {} }, { said: '30 km tak jaate hain', vendor, services });
  assert.equal(cov.action.coverage.radiusKm, 30);
  assert.equal(cov.action.coverage.city, 'Kolkata');

  const loc = validateAction({ kind: 'location', location: { locality: 'Salt Lake', city: 'Kolkata' } }, { said: 'Studio Salt Lake me hai, Kolkata', vendor, services });
  assert.equal(loc.action.location.address, 'Salt Lake');
  assert.equal(loc.action.location.type, 'STUDIO');

  for (const yes of ['yes', 'haan', 'haan save karo', 'yes please', 'ok', 'हाँ', 'ঠিক আছে', 'confirm update', 'confirm block']) assert.equal(readConfirmation(yes), true, yes);
  for (const no of ['no', 'nahi', 'cancel', 'नहीं']) assert.equal(readConfirmation(no), false, no);
  for (const other of ['make it 30000', 'haan but price 30000 karo', 'what is coverage?']) assert.equal(readConfirmation(other), null, other);
});

test('equipment is read from the vendor message when the model leaves it out', async () => {
  const { equipmentFrom, validateAction } = await import('../src/external/aura/setupActions.js');
  assert.deepEqual(equipmentFrom('team me 3 photographers hain, Canon R6 aur gimbal'), ['Canon R6', 'gimbal']);
  assert.deepEqual(equipmentFrom('We are 5 people. We use Sony FX3, DJI Ronin and lights'), ['Sony FX3', 'DJI Ronin', 'lights']);
  assert.deepEqual(equipmentFrom('team of 2'), []);
  const r = validateAction({ kind: 'capability', capability: { teamSize: 3 } }, { said: 'team me 3 photographers hain, Canon R6 aur gimbal', vendor: {}, services: [{ _id: 's', name: 'Candid', status: 'ACTIVE' }] });
  assert.deepEqual(r.action.capability.equipment, ['Canon R6', 'gimbal']);
});

test('phone, website and about are saved only as the vendor wrote them', () => {
  const msg = 'Call me on 98300 12345, website shutterstories.in. We shoot candid weddings across Bengal';
  assert.deepEqual(guardProfile({ phone: '9830012345', website: 'shutterstories.in', bio: 'We shoot candid weddings across Bengal' }, msg), {
    phone: '+91 9830012345',
    website: 'shutterstories.in',
    bio: 'We shoot candid weddings across Bengal',
  });
  // Invented phone / site / bio are dropped.
  assert.deepEqual(guardProfile({ phone: '9999999999', website: 'fake.com', bio: 'Award winning luxury studio' }, msg), {});
});

test('bio falls back to the vendor’s own line only when Aura asked about their work', async () => {
  const { bioFrom } = await import('../src/external/aura/profileWriter.js');
  assert.equal(bioFrom('Number 98300 12345 hai. We make cinematic wedding films across Bengal'), 'We make cinematic wedding films across Bengal');
  assert.equal(bioFrom('We charge 50000 per event'), null);
  assert.equal(bioFrom('Kolkata'), null);
  assert.deepEqual(guardProfile({}, 'We make cinematic wedding films across Bengal', { bioMissing: false }), {});
  assert.equal(guardProfile({}, 'We make cinematic wedding films across Bengal', { bioMissing: true }).bio, 'We make cinematic wedding films across Bengal');
  // Category from the vendor's words when they have none yet.
  assert.equal(guardProfile({}, 'hum cinematic wedding films banate hain', { categoryMissing: true }).category, 'Cinematic Production');
});

// ── Operational actions: block_date, revise_quote, create_quote ───────────

test('parseDate, dateIn, and reasonFrom correctly extract dates and reasons', async () => {
  const { parseDate, dateIn, reasonFrom } = await import('../src/external/aura/setupActions.js');

  assert.equal(parseDate('2026-10-09'), '2026-10-09');
  assert.equal(parseDate('09-10-2026'), '2026-10-09');
  assert.equal(parseDate('5 October 2026'), '2026-10-05');
  assert.equal(parseDate('October 5'), '2026-10-05');

  assert.equal(dateIn('Please block 09-10-2026 for maintenance'), '2026-10-09');
  assert.equal(dateIn('paanch tarikh ko block kardo'), '2026-10-05');

  assert.equal(reasonFrom('Meri paanch tarikh Ki booking done ho chuki hai manually toh block kardo'), 'Manual Booking');
  assert.equal(reasonFrom('Reason: Vacation for family trip'), 'Vacation for family trip');
  assert.equal(reasonFrom('maintenance ke liye band rahega'), 'Maintenance');
  assert.equal(reasonFrom('Isaka reason edit karo reason birthday party hai.'), 'Birthday Party');
  assert.equal(reasonFrom('reason: birthday party'), 'Birthday Party');
  assert.equal(reasonFrom('change reason to Vacation please'), 'Vacation');
  assert.equal(reasonFrom('reason badal kar Personal work rakh do'), 'Personal work');
  assert.equal(reasonFrom('Meri booking done ho chuki hai manually\nIsaka reason edit karo reason birthday party hai.'), 'Birthday Party');
  assert.equal(reasonFrom('block kar do paanch October'), null);
});

test('block_date action validates date and asks for reason if missing', async () => {
  const { validateAction, describeAction } = await import('../src/external/aura/setupActions.js');

  // Reason missing → prompts for reason/notes
  const missingReason = validateAction(
    { kind: 'block_date', blockout: { date: '2026-10-05' } },
    { said: 'block 5 October' }
  );
  assert.match(missingReason.error, /reason \/ notes/);

  // Both date and reason present
  const valid = validateAction(
    { kind: 'block_date', blockout: { date: '2026-10-09', reason: 'Vacation' } },
    { said: '09-10-2026 block kardo vacation ke liye' }
  );
  assert.equal(valid.action.kind, 'block_date');
  assert.equal(valid.action.blockout.date, '2026-10-09');
  assert.equal(valid.action.blockout.reason, 'Vacation');
  assert.equal(describeAction(valid.action), 'Block calendar date 2026-10-09 — Reason: Vacation');

  // Editing existing blocked date overrides old reason with newly stated reason
  const context = {
    blockedDates: [{ date: '2026-10-05', allDay: true, reason: 'Manual Booking' }],
  };
  const updated = validateAction(
    { kind: 'block_date', blockout: { date: '2026-10-05', reason: 'Manual Booking' } },
    { said: 'Meri booking done ho chuki hai manually\nIsaka reason edit karo reason birthday party hai.', context }
  );
  assert.equal(updated.action.kind, 'block_date');
  assert.equal(updated.action.blockout.date, '2026-10-05');
  assert.equal(updated.action.blockout.reason, 'Birthday Party');
  assert.equal(updated.action.isUpdate, true);
  assert.equal(describeAction(updated.action), 'Update calendar date 2026-10-05 — Reason: Birthday Party');
});

test('revise_quote action validates amounts and matches existing quote', async () => {
  const { validateAction, describeAction } = await import('../src/external/aura/setupActions.js');
  const context = {
    quotes: {
      latest: [
        {
          id: 'q1',
          ref: 'QT-073390-210',
          customer: 'khy',
          service: 'Cinematic Wedding Film & Teaser',
          basePrice: 47000,
          travelFee: 2000,
          total: 49000,
          status: 'submitted',
        },
      ],
    },
  };

  // Missing price
  const missingPrice = validateAction(
    { kind: 'revise_quote', quote: { customerName: 'khy' } },
    { said: 'revise quote for khy', context }
  );
  assert.match(missingPrice.error, /revised amount/);

  // Valid price given
  const valid = validateAction(
    { kind: 'revise_quote', quote: { quoteRef: 'QT-073390-210', customerName: 'khy', basePrice: 50000, travelFee: 2000, totalAmount: 52000, notes: 'Discount applied' } },
    { said: 'khy revise offer 50000 base and 2000 travel', context }
  );
  assert.equal(valid.action.kind, 'revise_quote');
  assert.equal(valid.action.quote.quoteRef, 'QT-073390-210');
  assert.equal(valid.action.quote.customerName, 'khy');
  assert.equal(valid.action.quote.totalAmount, 52000);
  assert.equal(describeAction(valid.action), 'Revise quote QT-073390-210 for khy — Total ₹52,000, Base: ₹50,000, Travel: ₹2,000 (Notes: Discount applied)');
});

test('create_quote action validates customer, service, date, and amounts', async () => {
  const { validateAction, describeAction } = await import('../src/external/aura/setupActions.js');
  const services = [{ _id: 's1', name: 'DJ & Sound', status: 'ACTIVE' }];
  const context = {
    enquiries: {
      open: [
        {
          id: 'opp1',
          customer: 'khy',
          service: 'DJ & Sound',
          eventDate: '2026-11-26',
        },
      ],
    },
  };

  // Valid create_quote
  const valid = validateAction(
    {
      kind: 'create_quote',
      quote: {
        customerName: 'khy',
        serviceName: 'DJ & Sound',
        eventDate: '2026-11-26',
        basePrice: 47000,
        travelFee: 2000,
        totalAmount: 49000,
      },
    },
    { said: 'khy ke liye quotation add karni hai 47000 base aur 2000 travel', services, context }
  );
  assert.equal(valid.action.kind, 'create_quote');
  assert.equal(valid.action.quote.customerName, 'khy');
  assert.equal(valid.action.quote.eventDate, '2026-11-26');
  assert.equal(valid.action.quote.totalAmount, 49000);
  assert.equal(describeAction(valid.action), 'Create quote for khy (DJ & Sound on 2026-11-26) — Total ₹49,000, Base: ₹47,000, Travel: ₹2,000');
});

test('isMessageRelevantToPending distinguishes between confirmations/adjustments and unrelated questions', async () => {
  const { isMessageRelevantToPending } = await import('../src/external/aura/setupActions.js');

  const pendingBlock = {
    kind: 'block_date',
    blockout: { date: '2026-10-05', reason: 'Manual Booking' },
  };

  // Confirmations / cancellations
  assert.equal(isMessageRelevantToPending(pendingBlock, 'yes'), true);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'haan'), true);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'cancel'), true);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'confirm block'), true);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'confirm update'), true);

  // Relevant adjustments / questions
  assert.equal(isMessageRelevantToPending(pendingBlock, 'Isaka reason edit karo reason birthday party hai.'), true);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'date 6 October kardo'), true);
  assert.equal(isMessageRelevantToPending(pendingBlock, '5 October block mat karo 7 October karo'), true);

  // UNRELATED questions - must return false so stale state is dropped!
  assert.equal(isMessageRelevantToPending(pendingBlock, 'meri rating kya hai'), false);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'Current data ke anusaar aapke paas abhi koi ratings ya reviews nahi hain.'), false);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'reviews dikhao'), false);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'enquiries kitni hain'), false);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'aaj kya karna hai'), false);
  assert.equal(isMessageRelevantToPending(pendingBlock, 'payments status kya hai'), false);
});

