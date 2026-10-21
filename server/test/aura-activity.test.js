import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { createAuraActivityReaders } from '../src/common/auraActivity.service.js';
import { activityAnswer } from '../src/common/auraActivityAnswer.js';
import { chat, getSession } from '../src/external/aura/vendorAura.service.js';
import { VendorAuraSession, VendorAuraMessage } from '../src/external/models/VendorAura.js';
import { CustomerEvent, Booking, Payment, Reservation, CustomerNotification, CustomerQuote } from '../src/customer/models/index.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Quote } from '../src/external/models/Quote.js';
import { Notification } from '../src/external/models/Notification.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { customerFinancialTruth } from '../src/common/financialTruth.service.js';

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part));
    if (value && typeof value === 'object') {
      if ('$in' in value) return value.$in.map(String).includes(String(row[key]));
      if ('$ne' in value) return row[key] !== value.$ne;
    }
    return value == null ? row[key] == null : String(row[key]) === String(value);
  });
}
function fixture() {
  const data = {
    event: [{ _id: 'event-a', customer: 'alice' }, { _id: 'event-b', customer: 'alice' }, { _id: 'event-c', customer: 'bob' }],
    opportunity: [{ _id: 'lead-a', customer: 'alice', customerEvent: 'event-a', vendor: 'vendor-a', serviceName: 'Stored service', status: 'NEW' }],
    quote: [{ _id: 'quote-a', customer: 'alice', opportunity: 'lead-a', vendor: 'vendor-a', serviceName: 'Stored quote', status: 'SENT', pricingBreakdown: { totalAmount: 1000 } }],
    reservation: [{ _id: 'reservation-a', customer: 'alice', event: 'event-a', quote: 'quote-a' }],
    booking: [{ _id: 'legacy-a', customer: 'alice', event: 'event-a', reservation: 'reservation-a', status: 'pending', amount: 1000 }],
    coreBooking: [
      { _id: 'core-a', customerId: 'alice', customerEvent: 'event-a', vendorId: 'vendor-a', quoteId: 'quote-a', bookingStatus: 'CONFIRMED', executionStatus: 'NOT_STARTED', paymentStatus: 'PAYMENT_PENDING', totalAmount: 1000, paymentSummary: { paidAmount: 0, balanceAmount: 1000 } },
      { _id: 'core-b', customerId: 'alice', customerEvent: 'event-b', vendorId: 'vendor-b', category: 'venue', totalAmount: 9000 },
      { _id: 'core-c', customerId: 'bob', customerEvent: 'event-a', vendorId: 'vendor-b', totalAmount: 90000 },
    ], payment: [], customerNotification: [], vendorNotification: [],
  };
  const store = { one: async (kind, filter) => structuredClone(data[kind].find(row => matches(row, filter))), list: async (kind, filter) => structuredClone(data[kind].filter(row => matches(row, filter))) };
  return { data, store, reader: createAuraActivityReaders(store) };
}
test('customer event ownership and contract isolation do not rely on matching categories', async () => {
  const { reader } = fixture();
  const result = await reader.customer('alice', 'event-a');
  assert.deepEqual(result.items.filter(row => row.kind === 'booking').map(row => row.id), ['booking:core-a']);
  assert.equal(result.counts.bookings, 1, 'Do not duplicate mirrored contracts');
  assert.equal(result.items.find(row => row.id === 'booking:core-a').paid, 0);
  assert.ok(!result.items.some(row => 'settlementStatus' in row));
  await assert.rejects(reader.customer('bob', 'event-a'), /EVENT_NOT_FOUND/);
  assert.equal(await reader.customer('alice', null), null);
});
test('admin status changes and vendor quote revisions reach both live snapshots without chat', async () => {
  const { reader, data } = fixture();
  const before = await reader.customer('alice', 'event-a');
  data.coreBooking[0].paymentStatus = 'PAYMENT_VERIFIED';
  data.coreBooking[0].executionStatus = 'COMPLETION_VERIFIED';
  data.coreBooking[0].settlementStatus = 'SETTLED';
  data.coreBooking[0].paymentSummary = { paidAmount: 300, balanceAmount: 700 };
  data.quote[0].pricingBreakdown.totalAmount = 1200;
  data.vendorNotification.push({ _id: 'notice-a', vendor: 'vendor-a', title: 'Payment verified', isRead: false });
  data.customerNotification.push({ _id: 'notice-a', customer: 'alice', event: 'event-a', title: 'Payment verified', readAt: null });
  for (const result of [await reader.customer('alice', 'event-a'), await reader.vendor('vendor-a')]) {
    const booking = result.items.find(row => row.id === 'booking:core-a');
    assert.equal(booking.paymentStatus, 'PAYMENT_VERIFIED'); assert.equal(booking.executionStatus, 'COMPLETION_VERIFIED');
    assert.equal(booking.paid, 300); assert.equal(booking.balance, 700);
    assert.equal(result.items.find(row => row.kind === 'quote').total, 1200);
    assert.equal(result.counts.unread, 1);
  }
  assert.equal(before.items.find(row => row.kind === 'booking').paymentStatus, 'PAYMENT_PENDING');
  const vendor = await reader.vendor('vendor-a');
  assert.equal(vendor.items.find(row => row.kind === 'booking').settlementStatus, 'SETTLED');
  assert.ok(!vendor.items.some(row => row.id === 'booking:core-b'));
  data.vendorNotification[0].isRead = true;
  assert.equal((await reader.vendor('vendor-a')).counts.unread, 0);
});
test('operational answers use saved truth and leave write commands to normal confirmation', async () => {
  const { reader } = fixture();
  const live = await reader.vendor('vendor-a');
  assert.match(activityAnswer('How many new enquiries?', live).reply, /Total: 1/);
  assert.match(activityAnswer('Show payments status', live).reply, /payment pending/);
  assert.match(activityAnswer('मेरी बुकिंग की स्थिति क्या है?', live, 'hi').reply, /सेव किए/);
  assert.equal(activityAnswer('Mark payment verified', live), null);
  assert.equal(activityAnswer('Create a new quote', live), null);
  assert.equal(activityAnswer('Find catering vendors', live), null);
});
test('a failed activity read propagates instead of becoming an empty success', async () => {
  const { store } = fixture();
  const reader = createAuraActivityReaders({ ...store, list: async () => { throw Error('database unavailable'); } });
  await assert.rejects(reader.vendor('vendor-a'), /database unavailable/);
  await assert.rejects(reader.customer('alice', 'event-a'), /database unavailable/);
});
test('legacy opportunities are linked only through owned event contracts, never an unrelated event', async () => {
  const { reader, data } = fixture();
  const quoteId = 'd'.repeat(24), otherId = 'e'.repeat(24);
  data.quote.push({ _id: quoteId, customer: 'alice', vendor: 'vendor-a', opportunity: 'old-unscoped-lead', status: 'SENT' });
  data.quote.push({ _id: otherId, customer: 'alice', vendor: 'vendor-a', opportunity: 'other-unscoped-lead', status: 'SENT' });
  data.coreBooking[0].quoteId = quoteId;
  data.coreBooking[1].quoteId = otherId;
  const result = await reader.customer('alice', 'event-a');
  assert.ok(result.items.some(row => row.id === `quote:${quoteId}`));
  assert.ok(!result.items.some(row => row.id === `quote:${otherId}`));
});
test('vendor chat uses current persisted status rather than stale history or provider guesses', async t => {
  const { data } = fixture();
  const query = value => ({ sort() { return this; }, limit() { return this; }, lean: async () => structuredClone(value) });
  t.mock.method(VendorAuraSession, 'findById', () => query({ vendor: 'vendor-a' }));
  t.mock.method(VendorAuraSession, 'updateOne', async () => ({}));
  t.mock.method(VendorAuraMessage, 'find', () => query([{ role: 'model', content: 'The payment is still pending.' }]));
  let saved = [];
  t.mock.method(VendorAuraMessage, 'insertMany', async rows => { saved = rows; });
  for (const [model, kind] of [[Opportunity, 'opportunity'], [Quote, 'quote'], [CoreBooking, 'coreBooking'], [Notification, 'vendorNotification']]) {
    t.mock.method(model, 'find', filter => query(data[kind].filter(row => matches(row, filter))));
  }
  data.coreBooking[0].paymentStatus = 'PAYMENT_VERIFIED';
  const result = await chat({ vendor: { _id: 'vendor-a' }, user: { _id: 'vendor-user' }, sessionId: 'test-session', message: 'Show payment status' });
  assert.match(result.reply, /payment verified/);
  assert.equal(result.fallback, false);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].content, result.reply);
});
test('vendor session service reads live records even before the first message and enforces ownership first', async t => {
  let session = null;
  const query = value => ({ sort() { return this; }, lean: async () => value });
  t.mock.method(VendorAuraSession, 'findById', () => query(session));
  for (const model of [Opportunity, Quote, CoreBooking, Notification]) t.mock.method(model, 'find', () => query([]));
  const result = await getSession({ vendor: { _id: 'vendor-a' }, sessionId: 'test-session' });
  assert.equal(result.activity.scope.vendorId, 'vendor-a');
  assert.deepEqual(result.messages, []);
  session = { vendor: 'vendor-b' };
  await assert.rejects(getSession({ vendor: { _id: 'vendor-a' }, sessionId: 'test-session' }), /FORBIDDEN/);
});
test('financial truth excludes explicit other-event and unlinked legacy contracts and reports failed reads', async t => {
  const query = value => ({ sort() { return this; }, lean: async () => structuredClone(value) });
  t.mock.method(CustomerEvent, 'findOne', () => query({ _id: 'event-a', customer: 'alice', budget: 10000 }));
  for (const model of [Reservation, Payment, CustomerQuote]) t.mock.method(model, 'find', () => query([]));
  t.mock.method(Booking, 'find', () => query([{ _id: 'own', category: 'venue', status: 'confirmed', amount: 100, paidAmount: 0 }]));
  t.mock.method(CoreBooking, 'find', () => query([
    { _id: 'other', category: 'venue', customerEvent: 'event-b', totalAmount: 9000, paymentSummary: { paidAmount: 9000 } },
    { _id: 'legacy', category: 'venue', totalAmount: 9000, paymentSummary: { paidAmount: 9000 } },
  ]));
  const result = await customerFinancialTruth('alice', 'event-a');
  assert.equal(result.metrics.paidAmount, 0);
  t.mock.method(CoreBooking, 'find', () => ({ sort() { return this; }, lean: async () => { throw Error('read failed'); } }));
  await assert.rejects(customerFinancialTruth('alice', 'event-a'), /read failed/);
});
test('unavailable vendor finance/readiness stays unknown and zero payable amounts remain zero', async () => {
  const query = value => ({ populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
  const empty = { find: () => query([]), countDocuments: async () => 0, aggregate: async () => [] };
  const modules = {};
  for (const name of ['Opportunity', 'Quote', 'VendorBlockout', 'VendorService', 'VendorReview', 'VendorDocument', 'Notification']) modules[`../models/${name}.js`] = { [name]: empty };
  modules['../../admin/models/CoreBooking.js'] = { CoreBooking: { find: () => query([{ serviceName: 'Test contract', totalAmount: 100, settlementDetails: { vendorPayable: 0 } }]) } };
  modules['../services/vendorActivation.service.js'] = { evaluateVendorActivation: async () => { throw Error('readiness unavailable'); } };
  modules['../../common/financialTruth.service.js'] = { vendorFinancialTruth: async () => { throw Error('finance unavailable'); } };
  const code = transformSync(readFileSync(new URL('../src/external/aura/vendorContext.js', import.meta.url), 'utf8'), { format: 'cjs', loader: 'js' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert.ok(modules[name], name); return modules[name]; }, module, module.exports);
  const context = await module.exports.buildVendorContext({ _id: 'vendor-a' });
  assert.equal(context.business.matchingEligible, null);
  assert.equal(context.business.leadActivationStatus, null);
  assert.equal(context.settlements.settledAmount, null);
  assert.equal(context.settlements.expectedReceivables, null);
  assert.equal(context.upcomingBookings[0].vendorPayable, 0);
  assert.equal(context.settlements.records[0].vendorPayable, 0);
});

test('customer Aura sees its sent enquiry before any vendor quote exists and isolates other events', async () => {
  const { reader, data } = fixture(); data.quote = []; data.coreBooking = []; data.booking = [];
  const current = await reader.customer('alice', 'event-a');
  assert.equal(current.counts.enquiries, 1);
  assert.equal(current.counts.newEnquiries, 1);
  assert.equal(current.counts.quotes, 0);
  assert.match(activityAnswer('meri enquiry ka status kya hai? quote aaya?', current, 'hinglish').reply, /quote nahi aaya/);
  assert.equal(current.counts.bookings, 0);
  assert.equal(current.items.find(row => row.kind === 'enquiry').status, 'NEW');
  assert.equal((await reader.customer('alice', 'event-b')).counts.enquiries, 0);
});
