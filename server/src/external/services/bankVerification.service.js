import { config } from '../../config.js';
import { requestRazorpayBankVerification } from './razorpayBankVerification.service.js';

/** Shared by saving and verifying a Vendor OS settlement bank account. */
export function validateBankDetails(input = {}) {
  const bankDetails = {
    accountHolderName: String(input.accountHolderName || '').trim(),
    accountNumber: String(input.accountNumber || '').trim(),
    ifsc: String(input.ifsc || '').trim().toUpperCase(),
    bankName: String(input.bankName || '').trim(),
    accountType: String(input.accountType || 'SAVINGS').trim().toUpperCase(),
  };
  const invalid = (error, message) => ({ ok: false, error, message });
  if (!bankDetails.accountHolderName) return invalid('ACCOUNT_HOLDER_NAME_REQUIRED', 'Account holder name is required.');
  if (!/^\d{6,20}$/.test(bankDetails.accountNumber)) return invalid('INVALID_ACCOUNT_NUMBER', 'Account number must contain 6–20 digits.');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankDetails.ifsc)) return invalid('INVALID_IFSC_FORMAT', 'Enter a valid 11-character Indian IFSC code.');
  if (!bankDetails.bankName) return invalid('BANK_NAME_REQUIRED', 'Bank name is required.');
  if (!['SAVINGS', 'CURRENT', 'CC_OD', 'OTHER'].includes(bankDetails.accountType)) return invalid('INVALID_ACCOUNT_TYPE', 'Choose a supported bank account type.');
  return { ok: true, bankDetails };
}

/** Bank verification uses RazorpayX only. Cashfree and mock fallback are retired. */
export async function requestBankVerification(vendorId, input = {}, options = {}) {
  const validated = validateBankDetails(input);
  if (!validated.ok) return validated;
  if (String(options.provider || config.bankVerificationProvider).toUpperCase() !== 'RAZORPAY') {
    return { ok: false, error: 'BANK_PROVIDER_UNSUPPORTED', message: 'STARVNT bank verification uses Razorpay. Contact support to complete its setup.' };
  }
  return requestRazorpayBankVerification(vendorId, validated.bankDetails);
}
