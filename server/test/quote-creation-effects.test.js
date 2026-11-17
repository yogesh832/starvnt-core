import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { Quote } from '../src/external/models/Quote.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorMessageThread } from '../src/external/models/VendorMessageThread.js';
import { OutboxEvent } from '../src/admin/models/OutboxEvent.js';
import { CustomerNotification } from '../src/customer/models/index.js';
import { commercialSnapshot } from '../src/external/services/commercialSnapshot.service.js';
import { prepareQuoteCreationEffects } from '../src/common/quoteCreationCommand.js';
import { enqueueQuoteCreationEffects, queuePendingQuoteCreationEffects, applyQuoteCreationEffects } from '../src/external/services/quoteCreationEffects.service.js';
import { processOutboxBatch } from '../src/automation/services/outbox.service.js';
import { recordLifecycleEventMessage } from '../src/customer/services/circle.service.js';

let mongo;
const key = () => crypto.randomUUID();
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('quote_effects_external')), adminConn.openUri(mongo.getUri('quote_effects_admin'))]);
  createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function fixture() {
  const owner = await ExternalUser.create({ fullName: 'Synthetic vendor', email: `${key()}@example.test`, accountType: 'VENDOR' });
  const customer = await ExternalUser.create({ fullName: 'Synthetic customer', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Synthetic effect fixture', category: 'Photography' });
  const service = await VendorService.create({ vendor: vendor._id, name: 'Synthetic service', category: 'Photography', pricing: { basePrice: 100 } });
  const opportunity = await Opportunity.create({ vendor: vendor._id, customer: customer._id, vendorService: service._id, serviceName: service.name, eventDate: '2027-03-01' });
  const quote = new Quote({ vendor: vendor._id, customer: customer._id, opportunity: opportunity._id, vendorService: service._id, serviceName: service.name, eventDate: opportunity.eventDate, status: 'SUBMITTED', pricingBreakdown: { basePrice: 100, totalAmount: 100 } });
  quote.commercialSnapshot = commercialSnapshot(quote, quote.pricingBreakdown, 1);
  quote.creationEffects = prepareQuoteCreationEffects(quote);
  await quote.save();
  return { quote, vendor, customer, opportunity };
}
const stored = quote => Quote.findById(quote._id).select('+creationEffects');

test('pending quote effects survive missing publication and recover one thread/message/notification', async () => {
  const f = await fixture();
  const sentinel = await OutboxEvent.create({ eventType: 'SENTINEL_FINANCE', aggregateType: 'Payment', aggregateId: key(), idempotencyKey: key(), payload: {}, nextRunAt: new Date(0) });
  const queued = await queuePendingQuoteCreationEffects({ limit: 25 });
  assert.equal(queued.failures.length, 0);
  const event = await OutboxEvent.findOne({ aggregateId: String(f.quote._id) });
  assert.ok(event);
  await enqueueQuoteCreationEffects(await stored(f.quote));
  assert.equal((await stored(f.quote)).creationEffects.state, 'COMPLETED');
  assert.equal((await enqueueQuoteCreationEffects(f.quote)).state, 'COMPLETED');
  assert.equal((await Opportunity.findById(f.opportunity._id)).status, 'RESPONDED');
  await enqueueQuoteCreationEffects(await stored(f.quote));
  await applyQuoteCreationEffects({ quoteId: f.quote._id });
  const threads = await VendorMessageThread.find({ vendor: f.vendor._id, opportunity: f.opportunity._id });
  assert.equal(threads.length, 1); assert.equal(threads[0].messages.length, 1);
  assert.equal(threads[0].unreadClientCount, 1);
  assert.equal(await CustomerNotification.countDocuments({ customer: f.customer._id }), 1);
  assert.equal((await OutboxEvent.findById(sentinel._id)).status, 'PENDING');
  assert.equal(f.quote.toJSON().creationEffects, undefined);
  await assert.rejects(processOutboxBatch({ eventId: { $ne: null } }), /INVALID_OUTBOX_EVENT_ID/);
  await OutboxEvent.deleteOne({ _id: sentinel._id });
});

test('failed in-app persistence remains retryable, error text is redacted, and retries cannot reopen an expired enquiry', async () => {
  const f = await fixture();
  const original = VendorMessageThread.findOneAndUpdate;
  VendorMessageThread.findOneAndUpdate = () => { throw new Error('Synthetic private provider payload'); };
  try { await enqueueQuoteCreationEffects(f.quote); }
  finally { VendorMessageThread.findOneAndUpdate = original; }
  assert.equal((await stored(f.quote)).creationEffects.state, 'ENQUEUED');
  let event = await OutboxEvent.findOne({ aggregateId: String(f.quote._id) });
  assert.equal(event.status, 'PENDING'); assert.equal(event.lastError, 'QUOTE_CREATION_EFFECTS_UNAVAILABLE');
  assert.equal(JSON.stringify(event).includes('Synthetic private provider payload'), false);
  await Opportunity.updateOne({ _id: f.opportunity._id }, { $set: { status: 'EXPIRED' } });
  await OutboxEvent.updateOne({ _id: event._id }, { $set: { nextRunAt: new Date(0) } });
  await enqueueQuoteCreationEffects(await stored(f.quote));
  assert.equal((await stored(f.quote)).creationEffects.state, 'COMPLETED');
  assert.equal((await Opportunity.findById(f.opportunity._id)).status, 'EXPIRED');
  assert.equal((await VendorMessageThread.findOne({ vendor: f.vendor._id })).messages.length, 1);
});

test('superseded quotes emit no stale new-offer message and poisoned queue entries do not starve others', async () => {
  const old = await fixture();
  old.quote.status = 'REJECTED'; await old.quote.save();
  await enqueueQuoteCreationEffects(old.quote);
  assert.equal((await stored(old.quote)).creationEffects.state, 'SUPERSEDED');
  assert.equal(await VendorMessageThread.countDocuments({ vendor: old.vendor._id }), 0);
  const poisoned = await fixture(), healthy = await fixture();
  await Quote.collection.updateOne({ _id: poisoned.quote._id }, { $set: { 'creationEffects.hash': 'tampered' } });
  const first = await queuePendingQuoteCreationEffects({ limit: 1 });
  assert.equal(first.failures.length, 1);
  const second = await queuePendingQuoteCreationEffects({ limit: 1 });
  assert.equal(second.queued, 1);
  assert.equal((await stored(healthy.quote)).creationEffects.state, 'ENQUEUED');
  await assert.rejects(applyQuoteCreationEffects({ quoteId: poisoned.quote._id }), /QUOTE_CREATION_EVIDENCE_CONFLICT/);
});

test('strict Core thread writes deduplicate concurrently and respect blocked conversation state', async () => {
  const f = await fixture();
  const input = { vendorId: f.vendor._id, customerId: f.customer._id, opportunityId: f.opportunity._id, quoteId: f.quote._id, sender: 'SYSTEM', type: 'quote', text: 'Synthetic immutable Core event', strict: true };
  await Promise.all(Array.from({ length: 4 }, () => recordLifecycleEventMessage(input)));
  const rows = await VendorMessageThread.find({ vendor: f.vendor._id });
  assert.equal(rows.length, 1); assert.equal(rows[0].messages.length, 1); assert.equal(rows[0].unreadClientCount, 1);
  await VendorMessageThread.updateOne({ _id: rows[0]._id }, { $set: { status: 'BLOCKED' } });
  await assert.rejects(recordLifecycleEventMessage({ ...input, text: 'A different event' }), /LIFECYCLE_THREAD_BLOCKED/);
  assert.equal((await VendorMessageThread.findById(rows[0]._id)).messages.length, 1);
});

test('a colliding outbox key cannot redirect quote recovery into a payment handler', async () => {
  const f = await fixture();
  const event = await OutboxEvent.create({ eventType: 'PAYMENT_CONFIRMED', aggregateType: 'Payment', aggregateId: String(f.quote._id), payload: { quoteId: String(f.quote._id) }, idempotencyKey: `quote.creation.${f.quote._id}.1.effects` });
  await assert.rejects(enqueueQuoteCreationEffects(f.quote), /QUOTE_CREATION_EVIDENCE_CONFLICT/);
  assert.equal((await OutboxEvent.findById(event._id)).status, 'PENDING');
  assert.equal((await OutboxEvent.findById(event._id)).attempts, 0);
  assert.equal(await VendorMessageThread.countDocuments({ vendor: f.vendor._id }), 0);
});

test('ambiguous legacy conversation contexts require review without merging identities or messages', async () => {
  const f = await fixture();
  const context = { vendor: f.vendor._id, customer: f.customer._id, opportunity: f.opportunity._id, clientName: 'Synthetic customer' };
  await VendorMessageThread.create([{ ...context }, { ...context }]);
  await assert.rejects(recordLifecycleEventMessage({ vendorId: f.vendor._id, customerId: f.customer._id, opportunityId: f.opportunity._id, quoteId: f.quote._id, type: 'quote', text: 'Synthetic event', strict: true }), /LIFECYCLE_CONTEXT_AMBIGUOUS/);
  const rows = await VendorMessageThread.find({ vendor: f.vendor._id });
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.messages.length === 0));
});
