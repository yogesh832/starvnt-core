import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExternalMutation } from '../src/externalMutation.ts';

test('a lost receipt response retains request identity and original revision after refresh', async () => {
  const mutation = new ExternalMutation(() => 'fixture-request-key');
  const requests: unknown[] = [];
  const send = async (_route: string, body: Record<string, unknown>) => { requests.push(body); if (requests.length === 1) throw new Error('Response lost after commit'); return { ok: true }; };
  const receipt = { amount: 50, method: 'CASH' };
  await assert.rejects(mutation.submit('receipts', receipt, 1, send));
  assert.equal(mutation.unresolved, true);
  await mutation.submit('receipts', receipt, 2, send);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal((requests[1] as Record<string, unknown>).revision, 1);
  assert.equal(mutation.unresolved, false);
});

test('an uncertain append cannot be replaced by different money details; known rejection allows correction', async () => {
  const mutation = new ExternalMutation(() => 'fixture-key');
  await assert.rejects(mutation.submit('refunds', { amount: 50 }, 2, async () => { throw new Error('Network timeout'); }));
  let calls = 0;
  await assert.rejects(mutation.submit('refunds', { amount: 80 }, 3, async () => { calls++; }));
  assert.equal(calls, 0);
  await assert.rejects(mutation.retry(async () => { throw Object.assign(new Error('Reported amount rejected'), { status: 400 }); }));
  assert.equal(mutation.unresolved, false);
  await mutation.submit('refunds', { amount: 40 }, 3, async () => { calls++; return { ok: true }; });
  assert.equal(calls, 1);
});
