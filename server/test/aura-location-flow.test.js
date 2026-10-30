import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextQuestion } from '../src/customer/services/understanding.js';

test('Aura requires a saved map point even when an event city is already known', () => {
  const event = {
    _id: 'event-1', status: 'draft', eventType: 'wedding', eventDate: new Date('2026-11-07'),
    city: 'Kapkot', location: { coordinates: { lat: null, lng: null } },
  };
  const question = nextQuestion(event, [], []);
  assert.equal(question.topic, 'event.city');
  assert.match(question.question, /exact event location near Kapkot/i);
  assert.deepEqual(question.options, []);
});

test('Aura proceeds past location after an event map point is saved', () => {
  const event = {
    _id: 'event-1', status: 'draft', eventType: 'wedding', eventDate: new Date('2026-11-07'),
    city: 'Kapkot', location: { coordinates: { lat: 29.92, lng: 79.97 } },
  };
  assert.equal(nextQuestion(event, [], []).topic, 'event.guest_count');
});
