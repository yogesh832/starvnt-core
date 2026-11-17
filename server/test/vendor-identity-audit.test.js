import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { auditVendorIdentity } from '../src/common/vendorIdentityAudit.js';
import { auditArguments } from '../scripts/audit-vendor-identity.js';

test('audit inspects evidence without exposing identity, file bytes or changing records', async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new mongoose.mongo.MongoClient(mongo.getUri());
  try {
    await client.connect();
    const db = client.db('identity_audit');
    const missing = await auditVendorIdentity(client.db('wrong_or_empty_target'));
    assert.equal(missing.complete, false);
    assert.equal(missing.collections.vendordocuments.status, 'UNAVAILABLE_OR_INTERRUPTED');
    const proof = { ok: true, providerVerified: true, matched: true, confidence: 'EXACT' };
    await db.collection('vendorfinancialprofiles').insertMany([
      { vendor: new mongoose.Types.ObjectId(), pan: { verificationStatus: 'VERIFIED', panNumber: 'AABPS1234D', legalName: 'Sensitive Name', raw: { ...proof, confidence: 'HIGH', secret: 'PROVIDER_SECRET' } }, bankAccount: { verificationStatus: 'FAILED', accountNumber: '987654321098' }, isSettlementEligible: true },
      { pan: { verificationStatus: 'VERIFIED', raw: proof }, gst: { verificationStatus: 'VERIFIED', raw: proof }, bankAccount: { verificationStatus: 'VERIFIED' }, isSettlementEligible: true },
    ]);
    await db.collection('vendordocuments').insertMany([
      { type: 'PAN', status: 'VERIFIED', verificationSource: 'MANUAL', fileUrl: 'https://private.example/sensitive-file', documentNumber: 'AABPS1234D' },
      { type: 'OTHER', fileUrl: 'data:application/pdf;base64,U0VDUkVU' },
      { type: 'GST', status: 'VERIFIED', verificationSource: 'GSTIN_API', verificationResult: { matched: true, confidence: 'EXACT' }, privateContent: Buffer.from('PRIVATE_FILE_BYTES'), contentHash: 'hash' },
      { type: 'OTHER', contentHash: 'orphaned-hash' },
    ]);
    const before = await Promise.all(['vendorfinancialprofiles', 'vendordocuments'].map(name => db.collection(name).find().toArray()));
    const report = await auditVendorIdentity(db);
    assert.equal(report.complete, true);
    assert.equal(report.collections.vendorfinancialprofiles.candidateRecords, 1);
    assert.equal(report.collections.vendorfinancialprofiles.reasons.SETTLEMENT_FLAGS_REQUIRE_REVIEW, 1);
    assert.equal(report.collections.vendordocuments.candidateRecords, 3);
    assert.equal(report.collections.vendordocuments.reasons.LEGACY_EXTERNAL_STORAGE_REQUIRES_REVIEW, 1);
    const json = JSON.stringify(report);
    for (const secret of ['AABPS1234D', 'Sensitive Name', 'PROVIDER_SECRET', '987654321098', 'private.example', 'U0VDUkVU', 'PRIVATE_FILE_BYTES', 'recordId', 'vendorId']) assert.equal(json.includes(secret), false, secret);
    assert.deepEqual(await Promise.all(['vendorfinancialprofiles', 'vendordocuments'].map(name => db.collection(name).find().toArray())), before);
    const bounded = await auditVendorIdentity(db, { maxRecords: 1, includeIds: true });
    assert.equal(bounded.complete, false);
    assert.equal(bounded.collections.vendorfinancialprofiles.status, 'PARTIAL_LIMIT');
    assert.equal(bounded.collections.vendordocuments.scanned, 1);
    assert.equal(bounded.collections.vendordocuments.candidates[0].recordId, String(before[1][0]._id));
    const empty = client.db('explicit_empty_sources');
    await empty.createCollection('vendorfinancialprofiles');
    await empty.createCollection('vendordocuments');
    const clean = await auditVendorIdentity(empty);
    assert.equal(clean.complete, true);
    assert.equal(clean.collections.vendorfinancialprofiles.scanned, 0);
  } finally { await client.close(); await mongo.stop(); }
});

test('unavailable collections remain unavailable instead of reporting zero successful findings', async () => {
  const report = await auditVendorIdentity({ collection() { throw new Error('mongodb://SECRET'); } });
  assert.equal(report.complete, false);
  assert.equal(report.collections.vendorfinancialprofiles.status, 'UNAVAILABLE_OR_INTERRUPTED');
  assert.equal(JSON.stringify(report).includes('SECRET'), false);
});

test('audit CLI requires an explicit target, bounded limit and read-only acknowledgement', () => {
  assert.throws(() => auditArguments([]), /EXPLICIT_AUDIT_TARGET_REQUIRED/);
  const args = ['--confirm-read-only', '--uri-env', 'AUDIT_DB_URI', '--database', 'external_test', '--out', 'audit.json'];
  assert.equal(auditArguments(args).maxRecords, 10000);
  for (const invalid of [['--max-records', '0'], ['--max-records', '100001'], ['--uri', 'mongodb://secret'], ['--include-ids', '--include-ids']]) assert.throws(() => auditArguments([...args, ...invalid]));
});
