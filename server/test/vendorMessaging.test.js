import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VendorMessageThread } from '../src/external/models/VendorMessageThread.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { Quote } from '../src/external/models/Quote.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { VendorReview } from '../src/external/models/VendorReview.js';
import { draftVendorMessage, openBookingThread } from '../src/external/services/vendorMessaging.service.js';
import { ownedCustomerThread } from '../src/customer/services/threadMessages.service.js';
import { registerLlmAdapter } from '../src/external/aura/llmAdapter.js';

const id = '111111111111111111111111';

test('Aura drafting uses only the owned context and performs no writes or sends', async (t) => {
  const record = { _id: id, vendor: 'vendor-a', eventName: 'Polaroid Corner', messages: [{ sender: 'CLIENT', text: 'Please confirm the arrival time' }] };
  t.mock.method(VendorMessageThread, 'findOne', (filter) => ({ lean: async () => filter._id === record._id && filter.vendor === record.vendor ? record : null }));
  for (const method of ['create', 'updateOne', 'findOneAndUpdate']) t.mock.method(VendorMessageThread, method, () => { assert.fail('Drafting must not write messages'); });
  let requests = 0;
  registerLlmAdapter({ async chat(request) {
    requests += 1;
    assert.match(request.systemPrompt, /Polaroid Corner/);
    assert.equal(request.message, 'Confirm our arrival at 3 pm');
    return { text: 'Our team will arrive at 3 pm.' };
  } });
  t.after(() => registerLlmAdapter(null));
  assert.deepEqual(await draftVendorMessage({ vendorId: 'vendor-a', context: { type: 'thread', id }, instructions: 'Confirm our arrival at 3 pm' }), { draft: 'Our team will arrive at 3 pm.' });
  await assert.rejects(draftVendorMessage({ vendorId: 'vendor-b', context: { type: 'thread', id }, instructions: 'Try another vendor’s chat' }), (error) => error.status === 404);
  await assert.rejects(draftVendorMessage({ vendorId: 'vendor-a', context: { type: 'thread', id }, instructions: '   ' }), (error) => error.status === 400);
  assert.equal(requests, 1);
});

test('booking, quote and enquiry drafts each enforce ownership on their source', async (t) => {
  const models = { booking: CoreBooking, quote: Quote, opportunity: Opportunity, review: VendorReview };
  for (const [type, model] of Object.entries(models)) {
    t.mock.method(model, 'findOne', (filter) => ({ lean: async () => filter[type === 'booking' ? 'vendorId' : 'vendor'] === 'owner' ? { serviceName: type } : null }));
  }
  registerLlmAdapter({ async chat() { return { text: 'Draft for review.' }; } });
  t.after(() => registerLlmAdapter(null));
  for (const type of Object.keys(models)) {
    assert.equal((await draftVendorMessage({ vendorId: 'owner', context: { type, id }, instructions: 'Ask which setup time works' })).draft, 'Draft for review.');
    await assert.rejects(draftVendorMessage({ vendorId: 'other', context: { type, id }, instructions: 'Ask a question' }), (error) => error.status === 404);
  }
});

test('opening a booking conversation creates an empty draft context and reuses that booking only', async (t) => {
  const booking = { _id: id, vendorId: 'owner', customerId: 'customer', serviceName: 'Polaroid Corner', eventDate: '2026-11-01' };
  const store = new Map();
  t.mock.method(CoreBooking, 'findOne', (filter) => ({ lean: async () => filter.vendorId === booking.vendorId && filter._id === id ? booking : null }));
  t.mock.method(VendorMessageThread, 'findOne', async (filter) => store.get(`${filter.vendor}:${filter.booking}`) || null);
  t.mock.method(VendorMessageThread, 'findOneAndUpdate', async (filter, update) => {
    const thread = { ...filter, ...update.$setOnInsert };
    store.set(`${filter.vendor}:${filter.booking}`, thread);
    return thread;
  });
  const first = await openBookingThread({ vendorId: 'owner', bookingId: id });
  assert.deepEqual(first.messages, []);
  assert.equal(first.lastMessageText, '');
  assert.equal(first.booking, id);
  assert.equal(first.customer, 'customer');
  assert.equal(await openBookingThread({ vendorId: 'owner', bookingId: id }), first);
  await assert.rejects(openBookingThread({ vendorId: 'other', bookingId: id }), (error) => error.status === 404);
  assert.equal(store.size, 1);
});

test('a customer cannot read or post to another customer’s thread by its id', async (t) => {
  const thread = { _id: id, customer: 'customer-a' };
  t.mock.method(VendorMessageThread, 'findOne', async (filter) => filter._id === id && filter.customer === thread.customer ? thread : null);
  assert.equal(await ownedCustomerThread('customer-a', id), thread);
  await assert.rejects(ownedCustomerThread('customer-b', id), (error) => error.status === 404);
});
