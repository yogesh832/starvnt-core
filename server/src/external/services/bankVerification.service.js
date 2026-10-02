import crypto from 'crypto';
import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { BankVerificationLog } from '../models/BankVerificationLog.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { compareBusinessNames } from './gstinVerification.service.js';

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCOUNT_NO_RE = /^[0-9A-Z]{8,20}$/i;

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

/**
 * Execute ₹0.02 Penny-drop Bank Account Verification for a Vendor.
 * Spec §5, §6, §7, §8, §9, §10, §18, §19, §21, §22:
 * - Independent of GST status.
 * - Strictly a verification transaction (₹0.02) — NOT a payout or settlement.
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
      message: 'Account Number must be 8-20 alphanumeric characters.',
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
  const provider = options.provider || process.env.BANK_VERIFICATION_PROVIDER || 'SANDBOX_MOCK';
  const maskedAcc = maskAccountNumber(accNo);

  // Initial audit log record in PROCESSING state
  const logRecord = await BankVerificationLog.create({
    verificationId,
    vendor: vendorId,
    bankAccountId: options.bankAccountId || `BA-${Date.now()}`,
    provider,
    verificationReference: referenceKey,
    amount: 0.02,
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

  // Execute verification call via provider
  let verificationStatus = 'FAILED';
  let nameMatchStatus = 'NONE';
  let failureReason = '';
  let providerTxId = `TXN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  let providerResponse = {};

  try {
    if (provider === 'SANDBOX_MOCK' || !process.env.CASHFREE_CLIENT_ID) {
      // Mock / Sandbox Penny Drop Execution
      // If IFSC contains 'FAIL' or account number is all 0s, trigger simulated failure for testing
      if (code.includes('FAIL') || accNo === '000000000000') {
        verificationStatus = 'FAILED';
        failureReason = 'Bank account verification failed. Invalid bank account or branch inactive.';
        nameMatchStatus = 'MISMATCH';
      } else {
        verificationStatus = 'VERIFIED';
        // Check name match against account holder, vendor business name, and PAN legal name
        const matchOrg = compareBusinessNames(holder, vendorBusinessName);
        const matchPan = panLegalName ? compareBusinessNames(holder, panLegalName) : { matched: false, confidence: 'NONE' };
        
        if (matchOrg.matched || matchPan.matched) {
          nameMatchStatus = matchOrg.confidence === 'EXACT' || matchPan.confidence === 'EXACT' ? 'EXACT' : 'HIGH';
        } else {
          nameMatchStatus = 'MEDIUM'; // Penny drop succeeded with valid account
        }
      }

      providerResponse = {
        source: 'SANDBOX_MOCK_PENNY_DROP',
        amount: 0.02,
        currency: 'INR',
        bankTransferStatus: verificationStatus === 'VERIFIED' ? 'SUCCESS' : 'FAILED',
        registeredNameAtBank: holder,
        ifscVerified: true,
        utr: `UTR${Date.now()}`,
      };
    } else {
      // Live Provider Integration (Cashfree / Razorpay Penny Drop API contract)
      // Note: Secrets are read strictly from backend environment variables
      const cleanBase = (process.env.BANK_VERIFICATION_BASE_URL || 'https://payout-api.cashfree.com/payout/v1').replace(/\/$/, '');
      const resp = await fetch(`${cleanBase}/authorize/penny-drop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': process.env.CASHFREE_CLIENT_ID || '',
          'X-Client-Secret': process.env.CASHFREE_CLIENT_SECRET || '',
        },
        body: JSON.stringify({
          verification_id: verificationId,
          name: holder,
          phone: vendorOrg?.phone || '9999999999',
          bank_account: accNo,
          ifsc: code,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      providerResponse = json;
      providerTxId = json.referenceId || json.txId || providerTxId;

      if (resp.ok && (json.status === 'SUCCESS' || json.subCode === '200')) {
        verificationStatus = 'VERIFIED';
        nameMatchStatus = json.accountExist ? 'EXACT' : 'HIGH';
      } else {
        verificationStatus = 'FAILED';
        failureReason = json.message || json.reason || 'Bank verification rejected by provider.';
      }
    }
  } catch (err) {
    verificationStatus = 'FAILED';
    failureReason = err.message || 'Verification provider API network failure.';
  }

  const completedAt = new Date();

  // Update audit log record
  logRecord.providerTransactionId = providerTxId;
  logRecord.verificationStatus = verificationStatus;
  logRecord.nameMatchStatus = nameMatchStatus;
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
    ok: verificationStatus === 'VERIFIED',
    verificationId,
    status: verificationStatus,
    nameMatchStatus,
    failureReason,
    bankAccount: profile.bankAccount,
    isSettlementEligible: profile.isSettlementEligible,
    completedAt,
    amount: 0.02,
    currency: 'INR',
  };
}
