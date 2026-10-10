import mongoose from 'mongoose';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { settlementMath } from '../admin/services/financeLedger.service.js';
import {
  Booking,
  CustomerEvent,
  CustomerQuote,
  Payment,
  Reservation,
} from '../customer/models/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(dueDate, now = new Date()) {
  const due = toDate(dueDate);
  if (!due) return null;
  return Math.floor((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

function dueState(dueDate, now = new Date()) {
  const days = daysUntil(dueDate, now);
  if (days == null) return { daysUntilDue: null, isDueSoon: false, isOverdue: false };
  return {
    daysUntilDue: days,
    isDueSoon: days >= 0 && days <= 2,
    isOverdue: days < 0,
  };
}

function eventBudget(event) {
  const exact = money(event?.budget);
  if (exact > 0) return { totalBudget: exact, budgetType: 'exact' };
  const max = money(event?.budgetMax);
  if (max > 0) return { totalBudget: max, budgetType: 'range_max' };
  const min = money(event?.budgetMin);
  if (min > 0) return { totalBudget: min, budgetType: 'range_min' };
  return { totalBudget: 0, budgetType: 'unset' };
}

function activeReservation(reservation) {
  return ['pending_payment', 'held'].includes(reservation?.status);
}

function paymentIsPaid(payment) {
  return ['paid', 'verified'].includes(payment?.status);
}

function paymentIsFailed(payment) {
  return payment?.status === 'failed';
}

function bookingAmount(booking) {
  return money(booking?.amount ?? booking?.packageTotal ?? booking?.totalAmount);
}

function bookingPaidAmount(booking) {
  return money(booking?.paidAmount);
}

function corePaidAmount(booking) {
  return money(booking?.paymentSummary?.paidAmount);
}

function coreBalanceAmount(booking) {
  return money(
    booking?.paymentSummary?.balanceAmount ??
      Math.max(0, money(booking?.totalAmount) - corePaidAmount(booking)),
  );
}

function compactAction(action) {
  return {
    type: action.type,
    severity: action.severity || 'NORMAL',
    title: action.title,
    detail: action.detail || '',
    amount: money(action.amount),
    dueDate: action.dueDate || null,
    daysUntilDue: action.daysUntilDue ?? null,
    actionUrl: action.actionUrl || null,
    bookingId: action.bookingId || null,
    reservationId: action.reservationId || null,
  };
}

function bucketForDueDate(dueDate, now = new Date()) {
  const days = daysUntil(dueDate, now);
  if (days == null) return 'unscheduled';
  if (days >= 0) return days === 0 ? 'dueToday' : days <= 7 ? 'dueIn1To7Days' : 'upcoming';
  const age = Math.abs(days);
  if (age <= 7) return 'overdue1To7Days';
  if (age <= 30) return 'overdue8To30Days';
  if (age <= 60) return 'overdue31To60Days';
  return 'overdue60PlusDays';
}

function emptyAging() {
  return {
    dueToday: { amount: 0, count: 0 },
    dueIn1To7Days: { amount: 0, count: 0 },
    overdue1To7Days: { amount: 0, count: 0 },
    overdue8To30Days: { amount: 0, count: 0 },
    overdue31To60Days: { amount: 0, count: 0 },
    overdue60PlusDays: { amount: 0, count: 0 },
    upcoming: { amount: 0, count: 0 },
    unscheduled: { amount: 0, count: 0 },
  };
}

function addToAging(aging, dueDate, amount, now) {
  const key = bucketForDueDate(dueDate, now);
  aging[key].amount += money(amount);
  aging[key].count += 1;
}

function bookingDueDate(booking) {
  return booking?.eventDate || booking?.createdAt || null;
}

export async function customerFinancialTruth(customerId, eventId, options = {}) {
  const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).lean();
  if (!event) {
    const err = new Error('EVENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  const now = options.now || new Date();
  const [reservations, payments, customerBookings, customerQuotes, coreBookings] = await Promise.all([
    Reservation.find({ event: event._id }).lean(),
    Payment.find({ event: event._id }).lean(),
    Booking.find({ event: event._id }).lean(),
    CustomerQuote.find({ event: event._id }).sort({ createdAt: -1 }).lean(),
    CoreBooking.find({ customerId }).sort({ createdAt: -1 }).lean().catch(() => []),
  ]);

  const { totalBudget, budgetType } = eventBudget(event);
  const activeReservations = reservations.filter(activeReservation);
  const confirmedCustomerBookings = customerBookings.filter((b) => b.status !== 'cancelled');
  const bookingCategories = new Set(confirmedCustomerBookings.map((b) => String(b.category || '').toLowerCase()));
  const matchedCoreBookings = coreBookings.filter((b) => {
    if (b.customerEvent && String(b.customerEvent) === String(event._id)) return true;
    const category = String(b.category || '').toLowerCase();
    return category && bookingCategories.has(category);
  });

  const customerBookingCommitted = confirmedCustomerBookings.reduce((sum, b) => sum + bookingAmount(b), 0);
  const activeReservationCommitted = activeReservations.reduce((sum, r) => sum + money(r.packageTotal || r.amount), 0);
  const coreOnlyCommitted = matchedCoreBookings.reduce((sum, b) => {
    const category = String(b.category || '').toLowerCase();
    return bookingCategories.has(category) ? sum : sum + money(b.totalAmount);
  }, 0);
  const committedAmount = money(customerBookingCommitted + activeReservationCommitted + coreOnlyCommitted);

  const paidFromPayments = payments.filter(paymentIsPaid).reduce((sum, p) => sum + money(p.amount), 0);
  const paidFromCore = matchedCoreBookings.reduce((sum, b) => sum + corePaidAmount(b), 0);
  const paidAmount = money(Math.max(paidFromPayments, paidFromCore));

  const obligations = [];
  for (const r of activeReservations) {
    const paidForReservation = payments
      .filter((p) => String(p.reservation) === String(r._id) && paymentIsPaid(p))
      .reduce((sum, p) => sum + money(p.amount), 0);
    const amount = money(Math.max(0, money(r.amount) - paidForReservation));
    if (amount > 0) {
      obligations.push({
        kind: 'reservation',
        amount,
        dueDate: r.expiresAt,
        title: `${r.vendorName || 'Vendor'} ${r.packageName || 'reservation'} advance`,
        reservationId: String(r._id),
        actionUrl: `/customer/events/${event._id}/bookings`,
      });
    }
  }
  for (const b of confirmedCustomerBookings) {
    const amount = money(Math.max(0, bookingAmount(b) - bookingPaidAmount(b)));
    if (amount > 0) {
      obligations.push({
        kind: 'booking_balance',
        amount,
        dueDate: b.completedAt || event.eventDate || b.createdAt,
        title: `${b.vendorName || 'Vendor'} balance`,
        bookingId: String(b._id),
        actionUrl: `/customer/events/${event._id}/bookings`,
      });
    }
  }
  for (const b of matchedCoreBookings) {
    const category = String(b.category || '').toLowerCase();
    if (bookingCategories.has(category)) continue;
    const amount = coreBalanceAmount(b);
    if (amount > 0) {
      obligations.push({
        kind: 'core_booking_balance',
        amount,
        dueDate: bookingDueDate(b),
        title: `${b.vendorName || 'Vendor'} balance`,
        bookingId: String(b._id),
        actionUrl: `/customer/events/${event._id}/bookings`,
      });
    }
  }

  const upcomingAmount = obligations
    .filter((o) => !dueState(o.dueDate, now).isOverdue)
    .reduce((sum, o) => sum + money(o.amount), 0);
  const overdueAmount = obligations
    .filter((o) => dueState(o.dueDate, now).isOverdue)
    .reduce((sum, o) => sum + money(o.amount), 0);

  const latestQuoteTotal = money(customerQuotes.find((q) => ['draft', 'accepted'].includes(q.status))?.total);
  const projectedTotal = money(Math.max(committedAmount, latestQuoteTotal));
  const remainingAmount = totalBudget > 0 ? money(Math.max(0, totalBudget - projectedTotal)) : 0;
  const budgetVariance = totalBudget > 0 ? projectedTotal - totalBudget : 0;

  const attentionItems = [
    ...obligations
      .map((o) => ({ ...o, ...dueState(o.dueDate, now) }))
      .filter((o) => o.isDueSoon || o.isOverdue)
      .map((o) =>
        compactAction({
          type: o.isOverdue ? 'payment_overdue' : 'payment_due_soon',
          severity: o.isOverdue ? 'HIGH' : 'NORMAL',
          title: o.isOverdue ? `${o.title} is overdue` : `${o.title} is due soon`,
          detail: o.isOverdue ? 'Pay or contact the vendor to avoid service risk.' : 'Pay before the due date to keep the booking on track.',
          amount: o.amount,
          dueDate: o.dueDate,
          daysUntilDue: o.daysUntilDue,
          actionUrl: o.actionUrl,
          bookingId: o.bookingId,
          reservationId: o.reservationId,
        }),
      ),
    ...payments
      .filter(paymentIsFailed)
      .map((p) =>
        compactAction({
          type: 'payment_failed',
          severity: 'HIGH',
          title: 'A payment failed',
          detail: p.failureReason || 'Retry the payment while the hold is active.',
          amount: p.amount,
          actionUrl: `/customer/events/${event._id}/bookings`,
          reservationId: p.reservation ? String(p.reservation) : null,
        }),
      ),
  ];

  if (totalBudget > 0 && budgetVariance > 0) {
    attentionItems.unshift(
      compactAction({
        type: 'budget_risk',
        severity: 'HIGH',
        title: 'Projected cost is above budget',
        detail: `Projected total is ₹${money(projectedTotal).toLocaleString('en-IN')} against a budget of ₹${money(totalBudget).toLocaleString('en-IN')}.`,
        amount: budgetVariance,
        actionUrl: `/customer/events/${event._id}/budget`,
      }),
    );
  }

  return {
    eventId: String(event._id),
    generatedAt: now.toISOString(),
    metrics: {
      totalBudget,
      budgetType,
      committedAmount,
      paidAmount,
      upcomingAmount: money(upcomingAmount),
      remainingAmount,
      overdueAmount: money(overdueAmount),
      projectedTotal,
      budgetVariance,
    },
    counts: {
      reservations: activeReservations.length,
      bookings: confirmedCustomerBookings.length + matchedCoreBookings.length,
      payments: payments.length,
      attentionItems: attentionItems.length,
    },
    attentionItems,
    obligations,
  };
}

export async function vendorFinancialTruth(vendorId, options = {}) {
  if (!mongoose.isValidObjectId(vendorId)) {
    const err = new Error('INVALID_VENDOR_ID');
    err.statusCode = 400;
    throw err;
  }

  const now = options.now || new Date();
  const bookings = await CoreBooking.find({
    $or: [{ vendorId }, { vendorId: String(vendorId) }],
    bookingStatus: 'CONFIRMED',
  })
    .sort({ eventDate: 1 })
    .lean();

  const agingBreakdown = emptyAging();
  let expectedReceivables = 0;
  let dueThisWeek = 0;
  let overdueAmount = 0;
  let expectedSettlements = 0;
  let settledAmount = 0;
  const overdueBookings = [];
  const nextBestActions = [];

  for (const booking of bookings) {
    const total = money(booking.totalAmount);
    const paid = corePaidAmount(booking);
    const unpaid = money(Math.max(0, total - paid));
    const dueDate = bookingDueDate(booking);
    const due = dueState(dueDate, now);
    const tax = booking.taxSummary?.vendorPayable
      ? booking.taxSummary
      : settlementMath(total);
    const vendorPayable = money(booking.settlementDetails?.vendorPayable || tax.vendorPayable || total);

    if (unpaid > 0 && booking.paymentStatus !== 'REFUNDED') {
      expectedReceivables += unpaid;
      addToAging(agingBreakdown, dueDate, unpaid, now);
      if (due.daysUntilDue != null && due.daysUntilDue >= 0 && due.daysUntilDue <= 7) dueThisWeek += unpaid;
      if (due.isOverdue) {
        overdueAmount += unpaid;
        overdueBookings.push({
          bookingId: String(booking._id),
          bookingReference: booking.bookingReference,
          customerName: booking.customerName,
          serviceName: booking.serviceName,
          amount: unpaid,
          dueDate,
          daysOverdue: Math.abs(due.daysUntilDue),
        });
      }
    }

    if (booking.settlementStatus === 'SETTLED') {
      settledAmount += vendorPayable;
    } else if (booking.settlementStatus === 'SETTLEMENT_ELIGIBLE' || booking.executionStatus === 'COMPLETION_VERIFIED') {
      expectedSettlements += vendorPayable;
      nextBestActions.push({
        type: 'settlement_ready',
        severity: 'NORMAL',
        title: `${booking.bookingReference || 'Booking'} is ready for settlement`,
        detail: 'Completion is verified. Finance can release settlement.',
        bookingId: String(booking._id),
        amount: vendorPayable,
      });
    } else if (booking.executionStatus === 'COMPLETION_SUBMITTED') {
      nextBestActions.push({
        type: 'completion_submitted',
        severity: 'NORMAL',
        title: `${booking.bookingReference || 'Booking'} completion is awaiting review`,
        detail: 'Customer or admin verification is needed before settlement can unlock.',
        bookingId: String(booking._id),
        amount: vendorPayable,
      });
    }
  }

  return {
    vendorId: String(vendorId),
    generatedAt: now.toISOString(),
    metrics: {
      expectedReceivables: money(expectedReceivables),
      dueThisWeek: money(dueThisWeek),
      overdueAmount: money(overdueAmount),
      expectedSettlements: money(expectedSettlements),
      settledAmount: money(settledAmount),
    },
    agingBreakdown,
    overdueBookings,
    nextBestActions,
  };
}
