import { identityOutcome, publicFinancialProfile, publicVerification } from '../../common/verificationPolicy.js';
import { Router } from 'express';
import { VendorFinancialProfile } from '../models/VendorFinancialProfile.js';
import { BankVerificationLog } from '../models/BankVerificationLog.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { verifyPan, discoverGstinsByPan } from '../services/panVerification.service.js';
import { verifyGstin } from '../services/gstinVerification.service.js';
import { requestBankVerification, validateBankDetails } from '../services/bankVerification.service.js';
import { bankFingerprint, razorpayBankAvailability } from '../services/razorpayBankVerification.service.js';
import { withVendorSchedule } from '../services/scheduleLock.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

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
      profile: publicFinancialProfile(profile),
      isSettlementEligible: Boolean(profile.isSettlementEligible),
      bankVerification: razorpayBankAvailability(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/pan
 * Spec Â§1: Collect & Validate PAN Number.
 * PAN is required from every vendor regardless of GST status.
 */
router.post('/pan', (req, res, next) => withVendorSchedule(`identity:${req.vendorId}`, async () => {
  const normalizedPan = String(req.body?.panNumber || '').trim().toUpperCase();
  const submittedLegalName = String(req.body?.fullLegalName || '').trim();
  if (!PAN_RE.test(normalizedPan)) return res.status(400).json({ error: 'INVALID_PAN_FORMAT', message: 'Enter a valid PAN.' });
  if (!submittedLegalName || submittedLegalName.length > 200) return res.status(400).json({ error: 'PAN_LEGAL_NAME_REQUIRED', message: 'Enter your complete legal name as printed on the PAN card.' });
  let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
  if (!profile) profile = new VendorFinancialProfile({ vendor: req.vendorId });
  const history = [...(profile.pan?.history || []).map(x => x.toObject?.() || x)];
  const changed = profile.pan?.panNumber !== normalizedPan || profile.pan?.submittedLegalName !== submittedLegalName;
  if (changed) profile.identityReviewRequired = true;
  profile.pan = { panNumber: normalizedPan, submittedLegalName, verificationStatus: 'UNDER_VERIFICATION', submittedAt: new Date(),
    verifiedAt: null, history: [...history, { actor: String(req.externalUser._id), action: 'SUBMITTED', status: 'SUBMITTED', submittedLegalName, at: new Date() }] };
  profile.isSettlementEligible = false;
  if (profile.gst?.verificationStatus === 'VERIFIED' && profile.gst.gstin?.slice(2, 12) !== normalizedPan) profile.gst.verificationStatus = 'SUBMITTED';
  await profile.save();
  // Revoke stale document evidence before contacting the provider. A failure must not
  // leave an older PAN document able to grant activation through the fallback path.
  await VendorDocument.updateMany({ vendor: req.vendorId, type: 'PAN' }, { $set: { status: 'SUBMITTED', verifiedAt: null, 'manualReview.required': true, 'manualReview.status': 'NEEDS_REVIEW' } });
  req.vendor.verification = { ...(req.vendor.verification?.toObject?.() || {}), isVerified: false, verifiedAt: null };
  await req.vendor.save();
  const result = await verifyPan(normalizedPan, submittedLegalName);
  const status = identityOutcome(result), verified = status === 'VERIFIED';
  profile.pan.verificationStatus = status;
  profile.pan.legalName = result.legalName || result.registeredName || '';
  profile.pan.entityType = result.entityType || '';
  profile.pan.checkedAt = result.checkedAt || new Date();
  profile.pan.verifiedAt = verified ? new Date() : null;
  profile.pan.raw = result;
  profile.pan.providerReference = String(result.providerReference || result.raw?.request_id || result.raw?.requestId || '').slice(0, 200);
  profile.pan.history.push({ actor: String(req.externalUser._id), action: 'PROVIDER_RESULT', status, providerReference: profile.pan.providerReference, verifiedAt: profile.pan.verifiedAt, at: new Date() });
  if (verified) profile.identityReviewRequired = false;
  profile.isSettlementEligible = verified && profile.bankAccount?.verificationStatus === 'VERIFIED';
  await profile.save();
  await VendorDocument.findOneAndUpdate({ vendor: req.vendorId, type: 'PAN', documentNumber: normalizedPan, fileUrl: { $in: ['', null] }, contentHash: { $in: ['', null] } }, { $set: {
    title: 'PAN Card / Tax Identity', type: 'PAN', documentNumber: normalizedPan, fileName: 'PAN identity document',
    status: verified ? 'VERIFIED' : 'SUBMITTED', verificationSource: 'PAN_API', verifiedAt: profile.pan.verifiedAt,
    verificationResult: { matched: verified, confidence: result.confidence || 'NONE', legalName: profile.pan.legalName, checkedAt: profile.pan.checkedAt },
    manualReview: { required: !verified, status: verified ? 'NONE' : 'NEEDS_REVIEW', reason: status, requestedAt: new Date() },
  } }, { upsert: true, new: true });
  req.vendor.verification = { ...(req.vendor.verification?.toObject?.() || {}), isVerified: verified, verifiedAt: profile.pan.verifiedAt, documentType: 'PAN', notes: verified ? 'Provider identity and submitted legal name verified' : 'Identity verification requires review' };
  await req.vendor.save();
  res.json({ ok: true, pan: publicFinancialProfile(profile).pan, isSettlementEligible: profile.isSettlementEligible,
    verificationResult: publicVerification(result), activation: await evaluateVendorActivation(req.vendorId) });
}).catch(next));

/**
 * POST /api/vendor/financial/discover-gstin
 * Spec Â§4: PAN -> GSTIN Discovery.
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
    const { raw, pan: privatePan, ...safe } = result;
    res.json({ ...safe, message: safe.ok ? safe.message : 'Identity lookup is unavailable or requires review.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vendor/financial/gst
 * Spec Â§2 & Â§3: GST Registration Status & GSTIN Logic.
 * Mandatory isRegistered flag (YES/NO).
 * If NO -> GSTIN is N/A, NOT required, and onboarding is NOT blocked!
 * If YES -> GSTIN becomes visible, required, validated, and verified.
 */
router.post('/gst', (req, res, next) => withVendorSchedule(`identity:${req.vendorId}`, async () => {
  try {
    const { isRegistered, gstin } = req.body || {};

    if (isRegistered === undefined || isRegistered === null) {
      return res
        .status(400)
        .json({ error: 'GST_STATUS_REQUIRED', message: 'GST Registration status (YES/NO) is mandatory.' });
    }

    if (![true, false, 'yes', 'no', 'YES', 'NO'].includes(isRegistered)) return res.status(400).json({ error: 'GST_STATUS_REQUIRED', message: 'Choose YES or NO for GST registration.' });
    const isGstYes = Boolean(isRegistered === true || String(isRegistered).toLowerCase() === 'yes');

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    if (!profile) {
      profile = new VendorFinancialProfile({ vendor: req.vendorId });
    }

    if (!isGstYes) {
      // GST Registered = NO -> Mark Not Applicable. Vendor can continue using PAN!
      profile.gst = {
        isRegistered: false,
        declaredAt: new Date(), declaredBy: String(req.externalUser._id),
        gstin: 'N/A',
        verificationStatus: 'NOT_APPLICABLE',
        legalName: '',
        tradeName: '',
        gstinStatus: 'NOT_APPLICABLE',
        verifiedAt: null,
        raw: null,
      };

      await profile.save();
      await VendorDocument.updateMany({ vendor: req.vendorId, type: 'GST' }, { $set: { status: 'SUBMITTED', verifiedAt: null, 'manualReview.required': true, 'manualReview.status': 'NEEDS_REVIEW' } });
      const activation = await evaluateVendorActivation(req.vendorId);
      profile.isSettlementEligible = activation.checklist.verified;
      await profile.save();

      return res.json({
        ok: true,
        gst: publicFinancialProfile(profile).gst,
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

    profile.gst = { isRegistered: true, declaredAt: new Date(), declaredBy: String(req.externalUser._id), gstin: normalizedGstin, verificationStatus: 'UNDER_VERIFICATION', verifiedAt: null };
    profile.isSettlementEligible = false;
    await profile.save();
    await VendorDocument.updateMany({ vendor: req.vendorId, type: 'GST' }, { $set: { status: 'SUBMITTED', verifiedAt: null } });

    const vendorNames = [req.vendor?.businessName, req.vendor?.brandName].filter(Boolean);
    const verificationResult = await verifyGstin(normalizedGstin, vendorNames.length ? vendorNames : req.vendor.businessName);
    const gstStatus = identityOutcome(verificationResult);
    const isVerified = gstStatus === 'VERIFIED';

    profile.gst = {
      isRegistered: true,
      declaredAt: new Date(), declaredBy: String(req.externalUser._id),
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
      { vendor: req.vendorId, type: 'GST', documentNumber: normalizedGstin, fileUrl: { $in: ['', null] }, contentHash: { $in: ['', null] } },
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
    profile.isSettlementEligible = activation.checklist.verified;
    await profile.save();

    res.json({
      ok: true,
      gst: publicFinancialProfile(profile).gst,
      verificationResult: publicVerification(verificationResult),
      activation,
    });
  } catch (err) {
    next(err);
  }
}).catch(next));

/**
 * POST /api/vendor/financial/bank
 * Spec Â§5: Add / Update Bank Details (GST Independent).
 * Collects Account Holder Name, Account Number, IFSC, Bank Name, Account Type.
 * Can be added whether GST Registered is YES or NO!
 */
const bankWrite = handler => (req, res, next) => withVendorSchedule(`bank:${req.vendorId}`, () => handler(req, res, next)).catch(next);

router.post('/bank', bankWrite(async (req, res, next) => {
  try {
    const validated = validateBankDetails(req.body || {});
    if (!validated.ok) return res.status(400).json(validated);
    const { accountHolderName, accountNumber, ifsc, bankName, accountType } = validated.bankDetails;

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    if (!profile) {
      profile = new VendorFinancialProfile({ vendor: req.vendorId });
    }

    const unchanged = bankFingerprint(profile.bankAccount) === bankFingerprint({ accountHolderName, accountNumber, ifsc, accountType });
    const pending = await BankVerificationLog.exists({ vendor: req.vendorId, provider: 'RAZORPAY', verificationStatus: 'PROCESSING' });
    if (pending && !unchanged) return res.status(409).json({ error: 'BANK_VERIFICATION_IN_PROGRESS', message: 'Wait for the current bank verification to finish before changing these details.' });
    profile.bankAccount = {
      accountHolderName: String(accountHolderName).trim(),
      accountNumber: String(accountNumber).trim(),
      ifsc: String(ifsc).trim().toUpperCase(),
      bankName: String(bankName).trim(),
      accountType: String(accountType || 'SAVINGS').toUpperCase(),
      verificationStatus: unchanged ? profile.bankAccount?.verificationStatus || 'NOT_VERIFIED' : 'NOT_VERIFIED',
      nameMatchStatus: unchanged ? profile.bankAccount?.nameMatchStatus || 'NONE' : 'NONE',
      lastVerifiedAt: unchanged ? profile.bankAccount?.lastVerifiedAt || null : null,
      failureReason: unchanged ? profile.bankAccount?.failureReason || '' : '',
    };

    if (!unchanged) profile.isSettlementEligible = false;
    await profile.save();

    res.json({
      ok: true,
      bankAccount: publicFinancialProfile(profile).bankAccount,
      message: 'Bank details updated. Proceed to bank account verification.',
    });
  } catch (err) {
    next(err);
  }
}));

/**
 * POST /api/vendor/financial/bank/verify
 * Spec Â§6, Â§7, Â§8, Â§9, Â§10: Execute bank account verification.
 * Independent of GST Status!
 */
router.post('/bank/verify', bankWrite(async (req, res, next) => {
  try {
    const { accountHolderName, accountNumber, ifsc, bankName, accountType } =
      req.body || {};

    let profile = await VendorFinancialProfile.findOne({ vendor: req.vendorId });
    const bankDetails = {
      accountHolderName: accountHolderName || profile?.bankAccount?.accountHolderName,
      accountNumber: accountNumber || profile?.bankAccount?.accountNumber,
      ifsc: ifsc || profile?.bankAccount?.ifsc,
      bankName: bankName || profile?.bankAccount?.bankName,
      accountType: accountType || profile?.bankAccount?.accountType,
    };

    const result = await requestBankVerification(req.vendorId, bankDetails);

    if (!result.ok && result.error) {
      return res.status(['RAZORPAYX_NOT_CONFIGURED', 'BANK_PROVIDER_UNSUPPORTED'].includes(result.error) ? 503 : 400).json(result);
    }

    const activation = await evaluateVendorActivation(req.vendorId);

    res.json({
      ...result,
      activation,
    });
  } catch (err) {
    next(err);
  }
}));

/**
 * GET /api/vendor/financial/bank/verifications
 * Spec Â§20: Retrieve Bank Verification Audit Log history.
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
