import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventStorageKey, latestRequestGate, resolveCurrentEvent, routeEventId } from '../src/pages/customer/eventContext.js';
import { nextHomeAction, pendingEventProposals } from '../src/pages/customer/homeActions.js';
import { portalSignupUrl } from '../src/lib/portalAccess.js';

const events = [{ id: 'a', status: 'completed' }, { id: 'b', status: 'planning' }, { id: 'c', status: 'draft' }];
test('an owned event URL overrides the browser preference on every nested event page', () => {
  assert.equal(resolveCurrentEvent(events, 'b', '/customer/events/c/quotes').id, 'c');
  assert.equal(resolveCurrentEvent(events, 'b', '/customer/events/a/history').id, 'a');
});
test('an unknown event URL cannot display another owned event in its header', () => {
  assert.equal(resolveCurrentEvent(events, 'b', '/customer/events/another-customers-event/bookings'), null);
});
test('Aura event links establish the same owned context as nested event pages', () => {
  assert.equal(resolveCurrentEvent(events, 'b', '/customer/aura', '?event=c').id, 'c');
  assert.equal(resolveCurrentEvent(events, 'b', '/customer/aura', '?event=other'), null);
});
test('new event and global views retain explicit selection or choose an active event', () => {
  assert.equal(routeEventId('/customer/events/new'), null);
  assert.equal(resolveCurrentEvent(events, 'c', '/customer/events/new').id, 'c');
  assert.equal(resolveCurrentEvent(events, 'deleted', '/customer').id, 'b');
  assert.equal(resolveCurrentEvent([], 'b', '/customer'), null);
  assert.equal(resolveCurrentEvent([events[0]], null, '/customer').id, 'a');
});
test('customer event preferences use independent keys and cannot use a guest global key', () => {
  assert.notEqual(eventStorageKey('customer-a'), eventStorageKey('customer-b'));
  assert.equal(eventStorageKey(null), null);
});
test('a later refresh and unmount both invalidate pending event responses', async () => {
  const gate = latestRequestGate();
  const older = gate.next(), newer = gate.next();
  await Promise.resolve();
  assert.equal(gate.current(older), false);
  assert.equal(gate.current(newer), true);
  gate.invalidate();
  assert.equal(gate.current(newer), false);
});
test('pending proposals belong to the selected event and exclude recorded responses', () => {
  assert.deepEqual(pendingEventProposals([
    { event: 'b', version: 1 }, { event: 'c', version: 2 },
    { event: 'b', version: 3, response: { decision: 'APPROVED' } },
  ], 'b').map(p => p.version), [1]);
});
test('payment and quote decisions take precedence over general planning suggestions', () => {
  assert.equal(nextHomeAction(events[1], [{ type: 'payment_failed', title: 'Payment failed' }], [{}]).to, '/customer/events/b/bookings');
  assert.equal(nextHomeAction(events[1], [{ type: 'quote_awaiting_decision' }]).to, '/customer/events/b/quotes');
});
test('home action URLs cannot redirect to an unrelated event or external site', () => {
  for (const actionUrl of ['https://untrusted.example', '/customer/events/c/bookings', '/customer/events/bad/bookings']) {
    assert.equal(nextHomeAction(events[1], [{ type: 'payment_failed', actionUrl }]).to, '/customer/events/b/bookings');
  }
  assert.equal(nextHomeAction(events[1], [{ actionUrl: '/customer/events/b/quotes?review=1' }]).to, '/customer/events/b/quotes?review=1');
});
test('proposal approval never substitutes a booking destination in the Home decision', () => {
  const action = nextHomeAction(events[1], [], [{}]);
  assert.equal(action.to, '/customer/proposals?event=b');
  assert.match(action.detail, /does not confirm a booking/);
  assert.equal(nextHomeAction(events[2]).to, '/customer/events/new?draft=c');
});
test('partner signup preserves the configured deployment host until controlled migration', () => {
  assert.equal(portalSignupUrl('VENDOR', { VENDOR: 'https://partners.example/old?tracking=1' }), 'https://partners.example/signup?as=vendor');
  assert.equal(portalSignupUrl('CUSTOMER', { CUSTOMER: 'javascript:alert(1)' }), 'https://starvnt-core.vercel.app/signup?as=customer');
});
