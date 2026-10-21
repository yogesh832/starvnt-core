import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { BankVerificationLog } from '../models/BankVerificationLog.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { compareBusinessNames } from './gstinVerification.service.js';
import { config } from '../../config.js';

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCOUNT_NO_RE = /^[0-9A-Z]{6,40}$/i;

function maskAccountNumber(accNo) {
  const str = String(accNo || '').trim();
  if (str.length <= 4) return str;
  return 'X'.repeat(str.length - 4) + str.slice(-4);
}

function generateVerificationId() {
  const timestamp = Date.now();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BVK-${timestamp}-${rand}`;
}

function isPlaceholder(value = '') {
  return !value || /^(your-|change-me|changeme)/i.test(String(value).trim());
}

function cashfreeBavUrl() {
  const baseUrl = String(config.cashfreeBavBaseUrl || 'https://sandbox.cashfree.com').replace(/\/$/, '');
  if (/payout-api\.cashfree\.com/i.test(baseUrl)) {
    return {
      ok: false,
      message:
        'CASHFREE_BAV_BASE_URL is pointing to the payouts host. Use https://sandbox.cashfree.com for sandbox or https://api.cashfree.com for production Secure ID BAV.',
    };
  }
  if (/\/verification\/bank-account\/sync$/i.test(baseUrl)) {
    return { ok: true, url: baseUrl, endpoint: '/verification/bank-account/sync' };
  }
  if (/\/verification$/i.test(baseUrl)) {
    return { ok: true, url: `${baseUrl}/bank-account/sync`, endpoint: '/verification/bank-account/sync' };
  }
  return { ok: true, url: `${baseUrl}/verification/bank-account/sync`, endpoint: '/verification/bank-account/sync' };
}

async function cashfreeBavSync(body) {
  if (isPlaceholder(config.cashfreeClientId) || isPlaceholder(config.cashfreeClientSecret)) {
    return {
      ok: false,
      error: 'BANK_VERIFICATION_NOT_CONFIGURED',
      message: 'Cashfree bank verification is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.',
    };
  }

  const endpoint = cashfreeBavUrl();
  if (!endpoint.ok) {
    return {
      ok: false,
      error: 'CASHFREE_BAV_BASE_URL_INVALID',
      message: endpoint.message,
    };
  }

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'x-client-id': config.cashfreeClientId,
      'x-client-secret': config.cashfreeClientSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const rawText = await response.text();
  let json = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    return {
      ok: false,
      error: json?.code || json?.type || json?.status || 'CASHFREE_BANK_VERIFICATION_FAILED',
      message:
        json?.message ||
        json?.reason ||
        `Cashfree bank verification request failed with HTTP ${response.status}.`,
      raw: {
        ...(Object.keys(json).length ? json : { body: rawText }),
        http_status: response.status,
        endpoint: endpoint.endpoint,
      },
    };
  }
  return {
    ok: true,
    raw: {
      ...json,
      http_status: response.status,
      endpoint: endpoint.endpoint,
    },
  };
}

function nameMatchFromCashfree(raw, context) {
  const result = String(raw?.name_match_result || '').toUpperCase();
  if (result === 'DIRECT_MATCH') return 'EXACT';
  if (result === 'GOOD_PARTIAL_MATCH') return 'HIGH';
  if (result === 'MODERATE_PARTIAL_MATCH') return 'MEDIUM';
  if (result === 'POOR_PARTIAL_MATCH') return 'LOW';
  if (result === 'NO_MATCH') return 'MISMATCH';

  const score = Number(raw?.name_match_score);
  if (Number.isFinite(score)) {
    if (score >= 95) return 'EXACT';
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    if (score > 0) return 'LOW';
    return 'MISMATCH';
  }

  const bankName = String(raw?.name_at_bank || '').trim();
  if (!bankName) return 'NONE';
  const candidates = [context.holder, context.vendorBusinessName, context.panLegalName].filter(Boolean);
  for (const candidate of candidates) {
    const match = compareBusinessNames(bankName, candidate);
    if (match.matched) return match.confidence === 'EXACT' ? 'EXACT' : 'HIGH';
  }
  return 'MISMATCH';
}

function normalizeCashfreeBav(raw, context) {
  const accountStatus = String(raw?.account_status || '').toUpperCase();
  const verificationStatus = accountStatus === 'VALID' ? 'VERIFIED' : 'FAILED';
  const failureReason =
    verificationStatus === 'FAILED'
      ? raw?.account_status_code || raw?.message || 'Bank account verification failed.'
      : '';

  return {
    providerTransactionId: raw?.reference_id ? String(raw.reference_id) : raw?.utr || '',
    verificationStatus,
    failureReason,
    nameMatchStatus:
      verificationStatus === 'VERIFIED'
        ? nameMatchFromCashfree(raw, context)
        : 'MISMATCH',
    providerResponse: raw,
  };
}

async function verifyWithCashfree({ holder, accNo, code, phone, context }) {
  const payload = {
    bank_account: accNo,
    ifsc: code,
    name: holder,
  };
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (cleanPhone.length >= 8 && cleanPhone.length <= 13) {
    payload.phone = cleanPhone;
  }

  const result = await cashfreeBavSync(payload);
  if (!result.ok) return result;

  return { ok: true, ...normalizeCashfreeBav(result.raw, context) };
}

function verifyWithMock({ accNo, code, holder, amount }) {
  let verificationStatus = 'VERIFIED';
  let nameMatchStatus = 'MEDIUM';
  let failureReason = '';

  if (accNo === '007711000031' || code === 'HDFC0000077') {
    verificationStatus = 'PROCESSING';
    failureReason = 'Bank account verification request is pending with bank.';
    nameMatchStatus = 'NONE';
  } else if (
    code.includes('FAIL') ||
    accNo === '000000000000' ||
    accNo === '026291800001190' ||
    accNo === '234005000876' ||
    code === 'CNRR0002640'
  ) {
    verificationStatus = 'FAILED';
    failureReason = 'Bank account verification failed. Invalid bank account or branch inactive.';
    nameMatchStatus = 'MISMATCH';
  }

  return {
    providerTransactionId: `MOCK-FAV-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    verificationStatus,
    nameMatchStatus,
    failureReason,
    providerResponse: {
      source: 'CORE_BANK_VERIFICATION_MOCK',
      amount,
      currency: 'INR',
      account_status: verificationStatus === 'VERIFIED' ? 'VALID' : 'INVALID',
      account_status_code: verificationStatus === 'VERIFIED' ? 'ACCOUNT_IS_VALID' : 'ACCOUNT_IS_INVALID',
      name_at_bank: verificationStatus === 'VERIFIED' ? holder : null,
      name_match_result: verificationStatus === 'VERIFIED' ? 'GOOD_PARTIAL_MATCH' : 'NO_MATCH',
    },
  };
}

/**
 * Execute bank account verification for a Vendor.
 * Spec §5, §6, §7, §8, §9, §10, §18, §19, §21, §22:
 * - Independent of GST status.
 * - Strictly a verification signal — NOT a payout or settlement.
 * - Idempotency & audit logging enabled.
 */
export async function requestBankVerification(vendorId, bankDetails = {}, options = {}) {
  const { accountHolderName, accountNumber, ifsc, bankName, accountType } = bankDetails;

  const holder = String(accountHolderName || '').trim();
  const accNo = String(accountNumber || '').trim();
  const code = String(ifsc || '').trim().toUpperCase();
  const bank = String(bankName || '').trim();
  const type = String(accountType || 'SAVINGS').toUpperCase();

  const requestedAt = new Date();

  // Basic format validations
  if (!holder) {
    return { ok: false, error: 'ACCOUNT_HOLDER_NAME_REQUIRED', message: 'Account Holder Name is required.' };
  }
  if (!accNo || !ACCOUNT_NO_RE.test(accNo)) {
    return {
      ok: false,
      error: 'INVALID_ACCOUNT_NUMBER',
      message: 'Account Number must be 6-40 alphanumeric characters.',
    };
  }
  if (!code || !IFSC_RE.test(code)) {
    return {
      ok: false,
      error: 'INVALID_IFSC_FORMAT',
      message: 'IFSC Code must be valid 11-character Indian IFSC format (e.g. HDFC0001234).',
    };
  }
  if (!bank) {
    return { ok: false, error: 'BANK_NAME_REQUIRED', message: 'Bank Name is required.' };
  }

  // Generate or use idempotency reference key
  const referenceKey =
    options.verificationReference ||
    `REF-${vendorId}-${accNo.slice(-4)}-${code}-${Math.floor(Date.now() / 60000)}`;

  // Check for duplicate pending/verified verification request within idempotency window
  const existingLog = await BankVerificationLog.findOne({
    vendor: vendorId,
    verificationReference: referenceKey,
    verificationStatus: { $in: ['PROCESSING', 'VERIFIED'] },
  });

  if (existingLog && !options.forceRetry) {
    return {
      ok: true,
      duplicate: true,
      verificationId: existingLog.verificationId,
      status: existingLog.verificationStatus,
      nameMatchStatus: existingLog.nameMatchStatus,
      message: 'A verification request with this reference key is already in progress or verified.',
      log: existingLog,
    };
  }

  const verificationId = generateVerificationId();
  const provider = String(options.provider || config.bankVerificationProvider || 'CORE_BANK_VERIFICATION').toUpperCase();
  const verificationAmount = 0;
  const maskedAcc = maskAccountNumber(accNo);

  // Initial audit log record in PROCESSING state
  const logRecord = await BankVerificationLog.create({
    verificationId,
    vendor: vendorId,
    bankAccountId: options.bankAccountId || `BA-${Date.now()}`,
    provider,
    verificationReference: referenceKey,
    amount: verificationAmount,
    currency: 'INR',
    accountHolderName: holder,
    submittedAccountNumber: maskedAcc,
    ifsc: code,
    verificationStatus: 'PROCESSING',
    requestedAt,
    requestedBy: options.requestedBy || 'VENDOR',
  });

  // Fetch vendor organization & financial profile for name matching & status update
  const vendorOrg = await VendorOrganization.findById(vendorId);
  const finProfile = await VendorFinancialProfile.findOne({ vendor: vendorId });
  const panLegalName = finProfile?.pan?.legalName || '';
  const vendorBusinessName = vendorOrg?.businessName || '';

  const useMock =
    options.mock === true ||
    provider === 'CORE_BANK_VERIFICATION' ||
    config.bankVerificationMockEnabled;
  let verificationResult;

  try {
    if (useMock) {
      verificationResult = verifyWithMock({ accNo, code, holder, amount: verificationAmount });
      if (verificationResult.verificationStatus === 'VERIFIED') {
        const matchOrg = compareBusinessNames(holder, vendorBusinessName);
        const matchPan = panLegalName ? compareBusinessNames(holder, panLegalName) : { matched: false, confidence: 'NONE' };
        verificationResult.nameMatchStatus =
          matchOrg.matched || matchPan.matched
            ? matchOrg.confidence === 'EXACT' || matchPan.confidence === 'EXACT'
              ? 'EXACT'
              : 'HIGH'
            : 'MEDIUM';
      }
    } else if (provider === 'CASHFREE') {
      const cashfreeResult = await verifyWithCashfree({
        holder,
        accNo,
        code,
        phone: options.phone || vendorOrg?.phone,
        context: { holder, vendorBusinessName, panLegalName },
      });
      if (!cashfreeResult.ok) {
        verificationResult = {
          providerTransactionId: '',
          verificationStatus: 'FAILED',
          nameMatchStatus: 'NONE',
          failureReason: cashfreeResult.message,
          providerResponse: cashfreeResult.raw || cashfreeResult,
        };
      } else {
        verificationResult = cashfreeResult;
      }
    } else {
      verificationResult = {
        providerTransactionId: '',
        verificationStatus: 'FAILED',
        nameMatchStatus: 'NONE',
        failureReason: `Unsupported bank verification provider: ${provider}.`,
        providerResponse: { provider },
      };
    }
  } catch (err) {
    verificationResult = {
      providerTransactionId: '',
      verificationStatus: 'FAILED',
      nameMatchStatus: 'NONE',
      failureReason: err.message || 'Bank verification provider request failed.',
      providerResponse: { error: err.message || String(err), provider },
    };
  }

  const {
    providerTransactionId,
    verificationStatus,
    nameMatchStatus,
    failureReason,
    providerResponse,
  } = verificationResult;

  const completedAt = new Date();

  // Update audit log record
  logRecord.providerTransactionId = providerTransactionId;
  logRecord.verificationStatus = verificationStatus;
  logRecord.nameMatchStatus = nameMatchStatus;
  logRecord.amount = verificationAmount;
  logRecord.providerResponse = providerResponse;
  logRecord.completedAt = completedAt;
  logRecord.failureReason = failureReason;
  await logRecord.save();

  // Update Vendor Financial Profile
  let profile = await VendorFinancialProfile.findOne({ vendor: vendorId });
  if (!profile) {
    profile = new VendorFinancialProfile({
      vendor: vendorId,
      gst: { isRegistered: false, gstinStatus: 'N/A' },
    });
  }

  profile.bankAccount = {
    accountHolderName: holder,
    accountNumber: accNo,
    ifsc: code,
    bankName: bank,
    accountType: type,
    verificationStatus: verificationStatus,
    nameMatchStatus: nameMatchStatus,
    lastVerifiedAt: completedAt,
    failureReason: failureReason,
  };

  // Settlement eligibility: Requires Bank Verification = VERIFIED and PAN number present
  profile.isSettlementEligible =
    verificationStatus === 'VERIFIED' && Boolean(profile.pan?.panNumber);

  await profile.save();

  return {
    ok: ['VERIFIED', 'PROCESSING', 'PENDING'].includes(verificationStatus),
    verificationId,
    status: verificationStatus,
    nameMatchStatus,
    failureReason,
    bankAccount: profile.bankAccount,
    isSettlementEligible: profile.isSettlementEligible,
    completedAt,
    amount: logRecord.amount,
    currency: 'INR',
    provider,
    providerTransactionId,
    providerResponse,
  };
}
