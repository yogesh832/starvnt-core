import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, makeUser } from './helpers.js';

let VendorOrganization;
let VendorFinancialProfile;
let BankVerificationLog;
let discoverGstinsByPan;
let requestBankVerification;
let evaluateVendorActivation;

before(async () => {
  await setup();
  ({ VendorOrganization } = await import('../src/external/models/VendorOrganization.js'));
  ({ VendorFinancialProfile } = await import('../src/external/models/VendorFinancialProfile.js'));
  ({ BankVerificationLog } = await import('../src/external/models/BankVerificationLog.js'));
  ({ discoverGstinsByPan } = await import('../src/external/services/panVerification.service.js'));
  ({ requestBankVerification } = await import('../src/external/services/bankVerification.service.js'));
  ({ evaluateVendorActivation } = await import('../src/external/services/vendorActivation.service.js'));
});

after(teardown);

async function createTestVendor(email, businessName) {
  const { user } = await makeUser('VENDOR');
  const vendorOrg = await VendorOrganization.create({
    businessName,
    owner: user._id,
    category: 'Decoration',
    location: 'Mumbai',
  });
  user.vendorOrganization = vendorOrg._id;
  await user.save();
  return { user, vendorOrg };
}

test('1. Vendor without GST (GST = NO) can register, add PAN & Bank Account, and complete onboarding', async () => {
  const { vendorOrg } = await createTestVendor('nogst-vendor@starvnt.com', 'ABC Decoration');

  // Step 1: Submit PAN Number (Required)
  const panNumber = 'ABCDE1234F';
  let finProfile = await VendorFinancialProfile.create({
    vendor: vendorOrg._id,
    pan: {
      panNumber,
      verificationStatus: 'VERIFIED',
      legalName: 'ABC DECORATION PROPRIETOR',
      entityType: 'Individual / Proprietor',
      verifiedAt: new Date(),
    },
    // Step 2 & 3: GST Registered = NO (N/A)
    gst: {
      isRegistered: false,
      gstin: 'N/A',
      verificationStatus: 'NOT_APPLICABLE',
      gstinStatus: 'N/A',
    },
    // Step 5: Bank Details added independently of GST
    bankAccount: {
      accountHolderName: 'ABC Decoration',
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      accountType: 'SAVINGS',
      verificationStatus: 'NOT_VERIFIED',
    },
  });

  assert.equal(finProfile.gst.isRegistered, false);
  assert.equal(finProfile.gst.gstin, 'N/A');
  assert.equal(finProfile.gst.verificationStatus, 'NOT_APPLICABLE');

  // Step 6: Trigger ₹0.02 Penny Drop Bank Verification
  const verificationRes = await requestBankVerification(vendorOrg._id, finProfile.bankAccount, {
    requestedBy: 'VENDOR',
  });

  assert.equal(verificationRes.ok, true);
  assert.equal(verificationRes.status, 'VERIFIED');
  assert.equal(verificationRes.amount, 0.02);

  // Verify Audit Log record created
  const log = await BankVerificationLog.findOne({ vendor: vendorOrg._id });
  assert.ok(log);
  assert.equal(log.amount, 0.02);
  assert.equal(log.currency, 'INR');
  assert.equal(log.verificationStatus, 'VERIFIED');
  assert.equal(log.submittedAccountNumber, 'XXXXXXXX9012');

  // Re-fetch profile to check settlement eligibility & activation state
  const updatedProfile = await VendorFinancialProfile.findOne({ vendor: vendorOrg._id });
  assert.equal(updatedProfile.bankAccount.verificationStatus, 'VERIFIED');
  assert.equal(updatedProfile.isSettlementEligible, true);

  // Evaluate activation status: Should NOT be blocked due to GST missing!
  const activation = await evaluateVendorActivation(vendorOrg._id);
  assert.equal(activation.checklist.verified, true);
});

test('2. Vendor with GST (GST = YES) submits valid GSTIN and verifies Bank Account', async () => {
  const { vendorOrg } = await createTestVendor('gst-vendor@starvnt.com', 'XYZ Events Pvt Ltd');

  const gstin = '19ABCDE1234F1Z5';
  const panNumber = 'ABCDE1234F';

  let finProfile = await VendorFinancialProfile.create({
    vendor: vendorOrg._id,
    pan: {
      panNumber,
      verificationStatus: 'VERIFIED',
      legalName: 'XYZ EVENTS PRIVATE LIMITED',
      entityType: 'Company / Corporation',
    },
    gst: {
      isRegistered: true,
      gstin,
      verificationStatus: 'VERIFIED',
      legalName: 'XYZ EVENTS PRIVATE LIMITED',
      gstinStatus: 'ACTIVE',
    },
    bankAccount: {
      accountHolderName: 'XYZ Events Pvt Ltd',
      accountNumber: '987654321098',
      ifsc: 'ICIC0005678',
      bankName: 'ICICI Bank',
      accountType: 'CURRENT',
      verificationStatus: 'NOT_VERIFIED',
    },
  });

  assert.equal(finProfile.gst.isRegistered, true);
  assert.equal(finProfile.gst.gstin, '19ABCDE1234F1Z5');

  const bankResult = await requestBankVerification(vendorOrg._id, finProfile.bankAccount);
  assert.equal(bankResult.ok, true);
  assert.equal(bankResult.status, 'VERIFIED');
});

test('3. PAN -> GSTIN Discovery returns message when no GST is registered (does not fail PAN)', async () => {
  const result = await discoverGstinsByPan('ABCDE9999Z');
  assert.equal(result.ok, true);
  assert.equal(result.found, false);
  assert.equal(result.gstins.length, 0);
  assert.equal(result.message, 'No GST registration found for this PAN.');
});

test('4. Idempotency mechanism prevents duplicate ₹0.02 transactions', async () => {
  const { vendorOrg } = await createTestVendor('idempotent-vendor@starvnt.com', 'Idempotency Test Studio');

  const bankDetails = {
    accountHolderName: 'Idempotency Test Studio',
    accountNumber: '555566667777',
    ifsc: 'SBIN0001111',
    bankName: 'State Bank of India',
    accountType: 'SAVINGS',
  };

  const options = { verificationReference: 'REF-IDEMPOTENT-001' };

  const req1 = await requestBankVerification(vendorOrg._id, bankDetails, options);
  assert.equal(req1.ok, true);

  const req2 = await requestBankVerification(vendorOrg._id, bankDetails, options);
  assert.equal(req2.duplicate, true);
  assert.equal(req2.verificationId, req1.verificationId);

  const logCount = await BankVerificationLog.countDocuments({
    vendor: vendorOrg._id,
    verificationReference: 'REF-IDEMPOTENT-001',
  });
  assert.equal(logCount, 1);
});

test('5. Bank Verification Failure leaves status as FAILED and failureReason recorded', async () => {
  const { vendorOrg } = await createTestVendor('fail-vendor@starvnt.com', 'Failed Verification Studio');

  const invalidBankDetails = {
    accountHolderName: 'Unknown Holder',
    accountNumber: '000000000000',
    ifsc: 'FAIL0000000',
    bankName: 'Dummy Failed Bank',
    accountType: 'SAVINGS',
  };

  const res = await requestBankVerification(vendorOrg._id, invalidBankDetails, { forceRetry: true });
  assert.equal(res.ok, false);
  assert.equal(res.status, 'FAILED');
  assert.ok(res.failureReason.length > 0);

  const profile = await VendorFinancialProfile.findOne({ vendor: vendorOrg._id });
  assert.equal(profile.bankAccount.verificationStatus, 'FAILED');
  assert.equal(profile.isSettlementEligible, false);
});
