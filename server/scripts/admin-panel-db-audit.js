import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/db/index.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { FinanceLedgerEntry } from '../src/admin/models/FinanceLedgerEntry.js';
import { Coupon } from '../src/admin/models/Coupon.js';
import { CustomerEvent, EventRequirement, Payment } from '../src/customer/models/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorDocument } from '../src/external/models/VendorDocument.js';

function id(value) {
  return value ? String(value) : '';
}

function compact(value, max = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printSection(title, rows) {
  console.log(`\n## ${title}`);
  if (!rows?.length) {
    console.log('No findings.');
    return;
  }
  console.table(rows);
}

async function adminAccess() {
  const admins = await AdminUser.find().sort({ createdAt: 1 }).lean();
  return admins.map((admin) => ({
    id: id(admin._id),
    email: admin.email,
    role: admin.role,
    roleKey: admin.roleKey || '',
    permissions: admin.role === 'SUPER_ADMIN' ? '*' : admin.permissions?.length || 0,
    status: admin.status,
    createdAt: admin.createdAt?.toISOString?.() || '',
    lastLoginAt: admin.lastLoginAt?.toISOString?.() || '',
  }));
}

async function duplicatePhones() {
  const rows = await ExternalUser.aggregate([
    { $match: { phone: { $nin: [null, ''] } } },
    {
      $group: {
        _id: '$phone',
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        emails: { $push: '$email' },
        names: { $push: '$fullName' },
        statuses: { $push: '$status' },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]);
  return rows.map((row) => ({
    phone: row._id,
    count: row.count,
    names: row.names.filter(Boolean).join(' | '),
    emails: row.emails.filter(Boolean).join(' | '),
    statuses: row.statuses.filter(Boolean).join(' | '),
    ids: row.ids.map(id).join(' | '),
  }));
}

async function testLookingCustomers() {
  const terms = [/dev test/i, /^test/i, /testmail/i, /^arav$/i, /^khy$/i, /^sdf$/i];
  const users = await ExternalUser.find({
    $or: terms.map((term) => ({ fullName: term })).concat(terms.map((term) => ({ email: term }))),
  }).sort({ createdAt: -1 }).limit(50).lean();
  const userIds = users.map((u) => u._id);
  const [eventCounts, bookingCounts, paymentCounts] = await Promise.all([
    CustomerEvent.aggregate([{ $match: { customer: { $in: userIds } } }, { $group: { _id: '$customer', count: { $sum: 1 } } }]),
    CoreBooking.aggregate([{ $match: { customerId: { $in: userIds } } }, { $group: { _id: '$customerId', count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { customer: { $in: userIds } } }, { $group: { _id: '$customer', count: { $sum: 1 } } }]),
  ]);
  const mapOf = (rows) => new Map(rows.map((row) => [id(row._id), row.count]));
  const eventsByUser = mapOf(eventCounts);
  const bookingsByUser = mapOf(bookingCounts);
  const paymentsByUser = mapOf(paymentCounts);
  return users.map((user) => ({
    id: id(user._id),
    name: user.fullName,
    email: user.email,
    phone: user.phone || '',
    status: user.status,
    events: eventsByUser.get(id(user._id)) || 0,
    bookings: bookingsByUser.get(id(user._id)) || 0,
    payments: paymentsByUser.get(id(user._id)) || 0,
    createdAt: user.createdAt?.toISOString?.() || '',
  }));
}

async function similarEvents() {
  const rows = await CustomerEvent.aggregate([
    {
      $group: {
        _id: {
          customer: '$customer',
          title: { $toLower: { $ifNull: ['$title', ''] } },
          eventDate: '$eventDate',
          city: { $toLower: { $ifNull: ['$city', ''] } },
          venue: { $toLower: { $ifNull: ['$location.venueName', ''] } },
          address: { $toLower: { $ifNull: ['$location.address', ''] } },
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        statuses: { $push: '$status' },
        createdAt: { $push: '$createdAt' },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]);
  const eventIds = rows.flatMap((row) => row.ids);
  const reqCounts = await EventRequirement.aggregate([
    { $match: { event: { $in: eventIds } } },
    { $group: { _id: '$event', count: { $sum: 1 } } },
  ]);
  const reqByEvent = new Map(reqCounts.map((row) => [id(row._id), row.count]));
  return rows.map((row) => ({
    customer: id(row._id.customer),
    title: compact(row._id.title),
    eventDate: row._id.eventDate || '',
    city: row._id.city || '',
    venue: compact(row._id.venue || row._id.address),
    count: row.count,
    eventIds: row.ids.map(id).join(' | '),
    reqCounts: row.ids.map((eventId) => reqByEvent.get(id(eventId)) || 0).join(' | '),
    statuses: row.statuses.join(' | '),
  }));
}

async function bookingsAndPayments() {
  const bookings = await CoreBooking.find().sort({ createdAt: -1 }).limit(100).lean();
  const rows = [];
  for (const booking of bookings) {
    const refs = [
      booking.paymentSummary?.providerPaymentId,
      booking.paymentSummary?.providerOrderId,
      booking.bookingReference,
      booking.quoteId,
    ].filter(Boolean);
    const payment = refs.length
      ? await Payment.findOne({
          $or: [
            { providerRef: { $in: refs } },
            { orderId: { $in: refs } },
            { reservation: booking._id },
          ],
        }).lean()
      : null;
    const ledgerCount = await FinanceLedgerEntry.countDocuments({
      $or: [
        { bookingId: booking._id },
        { resourceId: id(booking._id) },
        { reference: { $in: refs } },
      ],
    });
    const suspicious =
      booking.paymentStatus === 'PAYMENT_VERIFIED' &&
      (!payment || !['paid', 'captured', 'success', 'verified'].includes(String(payment.status || '').toLowerCase()));
    if (suspicious || refs.some((ref) => /^(MANUAL-|BANK-UTR-|DEV-|TEST-)/i.test(ref)) || booking.bookingReference === 'BK-3927') {
      rows.push({
        booking: booking.bookingReference,
        id: id(booking._id),
        customer: booking.customerName || id(booking.customerId),
        vendor: booking.vendorName || id(booking.vendorId),
        amount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        executionStatus: booking.executionStatus,
        settlementStatus: booking.settlementStatus,
        refs: refs.join(' | '),
        paymentFound: payment ? `${payment.status}:${payment.providerRef || payment.orderId || id(payment._id)}` : 'NO',
        ledgerCount,
      });
    }
  }
  return rows;
}

async function vendorsNeedingKyc() {
  const vendors = await VendorOrganization.find({
    $or: [
      { 'verification.isVerified': { $ne: true } },
      { status: { $in: ['PROFILE_INCOMPLETE', 'PENDING'] } },
    ],
  }).sort({ createdAt: -1 }).limit(50).lean();
  const ids = vendors.map((v) => v._id);
  const docs = await VendorDocument.aggregate([
    { $match: { vendor: { $in: ids } } },
    { $group: { _id: { vendor: '$vendor', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const docMap = new Map();
  for (const row of docs) {
    const key = id(row._id.vendor);
    const prev = docMap.get(key) || [];
    prev.push(`${row._id.status}:${row.count}`);
    docMap.set(key, prev);
  }
  return vendors.slice(0, 25).map((vendor) => ({
    id: id(vendor._id),
    businessName: vendor.businessName,
    status: vendor.status,
    activationState: vendor.activationState,
    verified: vendor.verification?.isVerified === true,
    docs: (docMap.get(id(vendor._id)) || []).join(' | ') || 'none',
    isCommerciallyActive: vendor.isCommerciallyActive === true,
  }));
}

async function coupons() {
  const now = new Date();
  const rows = await Coupon.find().sort({ createdAt: -1 }).lean();
  return rows
    .filter((coupon) => coupon.isActive || coupon.validUntil || coupon.usageLimit)
    .map((coupon) => ({
      id: id(coupon._id),
      code: coupon.code,
      active: coupon.isActive === true,
      expired: coupon.validUntil ? coupon.validUntil < now : false,
      validUntil: coupon.validUntil?.toISOString?.() || '',
      usage: `${coupon.usageCount || 0}/${coupon.usageLimit || '∞'}`,
      type: coupon.discountType,
      value: coupon.discountValue,
    }));
}

async function deletionAudit() {
  const logs = await AdminAuditLog.find({
    action: { $regex: /(DELETE|DELETED|DEACTIVATED)/i },
  }).sort({ createdAt: -1 }).limit(50).lean();
  return logs.map((log) => ({
    at: log.createdAt?.toISOString?.() || '',
    action: log.action,
    actor: log.actorEmail || id(log.actor),
    targetType: log.targetType || '',
    targetId: log.targetId || '',
    reason: compact(log.reason || ''),
    requestId: log.requestId || '',
  }));
}

async function main() {
  await connectDB();
  await mongoose.connection.asPromise?.().catch(() => null);
  try {
    printSection('Admin Users / Role Assignments', await adminAccess());
    printSection('Duplicate Phone External Users', await duplicatePhones());
    printSection('Test-Looking Customers With Link Counts', await testLookingCustomers());
    printSection('Similar Event Groups', await similarEvents());
    printSection('Suspicious Booking/Payment Reconciliation Rows', await bookingsAndPayments());
    printSection('Vendors Pending KYC / Activation', await vendorsNeedingKyc());
    printSection('Coupons Expiry / Usage Snapshot', await coupons());
    printSection('Deletion / Deactivation Audit Logs', await deletionAudit());
  } finally {
    await disconnectDB();
  }
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exitCode = 1;
});
