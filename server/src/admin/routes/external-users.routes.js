import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { externalConn } from '../../db/index.js';
import { evaluateVendorActivation } from '../../external/services/vendorActivation.service.js';

// Get references to External Models (assuming they are registered on externalConn)
const ExternalUser = externalConn.model('ExternalUser');
const VendorOrganization = externalConn.model('VendorOrganization');
const VendorDocument = externalConn.model('VendorDocument');

const router = Router();

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// One email can be both a customer and a vendor (`roles`); legacy users only have accountType.
function roleQuery(role, search) {
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
  return { $and: clauses };
}

// Require admin authentication for viewing external users
router.use(requireAdminAuth);

/**
 * List all Customers
 */
router.get('/customers', requirePermission('users.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const query = roleQuery('CUSTOMER', req.query.search);

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
 * List all Vendors (Users)
 */
router.get('/vendors', requirePermission('users.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const query = roleQuery('VENDOR', req.query.search);

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
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
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
      const ownerIds = matchingOwners.map(u => u._id);

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
      organization.verification = {
        ...(organization.verification?.toObject?.() || organization.verification || {}),
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: req.admin?._id || null,
        documentType: document?.type || 'OTHER',
        documentRef: document?._id || null,
        notes: notes || 'Approved from Core admin verification panel.',
      };
      if (document) {
        document.status = 'VERIFIED';
        document.verifiedAt = new Date();
        document.notes = [document.notes, notes || 'Approved by Core admin.'].filter(Boolean).join(' ');
        await document.save();
      }
    } else {
      organization.verification = {
        ...(organization.verification?.toObject?.() || organization.verification || {}),
        isVerified: false,
        notes: notes || 'Rejected by Core admin.',
      };
      if (document) {
        document.status = 'REJECTED';
        document.notes = [document.notes, notes || 'Rejected by Core admin.'].filter(Boolean).join(' ');
        await document.save();
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
