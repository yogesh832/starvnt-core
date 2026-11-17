// Deliberately independent of app configuration, models, providers and write APIs.
const truth = path => ({ $eq: [path, true] });
const text = path => ({ $convert: { input: path, to: 'string', onError: '', onNull: '' } });
const known = (path, values) => ({ $cond: [{ $in: [path, values] }, path, 'UNKNOWN'] });
const states = ['VERIFIED', 'NOT_SUBMITTED', 'SUBMITTED', 'UNDER_VERIFICATION', 'NAME_MISMATCH', 'INVALID', 'PROVIDER_ERROR', 'MANUAL_REVIEW_REQUIRED', 'NOT_VERIFIED', 'FAILED', 'NOT_APPLICABLE'];
const confidence = ['EXACT', 'HIGH', 'MEDIUM', 'LOW', 'MISMATCH', 'NONE'];
const provider = prefix => Object.fromEntries(['ok', 'providerVerified', 'matched'].map(key => [key, truth(`$${prefix}.raw.${key}`)]).concat([['confidence', known(`$${prefix}.raw.confidence`, confidence)]]));

export const financialAuditProjection = {
  _id: 1, vendor: 1,
  identityReviewRequired: truth('$identityReviewRequired'),
  settlementEligible: truth('$isSettlementEligible'),
  panStatus: known('$pan.verificationStatus', states), gstStatus: known('$gst.verificationStatus', states),
  bankStatus: known('$bankAccount.verificationStatus', states), gstRegistered: truth('$gst.isRegistered'),
  panProof: provider('pan'), gstProof: provider('gst'),
};
export const documentAuditProjection = {
  _id: 1, vendor: 1,
  type: known('$type', ['PAN', 'GST', 'BANK_PROOF', 'BUSINESS_REG', 'INSURANCE', 'ID_PROOF', 'OTHER']),
  status: known('$status', ['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED']),
  source: known('$verificationSource', ['MANUAL', 'GSTIN_API', 'PAN_API']),
  matched: truth('$verificationResult.matched'), confidence: known('$verificationResult.confidence', confidence),
  hasHash: { $ne: [text('$contentHash'), ''] },
  hasPrivateBytes: { $eq: [{ $type: '$privateContent' }, 'binData'] },
  storage: { $switch: { branches: [
    { case: { $eq: [{ $type: '$privateContent' }, 'binData'] }, then: 'PRIVATE_BINARY' },
    { case: { $regexMatch: { input: text('$fileUrl'), regex: '^data:', options: 'i' } }, then: 'LEGACY_INLINE' },
    { case: { $ne: [text('$fileUrl'), ''] }, then: 'LEGACY_EXTERNAL' },
  ], default: 'NO_FILE' } },
};
const exact = proof => proof?.ok === true && proof.providerVerified === true && proof.matched === true && proof.confidence === 'EXACT';
export function financialAuditReasons(row) {
  const reasons = [];
  for (const kind of ['pan', 'gst']) if (row[`${kind}Status`] === 'VERIFIED' && !exact(row[`${kind}Proof`])) reasons.push(`${kind.toUpperCase()}_VERIFIED_PROOF_REQUIRES_REVIEW`);
  if (row.settlementEligible && (row.identityReviewRequired || row.panStatus !== 'VERIFIED' || row.bankStatus !== 'VERIFIED' || (row.gstRegistered && row.gstStatus !== 'VERIFIED'))) reasons.push('SETTLEMENT_FLAGS_REQUIRE_REVIEW');
  return reasons;
}
export function documentAuditReasons(row) {
  const reasons = [];
  if (['LEGACY_INLINE', 'LEGACY_EXTERNAL'].includes(row.storage)) reasons.push(`${row.storage}_STORAGE_REQUIRES_REVIEW`);
  if (row.hasPrivateBytes !== row.hasHash) reasons.push('PRIVATE_CONTENT_METADATA_REQUIRES_REVIEW');
  if (['PAN', 'GST'].includes(row.type) && row.status === 'VERIFIED' && (row.source === 'MANUAL' || row.matched !== true || row.confidence !== 'EXACT')) reasons.push('IDENTITY_DOCUMENT_VERIFIED_EVIDENCE_REQUIRES_REVIEW');
  return reasons;
}

export async function auditVendorIdentity(db, { maxRecords = 10000, includeIds = false, now = () => new Date() } = {}) {
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 100000) throw new Error('INVALID_AUDIT_LIMIT');
  const report = { schemaVersion: 1, generatedAt: now().toISOString(), mode: 'READ_ONLY_REVIEW_CANDIDATES', interpretation: 'Missing historical evidence is a review candidate, not proof of invalid identity. No corrections are performed.', maxRecordsPerCollection: maxRecords, collections: {} };
  for (const [name, projection, classify] of [
    ['vendorfinancialprofiles', financialAuditProjection, financialAuditReasons],
    ['vendordocuments', documentAuditProjection, documentAuditReasons],
  ]) {
    const result = { status: 'COMPLETE', scanned: 0, candidateRecords: 0, reasons: {}, ...(includeIds ? { candidates: [] } : {}) };
    let cursor;
    try {
      cursor = db.collection(name).aggregate([{ $sort: { _id: 1 } }, { $limit: maxRecords + 1 }, { $project: projection }], { maxTimeMS: 30000, allowDiskUse: false, batchSize: 100 });
      for await (const row of cursor) {
        if (result.scanned === maxRecords) { result.status = 'PARTIAL_LIMIT'; break; }
        result.scanned++;
        const reasons = classify(row);
        if (!reasons.length) continue;
        result.candidateRecords++;
        for (const reason of reasons) result.reasons[reason] = (result.reasons[reason] || 0) + 1;
        if (includeIds) result.candidates.push({ recordId: String(row._id), vendorId: row.vendor ? String(row.vendor) : null, reasons });
      }
    } catch { result.status = 'UNAVAILABLE_OR_INTERRUPTED'; }
    finally { await cursor?.close().catch(() => {}); }
    report.collections[name] = result;
  }
  report.complete = Object.values(report.collections).every(item => item.status === 'COMPLETE');
  return report;
}
