import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { externalConn } from '../../db/index.js';

// Get references to External Models (assuming they are registered on externalConn)
const ExternalUser = externalConn.model('ExternalUser');
const VendorOrganization = externalConn.model('VendorOrganization');

const router = Router();

// One email can be both a customer and a vendor (`roles`); legacy users only have accountType.
function roleQuery(role, search) {
  const clauses = [{ $or: [{ roles: role }, { accountType: role }] }];
  if (search) {
    clauses.push({
      $or: [
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
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
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.search) {
      query.businessName = { $regex: req.query.search, $options: 'i' };
    }

    const organizations = await VendorOrganization.find(query)
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
