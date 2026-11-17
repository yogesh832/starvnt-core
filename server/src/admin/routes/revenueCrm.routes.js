import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { adminActor } from '../services/bookingWorkflow.service.js';
import { EventRequirement, CustomerEvent } from '../../customer/models/index.js';
import { FollowUp } from '../../external/models/FollowUp.js';
import { AdminUser } from '../models/AdminUser.js';
import { crmLead, linkedLeadRecords, updateCrmLead, createStaffFollowUp, completeStaffFollowUp, revenueCrmReport, crmSourcingOptions, sourceCrmVendor } from '../services/revenueCrm.service.js';
const router = Router();
const h = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
router.use(requireAdminAuth, requirePermission('leads.read'));
router.get('/', h(async (req, res) => {
  const actor = adminActor(req.admin);
  const assign = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('leads.assign');
  const leads = await EventRequirement.find(assign ? {} : { 'crm.owner': actor.id }).sort({ updatedAt: -1 }).limit(100).lean();
  const events = await CustomerEvent.find({ _id: { $in: leads.map(lead => lead.event) } }).select('title eventType eventDate customer city').lean();
  const followUps = await FollowUp.find({ scope: 'STAFF', requirement: { $in: leads.map(lead => lead._id) } }).sort({ dueDate: 1 }).lean();
  const owners = assign ? await AdminUser.find({ status: 'ACTIVE', $or: [{ role: 'SUPER_ADMIN' }, { permissions: 'leads.update' }] }).select('_id email fullName').lean() : [];
  res.json({ ok: true, leads: leads.map(lead => ({ ...lead, eventDetails: events.find(event => String(event._id) === String(lead.event)),
    followUps: followUps.filter(item => String(item.requirement) === String(lead._id)) })), owners });
}));
router.get('/report', h(async (req, res) => res.json(await revenueCrmReport(adminActor(req.admin), Number(req.query.days || 30)))));
router.get('/:id', h(async (req, res) => { const lead = await crmLead(req.params.id, adminActor(req.admin)); res.json({ ok: true, lead, ...await linkedLeadRecords(lead) }); }));
router.post('/:id', requirePermission('leads.update'), h(async (req, res) => res.json({ ok: true, lead: await updateCrmLead(req.params.id, req.body, adminActor(req.admin)) })));
router.post('/:id/followups', requirePermission('leads.update'), h(async (req, res) => res.status(201).json({ ok: true, followUp: await createStaffFollowUp(req.params.id, req.body, adminActor(req.admin)) })));
router.get('/:id/options', h(async (req, res) => res.json(await crmSourcingOptions(req.params.id, adminActor(req.admin)))));
router.post('/:id/source', requirePermission('leads.update'), h(async (req, res) => res.status(201).json({ ok: true, opportunity: await sourceCrmVendor(req.params.id, req.body, adminActor(req.admin)) })));
router.post('/followups/:id/complete', requirePermission('leads.update'), h(async (req, res) => res.json({ ok: true, followUp: await completeStaffFollowUp(req.params.id, req.body, adminActor(req.admin)) })));
export default router;
