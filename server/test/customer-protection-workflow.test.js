import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { CustomerEvent, CustomerQuote, EventRequirement, Reservation, Payment } from '../src/customer/models/index.js';
import { Quote } from '../src/external/models/Quote.js';
import { commercialSnapshot } from '../src/external/services/commercialSnapshot.service.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { EventMedia } from '../src/customer/models/eventMedia.models.js';
import { recordExecutionAction, submitCompletionEvidence, validateCompletionFromCore } from '../src/admin/services/executionSettlement.service.js';
import { updateCase, resolveDispute } from '../src/admin/services/disputes.service.js';
import { requestFinanceOperation, updateFinanceOperation } from '../src/admin/services/financeOperations.service.js';
import { completeEvent } from '../src/customer/services/ops.service.js';

let mongo, app, owner, stranger, event, core, media;
const key = () => crypto.randomUUID();
const oid = () => new mongoose.Types.ObjectId();
const auth = user => ({ Authorization: `Bearer ${user.token}` });
const admin = { id: String(oid()), type: 'ADMIN', permissions: ['operations.manage', 'payments.refund'] };
const checker = { id: String(oid()), type: 'ADMIN', permissions: ['payments.refund'] };
const reconciler = { id: String(oid()), type: 'ADMIN', permissions: ['payments.refund'] };
const policy = {
  version: 1, settlementCondition: 'MANUAL_APPROVAL_REQUIRED', settlementDelayDays: 0,
  manualFinanceAllowed: true, partialRefundAllowed: true, partialSettlementAllowed: true,
  customerCancellationRefunds: { 0: 100 },
  completionRequirements: { requireCheckIn: true, evidenceRequired: true, customerAcknowledgementRequired: true, requiredMilestones: ['coverage_complete'], requiredChecklist: ['agreed_deliverables'] },
};
async function person() {
  const user = await ExternalUser.create({ fullName: 'Protection fixture', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return { user, token: signExternalAccessToken(user, session._id) };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('protection')), adminConn.openUri(mongo.getUri('protection_core'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  owner = await person(); stranger = await person();
  await AdminUser.create({ _id: admin.id, email: 'reviewer@workflow.test', fullName: 'Authorized reviewer fixture', passwordHash: 'fixture-only', role: 'ADMIN', status: 'ACTIVE', permissions: admin.permissions });
  event = await CustomerEvent.create({ customer: owner.user._id, eventType: 'wedding', title: 'Recorded service', eventDate: '2099-11-26', status: 'booked' });
  core = await CoreBooking.create({
    customerId: owner.user._id, customerEvent: event._id, vendorId: oid(), vendorName: 'Booked photography',
    serviceName: 'Photography coverage', category: 'photography', eventDate: event.eventDate,
    totalAmount: 1000, paymentStatus: 'PAYMENT_VERIFIED', paymentSummary: { paidAmount: 300, balanceAmount: 700 },
    financialPolicySnapshot: policy,
  });
  media = await EventMedia.create({
    event: event._id, booking: core._id, uploader: core.vendorId, uploaderType: 'VENDOR',
    purpose: 'COMPLETION_EVIDENCE', kind: 'PHOTO', rightsConfirmed: true, requestKey: key(), requestHash: key(),
    storage: { publicId: 'private-completion-fixture', resourceType: 'image', format: 'jpg', mime: 'image/jpeg', bytes: 200 },
  });
});
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
const workflow = () => request(app).get(`/api/customer/bookings/${core._id}/workflow?eventId=${event._id}`).set(auth(owner)).expect(200);

test('customer acknowledgement is separate from evidence, Core validation and open protection cases', async () => {
  await assert.rejects(() => completeEvent(event._id, { operator: 'Authorized fixture operator' }), { code: 'EVENT_COMPLETION_REVIEW_REQUIRED' });
  await request(app).get(`/api/customer/bookings/${core._id}/workflow`).set(auth(stranger)).expect(404);
  await recordExecutionAction(core._id, core.vendorId, { action: 'CHECK_IN', idempotencyKey: key() });
  await recordExecutionAction(core._id, core.vendorId, { action: 'START', idempotencyKey: key() });
  await recordExecutionAction(core._id, core.vendorId, { action: 'MILESTONE', milestone: { key: 'coverage_complete', detail: 'Saved coverage milestone' }, idempotencyKey: key() });
  await submitCompletionEvidence(core._id, core.vendorId, { files: [{ assetId: String(media._id) }], notes: 'Vendor evidence submitted', checklist: [{ item: 'agreed_deliverables', checked: true }], idempotencyKey: key() }, core.vendorId);
  await assert.rejects(() => validateCompletionFromCore(core._id, { approved: true, notes: 'Reviewed', idempotencyKey: key() }, admin), /acknowledgement/i);
  const beforeAck = (await workflow()).body.booking;
  assert.equal(beforeAck.execution.checkedInAt != null, true);
  assert.equal(beforeAck.executionStatus, 'COMPLETION_SUBMITTED');
  await assert.rejects(() => validateCompletionFromCore(core._id, { approved: true, notes: 'Customer cannot authorize', idempotencyKey: key() }, { id: String(owner.user._id), type: 'CUSTOMER' }), /Core staff/i);
  const body = { eventId: String(event._id), idempotencyKey: key(), expectedVersion: beforeAck.version };
  const acknowledged = await request(app).post(`/api/customer/bookings/${core._id}/acknowledge-completion`).set(auth(owner)).send(body).expect(200);
  await request(app).post(`/api/customer/bookings/${core._id}/acknowledge-completion`).set(auth(owner)).send(body).expect(200);
  assert.equal(acknowledged.body.booking.executionStatus, 'COMPLETION_SUBMITTED');
  assert.equal(acknowledged.body.booking.execution.verifiedAt, null);
  const issue = { eventId: String(event._id), issueType: 'SERVICE_QUALITY', description: 'Please review the delivered coverage', idempotencyKey: key() };
  const reported = await request(app).post(`/api/customer/bookings/${core._id}/issues`).set(auth(owner)).send(issue).expect(201);
  await request(app).post(`/api/customer/bookings/${core._id}/issues`).set(auth(owner)).send(issue).expect(201);
  assert.equal(reported.body.booking.protection.cases.length, 1);
  assert.equal((await CoreBooking.findById(core._id)).settlementStatus, 'SETTLEMENT_HOLD');
  await validateCompletionFromCore(core._id, { approved: true, notes: 'Independent evidence checklist reviewed', idempotencyKey: key() }, admin);
  const verified = (await workflow()).body.booking;
  assert.equal(verified.executionStatus, 'COMPLETION_VERIFIED');
  assert.equal(verified.protection.underReview, true);
  assert.equal((await CoreBooking.findById(core._id)).settlementStatus, 'SETTLEMENT_HOLD');
  assert.equal(verified.refund.confirmedAmount, 0);
  const eventDay = await request(app).get(`/api/customer/events/${event._id}/event-day`).set(auth(owner)).expect(200);
  assert.equal(eventDay.body.services[0].execution.milestones.length, 1);
  assert.equal(eventDay.body.allCompleted, false);
});

test('information requests and proposed resolutions remain distinct from a reconciled partial refund', async () => {
  const booking = await CoreBooking.findById(core._id);
  const caseId = String(booking.disputes[0]._id);
  await updateCase(core._id, caseId, { action: 'ASSIGN', assignedTo: admin.id, notes: 'Assigned for review', idempotencyKey: key() }, admin);
  await updateCase(core._id, caseId, { action: 'REQUEST_INFORMATION', notes: 'Please explain the missed coverage', idempotencyKey: key() }, admin);
  const response = await workflow();
  assert.equal(response.body.booking.protection.cases[0].requests.length, 1);
  await request(app).post(`/api/customer/bookings/${core._id}/issues/${caseId}/evidence`).set(auth(owner)).send({ notes: 'The agreed final hour was missed', idempotencyKey: key() }).expect(200);
  await updateCase(core._id, caseId, { action: 'PROPOSE', decision: 'PARTIAL_REFUND', refundAmount: 100, notes: 'Proposed partial remedy', idempotencyKey: key() }, admin);
  assert.equal((await workflow()).body.booking.protection.cases[0].proposal.decision, 'PARTIAL_REFUND');
  await resolveDispute(core._id, caseId, { decision: 'PARTIAL_REFUND', refundAmount: 100, notes: 'Reviewed outcome', idempotencyKey: key() }, admin);
  const resolved = (await workflow()).body.booking;
  assert.equal(resolved.paymentStatus, 'PAYMENT_VERIFIED');
  assert.equal(resolved.refund.confirmedAmount, 0);
  assert.equal(resolved.refund.decisions[0].amount, 100);
  let operationBooking = await requestFinanceOperation(core._id, { kind: 'REFUND', amount: 100, method: 'MANUAL', reason: 'Approved case remedy', idempotencyKey: key() }, admin);
  const opId = operationBooking.financeOperations.at(-1).operationId;
  await updateFinanceOperation(core._id, opId, { action: 'APPROVE', idempotencyKey: key() }, checker);
  const privateFinance = await EventMedia.create({
    event: event._id, booking: core._id, uploader: admin.id, uploaderType: 'ADMIN', purpose: 'FINANCE_EVIDENCE',
    kind: 'DOCUMENT', rightsConfirmed: true, requestKey: key(), requestHash: key(),
    storage: { publicId: 'private-bank-statement', resourceType: 'raw', mime: 'application/pdf', bytes: 200 },
  });
  const financialEvidence = [{ assetId: String(privateFinance._id) }];
  const independentStatement = await EventMedia.create({ event: event._id, booking: core._id, uploader: reconciler.id, uploaderType: 'ADMIN', purpose: 'FINANCE_EVIDENCE', kind: 'DOCUMENT', rightsConfirmed: true, requestKey: key(), requestHash: key(), storage: { publicId: 'independent-statement-fixture', resourceType: 'raw', mime: 'application/pdf', bytes: 201 } });
  await updateFinanceOperation(core._id, opId, { action: 'RECORD_TRANSFER', reference: 'PRIVATE-BANK-REFERENCE', evidence: financialEvidence, idempotencyKey: key() }, admin);
  const processing = (await workflow()).body.booking;
  assert.equal(processing.refund.operations[0].status, 'PROCESSING');
  assert.equal(processing.refund.confirmedAmount, 0);
  await updateFinanceOperation(core._id, opId, { action: 'RECONCILE', reference: 'PRIVATE-BANK-REFERENCE', notes: 'Independent bank reconciliation', evidence: [{ assetId: String(independentStatement._id) }], idempotencyKey: key() }, reconciler);
  const confirmed = (await workflow()).body.booking;
  assert.equal(confirmed.refund.confirmedAmount, 100);
  assert.equal(confirmed.refund.remainingPaidAmount, 200);
  assert.equal(confirmed.paymentStatus, 'PAYMENT_VERIFIED');
  assert.ok(!JSON.stringify(confirmed).includes('PRIVATE-BANK-REFERENCE'));
  await request(app).get(`/api/customer/event-media/${privateFinance._id}/file`).set(auth(owner)).expect(404);
});

test('catalogue estimates and stale commercial versions cannot create a payable booking intent', async () => {
  const requirement = await EventRequirement.create({ event: event._id, category: 'photography', status: 'pending' });
  const quote = await CustomerQuote.create({
    customer: owner.user._id, event: event._id, status: 'draft', total: 1000, validUntil: new Date(Date.now() + 86400000),
    items: [{ requirement: requirement._id, category: 'photography', optionId: `vs_${oid()}`, vendorName: 'Advertised studio', packageName: 'Catalogue estimate', price: 1000, isDemo: false }],
  });
  const counts = await Promise.all([Payment.countDocuments(), CoreBooking.countDocuments()]);
  const estimate = await request(app).post(`/api/customer/quotes/${quote._id}/accept`).set(auth(owner)).expect(409);
  assert.equal(estimate.body.error, 'VENDOR_COST_CONFIRMATION_REQUIRED');
  const reservation = await Reservation.create({
    event: event._id, customer: owner.user._id, quote: quote._id, quoteItem: oid(), requirement: requirement._id,
    category: 'photography', optionId: quote.items[0].optionId, vendorName: 'Advertised studio', packageName: 'Estimate',
    amount: 200, packageTotal: 1000, balanceAmount: 800, expiresAt: new Date(Date.now() + 86400000),
  });
  const bypass = await request(app).post(`/api/customer/events/${event._id}/reservations/${reservation._id}/pay`).set(auth(owner)).send({ isBalance: true }).expect(409);
  assert.equal(bypass.body.error, 'VENDOR_COST_CONFIRMATION_REQUIRED');
  const foreignEvent = await CustomerEvent.create({ customer: stranger.user._id, eventType: 'wedding', title: 'Foreign payment event', status: 'planning' });
  await request(app).post(`/api/customer/events/${foreignEvent._id}/reservations/${reservation._id}/pay`).set(auth(stranger)).send({ isBalance: true }).expect(404);
  const vendorQuote = await Quote.create({
    vendor: core.vendorId, vendorService: oid(), customer: owner.user._id,
    serviceName: 'Confirmed photography', eventDate: event.eventDate, status: 'SUBMITTED',
    pricingBreakdown: { basePrice: 900, travelFee: 100, totalAmount: 1000 }, validUntil: new Date(Date.now() + 86400000),
  });
  vendorQuote.commercialSnapshot = commercialSnapshot(vendorQuote, vendorQuote.pricingBreakdown, 2);
  await vendorQuote.save();
  const stale = await request(app).post(`/api/customer/vendor-quotes/${vendorQuote._id}/accept`).set(auth(owner)).send({ eventId: String(event._id), expectedCommercialVersion: 1 }).expect(409);
  assert.equal(stale.body.error, 'COMMERCIAL_VERSION_CONFLICT');
  assert.deepEqual(await Promise.all([Payment.countDocuments(), CoreBooking.countDocuments()]), counts);
});

test('event completion waits for Core reviews and keeps the completed event, Memory and financial history retrievable', async () => {
  await EventMedia.create({
    event: event._id, uploader: owner.user._id, uploaderType: 'CUSTOMER', purpose: 'EVENT', kind: 'UPDATE',
    caption: 'Approved celebration highlight', rightsConfirmed: true, state: 'PUBLISHED', memoryIncluded: true, highlight: true,
    review: { privacy: true, safety: true, rights: true, actor: String(owner.user._id), at: new Date() },
    requestKey: key(), requestHash: key(),
  });
  await completeEvent(event._id, { operator: 'Authorized fixture operator' });
  assert.equal((await CustomerEvent.findById(event._id)).status, 'completed');
  const memory = await request(app).get(`/api/customer/events/${event._id}/memory`).set(auth(owner)).expect(200);
  assert.equal(memory.body.completed, true);
  assert.equal(memory.body.assets[0].caption, 'Approved celebration highlight');
  assert.equal(memory.body.story.at(-1).action, 'event_completed');
  const retained = (await workflow()).body.booking;
  assert.equal(retained.refund.confirmedAmount, 100);
  assert.equal(retained.refund.remainingPaidAmount, 200);
  await request(app).get(`/api/customer/events/${event._id}/memory`).set(auth(stranger)).expect(404);
});
