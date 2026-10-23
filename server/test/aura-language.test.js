import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationLanguage, localizeAuraQuestion, auraLanguageInstruction } from '../src/common/auraLanguage.js';
import { buildSystemPrompt } from '../src/customer/aura/systemPrompt.js';
import { buildVendorSystemPrompt } from '../src/external/aura/vendorSystemPrompt.js';

const hindi = [{ role: 'user', content: 'मुझे अपनी बेटी की शादी प्लान करनी है।' }];
test('short facts and acknowledgements retain Hindi; an English request switches it', () => {
  for (const answer of ['Delhi', '250', '2026-12-20', 'haan', 'Yes']) assert.equal(conversationLanguage(answer, hindi), 'hi');
  assert.equal(conversationLanguage('Please reply in English now', hindi), 'en');
  assert.equal(conversationLanguage('Mujhe Delhi mein shaadi karni hai'), 'hinglish');
  assert.equal(conversationLanguage('250', [{ role: 'user', content: 'Delhi' }, { role: 'model', content: 'मैं देख रही हूँ। कितने मेहमान आएँगे?' }]), 'hi');
  assert.equal(conversationLanguage('250', [{ role: 'user', content: 'আমার বিয়ের পরিকল্পনা করতে চাই' }]), 'bn');
  assert.match(auraLanguageInstruction('bn'), /Bengali/);
  assert.equal(localizeAuraQuestion({ question: 'When?', topic: 'event.date' }, 'bn').question, 'When?');
});
test('dynamic date, budget and service follow-ups stay in the selected language', () => {
  for (const topic of ['event.type', 'event.date', 'event.city', 'event.guest_count', 'event.area', 'event.budget', 'requirement.venue', 'requirement.photography', 'location.transport']) {
    const q = localizeAuraQuestion({ topic, question: 'English fallback?', options: [] }, 'hi');
    assert.match(q.question, /[\u0900-\u097f]/, topic);
    assert.equal(q.language, 'hi');
    assert.notEqual(localizeAuraQuestion({ topic, question: 'English fallback?', options: [] }, 'hinglish').question, 'English fallback?');
  }
});
test('localized chips preserve structured action values and retain their language', () => {
  const original = { topic: 'requirement.venue', question: 'Do you already have a venue?', options: [{ label: 'Help me find one', message: 'Please help me find a venue' }, { label: 'Skip for now', skipTopic: 'requirement.venue' }] };
  const q = localizeAuraQuestion(original, 'hinglish');
  assert.equal(q.options[1].skipTopic, 'requirement.venue');
  assert.equal(conversationLanguage(q.options[0].message), 'hinglish');
  assert.equal(original.options[1].label, 'Skip for now');
  const budget = localizeAuraQuestion({ topic: 'event.budget', options: [{ label: '₹1–2 lakh', budgetRange: 'one-two' }] }, 'hi');
  assert.equal(budget.options[0].budgetRange, 'one-two');
});
test('customer and vendor prompts use feminine Aura speech without assigning customer gender', () => {
  for (const prompt of [buildSystemPrompt({}), buildVendorSystemPrompt({}), auraLanguageInstruction('hi')]) {
    assert.match(prompt, /सकती|sakti/);
    assert.match(prompt, /gender/);
  }
});

test('multiword area and factual answers do not reset Roman Hindi to English', () => {
  const history = [{ role: 'user', content: 'mere bhai ka birthday hai' }, { role: 'model', content: 'Kis ilaake mein hai?' }];
  for (const answer of ['kapkote bazar ke paas', 'Near The Golden Palace', '15 november shaam 6 baje']) assert.equal(conversationLanguage(answer, history), 'hinglish');
  assert.equal(conversationLanguage('Can you find me another photographer?', history), 'en');
});

test('reported English Tent House conversation ignores earlier assistant language drift', () => {
  const history = [
    {role:'user',content:'Help me complete my profile setup'},
    {role:'model',content:'What service do you offer?'},
    {role:'user',content:'i had already mention i have my own Tent House'},
    {role:'model',content:'Got it. What is the base price?'},
    {role:'user',content:'How do I set my location and coverage area?'},
    {role:'model',content:'Main aapki location aur coverage area set karne mein madad kar sakti hoon.'},
  ];
  assert.equal(conversationLanguage('base price is 30k',history),'en');
  assert.equal(conversationLanguage('Yes, save it',[...history,{role:'model',content:'मैंने कीमत नोट कर ली है।'}]),'en');
  assert.equal(conversationLanguage('30k',[],'hinglish'),'hinglish');
  assert.equal(conversationLanguage('Yes, save it',[],'hi'),'hi');
  assert.equal(conversationLanguage('Please reply in English',[],'hi'),'en');
});
