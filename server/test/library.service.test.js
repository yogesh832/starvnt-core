import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSimplePdf } from '../src/customer/services/library.service.js';

test('buildSimplePdf returns a downloadable PDF buffer', () => {
  const pdf = buildSimplePdf(['Invoice number: INV-1', 'Amount: INR 1,000']);

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.match(pdf.toString('utf8'), /%%EOF$/);
});
