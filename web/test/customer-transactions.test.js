import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerTerms, offersForEvent, offerBlockReason, reservationPayment, reservationCanPay, bookingLabel, proposalLink } from '../src/pages/customer/transactionState.js';

test('same-day and unlinked offers never become event-linked by matching dates', () => {
  const day = '2028-10-20';
  const data = { quotes: [{ id: 'qa', eventId: 'a', opportunityId: 'oa', eventDate: day }, { id: 'qb', eventId: 'b', eventDate: day }, { id: 'legacy', eventDate: day }], opportunities: [{ _id: 'oa', customerEvent: 'a' }, { _id: 'pending', customerEvent: 'a' }, { _id: 'ob', customerEvent: 'b' }] };
  assert.deepEqual(offersForEvent(data, 'a').quotes.map(row => row.id), ['qa']);
  assert.deepEqual(offersForEvent(data, 'a').requests.map(row => row._id), ['pending']);
});
test('missing commercial terms stay unknown and saved zero amounts stay zero', () => {
  assert.deepEqual(offerTerms({ totalAmount: 1000 }), { total: 1000, advance: null, percent: null, balance: null });
  assert.deepEqual(offerTerms({ totalAmount: 1000, advanceAmount: 0, advancePercentage: 0 }), { total: 1000, advance: 0, percent: 0, balance: 1000 });
  assert.equal(offerTerms({ advanceAmount: -1 }).advance, null);
});
test('acceptance requires an explicitly linked planning event and current date/validity', () => {
  const event = { id: 'a', status: 'planning', eventDate: '2028-10-20' }, quote = { eventId: 'a', eventDate: event.eventDate, validUntil: '2028-10-01' };
  assert.equal(offerBlockReason(quote, event, Date.parse('2028-09-01')), null);
  assert.match(offerBlockReason({ ...quote, eventId: 'b' }, event), /not linked/);
  assert.match(offerBlockReason(quote, { ...event, status: 'cancelled' }), /confirmed event plan/);
  assert.match(offerBlockReason({ ...quote, eventDate: '2028-10-21' }, event), /date has changed/);
  assert.match(offerBlockReason(quote, event, Date.parse('2028-10-02')), /expired/);
});
test('failed retries cannot hide verified or processing payments for a reservation', () => {
  const rows = [{ id: 'failed', reservationId: 'r', status: 'failed', createdAt: '2028-10-20' }, { id: 'processing', reservationId: 'r', status: 'processing', createdAt: '2028-10-19' }, { id: 'other', reservationId: 'x', status: 'verified' }];
  assert.equal(reservationPayment(rows, 'r').id, 'processing');
  rows.push({ id: 'verified', reservationId: 'r', status: 'verified' });
  assert.equal(reservationPayment(rows, 'r').id, 'verified');
  assert.equal(reservationPayment(rows, 'absent'), null);
});
test('payment controls reject expired holds and avoid another checkout after verification', () => {
  const r = { status: 'pending_payment', expiresAt: '2028-10-20' }, now = Date.parse('2028-10-19');
  assert.equal(reservationCanPay(r, null, true, now), true);
  for (const status of ['processing', 'paid', 'verified']) assert.equal(reservationCanPay(r, { status }, true, now), false);
  assert.equal(reservationCanPay(r, null, true, Date.parse('2028-10-21')), false);
  assert.equal(reservationCanPay(r, null, false, now), false);
});
test('unknown and external booking states cannot be presented as Core confirmation', () => {
  assert.match(bookingLabel({ status: 'new-state' })[0], /unavailable/);
  assert.match(bookingLabel({ status: 'confirmed', source: 'EXTERNAL' })[0], /external arrangement/);
  assert.equal(bookingLabel({ status: 'confirmed', source: 'STARVNT' })[0], 'Confirmed by STARVNT');
  assert.equal(proposalLink('a', 'p'), '/customer/proposals?event=a&proposal=p');
});
