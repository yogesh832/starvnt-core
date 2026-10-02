import { Router } from 'express';
import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { BankVerificationLog } from '../models/BankVerificationLog.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { verifyPan, discoverGstinsByPan } from '../services/panVerification.service.js';
import { verifyGstin } from '../services/gstinVerification.service.js';
import { requestBankVerification } from '../services/bankVerification.service.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';

const router = Router();

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;

/**
 * GET /api/v1/vendor/financial or /api/vendor/financial
 * Fetch vendor financial profile (PAN, GST, Bank, Verification Status).
 */
router.get('/', async (req, res, next) => {
  try {
    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    if (!profile) {
      profile = await VendorFinancialProfile.create({
        vendor: req.vendorId,
        gst: { isRegistered: false, gstinStatus: 'N/A' },
      });
    }

    res.json({
      ok: true,
      profile,
      isSettlementEligible: Boolean(profile.isSettlementEligible),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/pan
 * Spec §1: Collect & Validate PAN Number.
 * PAN is required from every vendor regardless of GST status.
 */
router.post('/pan', async (req, res, next) => {
  try {
    const { panNumber } = req.body || {};
    const normalizedPan = String(panNumber || '').trim().toUpperCase();

    if (!normalizedPan) {
      return res.status(400).json({ error: 'PAN_REQUIRED', message: 'PAN Number is required.' });
    }
    if (!PAN_RE.test(normalizedPan)) {
      return res.status(400).json({
        error: 'INVALID_PAN_FORMAT',
        message: 'PAN must be a valid 10-character alphanumeric string (e.g. ABCDE1234F).',
      });
    }

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    if (!profile) {
      profile = new VendorFinancialProfile({ vendor: req.vendorId });
    }

    // Run backend verification
    const verificationResult = await verifyPan(normalizedPan, req.vendor.businessName);

    const isVerified = Boolean(verificationResult.ok && verificationResult.matched);
    const panStatus = isVerified ? 'VERIFIED' : verificationResult.ok ? 'VERIFIED' : 'FAILED';

    profile.pan = {
      panNumber: normalizedPan,
      verificationStatus: panStatus,
      legalName: verificationResult.legalName || verificationResult.registeredName || '',
      entityType: verificationResult.entityType || '',
      verifiedAt: isVerified ? new Date() : null,
      raw: verificationResult,
    };

    // Update settlement eligibility if bank account is already verified
    profile.isSettlementEligible =
      profile.bankAccount?.verificationStatus === 'VERIFIED' && Boolean(normalizedPan);

    await profile.save();

    // Create/update VendorDocument record for PAN
    await VendorDocument.findOneAndUpdate(
      { vendor: req.vendorId, type: 'PAN' },
      {
        title: 'PAN Card / Tax Identity',
        type: 'PAN',
        documentNumber: normalizedPan,
        fileName: `PAN_${normalizedPan}.pdf`,
        status: isVerified ? 'VERIFIED' : 'SUBMITTED',
        verificationSource: 'PAN_API',
        verificationResult: {
          matched: Boolean(verificationResult.matched),
          confidence: verificationResult.confidence || 'NONE',
          legalName: verificationResult.legalName || '',
          pan: normalizedPan,
          checkedAt: new Date(),
        },
        verifiedAt: isVerified ? new Date() : null,
      },
      { upsert: true, new: true }
    );

    // If PAN is verified, check if main vendor verification can be updated
    if (isVerified && !req.vendor.verification?.isVerified) {
      req.vendor.verification = {
        ...(req.vendor.verification?.toObject?.() || req.vendor.verification || {}),
        isVerified: true,
        verifiedAt: new Date(),
        documentType: 'PAN',
        notes: `Verified via PAN API match (${verificationResult.legalName || ''})`,
      };
      await req.vendor.save();
    }

    const activation = await evaluateVendorActivation(req.vendorId);

    res.json({
      ok: true,
      pan: profile.pan,
      isSettlementEligible: profile.isSettlementEligible,
      verificationResult,
      activation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/discover-gstin
 * Spec §4: PAN -> GSTIN Discovery.
 * Discovers GSTIN registrations under a PAN.
 */
router.post('/discover-gstin', async (req, res, next) => {
  try {
    const { pan } = req.body || {};
    const targetPan = String(pan || '').trim().toUpperCase();

    if (!targetPan) {
      return res.status(400).json({ error: 'PAN_REQUIRED', message: 'PAN is required for GSTIN search.' });
    }

    const result = await discoverGstinsByPan(targetPan);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/gst
 * Spec §2 & §3: GST Registration Status & GSTIN Logic.
 * Mandatory isRegistered flag (YES/NO).
 * If NO -> GSTIN is N/A, NOT required, and onboarding is NOT blocked!
 * If YES -> GSTIN becomes visible, required, validated, and verified.
 */
router.post('/gst', async (req, res, next) => {
  try {
    const { isRegistered, gstin } = req.body || {};

    if (isRegistered === undefined || isRegistered === null) {
      return res
        .status(400)
        .json({ error: 'GST_STATUS_REQUIRED', message: 'GST Registration status (YES/NO) is mandatory.' });
    }

    const isGstYes = Boolean(isRegistered === true || String(isRegistered).toLowerCase() === 'yes');

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    if (!profile) {
      profile = new VendorFinancialProfile({ vendor: req.vendorId });
    }

    if (!isGstYes) {
      // GST Registered = NO -> Mark Not Applicable. Vendor can continue using PAN!
      profile.gst = {
        isRegistered: false,
        gstin: 'N/A',
        verificationStatus: 'NOT_APPLICABLE',
        legalName: '',
        tradeName: '',
        gstinStatus: 'NOT_APPLICABLE',
        verifiedAt: null,
        raw: null,
      };

      await profile.save();
      const activation = await evaluateVendorActivation(req.vendorId);

      return res.json({
        ok: true,
        gst: profile.gst,
        message: 'GST status set to NOT REGISTERED (N/A). Onboarding continues via PAN.',
        activation,
      });
    }

    // GST Registered = YES -> GSTIN is required & format validated
    const normalizedGstin = String(gstin || '').trim().toUpperCase();
    if (!normalizedGstin) {
      return res.status(400).json({
        error: 'GSTIN_REQUIRED',
        message: 'GSTIN is required when GST Registration status is YES.',
      });
    }
    if (!GSTIN_RE.test(normalizedGstin)) {
      return res.status(400).json({
        error: 'INVALID_GSTIN_FORMAT',
        message: 'GSTIN must be a valid 15-character Indian GSTIN format (e.g. 19ABCDE1234F1Z5).',
      });
    }

    const verificationResult = await verifyGstin(normalizedGstin, req.vendor.businessName);
    const isVerified = Boolean(verificationResult.ok && verificationResult.matched);
    const gstStatus = isVerified ? 'VERIFIED' : verificationResult.ok ? 'VERIFIED' : 'FAILED';

    profile.gst = {
      isRegistered: true,
      gstin: normalizedGstin,
      verificationStatus: gstStatus,
      legalName: verificationResult.legalName || '',
      tradeName: verificationResult.tradeName || '',
      gstinStatus: verificationResult.gstinStatus || 'ACTIVE',
      verifiedAt: isVerified ? new Date() : null,
      raw: verificationResult,
    };

    await profile.save();

    // Create/update VendorDocument record for GST
    await VendorDocument.findOneAndUpdate(
      { vendor: req.vendorId, type: 'GST' },
      {
        title: 'GST Registration Certificate',
        type: 'GST',
        documentNumber: normalizedGstin,
        fileName: `GSTIN_${normalizedGstin}.pdf`,
        status: isVerified ? 'VERIFIED' : 'SUBMITTED',
        verificationSource: 'GSTIN_API',
        verificationResult: {
          matched: Boolean(verificationResult.matched),
          confidence: verificationResult.confidence || 'NONE',
          legalName: verificationResult.legalName || '',
          tradeName: verificationResult.tradeName || '',
          checkedAt: new Date(),
        },
        verifiedAt: isVerified ? new Date() : null,
      },
      { upsert: true, new: true }
    );

    const activation = await evaluateVendorActivation(req.vendorId);

    res.json({
      ok: true,
      gst: profile.gst,
      verificationResult,
      activation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/bank
 * Spec §5: Add / Update Bank Details (GST Independent).
 * Collects Account Holder Name, Account Number, IFSC, Bank Name, Account Type.
 * Can be added whether GST Registered is YES or NO!
 */
router.post('/bank', async (req, res, next) => {
  try {
    const { accountHolderName, accountNumber, ifsc, bankName, accountType } = req.body || {};

    if (!accountHolderName || !accountNumber || !ifsc || !bankName) {
      return res.status(400).json({
        error: 'BANK_DETAILS_INCOMPLETE',
        message: 'Account Holder Name, Account Number, IFSC, and Bank Name are required.',
      });
    }

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    if (!profile) {
      profile = new VendorFinancialProfile({ vendor: req.vendorId });
    }

    profile.bankAccount = {
      accountHolderName: String(accountHolderName).trim(),
      accountNumber: String(accountNumber).trim(),
      ifsc: String(ifsc).trim().toUpperCase(),
      bankName: String(bankName).trim(),
      accountType: String(accountType || 'SAVINGS').toUpperCase(),
      verificationStatus: profile.bankAccount?.verificationStatus || 'NOT_VERIFIED',
      nameMatchStatus: profile.bankAccount?.nameMatchStatus || 'NONE',
      lastVerifiedAt: profile.bankAccount?.lastVerifiedAt || null,
      failureReason: profile.bankAccount?.failureReason || '',
    };

    await profile.save();

    res.json({
      ok: true,
      bankAccount: profile.bankAccount,
      message: 'Bank details updated. Proceed to ₹0.02 Penny-drop verification.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/bank/verify
 * Spec §6, §7, §8, §9, §10: Execute ₹0.02 Penny-drop verification.
 * Independent of GST Status!
 */
router.post('/bank/verify', async (req, res, next) => {
  try {
    const { accountHolderName, accountNumber, ifsc, bankName, accountType, forceRetry } =
      req.body || {};

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    const bankDetails = {
      accountHolderName: accountHolderName || profile?.bankAccount?.accountHolderName,
      accountNumber: accountNumber || profile?.bankAccount?.accountNumber,
      ifsc: ifsc || profile?.bankAccount?.ifsc,
      bankName: bankName || profile?.bankAccount?.bankName,
      accountType: accountType || profile?.bankAccount?.accountType,
    };

    const result = await requestBankVerification(req.vendorId, bankDetails, {
      requestedBy: 'VENDOR',
      forceRetry: Boolean(forceRetry),
    });

    if (!result.ok && result.error) {
      return res.status(400).json(result);
    }

    const activation = await evaluateVendorActivation(req.vendorId);

    res.json({
      ...result,
      activation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/vendor/financial/bank/verifications
 * Spec §20: Retrieve Bank Verification Audit Log history.
 */
router.get('/bank/verifications', async (req, res, next) => {
  try {
    const logs = await BankVerificationLog.find({ vendor: req.vendorId }).sort({ createdAt: -1 });
    res.json({ ok: true, verifications: logs });
  } catch (err) {
    next(err);
  }
});

export default router;
