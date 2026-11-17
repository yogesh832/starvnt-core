import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryItems, safeContractLink, savedOptionLink } from '../src/pages/customer/libraryState.js';
import { notificationTarget, updateCategory, withoutDuplicateMessages, belongsToEvent } from '../src/pages/customer/updateState.js';
import { routeEventId, resolveCurrentEvent } from '../src/pages/customer/eventContext.js';

test('event-scoped library URLs determine the shell context and isolate inaccessible IDs', () => {
  for (const path of ['/customer/documents', '/customer/favorites', '/customer/updates', '/customer/reminders']) {
    assert.equal(routeEventId(path, '?event=a'), 'a');
    assert.equal(resolveCurrentEvent([{ id: 'b' }], 'b', path, '?event=a'), null);
  }
  assert.equal(routeEventId('/customer/favorites', '?event=global'), null);
});

test('library filtering distinguishes saved global references and event selections', () => {
  const rows = [{ id: 'global', vendorName: 'Studio', source: 'customer' }, { id: 'a', event: { id: 'a' }, source: 'selected_option' }, { id: 'b', event: { id: 'b' }, source: 'customer' }];
  assert.deepEqual(libraryItems(rows, { eventId: 'global' }).map(row => row.id), ['global']);
  assert.deepEqual(libraryItems(rows, { eventId: 'a', source: 'selected' }).map(row => row.id), ['a']);
  assert.deepEqual(libraryItems(rows, { source: 'saved', search: 'STUDIO' }).map(row => row.id), ['global']);
});
test('secure external file links never accept executable, credentialed or insecure targets', () => {
  assert.equal(safeContractLink('https://files.example.test/a.pdf'), 'https://files.example.test/a.pdf');
  for (const value of ['javascript:alert(1)', '//evil.test', 'http://example.test', 'https://user:secret@example.test/a']) assert.equal(safeContractLink(value), null);
  assert.equal(savedOptionLink({ optionId: 'vs_123' }, 'event'), '/customer/events/event/services/vs_123');
  assert.equal(savedOptionLink({ optionId: 'vs_123' }, ''), null);
});
test('update destinations retain exact quote and proposal links without crossing events', () => {
  const target = '/customer/events/a/quotes?quote=exact-version#offer';
  assert.equal(notificationTarget({ eventId: 'a', to: target }), target);
  assert.equal(notificationTarget({ eventId: 'a', to: '/customer/proposals?event=a&proposal=p' }), '/customer/proposals?event=a&proposal=p');
  assert.equal(notificationTarget({ eventId: 'a', to: '/customer/events/b/bookings' }), '/customer/events/a');
  assert.equal(notificationTarget({ eventId: 'a', to: '/customer/proposals?event=b&proposal=p' }), '/customer/events/a');
});
test('update destinations reject external and encoded redirect paths', () => {
  for (const to of ['//evil.test', 'https://evil.test', 'javascript:alert(1)', '/customer/\\evil.test', '/customer%2f%2fevil.test', '/customer/events/a/../../outside']) assert.equal(notificationTarget({ eventId: 'a', to }), '/customer/events/a');
});
test('message deduplication uses saved source identity, never matching text from different events', () => {
  const messages = [{ id: 'one', body: 'Same text', eventId: 'a' }, { id: 'two', body: 'Same text', eventId: 'b' }];
  assert.equal(withoutDuplicateMessages(messages, [{ title: 'Same text' }]).length, 2);
  assert.deepEqual(withoutDuplicateMessages(messages, [{ sourceType: 'event_message', sourceId: 'one' }]).map(row => row.id), ['two']);
  assert.equal(belongsToEvent(messages[0], 'b'), false);
});
test('promotional classification requires an explicit type rather than promotional words', () => {
  assert.equal(updateCategory({ type: 'payment', body: 'Offer discount' }), 'Transactional');
  assert.equal(updateCategory({ type: 'promotion' }), 'Promotional');
  assert.equal(updateCategory({ type: 'aura_suggestion' }), 'Aura+');
  assert.equal(updateCategory({ type: 'system' }), 'Operational');
});
