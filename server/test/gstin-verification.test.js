import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareBusinessNames } from '../src/external/services/gstinVerification.service.js';

test('GSTIN business-name matching accepts strong legal/trade matches only', () => {
  assert.deepEqual(
    compareBusinessNames('STARVENT ENTERTAINMENT', 'STARVENT ENTERTAINMENT PRIVATE LIMITED'),
    { matched: true, confidence: 'EXACT' },
  );
  assert.deepEqual(
    compareBusinessNames('Mahiman Tent House', 'MHT Logistics Private Limited', 'MAHIMAN TENT HOUSE'),
    { matched: true, confidence: 'EXACT' },
  );
  assert.equal(compareBusinessNames('Mahiman Tent House', 'Fusion Wave Company').matched, false);
});
