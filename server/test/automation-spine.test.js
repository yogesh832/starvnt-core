import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let adminToken;
let publishOutboxEvent;
let processOutboxBatch;
let resetRetryCounter;
let OutboxEvent;

before(async () => {
  ctx = await setupTestApp();

  const outboxModule = await import('../src/automation/services/outbox.service.js');
  publishOutboxEvent = outboxModule.publishOutboxEvent;
  processOutboxBatch = outboxModule.processOutboxBatch;

  const dispatcherModule = await import('../src/automation/services/dispatcher.service.js');
  resetRetryCounter = dispatcherModule.resetRetryCounter;

  const eventModule = await import('../src/admin/models/OutboxEvent.js');
  OutboxEvent = eventModule.OutboxEvent;

  // Create Super Admin for testing automation admin endpoints
  const { AdminUser } = ctx.models;
  const { hashPassword } = await import('../src/external/utils/password.js');
  const passwordHash = await hashPassword('AdminPass123!');
  const adminEmail = `automation_${Date.now()}@starvnt.com`;
  const admin = await AdminUser.create({
    fullName: 'Central Automation Lead',
    email: adminEmail,
    passwordHash,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });

  const loginRes = await request(ctx.app).post('/api/admin/auth/login').send({
    email: adminEmail,
    password: 'AdminPass123!',
  });
  assert.equal(loginRes.status, 200);
  adminToken = loginRes.body.accessToken;
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('GOLDEN TEST H: Quote Approval Idempotency (Zero Duplicate Booking Requests)', async () => {
  const quoteId = 'Q-9901';
  const vendorId = 'VN-7711';
  const idempotencyKey = `quote-approval-${quoteId}`;

  // 1. First event published & processed
  const pub1 = await publishOutboxEvent({
    eventType: 'QUOTE_APPROVED',
    aggregateType: 'Quote',
    aggregateId: quoteId,
    idempotencyKey,
    payload: {
      quoteId,
      vendorId,
      amount: 48000,
      eventDate: '2026-11-26',
    },
  });
  assert.equal(pub1.created, true);

  // Run worker to process
  const batch1 = await processOutboxBatch({ immediate: true });
  assert.equal(batch1.totalProcessed, 1);
  assert.equal(batch1.successes, 1);

  const firstBookingResult = batch1.results[0].result;
  assert.equal(firstBookingResult.duplicate, false);
  const createdBookingId = firstBookingResult.booking.bookingId;
  assert.ok(createdBookingId);

  // 2. Duplicate approval event arrives (e.g. duplicate webhook or user double-click)
  const pub2 = await publishOutboxEvent({
    eventType: 'QUOTE_APPROVED',
    aggregateType: 'Quote',
    aggregateId: quoteId,
    idempotencyKey, // Same key
    payload: {
      quoteId,
      vendorId,
      amount: 48000,
      eventDate: '2026-11-26',
    },
  });
  // Outbox recognizes duplicate key and does not duplicate
  assert.equal(pub2.created, false);
  assert.equal(String(pub2.event._id), String(pub1.event._id));

  // 3. Now simulate duplicate execution directly with same quoteId under different outbox key
  const pubDuplicate = await publishOutboxEvent({
    eventType: 'QUOTE_APPROVED',
    aggregateType: 'Quote',
    aggregateId: quoteId,
    idempotencyKey: `duplicate-approval-webhook-${Date.now()}`,
    payload: {
      quoteId,
      vendorId,
      amount: 48000,
      eventDate: '2026-11-26',
    },
  });
  assert.equal(pubDuplicate.created, true);

  const batch2 = await processOutboxBatch({ immediate: true });
  assert.equal(batch2.totalProcessed, 1);
  const secondBookingResult = batch2.results[0].result;

  // Idempotency guard caught it!
  assert.equal(secondBookingResult.duplicate, true);
  // Reused exact same booking ID, no second booking created
  assert.equal(secondBookingResult.booking.bookingId, createdBookingId);
});

test('GOLDEN TEST O: Failure -> Exponential Backoff -> Eventual Success', async () => {
  resetRetryCounter();
  const idempotencyKey = `retry-test-${Date.now()}`;

  // Publish event configured to fail on attempt 1 and succeed on attempt 2
  await publishOutboxEvent({
    eventType: 'RETRY_TEST_EVENT',
    aggregateType: 'PaymentAudit',
    aggregateId: 'PA-5544',
    idempotencyKey,
    maxAttempts: 4,
    payload: {
      failUntilAttempt: 2,
    },
  });

  // Cycle 1: Must fail
  const cycle1 = await processOutboxBatch({ immediate: true });
  assert.equal(cycle1.totalProcessed, 1);
  assert.equal(cycle1.failures, 1);

  const eventAfterFail = await OutboxEvent.findOne({ idempotencyKey });
  assert.equal(eventAfterFail.status, 'PENDING');
  assert.equal(eventAfterFail.attempts, 1);
  assert.ok(eventAfterFail.lastError.includes('TRANSIENT_DOWNSTREAM_TIMEOUT'));
  assert.ok(eventAfterFail.history.length === 1);
  assert.equal(eventAfterFail.history[0].status, 'FAILED');

  // Cycle 2: Retries and must succeed
  const cycle2 = await processOutboxBatch({ immediate: true });
  assert.equal(cycle2.totalProcessed, 1);
  assert.equal(cycle2.successes, 1);

  const eventAfterSuccess = await OutboxEvent.findOne({ idempotencyKey });
  assert.equal(eventAfterSuccess.status, 'COMPLETED');
  assert.equal(eventAfterSuccess.attempts, 1); // 1 previous fail + success
  assert.equal(eventAfterSuccess.lastError, null);
  assert.equal(eventAfterSuccess.history.length, 2);
  assert.equal(eventAfterSuccess.history[1].status, 'COMPLETED');
});

test('Admin Central Automation API Inspection', async () => {
  // 1. Fetch automation stats
  const statsRes = await request(ctx.app)
    .get('/api/admin/automation/stats')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(statsRes.status, 200);
  assert.ok(statsRes.body.ok);
  assert.ok(statsRes.body.stats.completed >= 2);

  // 2. Query outbox list
  const outboxRes = await request(ctx.app)
    .get('/api/admin/automation/outbox')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(outboxRes.status, 200);
  assert.ok(outboxRes.body.events.length >= 2);
  assert.ok(outboxRes.body.events.every((e) => e.eventType && e.idempotencyKey));
});
