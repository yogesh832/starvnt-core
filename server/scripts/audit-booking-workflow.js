// Read-only pre-release inventory. Run against an explicitly selected environment.
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db/index.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { Quote } from '../src/external/models/Quote.js';
import { financeProjection } from '../src/admin/services/financeOperations.service.js';
createApp(); // Register shared models without starting workers or listeners.
try {
  await connectDB();
  const counts = { reviewedBookings: 0, missingCompletionPolicy: 0, legacyPublicEvidence: 0, unresolvedCases: 0, uncertainFinance: 0, undispatchedEvents: 0 };
  const attention = [];
  for await (const booking of CoreBooking.find().cursor()) {
    counts.reviewedBookings++;
    const reasons = [];
    if (!(booking.completionPolicySnapshot || booking.financialPolicySnapshot)?.completionRequirements) { counts.missingCompletionPolicy++; reasons.push('APPROVED_COMPLETION_POLICY_REQUIRED'); }
    if (booking.completionEvidence.some(entry => entry.files.some(file => !file.assetId) || entry.photos.length || entry.videos.length || (entry.deliverablesUrl && !entry.deliverablesUrl.startsWith('asset:')))) { counts.legacyPublicEvidence++; reasons.push('PRIVATE_EVIDENCE_MIGRATION_REQUIRED'); }
    const open = booking.disputes.filter(item => item.status !== 'RESOLVED');
    counts.unresolvedCases += open.length;
    if (open.some(item => !item.assignedTo)) reasons.push('CASE_REVIEW_OWNER_REQUIRED');
    const uncertain = booking.financeOperations.filter(op => ['PROCESSING', 'UNDER_REVIEW'].includes(op.status));
    counts.uncertainFinance += uncertain.length;
    if (uncertain.length) reasons.push('BANK_OR_PROVIDER_RECONCILIATION_REQUIRED');
    const intents = booking.workflowEvents.filter(event => !event.dispatchedAt).length;
    counts.undispatchedEvents += intents;
    if (intents) reasons.push('WORKFLOW_EFFECTS_PENDING');
    const funds = await financeProjection(booking);
    if (funds.confirmedRefunds + funds.confirmedSettlements + funds.pendingAmount > funds.verifiedCollections) reasons.push('FINANCE_RESERVATIONS_EXCEED_VERIFIED_COLLECTIONS');
    if (reasons.length) attention.push({ bookingId: String(booking._id), version: booking.workflowVersion, reasons });
  }
  const unconfirmedOffers = await Quote.countDocuments({ status: 'SUBMITTED', $or: [{ commercialSnapshot: null }, { 'commercialSnapshot.source': { $ne: 'VENDOR_CONFIRMED' } }] });
  console.log(JSON.stringify({ readOnly: true, generatedAt: new Date(), counts, unconfirmedOffers, attention }, null, 2));
} finally { await disconnectDB(); }
