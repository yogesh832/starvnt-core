import { VendorBookingSlot } from '../../external/models/VendorBookingSlot.js';
import { observeProduct } from '../../common/productObservability.js';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { VendorBlockout } from '../../external/models/VendorBlockout.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { checkTrueAvailability } from '../../external/services/availability.service.js';
import { cancelCommitment, cancelLegacyCommitment } from '../../external/services/commitments.service.js';
import { recordAudit, auditContext } from '../utils/audit.js';
import { validDate } from '../../common/scheduleRules.js';

const router = Router();
router.use(requireAdminAuth, requirePermission('vendors.read'));
const canPII = admin => admin.role === 'SUPER_ADMIN' || admin.permissions.includes('availability.personal.read');
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.vendor) {
      if (!mongoose.isValidObjectId(req.query.vendor)) return res.status(400).json({ error: 'INVALID_VENDOR' });
      filter.vendor = new mongoose.Types.ObjectId(req.query.vendor);
    }
    for (const [field, allowed] of [['recordType', ['VENDOR_BLOCK', 'EXTERNAL_COMMITMENT']], ['status', ['ACTIVE', 'CONFLICT_REVIEW', 'CANCELLED', 'COMPLETED']], ['scope', ['BUSINESS', 'SERVICE', 'RESOURCE']]]) {
      if (req.query[field]) { if (!allowed.includes(req.query[field])) return res.status(400).json({ error: 'INVALID_FILTER' }); filter[field] = req.query[field]; }
    }
    if (req.query.from || req.query.to) {
      if ((req.query.from && !validDate(req.query.from)) || (req.query.to && !validDate(req.query.to))) return res.status(400).json({ error: 'INVALID_DATE' });
      if (req.query.to) filter.date = { $lte: req.query.to };
      if (req.query.from) filter.$or = [{ endDate: { $gte: req.query.from } }, { endDate: null, date: { $gte: req.query.from } }];
    }
    if (req.query.resource) {
      if (!mongoose.isValidObjectId(req.query.resource)) return res.status(400).json({ error: 'INVALID_RESOURCE' });
      filter.resourceIds = new mongoose.Types.ObjectId(req.query.resource);
    }
    const page = Math.max(0, Math.min(10000, Number(req.query.page) || 0));
    const resultRows = await VendorBlockout.aggregate([
      { $set: { sourceModel: 'VendorBlockout', recordType: { $ifNull: ['$recordType', 'VENDOR_BLOCK'] }, status: { $ifNull: ['$status', 'ACTIVE'] }, scope: { $ifNull: ['$scope', 'BUSINESS'] }, endDate: { $ifNull: ['$endDate', '$date'] } } },
      { $unionWith: { coll: VendorBookingSlot.collection.name, pipeline: [{ $set: { sourceModel: 'VendorBookingSlot', sourceStatus: '$status', recordType: 'EXTERNAL_COMMITMENT', verificationStatus: 'REPORTED', status: { $cond: [{ $in: ['$status', ['CANCELLED', 'COMPLETED']] }, '$status', 'ACTIVE'] }, scope: { $cond: [{ $gt: [{ $size: { $ifNull: ['$assignedResources', []] } }, 0] }, 'RESOURCE', 'SERVICE'] }, resourceIds: '$assignedResources', allDay: false, endDate: '$date', reason: 'Legacy vendor-reported commitment' } }] } },
      { $match: filter }, { $sort: { date: -1, _id: -1 } }, { $skip: page * 50 }, { $limit: 51 },
    ]);
    const rows = resultRows.slice(0, 50);
    const vendors = await VendorOrganization.find({ _id: { $in: rows.map(r => r.vendor) } }).select('businessName').lean();
    const names = new Map(vendors.map(v => [String(v._id), v.businessName]));
    const personal = canPII(req.admin);
    const records = await Promise.all(rows.map(async row => {
      const result = ['CANCELLED', 'COMPLETED'].includes(row.status) ? { conflicts: [] } : await checkTrueAvailability({ vendorId: row.vendor, ...row, vendorServiceId: row.vendorService, requestedResources: row.resourceIds, excludeId: row._id, blockAll: row.recordType !== 'EXTERNAL_COMMITMENT' });
      if (!personal && row.external) { const { eventType, location } = row.external; row.external = { eventType, location }; }
      delete row.requestHash;
      return { ...row, vendorName: names.get(String(row.vendor)), conflicts: result.conflicts };
    }));
    await AdminAuditLog.create({ ...auditContext(req), action: personal ? 'AVAILABILITY_PERSONAL_DATA_READ' : 'AVAILABILITY_READ', targetType: 'VendorBlockout', targetId: records.map(r => String(r._id)).join(','), reason: 'Operational availability review' });
    await observeProduct('admin_availability_read', 'SUCCESS');
    res.json({ ok: true, records: req.query.conflict === 'true' ? records.filter(r => r.conflicts.length) : records, page, hasMore: resultRows.length > 50, personalDataVisible: personal });
  } catch (err) { await observeProduct('admin_availability_read', 'FAILED'); next(err); }
});
router.post('/:id/cancel', requirePermission('vendors.update'), async (req, res) => {
  try {
    if (!String(req.body?.reason || '').trim()) return res.status(400).json({ error: 'REASON_REQUIRED' });
    const block = await VendorBlockout.findById(req.params.id).select('vendor');
    const row = block || await VendorBookingSlot.findById(req.params.id).select('vendor');
    if (!row) return res.status(404).json({ error: 'RECORD_NOT_FOUND' });
    await (block ? cancelCommitment : cancelLegacyCommitment)(row.vendor, row._id, { id: req.admin._id, role: req.admin.role }, req.body.reason);
    res.json({ ok: true });
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.code || 'CANCEL_FAILED', message: err.message }); }
});
export default router;
