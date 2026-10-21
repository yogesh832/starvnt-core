import { CustomerEvent, Booking, Payment, Reservation, CustomerNotification } from '../customer/models/index.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { Quote } from '../external/models/Quote.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { Notification } from '../external/models/Notification.js';

const models = { event: CustomerEvent, booking: Booking, payment: Payment, reservation: Reservation, customerNotification: CustomerNotification, opportunity: Opportunity, quote: Quote, coreBooking: CoreBooking, vendorNotification: Notification };
const store = {
  one: (kind, filter) => models[kind].findOne(filter).lean(),
  list: (kind, filter) => models[kind].find(filter).sort({ updatedAt: -1, createdAt: -1, _id: -1 }).lean(),
};
const id = (value) => value == null ? null : String(value);
const amount = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const at = (row) => row.updatedAt || row.createdAt || null;
const bookingItem = (row, href) => ({
  id: `booking:${row._id}`, kind: 'booking', title: row.serviceName || row.packageName || 'Booking',
  reference: row.bookingReference || null, category: row.category || null,
  status: row.bookingStatus || row.status, paymentStatus: row.paymentStatus || null,
  executionStatus: row.executionStatus || null, settlementStatus: row.settlementStatus || null,
  total: amount(row.totalAmount ?? row.amount), paid: amount(row.paymentSummary?.paidAmount ?? row.paidAmount),
  balance: amount(row.paymentSummary?.balanceAmount ?? row.balanceAmount), updatedAt: at(row), href,
});
const quoteItem = (row, href) => ({
  id: `quote:${row._id}`, kind: 'quote', title: row.serviceName || 'Vendor quote', reference: row.quoteReference || null,
  status: row.status, paymentStatus: row.advancePayment?.status || null,
  total: amount(row.pricingBreakdown?.totalAmount), updatedAt: at(row), href,
});
const notificationItem = (row, href) => ({ id: `notification:${row._id}`, kind: 'notification', title: row.title, status: row.isRead || row.readAt ? 'READ' : 'UNREAD', updatedAt: at(row), href });
function snapshot(scope, items, counts) {
  return { source: 'starvnt_api', scope, checkedAt: new Date().toISOString(), counts,
    items: items.sort((a, b) => (new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)) || a.id.localeCompare(b.id)).slice(0, 40) };
}

/** Actor-scoped reads shared by the prompt and the live cards. No business writes. */
export function createAuraActivityReaders(database = store) {
  return {
    async customer(customerId, eventId) {
      if (!eventId) return null;
      const event = await database.one('event', { _id: eventId, customer: customerId });
      if (!event) throw Object.assign(new Error('EVENT_NOT_FOUND'), { status: 404 });
      const owned = { customer: customerId, event: event._id };
      const opportunities = await database.list('opportunity', { customer: customerId, customerEvent: event._id });
      const [reservations, bookings, payments, notifications, directContracts] = await Promise.all([
        database.list('reservation', owned), database.list('booking', owned), database.list('payment', owned), database.list('customerNotification', owned),
        database.list('coreBooking', { customerId, customerEvent: event._id }),
      ]);
      // Older opportunities may lack customerEvent. A contract/reservation's exact
      // quote link still proves event membership; names and categories never do.
      const linkedQuotes = [...directContracts.map(row => id(row.quoteId)), ...reservations.map(row => id(row.quote))].filter(value => /^[a-f\d]{24}$/i.test(value || ''));
      const quotes = await database.list('quote', { customer: customerId, $or: [
        { opportunity: { $in: opportunities.map(row => row._id) } }, { _id: { $in: linkedQuotes } },
      ], status: { $ne: 'DRAFT' } });
      const quoteIds = [...new Set([...quotes.map(row => id(row._id)), ...reservations.map(row => id(row.quote))].filter(Boolean))];
      const legacyContracts = await database.list('coreBooking', { customerId, customerEvent: null, quoteId: { $in: quoteIds } });
      const coreBookings = [...directContracts, ...legacyContracts];
      const coreQuotes = new Set(coreBookings.map(row => id(row.quoteId)).filter(Boolean));
      const reservationQuotes = new Map(reservations.map(row => [id(row._id), id(row.quote)]));
      const legacy = bookings.filter(row => !coreQuotes.has(reservationQuotes.get(id(row.reservation))));
      const prefix = `/customer/events/${event._id}`;
      const items = [
        ...opportunities.map(row => ({ id: `enquiry:${row._id}`, kind: 'enquiry', title: row.serviceName || 'Vendor enquiry', status: row.status, updatedAt: at(row), href: `${prefix}/quotes` })),
        ...coreBookings.map(row => bookingItem(row, `${prefix}/bookings`)), ...legacy.map(row => bookingItem(row, `${prefix}/bookings`)),
        ...quotes.map(row => quoteItem(row, `${prefix}/quotes`)),
        ...payments.map(row => ({ id: `payment:${row._id}`, kind: 'payment', title: 'Payment', status: row.status, total: amount(row.amount), updatedAt: at(row), href: `${prefix}/bookings` })),
        ...notifications.map(row => notificationItem(row, '/customer/updates')),
      ];
      // Customer cards expose customer commitments, not vendor payout state.
      for (const item of items) delete item.settlementStatus;
      return snapshot({ role: 'customer', eventId: id(event._id) }, items, { newEnquiries: opportunities.filter(row => row.status === 'NEW').length, enquiries: opportunities.length, quotes: quotes.length, bookings: coreBookings.length + legacy.length, payments: payments.length, unread: notifications.filter(row => !row.readAt).length });
    },
    async vendor(vendorId) {
      const [opportunities, quotes, bookings, notifications] = await Promise.all([
        database.list('opportunity', { vendor: vendorId }), database.list('quote', { vendor: vendorId }),
        database.list('coreBooking', { vendorId }), database.list('vendorNotification', { vendor: vendorId }),
      ]);
      return snapshot({ role: 'vendor', vendorId: id(vendorId) }, [
        ...opportunities.map(row => ({ id: `enquiry:${row._id}`, kind: 'enquiry', title: row.serviceName || 'Enquiry', status: row.status, updatedAt: at(row), href: '/vendor/enquiries' })),
        ...quotes.map(row => quoteItem(row, '/vendor/quotes')), ...bookings.map(row => bookingItem(row, '/vendor/bookings')),
        ...notifications.map(row => notificationItem(row, '/vendor/updates')),
      ], { newEnquiries: opportunities.filter(row => row.status === 'NEW').length, quotes: quotes.length, bookings: bookings.length, unread: notifications.filter(row => !row.isRead).length });
    },
  };
}
const readers = createAuraActivityReaders();
export const customerAuraActivity = readers.customer;
export const vendorAuraActivity = readers.vendor;
