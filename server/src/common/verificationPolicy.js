/** Provider truth and public projections, shared by financial and document APIs. */
export const identityStates = ['NOT_SUBMITTED', 'SUBMITTED', 'UNDER_VERIFICATION', 'VERIFIED', 'NAME_MISMATCH', 'INVALID', 'PROVIDER_ERROR', 'MANUAL_REVIEW_REQUIRED'];
export function identityOutcome(result = {}) {
  if (result.ok !== true || result.providerVerified !== true) {
    return ['INVALID_PAN_FORMAT', 'INVALID_PAN', 'PAN_INVALID', 'INVALID_GSTIN_FORMAT', 'INVALID_GSTIN'].includes(result.error) ? 'INVALID' : 'PROVIDER_ERROR';
  }
  if (result.matched === true && result.confidence === 'EXACT') return 'VERIFIED';
  if (['HIGH', 'MEDIUM'].includes(result.confidence)) return 'MANUAL_REVIEW_REQUIRED';
  return 'NAME_MISMATCH';
}
export const maskIdentity = value => value ? `${'*'.repeat(Math.max(0, String(value).length - 4))}${String(value).slice(-4)}` : '';
export function publicVerification(result = {}) {
  const status = identityOutcome(result);
  return { ok: status === 'VERIFIED', matched: status === 'VERIFIED', providerVerified: result.providerVerified === true,
    verificationStatus: status, confidence: result.confidence || 'NONE', legalName: result.legalName || result.registeredName || '',
    tradeName: result.tradeName || '', entityType: result.entityType || '', checkedAt: result.checkedAt || null,
    error: status === 'PROVIDER_ERROR' ? 'VERIFICATION_PROVIDER_UNAVAILABLE' : status === 'INVALID' ? 'IDENTITY_INVALID' : null };
}
export function publicFinancialProfile(profile) {
  const value = profile?.toObject ? profile.toObject() : JSON.parse(JSON.stringify(profile || {}));
  if (value.pan) {
    value.pan.hasPan = Boolean(value.pan.panNumber);
    value.pan.maskedPan = maskIdentity(value.pan.panNumber);
    value.pan.panNumber = value.pan.maskedPan;
    delete value.pan.raw; delete value.pan.identityDate; delete value.pan.history;
  }
  if (value.gst) {
    delete value.gst.raw;
    if (value.gst.gstin && value.gst.gstin !== 'N/A') value.gst.gstin = maskIdentity(value.gst.gstin);
  }
  if (value.bankAccount?.accountNumber) value.bankAccount.accountNumber = maskIdentity(value.bankAccount.accountNumber);
  return value;
}
export function publicVendorDocument(document) {
  const value = document?.toObject ? document.toObject() : JSON.parse(JSON.stringify(document));
  const originalNumber = value.documentNumber;
  value.contentAccess = value.contentHash || value.fileUrl?.startsWith('data:') ? 'AVAILABLE' : value.fileUrl ? 'LEGACY_EXTERNAL_REVIEW_REQUIRED' : 'NO_FILE';
  delete value.privateContent;
  delete value.fileUrl;
  if (['PAN', 'GST', 'BANK_PROOF', 'ID_PROOF'].includes(value.type)) {
    value.documentNumber = maskIdentity(value.documentNumber);
    value.fileName = `${value.type} identity document`;
    if (value.verificationResult) delete value.verificationResult.pan;
  }
  if (value.verificationResult) { delete value.verificationResult.raw; delete value.verificationResult.address; }
  const plain = JSON.parse(JSON.stringify(value));
  const textFields = new Set(['title', 'notes', 'fileName', 'fileSize', 'expiryDate', 'documentNumber', 'legalName', 'tradeName', 'registeredName', 'reason', 'error', 'entityType', 'taxpayerType']);
  const redact = (item, field) => {
    if (typeof item === 'string' && textFields.has(field)) return (originalNumber ? item.split(originalNumber).join(maskIdentity(originalNumber)) : item)
      .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]{3}\b/gi, maskIdentity).replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, maskIdentity);
    if (Array.isArray(item)) return item.map(entry => redact(entry, field));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, redact(entry, key)]));
    return item;
  };
  return redact(plain);
}
