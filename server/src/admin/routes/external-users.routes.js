import { observeProduct } from '../../common/productObservability.js';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { reviewActivation } from '../services/vendorActivationReview.js';
import { Router } from 'express';
import { requireAdminAuth, requirePermission, requireAnyPermission } from '../middleware/requireAdminAuth.js';
import { externalConn } from '../../db/index.js';
import { evaluateVendorActivation } from '../../external/services/vendorActivation.service.js';
import { recordAudit, auditContext } from '../utils/audit.js';

import { ExternalUser } from '../../external/models/ExternalUser.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { VendorDocument } from '../../external/models/VendorDocument.js';
import { sendPrivateDocument } from '../../external/services/privateVendorDocument.service.js';
import mongoose from 'mongoose';
import { VendorFinancialProfile } from '../../external/models/VendorFinancialProfile.js';
import { BusinessAuditLog } from '../models/BusinessAuditLog.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';

const router = Router();
function customerForAdmin(req, customer) {
  const value = { ...customer.toSafeJSON(), _id: customer._id };
  if (req.admin.role !== 'SUPER_ADMIN' && !req.admin.permissions.includes('customerContacts.read')) { delete value.email; delete value.phone; }
  return value;
}

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// One email can be both a customer and a vendor (`roles`); legacy users only have accountType.
function roleQuery(role, search, statusFilter) {
  const clauses = [{ $or: [{ roles: role }, { accountType: role }] }];
  if (search && search.trim()) {
    const escaped = escapeRegex(search.trim());
    clauses.push({
      $or: [
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
        { fullName: { $regex: escaped, $options: 'i' } },
      ],
    });
  }
  if (statusFilter && statusFilter !== 'All') {
    const lower = statusFilter.toLowerCase();
    if (lower === 'active') {
      clauses.push({ status: 'ACTIVE', isRestricted: { $ne: true } });
    } else if (lower === 'flagged') {
      clauses.push({ isFlagged: true });
    } else if (lower === 'suspended') {
      clauses.push({ $or: [{ status: 'SUSPENDED' }, { isRestricted: true }] });
    } else if (lower === 'inactive' || lower === 'disabled') {
      clauses.push({ status: { $in: ['DISABLED', 'SUSPENDED'] } });
    }
  }
  return { $and: clauses };
}

// Require admin authentication for viewing external users
router.use(requireAdminAuth);

/**
 * List all Customers
 */
router.get('/customers', requirePermission('customers.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = parseInt(req.query.skip, 10) || 0;
    
    const query = roleQuery('CUSTOMER', req.query.search, req.query.tab || req.query.status);

    const customers = await ExternalUser.find(query)
      .select('-passwordHash') // Security: never return hashes to frontend
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await ExternalUser.countDocuments(query);

    const visible = customers.map(customer => customerForAdmin(req, customer));
    await recordAudit({ ...auditContext(req), action: 'CUSTOMER_DIRECTORY_READ', targetType: 'customers', targetId: visible.map(c => String(c.id)).join(','), reason: 'Customer directory access' });
    res.json({ ok: true, count: visible.length, total, customers: visible });
  } catch (err) {
    next(err);
  }
});

/**
 * Edit Customer details
 */
router.patch('/customers/:id', requirePermission('customers.update'), async (req, res, next) => {
  try {
    const { fullName, phone, email, status } = req.body || {};
    const customer = await ExternalUser.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
    }

    const fromState = {
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      status: customer.status,
    };

    if (fullName !== undefined) customer.fullName = String(fullName).trim();
    if (phone !== undefined && String(phone).trim() !== (customer.phone || '')) return res.status(400).json({ error: 'CONTACT_VERIFICATION_REQUIRED', message: 'Customer contact changes require the customer OTP workflow.' });
    if (email !== undefined) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (trimmedEmail !== customer.email) {
        return res.status(400).json({ error: 'CONTACT_VERIFICATION_REQUIRED', message: 'Contact support for a verified email ownership review.' });
      }
    }
    if (status !== undefined) customer.status = status;

    await customer.save();

    await recordAudit({
      ...auditContext(req),
      action: 'CUSTOMER_UPDATED',
      targetType: 'customers',
      targetId: customer._id,
      fromState,
      toState: {
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        status: customer.status,
      },
    });

    res.json({ ok: true, customer: customerForAdmin(req, customer) });
  } catch (err) {
    next(err);
  }
});

/**
 * Flag / Unflag Customer
 */
router.post('/customers/:id/flag', requirePermission('customers.update'), async (req, res, next) => {
  try {
    const { isFlagged, reason = '' } = req.body || {};
    const customer = await ExternalUser.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
    }

    const nextFlag = typeof isFlagged === 'boolean' ? isFlagged : !customer.isFlagged;
    customer.isFlagged = nextFlag;
    customer.flagReason = nextFlag ? (reason || 'Flagged by Admin') : '';
    customer.flaggedAt = nextFlag ? new Date() : null;

    await customer.save();

    await recordAudit({
      ...auditContext(req),
      action: nextFlag ? 'CUSTOMER_FLAGGED' : 'CUSTOMER_UNFLAGGED',
      targetType: 'customers',
      targetId: customer._id,
      reason,
      toState: { isFlagged: customer.isFlagged, flagReason: customer.flagReason },
    });

    res.json({ ok: true, customer: customerForAdmin(req, customer) });
  } catch (err) {
    next(err);
  }
});

/**
 * Restrict / Suspend Customer for N days
 */
router.post('/customers/:id/restrict', requirePermission('customers.disable'), async (req, res, next) => {
  try {
    const { days = 0, reason = '' } = req.body || {};
    const customer = await ExternalUser.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
    }

    const numDays = Number(days);
    if (numDays > 0) {
      customer.isRestricted = true;
      customer.restrictedUntil = new Date(Date.now() + numDays * 86400000);
      customer.restrictionReason = reason || `Restricted for ${numDays} days`;
      customer.status = 'SUSPENDED';
    } else {
      customer.isRestricted = false;
      customer.restrictedUntil = null;
      customer.restrictionReason = '';
      customer.status = 'ACTIVE';
    }

    await customer.save();

    await recordAudit({
      ...auditContext(req),
      action: customer.isRestricted ? 'CUSTOMER_RESTRICTED' : 'CUSTOMER_UNRESTRICTED',
      targetType: 'customers',
      targetId: customer._id,
      reason,
      toState: {
        isRestricted: customer.isRestricted,
        restrictedUntil: customer.restrictedUntil,
        restrictionReason: customer.restrictionReason,
        status: customer.status,
      },
    });

    res.json({ ok: true, customer: customerForAdmin(req, customer) });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete Customer
 */
router.delete('/customers/:id', requirePermission('customers.delete'), async (req, res, next) => {
  try {
    const customer = await ExternalUser.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
    }

    const fromState = {
      fullName: customer.fullName,
      email: customer.email,
      status: customer.status,
      isRestricted: customer.isRestricted,
    };
    customer.status = 'DISABLED';
    customer.isRestricted = true;
    customer.restrictionReason = req.body?.reason || 'Deactivated by admin. Record retained for audit and relationship integrity.';
    customer.restrictedUntil = null;
    await customer.save();

    await recordAudit({
      ...auditContext(req),
      action: 'CUSTOMER_DEACTIVATED',
      targetType: 'ExternalUser',
      targetId: String(customer._id),
      fromState,
      toState: {
        status: customer.status,
        isRestricted: customer.isRestricted,
        restrictionReason: customer.restrictionReason,
      },
      reason: req.body?.reason || '',
    });

    res.json({ ok: true, message: 'Customer deactivated and retained for audit.', customer: customerForAdmin(req, customer) });
  } catch (err) {
    next(err);
  }
});

/**
 * List all Vendors (Users)
 */
router.get('/vendors', requirePermission('vendors.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = parseInt(req.query.skip, 10) || 0;
    
    const query = roleQuery('VENDOR', req.query.search, req.query.tab || req.query.status);

    const vendors = await ExternalUser.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await ExternalUser.countDocuments(query);

    res.json({ ok: true, count: vendors.length, total, vendors });
  } catch (err) {
    next(err);
  }
});

/**
 * List all Vendor Organizations
 */
router.get('/organizations', requirePermission('vendors.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = parseInt(req.query.skip, 10) || 0;
    
    const query = {};

    // Tab / Status filter
    const statusFilter = req.query.tab || req.query.status;
    if (statusFilter && statusFilter !== 'All') {
      const lower = statusFilter.toLowerCase();
      if (lower === 'verified') {
        query['verification.isVerified'] = true;
      } else if (lower === 'pending') {
        query['verification.isVerified'] = { $ne: true };
        query.status = { $ne: 'REJECTED' };
      } else if (lower === 'manual review' || lower === 'review') {
        query['manualReview.status'] = { $in: ['NEEDS_REVIEW', 'IN_REVIEW'] };
      } else if (lower === 'rejected') {
        query.status = 'REJECTED';
      } else if (lower === 'flagged') {
        query.isFlagged = true;
      } else if (lower === 'suspended') {
        query.$or = [{ status: 'SUSPENDED' }, { isRestricted: true }];
      } else {
        query.status = { $regex: new RegExp(`^${escapeRegex(statusFilter)}$`, 'i') };
      }
    }

    // Comprehensive search across businessName, category, location, and owner details
    if (req.query.search && req.query.search.trim()) {
      const term = escapeRegex(req.query.search.trim());
      const regex = { $regex: term, $options: 'i' };

      // Also search owner ExternalUser matching name, email, or phone
      const matchingOwners = await ExternalUser.find({
        $or: [
          { fullName: regex },
          { email: regex },
          { phone: regex },
        ],
      }).select('_id').limit(50);
      const ownerIds = matchingOwners.map((u) => u._id);

      query.$or = [
        { businessName: regex },
        { category: regex },
        { location: regex },
        ...(ownerIds.length > 0 ? [{ owner: { $in: ownerIds } }] : []),
      ];
    }

    const organizations = await VendorOrganization.find(query)
      .populate('owner', 'fullName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
      
    const total = await VendorOrganization.countDocuments(query);
    const organizationIds = organizations.map((org) => org._id);
    const pendingDocCounts = await VendorDocument.aggregate([
      { $match: { vendor: { $in: organizationIds }, status: { $in: ['SUBMITTED', 'PENDING'] } } },
      { $group: { _id: '$vendor', count: { $sum: 1 } } },
    ]);
    const pendingDocCountByVendor = new Map(pendingDocCounts.map((row) => [String(row._id), row.count]));
    const enriched = organizations.map((org) => {
      const pendingDocumentCount = pendingDocCountByVendor.get(String(org._id)) || 0;
      return {
        ...org,
        pendingDocumentCount,
        adminActions: {
          canApproveVerification: pendingDocumentCount > 0 && org.verification?.isVerified !== true,
          kycActionLabel: org.verification?.isVerified ? 'View KYC' : org.manualReview?.status && org.manualReview.status !== 'NONE' ? 'Manual Review' : pendingDocumentCount > 0 ? 'Review KYC' : 'KYC Pending',
        },
      };
    });

    res.json({ ok: true, count: enriched.length, total, organizations: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * Edit Vendor Organization details
 */
router.patch('/organizations/:id', requirePermission('vendors.update'), async (req, res, next) => {
  try {
    const { businessName, category, location, phone, website, bio, status } = req.body || {};
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    const fromState = {
      businessName: organization.businessName,
      category: organization.category,
      location: organization.location,
      phone: organization.phone,
      website: organization.website,
      bio: organization.bio,
      status: organization.status,
    };

    if (businessName !== undefined) organization.businessName = String(businessName).trim();
    if (category !== undefined) organization.category = String(category).trim();
    if (location !== undefined) organization.location = String(location).trim();
    if (phone !== undefined) organization.phone = String(phone).trim();
    if (website !== undefined) organization.website = String(website).trim();
    if (bio !== undefined) organization.bio = String(bio).trim();
    if (status !== undefined) organization.status = status;

    await organization.save();

    await recordAudit({
      ...auditContext(req),
      action: 'VENDOR_ORG_UPDATED',
      targetType: 'vendors',
      targetId: organization._id,
      fromState,
      toState: {
        businessName: organization.businessName,
        category: organization.category,
        location: organization.location,
        phone: organization.phone,
        website: organization.website,
        bio: organization.bio,
        status: organization.status,
      },
    });

    const populated = await VendorOrganization.findById(organization._id).populate('owner', 'fullName email phone');
    res.json({ ok: true, organization: populated });
  } catch (err) {
    next(err);
  }
});

/**
 * Flag / Unflag Vendor Organization
 */
router.post('/organizations/:id/flag', requirePermission('vendors.update'), async (req, res, next) => {
  try {
    const { isFlagged, reason = '' } = req.body || {};
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    const nextFlag = typeof isFlagged === 'boolean' ? isFlagged : !organization.isFlagged;
    organization.isFlagged = nextFlag;
    organization.flagReason = nextFlag ? (reason || 'Flagged by Admin') : '';
    organization.flaggedAt = nextFlag ? new Date() : null;

    await organization.save();

    await recordAudit({
      ...auditContext(req),
      action: nextFlag ? 'VENDOR_FLAGGED' : 'VENDOR_UNFLAGGED',
      targetType: 'vendors',
      targetId: organization._id,
      reason,
      toState: { isFlagged: organization.isFlagged, flagReason: organization.flagReason },
    });

    const populated = await VendorOrganization.findById(organization._id).populate('owner', 'fullName email phone');
    res.json({ ok: true, organization: populated });
  } catch (err) {
    next(err);
  }
});

/**
 * Restrict / Suspend Vendor Organization for N days
 */
router.post('/organizations/:id/restrict', requirePermission('vendors.disable'), async (req, res, next) => {
  try {
    const { days = 0, reason = '' } = req.body || {};
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    const numDays = Number(days);
    if (numDays > 0) {
      organization.isRestricted = true;
      organization.restrictedUntil = new Date(Date.now() + numDays * 86400000);
      organization.restrictionReason = reason || `Restricted for ${numDays} days`;
      organization.status = 'SUSPENDED';
    } else {
      organization.isRestricted = false;
      organization.restrictedUntil = null;
      organization.restrictionReason = '';
      organization.status = 'ACTIVE';
    }

    await organization.save();

    // Also update owner if exists
    if (organization.owner) {
      await ExternalUser.findByIdAndUpdate(organization.owner, {
        isRestricted: organization.isRestricted,
        restrictedUntil: organization.restrictedUntil,
        restrictionReason: organization.restrictionReason,
        status: organization.isRestricted ? 'SUSPENDED' : 'ACTIVE',
      });
    }

    await recordAudit({
      ...auditContext(req),
      action: organization.isRestricted ? 'VENDOR_RESTRICTED' : 'VENDOR_UNRESTRICTED',
      targetType: 'vendors',
      targetId: organization._id,
      reason,
      toState: {
        isRestricted: organization.isRestricted,
        restrictedUntil: organization.restrictedUntil,
        restrictionReason: organization.restrictionReason,
        status: organization.status,
      },
    });

    const populated = await VendorOrganization.findById(organization._id).populate('owner', 'fullName email phone');
    res.json({ ok: true, organization: populated });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete Vendor Organization
 */
router.delete('/organizations/:id', requirePermission('vendors.delete'), async (req, res, next) => {
  try {
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    const fromState = {
      businessName: organization.businessName,
      owner: organization.owner,
      status: organization.status,
      activationState: organization.activationState,
      isRestricted: organization.isRestricted,
    };
    organization.status = 'SUSPENDED';
    organization.activationState = 'REGISTERED';
    organization.isCommerciallyActive = false;
    organization.isRestricted = true;
    organization.restrictionReason = req.body?.reason || 'Deactivated by admin. Record retained for audit and relationship integrity.';
    organization.restrictedUntil = null;
    await organization.save();

    if (organization.owner) {
      await ExternalUser.findByIdAndUpdate(organization.owner, {
        status: 'SUSPENDED',
        isRestricted: true,
        restrictionReason: organization.restrictionReason,
      });
    }

    await recordAudit({
      ...auditContext(req),
      action: 'VENDOR_DEACTIVATED',
      targetType: 'VendorOrganization',
      targetId: String(organization._id),
      fromState,
      toState: {
        status: organization.status,
        activationState: organization.activationState,
        isCommerciallyActive: organization.isCommerciallyActive,
        isRestricted: organization.isRestricted,
        restrictionReason: organization.restrictionReason,
      },
      reason: req.body?.reason || '',
    });

    res.json({ ok: true, message: 'Vendor organization deactivated and retained for audit.', organization });
  } catch (err) {
    next(err);
  }
});

/**
 * Get vendor organization details and uploaded KYC documents for admin review
 */
router.get('/organizations/:id/documents', requirePermission('vendors.read'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const organization = await VendorOrganization.findById(req.params.id).populate('owner', 'fullName email phone');
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    const documents = await VendorDocument.find({ vendor: organization._id }).sort({ createdAt: -1 });
    const activation = await evaluateVendorActivation(organization._id);

    res.json({ ok: true, organization, documents, activation });
  } catch (err) {
    next(err);
  }
});

router.get('/organizations/:id/documents/:documentId/content', requirePermission('vendors.read'), requirePermission('vendorIdentity.readSensitive'), async (req, res, next) => {
  try {
    const { id, documentId } = req.params;
    const document = mongoose.isValidObjectId(id) && mongoose.isValidObjectId(documentId) && await VendorDocument.findOne({ _id: documentId, vendor: id }).select('+privateContent');
    if (!document) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    await sendPrivateDocument(res, document, req.admin._id, 'ADMIN');
  } catch (error) { next(error); }
});

router.post('/organizations/:id/verification', requirePermission('vendors.read'), requirePermission('vendors.approve'), (req, res, next) => withVendorSchedule(`identity:${req.params.id}`, async () => {
  try {
    const { approved, documentId, notes = '', expectedDocumentVersion } = req.body || {};
    if (typeof approved !== 'boolean' || !mongoose.isValidObjectId(documentId) || typeof notes !== 'string' || !notes.trim() || notes.length > 1000) return res.status(400).json({ error: 'DOCUMENT_REVIEW_REQUIRED', message: 'Choose the exact document, an explicit decision and a review reason.' });
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    const document = await VendorDocument.findOne({ _id: documentId, vendor: organization._id });
    if (!document) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });

    if (document && (!Number.isInteger(expectedDocumentVersion) || expectedDocumentVersion !== (document.__v || 0))) return res.status(409).json({ error: 'DOCUMENT_VERSION_CONFLICT', message: 'Reload and review the current document before deciding.' });
    if (approved) {
      if (!document) {
        return res.status(409).json({ error: 'NO_PENDING_KYC_DOCUMENT', message: 'A submitted KYC document is required before vendor verification can be approved.' });
      }
      const financial = await VendorFinancialProfile.findOne({ vendor: organization._id });
      if (['PAN', 'GST'].includes(document.type) && (financial?.identityReviewRequired || financial?.[document.type === 'PAN' ? 'pan' : 'gst']?.verificationStatus !== 'VERIFIED')) return res.status(409).json({ error: 'MANUAL_IDENTITY_POLICY_REQUIRED', message: 'Document review cannot override an unresolved identity/provider result. Keep it under review until the authorized identity review policy and evidence are approved.' });
      if (['PAN', 'GST'].includes(document.type) && (!document.documentNumber || document.documentNumber !== (document.type === 'PAN' ? financial.pan.panNumber : financial.gst.gstin))) return res.status(409).json({ error: 'DOCUMENT_IDENTITY_BINDING_REQUIRED', message: 'This file must be reviewed against the current declared identity number, not a superseded identity.' });
      const hasFile = Boolean(document.contentHash || document.fileUrl);
      if (!hasFile && document.status !== 'VERIFIED') return res.status(409).json({ error: 'EVIDENCE_FILE_REQUIRED', message: 'A verification placeholder is not uploaded evidence.' });
      if (hasFile) {
        if (req.admin.role !== 'SUPER_ADMIN' && !req.admin.permissions.includes('vendorIdentity.readSensitive')) return res.status(403).json({ error: 'SENSITIVE_EVIDENCE_PERMISSION_REQUIRED', message: 'Sensitive document access permission is required for evidence review.' });
        const read = await BusinessAuditLog.exists({ actorId: String(req.admin._id), action: 'VENDOR_PRIVATE_DOCUMENT_READ', resourceId: String(document._id), createdAt: { $gte: document.uploadedAt || document.createdAt }, ...(document.contentHash ? { 'traceContext.documentHash': document.contentHash } : {}) });
        if (!read) return res.status(409).json({ error: 'EVIDENCE_READ_REQUIRED', message: 'Open the private evidence before approving its review.' });
      }
      document.status = 'VERIFIED';
      document.verifiedAt = new Date();
      document.notes = [document.notes, notes || 'Approved by Core admin.'].filter(Boolean).join(' ');
      document.manualReview = {
        ...(document.manualReview?.toObject?.() || document.manualReview || {}),
        required: false,
        status: 'APPROVED',
        reviewedBy: req.admin?._id || null,
        reviewedAt: new Date(),
      };
      document.reviewHistory.push({ actor: String(req.admin._id), decision: 'APPROVED', at: new Date(), reason: notes.trim(), version: expectedDocumentVersion, contentHash: document.contentHash });
      await document.save();

      organization.verification = {
        ...(organization.verification?.toObject?.() || organization.verification || {}),
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: req.admin?._id || null,
        documentType: document?.type || organization.verification?.documentType || 'OTHER',
        documentRef: document?._id || organization.verification?.documentRef || null,
        notes: notes || 'Approved from Core admin verification panel.',
      };
      organization.manualReview = {
        ...(organization.manualReview?.toObject?.() || organization.manualReview || {}),
        status: 'APPROVED',
        reviewedBy: req.admin?._id || null,
        reviewedAt: new Date(),
        notes: notes || 'Approved from Core admin verification panel.',
      };
    } else {
      if (document) {
        document.status = 'REJECTED';
        document.verifiedAt = null;
        document.notes = [document.notes, notes || 'Rejected by Core admin.'].filter(Boolean).join(' ');
        document.manualReview = {
          ...(document.manualReview?.toObject?.() || document.manualReview || {}),
          required: false,
          status: 'REJECTED',
          reviewedBy: req.admin?._id || null,
          reviewedAt: new Date(),
        };
        document.reviewHistory.push({ actor: String(req.admin._id), decision: 'REJECTED', at: new Date(), reason: notes.trim(), version: expectedDocumentVersion, contentHash: document.contentHash });
        await document.save();
      }

      // Check if vendor has any remaining verified GST or PAN document
      const hasVerifiedDocs = await VendorDocument.exists({
        vendor: organization._id,
        type: { $in: ['GST', 'PAN'] },
        status: 'VERIFIED',
      });

      if (!hasVerifiedDocs) {
        organization.verification = {
          ...(organization.verification?.toObject?.() || organization.verification || {}),
          isVerified: false,
          notes: notes || 'Rejected by Core admin.',
        };
        organization.manualReview = {
          ...(organization.manualReview?.toObject?.() || organization.manualReview || {}),
          status: 'REJECTED',
          reviewedBy: req.admin?._id || null,
          reviewedAt: new Date(),
          notes: notes || 'Rejected by Core admin.',
        };
      } else {
        organization.verification = {
          ...(organization.verification?.toObject?.() || organization.verification || {}),
          notes: notes || 'Document rejected by Core admin.',
        };
      }
    }

    await organization.save();
    await recordAudit({ ...auditContext(req), action: 'VENDOR_DOCUMENT_REVIEW_DECISION', targetType: 'VendorDocument', targetId: String(document._id), reason: 'Explicit document review decision', toState: { status: document.status, organizationId: String(organization._id), documentVersion: document.__v } });
    const activation = await evaluateVendorActivation(organization._id);
    res.json({ ok: true, organization, document, activation });
  } catch (err) {
    next(err);
  }
}).catch(next));

router.post('/organizations/:id/activation', async (req, res, next) => {
  if (req.admin?.role === 'SUPER_ADMIN' || req.admin?.permissions?.includes('vendors.approve')) return next();
  try { await AdminAuditLog.create({ ...auditContext(req), action: 'VENDOR_ACTIVATION_DENIED', targetType: 'VendorOrganization', targetId: req.params.id, reason: 'Missing vendors.approve permission' }); }
  catch { return res.status(503).json({ error: 'AUDIT_UNAVAILABLE' }); }
  return res.status(403).json({ error: 'FORBIDDEN' });
}, async (req, res) => {
  try {
    const result = await reviewActivation(req.params.id, req.body || {}, { id: req.admin._id, role: req.admin.role });
    await recordAudit({ ...auditContext(req), action: 'VENDOR_ACTIVATION_REVIEW', targetType: 'VendorOrganization', targetId: req.params.id, reason: req.body.reason, toState: { status: result.status.activationState } });
    await observeProduct('activation_review', 'SUCCESS');
    res.json({ ok: true, ...result });
  } catch (err) {
    await observeProduct('activation_review', 'FAILED');
    await recordAudit({ ...auditContext(req), action: 'VENDOR_ACTIVATION_DENIED', targetType: 'VendorOrganization', targetId: req.params.id, reason: err.message });
    res.status(err.statusCode || 400).json({ error: err.code || 'ACTIVATION_FAILED', message: err.message });
  }
});

router.post('/organizations/:id/founding-partner', requirePermission('vendors.update'), async (req, res, next) => {
  try {
    const { enrollFoundingPartner } = await import('../../experience/launchpad.service.js');
    const { cohort = 'Founding Partner 2026', durationDays = 30 } = req.body || {};
    const updated = await enrollFoundingPartner(req.params.id, { cohort, durationDays: Number(durationDays) || 30 });
    if (!updated) return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    await recordAudit({ ...auditContext(req), action: 'VENDOR_FOUNDING_PARTNER_ENROLLED', targetType: 'VendorOrganization', targetId: req.params.id, reason: `Enrolled in cohort ${cohort}` });
    res.json({ ok: true, foundingPartner: updated.foundingPartner });
  } catch (err) {
    next(err);
  }
});

router.post('/organizations/:id/manual-review', requirePermission('vendors.approve'), async (req, res, next) => {
  try {
    const { status = 'IN_REVIEW', reason = '', documentId = null, notes = '' } = req.body || {};
    const allowed = new Set(['NEEDS_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'INVALID_REVIEW_STATUS' });
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });

    let document = null;
    if (documentId) {
      document = await VendorDocument.findOne({ _id: documentId, vendor: organization._id });
      if (!document) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
      document.manualReview = {
        ...(document.manualReview?.toObject?.() || document.manualReview || {}),
        required: ['NEEDS_REVIEW', 'IN_REVIEW'].includes(status),
        status,
        reason: reason || document.manualReview?.reason || '',
        reviewedBy: ['APPROVED', 'REJECTED'].includes(status) ? req.admin?._id || null : document.manualReview?.reviewedBy || null,
        reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? new Date() : document.manualReview?.reviewedAt || null,
      };
      await document.save();
    }

    organization.manualReview = {
      ...(organization.manualReview?.toObject?.() || organization.manualReview || {}),
      status,
      reason: reason || organization.manualReview?.reason || 'Manual KYC review',
      documentRef: document?._id || organization.manualReview?.documentRef || null,
      requestedAt: organization.manualReview?.requestedAt || new Date(),
      assignedTo: ['NEEDS_REVIEW', 'IN_REVIEW'].includes(status) ? req.admin?._id || null : organization.manualReview?.assignedTo || null,
      reviewedBy: ['APPROVED', 'REJECTED'].includes(status) ? req.admin?._id || null : organization.manualReview?.reviewedBy || null,
      reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? new Date() : organization.manualReview?.reviewedAt || null,
      notes,
    };
    await organization.save();
    await recordAudit({
      ...auditContext(req),
      action: 'VENDOR_KYC_MANUAL_REVIEW_UPDATED',
      targetType: 'VendorOrganization',
      targetId: String(organization._id),
      reason,
      toState: { manualReview: organization.manualReview },
    });

    res.json({ ok: true, organization, document, activation: await evaluateVendorActivation(organization._id) });
  } catch (err) {
    next(err);
  }
});

/**
 * Get detailed External User profile
 */
router.get('/:id', requireAnyPermission('customers.read', 'vendors.read'), async (req, res, next) => {
  try {
    const user = await ExternalUser.findById(req.params.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    
    const result = { user };

    // If it's a vendor, fetch their organization data
    if (user.accountType === 'VENDOR' && user.organizationId) {
      const organization = await VendorOrganization.findById(user.organizationId);
      result.organization = organization;
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;

