import { Router } from 'express';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { assertBookingActor, findCoreBooking } from '../../admin/services/bookingWorkflow.service.js';
import { getExecutionProjection, recordExecutionAction, submitCompletionEvidence, handleVendorFailureAndDiscoverAlternatives } from '../../admin/services/executionSettlement.service.js';
import { caseProjection, reportIssue, updateCase } from '../../admin/services/disputes.service.js';
import { reconcileBookingWorkflow } from '../../admin/services/bookingWorkflowEffects.service.js';
const router = Router();
const h = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const actor = req => ({ id: String(req.externalUser._id), vendorId: String(req.externalUser.vendorOrganization), type: 'VENDOR' });
router.use(requireExternalAuth, requireAccountType('VENDOR'));
router.get('/bookings', h(async (req, res) => {
  const bookings = await CoreBooking.find({ vendorId: req.externalUser.vendorOrganization }).sort({ eventDate: 1 }).limit(100).select('bookingReference serviceName category eventDate executionStatus workflowVersion paymentStatus bookingStatus customerEvent').lean();
  res.json({ ok: true, bookings });
}));
router.get('/bookings/:id', h(async (req, res) => {
  const booking = await findCoreBooking(req.params.id);
  assertBookingActor(booking, actor(req));
  res.json({ ok: true, bookingId: booking._id, serviceName: booking.serviceName, eventId: booking.customerEvent,
    execution: getExecutionProjection(booking), cases: caseProjection(booking, actor(req)),
    settlement: { status: booking.settlementStatus, reviewAt: booking.payoutReviewAt,
      operations: booking.financeOperations.filter(op => op.kind === 'SETTLEMENT').map(op => ({ amount: op.amount, status: op.status, confirmedAt: op.confirmedAt })) } });
}));
router.post('/bookings/:id/execution', h(async (req, res) => {
  const vendorId = req.externalUser.vendorOrganization;
  const booking = req.body.action === 'SUBMIT_COMPLETION' ? await submitCompletionEvidence(req.params.id, vendorId, req.body, req.externalUser._id)
    : await recordExecutionAction(req.params.id, vendorId, req.body, req.externalUser._id);
  await reconcileBookingWorkflow(booking._id).catch(() => {});
  res.json({ ok: true, execution: getExecutionProjection(booking) });
}));
router.post('/bookings/:id/cases', h(async (req, res) => {
  const booking = await reportIssue(req.params.id, req.body, actor(req));
  await reconcileBookingWorkflow(booking._id).catch(() => {});
  res.json({ ok: true, cases: caseProjection(booking, actor(req)) });
}));
router.post('/bookings/:id/cases/:caseId', h(async (req, res) => {
  const booking = await updateCase(req.params.id, req.params.caseId, req.body, actor(req));
  await reconcileBookingWorkflow(booking._id).catch(() => {});
  res.json({ ok: true, cases: caseProjection(booking, actor(req)) });
}));
router.post('/bookings/:id/failure', h(async (req, res) => {
  const result = await handleVendorFailureAndDiscoverAlternatives(req.params.id, { ...req.body, actor: actor(req) });
  res.json({ ok: true, originalBookingId: result.failedBooking._id, status: result.matchSummary.status });
}));
export default router;
