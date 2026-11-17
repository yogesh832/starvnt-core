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
  if (['PAN', 'GST'].includes(value.type)) {
    value.documentNumber = maskIdentity(value.documentNumber);
    value.fileName = `${value.type} identity document`;
    if (value.verificationResult) delete value.verificationResult.pan;
  }
  if (value.verificationResult) { delete value.verificationResult.raw; delete value.verificationResult.address; }
  return value;
}
