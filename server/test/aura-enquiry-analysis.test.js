import { serviceRequirementSummary } from '../src/customer/services/enquiryBrief.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enquiryAnswer } from '../src/external/aura/enquiryAnswer.js';
import { activityAnswer } from '../src/common/auraActivityAnswer.js';
import { backfillFacts } from '../src/customer/aura/factBackfill.js';
test('vendor analysis treats Sunday as a normal event date without claiming a booking', () => {
  const text = 'meri nayi enquiry ki customer ki requirement aur availability detail batao';
  assert.equal(activityAnswer(text, { items: [] }, 'hinglish'), null);
  const context = { activity: { counts: { quotes: 0, bookings: 0 } }, business: { workingHours: { Sunday: { isOpen: false } } }, enquiries: { open: [{ id: 'owned', customer: 'Ananya Sharma', eventDate: '2026-11-15', guests: 50, service: 'Birthday Reel', status: 'new', place: 'Kapkote', requirement: 'shaam 6 se 9 baje' }] } };
  const result = enquiryAnswer(text, context, 'hinglish');
  for (const fact of ['Ananya Sharma', '2026-11-15', '50 guests', 'Kapkote', 'shaam 6 se 9 baje']) assert.ok(result.reply.includes(fact), fact);
  assert.match(result.reply, /Enquiry booking nahi hai/);
  for (const language of ['en', 'hi', 'hinglish']) {
    const answer = enquiryAnswer(text, context, language);
    assert.doesNotMatch(answer.reply, /Sunday|closed|special arrangement|विशेष व्यवस्था/);
    assert.ok(!answer.actions.some(action => action.to === '/vendor/availability'));
  }
  assert.ok(result.actions.some(action => action.to === '/vendor/enquiries'));
  assert.match(enquiryAnswer(`${text}, quote ya booking hui?`, context, 'hinglish').reply, /Saved quotes: 0 · bookings: 0/);
  assert.equal(enquiryAnswer('Please make a quote', context), null);
});
test('the original service timing remains in the saved customer brief without inferring a time zone or confirmed hours', () => {
  const text = 'cake bhi hum kar lenge. photography ghar par hi chahiye, shaam 6 se 9 baje. birthday ki candid photos aur ek chhota video chahiye';
  const facts = backfillFacts(text, {});
  assert.equal(facts.serviceBriefs.length, 1);
  assert.equal(facts.serviceBriefs[0].category, 'photography');
  assert.match(facts.serviceBriefs[0].brief, /shaam 6 se 9 baje/);
  assert.match(facts.serviceBriefs[0].brief, /chhota video/);
  assert.doesNotMatch(facts.serviceBriefs[0].brief, /18:00|21:00|confirmed|cake/);
});

test('the enquiry brief retains the original timing alongside the saved package and guests', () => {
  const summary = serviceRequirementSummary({ preferences: { customerBrief: 'photography ghar par hi chahiye, shaam 6 se 9 baje', style: 'Candid' }, specialRequirements: 'short video' }, { packageName: 'Birthday Reel' }, { guestCount: 50 });
  for (const fact of ['Birthday Reel', 'shaam 6 se 9 baje', 'Candid', 'short video', '50 guests']) assert.ok(summary.includes(fact));
});

test('enquiry commercial status is scoped and unrelated business totals cannot masquerade as this lead', () => {
  const context = { activity: { counts: { quotes: 15, bookings: 7 } }, enquiries: { open: [
    { id: 'one', customer: 'Ananya Sharma', service: 'Birthday', status: 'new', commercial: { quotes: 0, bookings: 0 } },
    { id: 'two', customer: 'Rahul Verma', service: 'Wedding', status: 'new', commercial: { quotes: 2, bookings: 1 } },
  ] } };
  const result = enquiryAnswer('Ananya ki enquiry detail aur quote booking status', context, 'hinglish');
  assert.match(result.reply, /Saved quotes: 0 · bookings: 0/);
  assert.doesNotMatch(result.reply, /Rahul|15|7/);
  delete context.enquiries.open[0].commercial;
  assert.match(enquiryAnswer('Ananya ki enquiry detail aur quote booking status', context, 'hinglish').reply, /exact quote\/booking status abhi available nahi/);
});
test('profile and calendar blockers have actionable guidance without changing eligibility or promising availability', () => {
  const context = { business: { matchingEligible: false, missingForActivation: ['Verified bank document'], workingHours: { Sunday: { isOpen: false } } }, profileSetup: { complete: false }, blockedDates: [{ date: '2026-11-15', allDay: true }], enquiries: { open: [{ id: 'one', customer: 'Ananya Sharma', eventDate: '2026-11-15', status: 'new' }] } };
  const before = JSON.stringify(context);
  const result = enquiryAnswer('Ananya ki enquiry availability detail', context, 'hinglish');
  assert.match(result.reply, /Verified bank document/); assert.match(result.reply, /saved blockout/); assert.match(result.reply, /incomplete/);
  assert.ok(result.actions.some(action => action.to === '/vendor/profile'));
  assert.ok(result.actions.some(action => action.to === '/vendor/availability'));
  assert.equal(JSON.stringify(context), before);
});
test('an unmatched named customer does not return a different customer, and malformed dates do not crash the answer', () => {
  const context = { enquiries: { open: [{ id: 'one', customer: 'Ananya Sharma', eventDate: 'not-a-date', status: 'new' }] } };
  assert.doesNotMatch(enquiryAnswer('Rahul ki enquiry detail batao', context, 'hinglish').reply, /Ananya/);
  assert.doesNotThrow(() => enquiryAnswer('Ananya ki enquiry detail batao', context));
});
