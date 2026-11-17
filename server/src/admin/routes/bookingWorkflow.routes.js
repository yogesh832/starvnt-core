import { Router } from 'express';
import { requireAdminAuth, requireAnyPermission, requirePermission } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { adminActor, findCoreBooking } from '../services/bookingWorkflow.service.js';
import { getExecutionProjection, assignCompletionPolicy, validateCompletionFromCore, handleVendorFailureAndDiscoverAlternatives } from '../services/executionSettlement.service.js';
import { caseProjection, updateCase, reportIssue, resolveDispute } from '../services/disputes.service.js';
import { financeProjection, requestFinanceOperation, updateFinanceOperation, processProviderRefund, reconcileProviderRefund } from '../services/financeOperations.service.js';
import { reconcileBookingWorkflow } from '../services/bookingWorkflowEffects.service.js';
const router = Router();
const h = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const can = (actor, permission) => actor.role === 'SUPER_ADMIN' || actor.permissions.includes(permission);
router.use(requireAdminAuth);
router.get('/bookings', requireAnyPermission('operations.read', 'operations.manage', 'bookings.read', 'settlements.read', 'payments.refund', 'settlements.release', 'settlements.approve'), h(async (req, res) => {
  const bookings = await CoreBooking.find().sort({ updatedAt: -1 }).limit(100).select('bookingReference serviceName category eventDate workflowVersion executionStatus bookingStatus paymentStatus settlementStatus protectionStatus customerEvent vendorId').lean();
  res.json({ ok: true, bookings });
}));
router.get('/bookings/:id', requireAnyPermission('operations.read', 'operations.manage', 'bookings.read', 'settlements.read', 'payments.refund', 'settlements.release', 'settlements.approve'), h(async (req, res) => {
  const booking = await findCoreBooking(req.params.id);
  const actor = adminActor(req.admin);
  const operations = can(actor, 'operations.manage');
  const finance = ['settlements.read', 'settlements.release', 'settlements.approve', 'payments.refund'].some(p => can(actor, p));
  res.json({ ok: true, booking: { _id: booking._id, bookingReference: booking.bookingReference, customerEvent: booking.customerEvent,
    serviceName: booking.serviceName, eventDate: booking.eventDate },
    execution: operations ? getExecutionProjection(booking) : { version: booking.workflowVersion || 0, executionStatus: booking.executionStatus },
    cases: operations ? caseProjection(booking, actor) : undefined, finance: finance ? await financeProjection(booking) : undefined });
}));
async function result(res, booking) {
  await reconcileBookingWorkflow(booking._id).catch(() => {}); // Intent remains available to the reconciliation worker.
  res.json({ ok: true, bookingId: booking._id, version: booking.workflowVersion, executionStatus: booking.executionStatus, settlementStatus: booking.settlementStatus });
}
router.post('/bookings/:id/completion-policy', requirePermission('operations.manage'), h(async (req, res) => result(res, await assignCompletionPolicy(req.params.id, req.body, adminActor(req.admin)))));
router.post('/bookings/:id/validate', requirePermission('operations.manage'), h(async (req, res) => result(res, await validateCompletionFromCore(req.params.id, req.body, adminActor(req.admin)))));
router.post('/bookings/:id/failure', requirePermission('operations.manage'), h(async (req, res) => {
  const failure = await handleVendorFailureAndDiscoverAlternatives(req.params.id, { ...req.body, actor: adminActor(req.admin) });
  return result(res, failure.failedBooking);
}));
router.post('/bookings/:id/cases', requirePermission('operations.manage'), h(async (req, res) => result(res, await reportIssue(req.params.id, req.body, adminActor(req.admin)))));
router.post('/bookings/:id/cases/:caseId', requirePermission('operations.manage'), h(async (req, res) => {
  const actor = adminActor(req.admin);
  const booking = req.body.action === 'RESOLVE' ? await resolveDispute(req.params.id, req.params.caseId, req.body, actor)
    : await updateCase(req.params.id, req.params.caseId, req.body, actor);
  return result(res, booking);
}));
router.post('/bookings/:id/finance', requireAnyPermission('payments.refund', 'settlements.release'), h(async (req, res) => result(res, await requestFinanceOperation(req.params.id, req.body, adminActor(req.admin)))));
router.post('/bookings/:id/finance/:operationId', requireAnyPermission('payments.refund', 'settlements.release', 'settlements.approve'), h(async (req, res) => {
  const { id, operationId } = req.params;
  const actor = adminActor(req.admin);
  if (req.body.action === 'PROCESS_PROVIDER') return result(res, await processProviderRefund(id, operationId, actor));
  if (req.body.action === 'RECONCILE_PROVIDER') {
    if (actor.role !== 'SUPER_ADMIN' && !actor.permissions.includes('payments.refund')) return res.status(403).json({ error: 'FORBIDDEN' });
    return result(res, await reconcileProviderRefund(id, operationId));
  }
  return result(res, await updateFinanceOperation(id, operationId, req.body, actor));
}));
export default router;
