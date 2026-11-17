import { CoreBooking } from '../models/CoreBooking.js';
import { Booking } from '../../customer/models/index.js';
import { publishOutboxEvent } from '../../automation/services/outbox.service.js';
import { recordBusinessAudit } from '../utils/audit.js';
import { postConfirmedFinanceLedger, reconcileProviderRefund } from './financeOperations.service.js';
import { reconcileDisputeWallet } from './disputes.service.js';
import { ensureInvoiceForBooking } from './financeLedger.service.js';

export async function reconcileBookingWorkflow(bookingId) {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) return;
  await postConfirmedFinanceLedger(booking);
  await reconcileDisputeWallet(booking.vendorId);
  if (booking.executionStatus === 'COMPLETION_VERIFIED') {
    const tax = await ensureInvoiceForBooking(booking, 'CORE_WORKFLOW');
    await CoreBooking.updateOne({ _id: booking._id, 'taxSummary.invoiceNumber': { $in: ['', null] } }, { $set: { taxSummary: booking.taxSummary } });
  }
  const mapped = { NOT_STARTED: 'not_started', SERVICE_SCHEDULED: 'not_started', CHECKED_IN: 'checked_in', SERVICE_STARTED: 'started', COMPLETION_SUBMITTED: 'started', COMPLETION_VERIFIED: 'completed' };
  if (booking.customerBookingId) await Booking.updateOne({ _id: booking.customerBookingId, customer: booking.customerId }, { $set: {
    executionStatus: mapped[booking.executionStatus], checkedInAt: booking.execution.checkedInAt || null,
    startedAt: booking.execution.startedAt || null, completedAt: booking.validationAudit?.verifiedAt || null,
  } });
  for (const event of booking.workflowEvents.filter(e => !e.dispatchedAt)) {
    const key = `booking-workflow:${booking._id}:${event.key}`;
    await recordBusinessAudit({ actorId: event.actorType === 'ADMIN' && /^[a-f0-9]{24}$/i.test(event.actor) ? event.actor : undefined,
      who: event.actor, actorType: event.actorType, action: event.action, resourceType: 'CoreBooking', resourceId: String(booking._id),
      fromState: event.fromState, toState: event.toState, why: event.reason, source: 'BOOKING_WORKFLOW', authority: event.actorType,
      idempotencyKey: key });
    await publishOutboxEvent({ eventType: 'BOOKING_WORKFLOW_CHANGED', aggregateType: 'CoreBooking', aggregateId: String(booking._id),
      idempotencyKey: key, payload: { bookingId: String(booking._id), action: event.action, key } });
    await CoreBooking.updateOne({ _id: booking._id, 'workflowEvents._id': event._id }, { $set: { 'workflowEvents.$.dispatchedAt': new Date() } });
  }
}

export async function reconcileWorkflowBatch(limit = 50) {
  const failures = [];
  const rows = await CoreBooking.find({ workflowEvents: { $elemMatch: { dispatchedAt: { $exists: false } } } }).select('_id').limit(limit).lean();
  for (const booking of rows) try { await reconcileBookingWorkflow(booking._id); } catch (error) { failures.push(error); }
  const processing = await CoreBooking.find({ financeOperations: { $elemMatch: { method: 'RAZORPAY', status: { $in: ['PROCESSING', 'UNDER_REVIEW'] } } } }).limit(limit).lean();
  for (const row of processing) for (const op of row.financeOperations.filter(op => op.method === 'RAZORPAY' && ['PROCESSING', 'UNDER_REVIEW'].includes(op.status))) {
    try { await reconcileProviderRefund(row._id, op.operationId); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} booking workflow reconciliation(s) require retry`);
}
