import crypto from 'node:crypto';
import { BankVerificationLog } from '../models/BankVerificationLog.js';
import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { compareBusinessNames } from './gstinVerification.service.js';
import { withVendorSchedule } from './scheduleLock.js';
import { HttpError } from '../../customer/utils/http.js';

// RazorpayX has separate access and funding requirements from Checkout.
// Never fall back to mock verification or to the payment gateway credentials.
export function razorpayBankConfiguration() {
  const keyId = process.env.RAZORPAYX_KEY_ID || '';
  const keySecret = process.env.RAZORPAYX_KEY_SECRET || '';
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER || '';
  return {
    keyId, keySecret, accountNumber,
    enabled: process.env.RAZORPAYX_BANK_VERIFICATION_ENABLED === 'true',
  };
}

export function bankFingerprint(bank = {}) {
  return crypto.createHash('sha256').update(JSON.stringify([
    String(bank.accountHolderName || '').trim().toUpperCase(),
    String(bank.accountNumber || '').trim(),
    String(bank.ifsc || '').trim().toUpperCase(),
    String(bank.accountType || 'SAVINGS').toUpperCase(),
  ])).digest('hex');
}

function configurationError() {
  const env = razorpayBankConfiguration();
  if (!env.enabled || !/^rzp_live_/.test(env.keyId) || !env.keySecret || !/^\d+$/.test(env.accountNumber)) {
    return { ok: false, error: 'RAZORPAYX_NOT_CONFIGURED', message: 'Bank verification requires enabled RazorpayX Account Validation, live RazorpayX credentials and a source account. Contact STARVNT support.' };
  }
  return null;
}

export function razorpayBankAvailability() {
  return { provider: 'RAZORPAY', configured: !configurationError() };
}

async function providerRequest(path, body) {
  const env = razorpayBankConfiguration();
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${env.keyId}:${env.keySecret}`).toString('base64')}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Do not expose bank details or provider error bodies in UI/audit responses.
    const error = new Error('The bank verification provider could not complete the request. Contact STARVNT support before retrying.');
    error.definitive = response.status >= 400 && response.status < 500 && response.status !== 429;
    throw error;
  }
  return data;
}

export function normalizeRazorpayBankResult(raw, holder) {
  const results = raw?.validation_results || raw?.results || {};
  const match = results.registered_name ? compareBusinessNames(results.registered_name, holder) : { matched: false };
  const active = raw?.status === 'completed' && results.account_status === 'active';
  const verified = active && match.matched && ['EXACT', 'HIGH'].includes(match.confidence);
  const pending = raw?.status === 'created';
  return {
    verificationStatus: verified ? 'VERIFIED' : pending ? 'PROCESSING' : 'FAILED',
    nameMatchStatus: verified ? match.confidence === 'EXACT' ? 'EXACT' : 'HIGH' : active ? 'MISMATCH' : 'NONE',
    failureReason: verified ? '' : pending ? 'Bank verification is processing. Check the status again shortly.' : active ? 'The bank account holder name does not match the submitted name.' : 'The provider did not confirm an active bank account.',
    // Store only the evidence needed for reconciliation; no unmasked account payload.
    providerResponse: { id: raw?.id, status: raw?.status, accountStatus: results.account_status || null, registeredName: results.registered_name || '', nameMatchScore: results.name_match_score ?? null },
  };
}

async function applyResult(log, raw, bank) {
  if (raw?.id !== log.providerTransactionId || !/^fav_/.test(raw?.id || '')) throw new Error('Bank verification reference mismatch.');
  const returnedBank = raw.fund_account?.bank_account;
  if (returnedBank && (String(returnedBank.account_number) !== bank.accountNumber || String(returnedBank.ifsc).toUpperCase() !== bank.ifsc)) throw new Error('Bank verification account mismatch.');
  Object.assign(log, normalizeRazorpayBankResult(raw, bank.accountHolderName));
  log.completedAt = log.verificationStatus === 'PROCESSING' ? null : new Date();
  const profile = await VendorFinancialProfile.findOne({ vendor: log.vendor });
  // A late provider response must never verify replacement bank details.
  if (profile && bankFingerprint(profile.bankAccount) === log.bankFingerprint) {
    profile.bankAccount.verificationStatus = log.verificationStatus;
    profile.bankAccount.nameMatchStatus = log.nameMatchStatus;
    profile.bankAccount.failureReason = log.failureReason;
    profile.bankAccount.lastVerifiedAt = log.verificationStatus === 'VERIFIED' ? log.completedAt : null;
    profile.isSettlementEligible = log.verificationStatus === 'VERIFIED' && profile.pan?.verificationStatus === 'VERIFIED';
    await profile.save();
  }
  await log.save();
  return publicResult(log);
}

function publicResult(log) {
  return {
    ok: log.verificationStatus !== 'FAILED', verificationId: log.verificationId,
    status: log.verificationStatus, nameMatchStatus: log.nameMatchStatus,
    failureReason: log.failureReason, provider: 'RAZORPAY', completedAt: log.completedAt,
  };
}

export async function requestRazorpayBankVerification(vendorId, bank) {
  const invalidConfig = configurationError();
  if (invalidConfig) return invalidConfig;
  const fingerprint = bankFingerprint(bank);
  // One outstanding provider transaction per vendor, even across edited details.
  const pending = await BankVerificationLog.findOne({ vendor: vendorId, provider: 'RAZORPAY', verificationStatus: 'PROCESSING' });
  if (pending) {
    if (pending.bankFingerprint !== fingerprint) return { ok: false, error: 'BANK_VERIFICATION_IN_PROGRESS', message: 'A bank verification is still processing. Keep the original bank details until it completes or contact support.' };
    if (!pending.providerTransactionId) return publicResult(pending);
    const raw = await providerRequest(`fund_accounts/validations/${encodeURIComponent(pending.providerTransactionId)}`);
    return applyResult(pending, raw, bank);
  }
  const profile = await VendorFinancialProfile.findOne({ vendor: vendorId });
  if (profile?.bankAccount?.verificationStatus === 'VERIFIED' && bankFingerprint(profile.bankAccount) === fingerprint) return { ok: true, duplicate: true, status: 'VERIFIED', provider: 'RAZORPAY' };
  const verificationId = `bav_${crypto.randomUUID()}`;
  let log;
  try {
    log = await BankVerificationLog.create({
      verificationId, vendor: vendorId, provider: 'RAZORPAY', bankFingerprint: fingerprint,
      verificationReference: verificationId, accountHolderName: bank.accountHolderName,
      submittedAccountNumber: `XXXX${bank.accountNumber.slice(-4)}`, ifsc: bank.ifsc,
      verificationStatus: 'PROCESSING', amount: 0,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return { ok: false, error: 'BANK_VERIFICATION_IN_PROGRESS', message: 'A verification is already processing. Check again shortly.' };
  }
  await VendorFinancialProfile.findOneAndUpdate({ vendor: vendorId }, { $set: { bankAccount: { ...bank, verificationStatus: 'PROCESSING', nameMatchStatus: 'NONE', lastVerifiedAt: null, failureReason: '' }, isSettlementEligible: false } }, { upsert: true });
  try {
    const raw = await providerRequest('fund_accounts/validations', {
      source_account_number: razorpayBankConfiguration().accountNumber,
      validation_type: 'penniless', reference_id: verificationId,
      fund_account: {
        account_type: 'bank_account',
        bank_account: { name: bank.accountHolderName, ifsc: bank.ifsc, account_number: bank.accountNumber },
        contact: { name: bank.accountHolderName, type: 'vendor', reference_id: String(vendorId) },
      },
    });
    if (!/^fav_/.test(raw?.id || '')) throw new Error('The provider did not return a bank verification reference. Contact support.');
    log.providerTransactionId = raw.id;
    await log.save();
    return await applyResult(log, raw, bank);
  } catch (error) {
    // A timeout/5xx may have created a billable validation: keep it pending and
    // prevent automatic resubmission. A provider reference can be recovered by ops.
    log.verificationStatus = error.definitive ? 'FAILED' : 'PROCESSING';
    log.failureReason = error.definitive ? 'Bank verification was rejected by the provider. Contact STARVNT support.' : 'Bank verification needs reconciliation. Contact STARVNT support before retrying.';
    log.completedAt = error.definitive ? new Date() : null;
    await log.save();
    await VendorFinancialProfile.updateOne({ vendor: vendorId, 'bankAccount.accountNumber': bank.accountNumber, 'bankAccount.ifsc': bank.ifsc }, { $set: { 'bankAccount.verificationStatus': log.verificationStatus, 'bankAccount.failureReason': log.failureReason, isSettlementEligible: false } });
    return publicResult(log);
  }
}

export async function handleRazorpayBankWebhook(rawBody, headers) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET || '';
  if (!secret) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'Bank webhook secret not configured');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const signature = String(headers['x-razorpay-signature'] || '');
  if (!/^[0-9a-f]{64}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new HttpError(400, 'INVALID_SIGNATURE', 'Invalid signature');
  let body;
  try { body = JSON.parse(rawBody.toString('utf8')); }
  catch { throw new HttpError(400, 'INVALID_BODY', 'Invalid JSON'); }
  if (!['fund_account.validation.completed', 'fund_account.validation.failed'].includes(body.event)) return { ok: true, ignored: true };
  const id = body.payload?.['fund_account.validation']?.entity?.id;
  const log = id && await BankVerificationLog.findOne({ provider: 'RAZORPAY', providerTransactionId: id, verificationStatus: 'PROCESSING' });
  if (!log) return { ok: true, ignored: true };
  return withVendorSchedule(`bank:${log.vendor}`, async () => {
    const current = await BankVerificationLog.findById(log._id);
    if (current.verificationStatus !== 'PROCESSING') return { ok: true, duplicate: true };
    const profile = await VendorFinancialProfile.findOne({ vendor: log.vendor });
    if (!profile || bankFingerprint(profile.bankAccount) !== log.bankFingerprint) return { ok: true, ignored: true };
    if (configurationError()) throw new HttpError(503, 'RAZORPAYX_NOT_CONFIGURED', 'Bank verification is not configured');
    const raw = await providerRequest(`fund_accounts/validations/${encodeURIComponent(id)}`);
    await applyResult(current, raw, profile.bankAccount);
    return { ok: true };
  });
}
