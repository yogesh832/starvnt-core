import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVendorFirstResponses } from '../src/external/services/vendorFirstResponseMetrics.service.js';

const now = new Date('2026-10-29T12:00:00.000Z');

test('first-response summary joins message and quote responses by opportunity and uses the earliest response once', () => {
  const result = summarizeVendorFirstResponses({
    now,
    periodDays: 30,
    opportunities: [
      { _id: 'opp-a', createdAt: '2026-09-01T00:00:00.000Z' },
      { _id: 'opp-b', createdAt: '2026-09-05T00:00:00.000Z' },
      { _id: 'opp-c', createdAt: '2026-09-06T00:00:00.000Z' },
      { _id: 'too-new', createdAt: '2026-10-10T00:00:00.000Z' },
      { _id: 'too-old', createdAt: '2026-08-01T00:00:00.000Z' },
    ],
    quotes: [
      { _id: 'quote-a', opportunity: 'opp-a', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-09-03T00:00:00.000Z' }] },
      { _id: 'quote-b', opportunity: 'opp-b', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-09-07T00:00:00.000Z' }] },
    ],
    threads: [
      { opportunity: 'opp-a', messages: [{ sender: 'SYSTEM', createdAt: '2026-09-01T00:01:00.000Z' }, { sender: 'VENDOR', createdAt: '2026-09-02T00:00:00.000Z' }] },
      { quote: 'quote-b', messages: [{ sender: 'CLIENT', createdAt: '2026-09-05T00:01:00.000Z' }, { sender: 'VENDOR', createdAt: '2026-09-05T12:00:00.000Z' }] },
      { opportunity: 'opp-c', messages: [{ sender: 'CLIENT', createdAt: '2026-09-06T01:00:00.000Z' }] },
      { opportunity: 'too-new', messages: [{ sender: 'VENDOR', createdAt: '2026-10-11T00:00:00.000Z' }] },
    ],
  });

  assert.equal(result.eligibleEnquiries, 3);
  assert.equal(result.respondedEnquiries, 2);
  assert.equal(result.averageFirstResponseMs, 18 * 60 * 60 * 1000);
  assert.equal(result.complete, true);
});

test('first-response summary does not publish an average for empty or truncated data', () => {
  const empty = summarizeVendorFirstResponses({ now, opportunities: [] });
  assert.equal(empty.averageFirstResponseMs, null);
  assert.equal(empty.respondedEnquiries, 0);

  const truncated = summarizeVendorFirstResponses({
    now,
    complete: false,
    opportunities: [{ _id: 'opp', createdAt: '2026-09-01T00:00:00.000Z', slaResponseTimeMs: 1000 }],
  });
  assert.equal(truncated.complete, false);
  assert.equal(truncated.averageFirstResponseMs, null);
});
