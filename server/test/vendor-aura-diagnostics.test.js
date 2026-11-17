import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vendorAuraDiagnostic } from '../src/common/vendorAuraDiagnostics.js';

test('Aura diagnostics exclude injected conversation, identities, provider errors and unknown fields', () => {
  const lines = [];
  const secret = 'AABPS1234D sensitive customer name token=private';
  vendorAuraDiagnostic('TURN', { actionKind: secret, message: secret, reply: secret, vendor: secret, sessionId: secret, model: secret, error: { code: secret, message: secret }, saved: [{ value: secret }], savedFieldCount: 2, totalDurationMs: 12.4, firstTokenMs: Infinity, fallback: true }, line => lines.push(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes(secret), false);
  assert.deepEqual(JSON.parse(lines[0]), { component: 'vendor-aura', event: 'TURN', actionKind: null, fallback: true, savedFieldCount: 2, totalDurationMs: 12, firstTokenMs: null });
  vendorAuraDiagnostic(secret, {}, line => lines.push(line));
  assert.equal(lines.length, 1);
});

test('Aura diagnostics retain safe action/failure events without serializing error objects', () => {
  const lines = [];
  const error = { toJSON() { throw new Error('MUST_NOT_SERIALIZE_PROVIDER_ERROR'); } };
  vendorAuraDiagnostic('ACTION_FAILED', { actionKind: 'revise_quote', error, savedFieldCount: -1, totalDurationMs: -10 }, line => lines.push(line));
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, 'ACTION_FAILED'); assert.equal(entry.actionKind, 'revise_quote');
  assert.equal(entry.savedFieldCount, 0); assert.equal(entry.totalDurationMs, null);
});
