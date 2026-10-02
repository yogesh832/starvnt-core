import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { externalConn } from '../../db/index.js';
import { evaluateVendorActivation } from '../../external/services/vendorActivation.service.js';
import { recordAudit, auditContext } from '../utils/audit.js';

import { ExternalUser } from '../../external/models/ExternalUser.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { VendorDocument } from '../../external/models/VendorDocument.js';

const router = Router();

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
router.get('/customers', requirePermission('users.read'), async (req, res, next) => {
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

    res.json({ ok: true, count: customers.length, total, customers });
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
    if (phone !== undefined) customer.phone = String(phone).trim();
    if (email !== undefined) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (trimmedEmail !== customer.email) {
        const exists = await ExternalUser.findOne({ email: trimmedEmail, _id: { $ne: customer._id } });
        if (exists) return res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
        customer.email = trimmedEmail;
      }
    }
    if (status !== undefined) customer.status = status;

    await customer.save();

    await recordAudit({
      ...auditContext(req),
      action: 'CUSTOMER_UPDATED',
      targetResource: 'customers',
      targetId: customer._id,
      fromState,
      toState: {
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        status: customer.status,
      },
    });

    res.json({ ok: true, customer: customer.toSafeJSON() });
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
      targetResource: 'customers',
      targetId: customer._id,
      reason,
      toState: { isFlagged: customer.isFlagged, flagReason: customer.flagReason },
    });

    res.json({ ok: true, customer: customer.toSafeJSON() });
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
      targetResource: 'customers',
      targetId: customer._id,
      reason,
      toState: {
        isRestricted: customer.isRestricted,
        restrictedUntil: customer.restrictedUntil,
        restrictionReason: customer.restrictionReason,
        status: customer.status,
      },
    });

    res.json({ ok: true, customer: customer.toSafeJSON() });
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

    await ExternalUser.findByIdAndDelete(customer._id);

    await recordAudit({
      ...auditContext(req),
      action: 'CUSTOMER_DELETED',
      targetResource: 'customers',
      targetId: customer._id,
      fromState: { fullName: customer.fullName, email: customer.email },
    });

    res.json({ ok: true, message: 'Customer deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * List all Vendors (Users)
 */
router.get('/vendors', requirePermission('users.read'), async (req, res, next) => {
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
router.get('/organizations', requirePermission('users.read'), async (req, res, next) => {
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
      .limit(limit);
      
    const total = await VendorOrganization.countDocuments(query);

    res.json({ ok: true, count: organizations.length, total, organizations });
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
      targetResource: 'vendors',
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
      targetResource: 'vendors',
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
      targetResource: 'vendors',
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

    // Clean up vendor docs
    await VendorDocument.deleteMany({ vendor: organization._id });

    // Detach from owner if owner exists
    if (organization.owner) {
      await ExternalUser.findByIdAndUpdate(organization.owner, {
        vendorOrganization: null,
      });
    }

    await VendorOrganization.findByIdAndDelete(organization._id);

    await recordAudit({
      ...auditContext(req),
      action: 'VENDOR_DELETED',
      targetResource: 'vendors',
      targetId: organization._id,
      fromState: { businessName: organization.businessName, owner: organization.owner },
    });

    res.json({ ok: true, message: 'Vendor organization deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Get vendor organization details and uploaded KYC documents for admin review
 */
router.get('/organizations/:id/documents', requirePermission('users.read'), async (req, res, next) => {
  try {
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

router.post('/organizations/:id/verification', requirePermission('vendors.approve'), async (req, res, next) => {
  try {
    const { approved = true, documentId, notes = '' } = req.body || {};
    const organization = await VendorOrganization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
    }

    let document = null;
    if (documentId) {
      document = await VendorDocument.findOne({ _id: documentId, vendor: organization._id });
      if (!document) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    } else {
      document = await VendorDocument.findOne({ vendor: organization._id, status: { $in: ['SUBMITTED', 'PENDING'] } }).sort({ createdAt: -1 });
    }

    if (approved) {
      if (document) {
        document.status = 'VERIFIED';
        document.verifiedAt = new Date();
        document.notes = [document.notes, notes || 'Approved by Core admin.'].filter(Boolean).join(' ');
        await document.save();
      }

      organization.verification = {
        ...(organization.verification?.toObject?.() || organization.verification || {}),
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: req.admin?._id || null,
        documentType: document?.type || organization.verification?.documentType || 'OTHER',
        documentRef: document?._id || organization.verification?.documentRef || null,
        notes: notes || 'Approved from Core admin verification panel.',
      };
    } else {
      if (document) {
        document.status = 'REJECTED';
        document.notes = [document.notes, notes || 'Rejected by Core admin.'].filter(Boolean).join(' ');
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
      } else {
        organization.verification = {
          ...(organization.verification?.toObject?.() || organization.verification || {}),
          notes: notes || 'Document rejected by Core admin.',
        };
      }
    }

    await organization.save();
    const activation = await evaluateVendorActivation(organization._id);
    res.json({ ok: true, organization, document, activation });
  } catch (err) {
    next(err);
  }
});

/**
 * Get detailed External User profile
 */
router.get('/:id', requirePermission('users.read'), async (req, res, next) => {
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
