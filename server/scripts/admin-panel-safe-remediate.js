import { connectDB, disconnectDB } from '../src/db/index.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { FinanceLedgerEntry } from '../src/admin/models/FinanceLedgerEntry.js';
import { Coupon } from '../src/admin/models/Coupon.js';
import { CustomerEvent, EventHistory, Payment } from '../src/customer/models/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { rolePresetPermissions } from '../src/admin/constants/permissions.js';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'codex-admin-remediation';
const TEST_CUSTOMER_IDS = [
  '6ac85f220893b5d59b84fbe4',
  '6ac85f0e0893b5d59b84fa2a',
  '6abb12fd78c32babbcd82804',
  '6ab87a12036d6d82ecf10c11',
  '6ab718f4adba1eadf58a5340',
  '6ab623559f877b964a1c3706',
  '6ab3ebd77cbf8f03a27ac478',
  '6ab1f46f76f3aae626a8abce',
];

function id(value) {
  return value ? String(value) : '';
}

async function audit(action, targetType, targetId, fromState, toState, reason) {
  if (!APPLY) return;
  await AdminAuditLog.create({
    actorEmail: ACTOR,
    action,
    targetType,
    targetId: id(targetId),
    fromState,
    toState,
    reason,
    source: 'SYSTEM',
    reference: 'admin-panel-safe-remediate',
    idempotencyKey: `${action}_${targetId}_2026-10-13`,
    requestId: 'codex-local-remediation-2026-10-13',
  }).catch((err) => {
    if (err?.code !== 11000) throw err;
  });
}

async function maybeSave(doc) {
  if (APPLY) await doc.save();
}

async function demoteAutomationAdmin(changes) {
  const admin = await AdminUser.findOne({ email: 'automation@starvnt.com' });
  if (!admin) return;
  if (admin.role !== 'SUPER_ADMIN' && admin.roleKey === 'OPERATIONS_ADMIN') return;
  const fromState = {
    role: admin.role,
    roleKey: admin.roleKey || '',
    permissions: admin.role === 'SUPER_ADMIN' ? ['*'] : admin.permissions,
  };
  admin.role = 'ADMIN';
  admin.roleKey = 'OPERATIONS_ADMIN';
  admin.permissions = rolePresetPermissions('OPERATIONS_ADMIN');
  await maybeSave(admin);
  const toState = { role: admin.role, roleKey: admin.roleKey, permissions: admin.permissions };
  await audit('ADMIN_ROLE_REMEDIATED', 'AdminUser', admin._id, fromState, toState, 'Least-privilege remediation: automation account should not hold Super Admin.');
  changes.push({ item: 'automation@starvnt.com', action: APPLY ? 'demoted to OPERATIONS_ADMIN' : 'would demote to OPERATIONS_ADMIN' });
}

async function deactivateExpiredCoupons(changes) {
  const now = new Date();
  const coupons = await Coupon.find({ isActive: true, validUntil: { $lt: now } });
  for (const coupon of coupons) {
    const fromState = { code: coupon.code, isActive: coupon.isActive, validUntil: coupon.validUntil };
    coupon.isActive = false;
    await maybeSave(coupon);
    const toState = { code: coupon.code, isActive: coupon.isActive, validUntil: coupon.validUntil };
    await audit('COUPON_EXPIRED_DEACTIVATED', 'Coupon', coupon._id, fromState, toState, 'Expired coupon was still active after expiry boundary.');
    changes.push({ item: coupon.code, action: APPLY ? 'deactivated expired coupon' : 'would deactivate expired coupon' });
  }
}

async function correctBk3927(changes) {
  const booking = await CoreBooking.findOne({ bookingReference: 'BK-3927' });
  if (!booking) return;
  const refs = [
    booking.paymentSummary?.providerPaymentId,
    booking.paymentSummary?.providerOrderId,
    booking.bookingReference,
    booking.quoteId,
  ].filter(Boolean);
  const [payment, ledgerCount] = await Promise.all([
    refs.length
      ? Payment.findOne({
          $or: [
            { providerRef: { $in: refs } },
            { orderId: { $in: refs } },
            { reservation: booking._id },
          ],
        }).lean()
      : null,
    FinanceLedgerEntry.countDocuments({
      $or: [
        { bookingId: booking._id },
        { resourceId: id(booking._id) },
        { reference: { $in: refs } },
      ],
    }),
  ]);
  if (payment || ledgerCount > 0) return;
  if (
    booking.paymentStatus === 'PENDING' &&
    booking.executionStatus === 'NOT_STARTED' &&
    booking.settlementStatus === 'NOT_ELIGIBLE' &&
    Number(booking.paymentSummary?.paidAmount || 0) === 0 &&
    !booking.paymentSummary?.paidAt &&
    !booking.paymentSummary?.providerPaymentId
  ) {
    return;
  }
  const fromState = {
    paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus,
    settlementStatus: booking.settlementStatus,
    paymentSummary: booking.paymentSummary,
  };
  booking.paymentStatus = 'PENDING';
  booking.executionStatus = 'NOT_STARTED';
  booking.settlementStatus = 'NOT_ELIGIBLE';
  booking.paymentSummary = {
    ...(booking.paymentSummary?.toObject?.() || booking.paymentSummary || {}),
    paidAmount: 0,
    paidAt: null,
    providerPaymentId: '',
  };
  await maybeSave(booking);
  const toState = {
    paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus,
    settlementStatus: booking.settlementStatus,
    paymentSummary: booking.paymentSummary,
  };
  await audit('BOOKING_FINANCIAL_STATE_REMEDIATED', 'CoreBooking', booking._id, fromState, toState, 'No authoritative payment or ledger evidence found for BK-3927.');
  changes.push({ item: 'BK-3927', action: APPLY ? 'reset unsupported payment/execution/settlement truth' : 'would reset unsupported payment/execution/settlement truth' });
}

async function deactivateUnlinkedTestCustomers(changes) {
  const users = await ExternalUser.find({ _id: { $in: TEST_CUSTOMER_IDS }, status: { $ne: 'DISABLED' } });
  for (const user of users) {
    const [events, bookings, payments] = await Promise.all([
      CustomerEvent.countDocuments({ customer: user._id }),
      CoreBooking.countDocuments({ customerId: user._id }),
      Payment.countDocuments({ customer: user._id }),
    ]);
    if (events || bookings || payments) {
      changes.push({ item: `${user.fullName} <${user.email}>`, action: `skipped; linked records events=${events} bookings=${bookings} payments=${payments}` });
      continue;
    }
    const fromState = {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      isRestricted: user.isRestricted,
    };
    user.status = 'DISABLED';
    user.isRestricted = true;
    user.restrictionReason = 'Deactivated by admin remediation: test-looking customer with no linked events, bookings, or payments.';
    user.restrictedUntil = null;
    await maybeSave(user);
    const toState = {
      status: user.status,
      isRestricted: user.isRestricted,
      restrictionReason: user.restrictionReason,
    };
    await audit('CUSTOMER_TEST_RECORD_DEACTIVATED', 'ExternalUser', user._id, fromState, toState, user.restrictionReason);
    changes.push({ item: `${user.fullName} <${user.email}>`, action: APPLY ? 'soft-deactivated unlinked test-looking customer' : 'would soft-deactivate unlinked test-looking customer' });
  }
}

async function cancelUnlinkedDuplicateEvents(changes) {
  const groups = await CustomerEvent.aggregate([
    {
      $match: { status: { $ne: 'cancelled' } },
    },
    {
      $group: {
        _id: {
          customer: '$customer',
          title: { $toLower: { $ifNull: ['$title', ''] } },
          eventDate: '$eventDate',
          city: { $toLower: { $ifNull: ['$city', ''] } },
          venue: { $toLower: { $ifNull: ['$location.venueName', ''] } },
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  for (const group of groups) {
    const [payments, coreBookings] = await Promise.all([
      Payment.countDocuments({ event: { $in: group.ids } }),
      CoreBooking.countDocuments({ customerId: group._id.customer, eventDate: group._id.eventDate }),
    ]);
    if (payments || coreBookings) {
      changes.push({
        item: `${group._id.title || 'event'} ${group._id.eventDate || ''}`,
        action: `skipped duplicate-event cleanup; payments=${payments} coreBookings=${coreBookings}`,
      });
      continue;
    }

    const events = await CustomerEvent.find({ _id: { $in: group.ids } }).sort({ createdAt: 1 });
    const [keeper, ...duplicates] = events;
    for (const event of duplicates) {
      const fromState = { status: event.status };
      event.status = 'cancelled';
      await maybeSave(event);
      if (APPLY) {
        await EventHistory.create({
          event: event._id,
          actorType: 'system',
          actorId: ACTOR,
          action: 'event_duplicate_cancelled',
          details: { keptEventId: id(keeper._id), reason: 'Historical duplicate event with no payment or booking links.' },
        });
      }
      await audit(
        'EVENT_DUPLICATE_CANCELLED',
        'CustomerEvent',
        event._id,
        fromState,
        { status: event.status, keptEventId: id(keeper._id) },
        'Historical duplicate event with no payment or booking links.'
      );
      changes.push({
        item: `${event.title || 'event'} ${event.eventDate || ''} ${id(event._id)}`,
        action: APPLY ? `soft-cancelled duplicate; kept ${id(keeper._id)}` : `would soft-cancel duplicate; keep ${id(keeper._id)}`,
      });
    }
  }
}

async function main() {
  const changes = [];
  await connectDB();
  try {
    await demoteAutomationAdmin(changes);
    await deactivateExpiredCoupons(changes);
    await correctBk3927(changes);
    await deactivateUnlinkedTestCustomers(changes);
    await cancelUnlinkedDuplicateEvents(changes);
    console.table(changes);
    console.log(APPLY ? 'Applied safe remediation.' : 'Dry run only. Re-run with --apply to make changes.');
  } finally {
    await disconnectDB();
  }
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exitCode = 1;
});
