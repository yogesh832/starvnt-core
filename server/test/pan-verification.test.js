import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyPan,
  getPanEntityType,
  isCorporatePan,
  PAN_ENTITY_TYPES,
} from '../src/external/services/panVerification.service.js';
import { compareBusinessNames } from '../src/external/services/gstinVerification.service.js';

test('PAN format and entity classification', () => {
  // Test corporate PANs ('C' = Company / Corporation, 'F' = Partnership Firm / LLP)
  assert.equal(isCorporatePan('AABCS1234D'), true);
  assert.equal(getPanEntityType('AABCS1234D'), PAN_ENTITY_TYPES.C);

  assert.equal(isCorporatePan('AAAFK9876K'), true);
  assert.equal(getPanEntityType('AAAFK9876K'), PAN_ENTITY_TYPES.F);

  // Test individual PAN ('P' = Individual / Proprietor)
  assert.equal(isCorporatePan('ABCPE1234F'), false);
  assert.equal(getPanEntityType('ABCPE1234F'), PAN_ENTITY_TYPES.P);

  // Test invalid PANs
  assert.equal(isCorporatePan('INVALID'), false);
  assert.equal(getPanEntityType(''), 'Unknown Entity');
});

test('Corporation business name comparison logic', () => {
  // Vendor brand matches corporate legal name
  const match1 = compareBusinessNames('STARVENT ENTERTAINMENT', 'STARVENT ENTERTAINMENT PRIVATE LIMITED');
  assert.equal(match1.matched, true);
  assert.equal(match1.confidence, 'EXACT');

  // Vendor brand matches corporate trade name
  const match2 = compareBusinessNames('Mahiman Tent House', 'MHT Logistics LLP', 'MAHIMAN TENT HOUSE');
  assert.equal(match2.matched, true);
  assert.equal(match2.confidence, 'EXACT');

  // Mismatched names
  const mismatch = compareBusinessNames('Starvent Events', 'Unrelated Logistics Private Limited');
  assert.equal(mismatch.matched, false);
});

test('verifyPan validates format before API lookup', async () => {
  const result = await verifyPan('12345', 'Starvent Events');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'INVALID_PAN_FORMAT');
});

test('verifyPan successfully auto-verifies corporation PAN with matching business name', async () => {
  const result = await verifyPan('AABCS1234D', 'STARVENT ENTERTAINMENT', { mock: true });
  assert.equal(result.ok, true);
  assert.equal(result.matched, true);
  assert.equal(result.isCorporate, true);
  assert.equal(result.entityType, 'Company / Corporation');
  assert.equal(result.legalName, 'STARVENT ENTERTAINMENT PRIVATE LIMITED');
  assert.equal(result.panStatus, 'VALID');
});

test('verifyPan detects name mismatch on corporation PAN and routes to review', async () => {
  const result = await verifyPan('AABCC9999Z', 'STARVENT ENTERTAINMENT', { mock: true });
  assert.equal(result.ok, true);
  assert.equal(result.matched, false);
  assert.equal(result.isCorporate, true);
  assert.equal(result.legalName, 'UNRELATED ENTERPRISES PRIVATE LIMITED');
});
