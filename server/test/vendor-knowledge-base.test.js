import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VENDOR_KNOWLEDGE_COUNT, shouldHandoffToAura, vendorKnowledgeAnswer } from '../src/external/aura/vendorKnowledgeBase.js';

test('vendor help has broad, deterministic coverage of shipped workflows', () => {
  assert.ok(VENDOR_KNOWLEDGE_COUNT >= 50);
  for (const [question, expected] of [
    ['Where do I add a service?', 'services-add'],
    ['How can I upload portfolio photos?', 'portfolio-add'],
    ['How do I see my payments?', 'payments-list'],
    ['How do I reply to reviews?', 'reviews-reply'],
    ['Where can I see my bookings?', 'bookings-list'],
  ]) {
    assert.equal(vendorKnowledgeAnswer(question)?.id, expected, question);
  }
});

test('review, action and next-step messages bypass the knowledge base', () => {
  for (const question of [
    'Review my quote',
    'What is the next step for my booking?',
    'Help me complete my profile setup',
    'Please add a service for me',
    'What is the status of my booking?',
  ]) {
    assert.equal(shouldHandoffToAura(question), true, question);
    assert.equal(vendorKnowledgeAnswer(question), null, question);
  }
});

test('unknown product questions do not invent a knowledge answer', () => {
  assert.equal(vendorKnowledgeAnswer('What is the guaranteed payout date?'), null);
  assert.equal(vendorKnowledgeAnswer('hello'), null);
});
