import mongoose from 'mongoose';
import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { VendorService } from '../models/VendorService.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { vendorDirectory } from '../../experience/growth.service.js';

const routes = { leads: 'enquiries', quotes: 'quotes', bookings: 'bookings', payments: 'bookings', documents: 'documents', services: 'services', portfolio: 'portfolio', customers: 'customers' };
export async function searchVendorRecords(vendorId, input = {}) {
  if (typeof input.q !== 'string' || input.q.trim().length < 2 || input.q.trim().length > 100) throw Object.assign(new Error('Enter between 2 and 100 characters.'), { statusCode: 400, code: 'INVALID_SEARCH_QUERY' });
  const q = input.q.trim(), expression = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const page = Number(input.page || 1), limit = 8;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw Object.assign(new Error('Choose a valid search page.'), { statusCode: 400, code: 'INVALID_SEARCH_PAGE' });
  const skip = (page - 1) * limit;
  const match = fields => ({ $or: [...fields.map(field => ({ [field]: expression })), ...(mongoose.isValidObjectId(q) ? [{ _id: q }] : [])] });
  const query = (model, scope, fields, projection) => () => model.find({ $and: [scope, match(fields)] }).select(projection).sort({ _id: -1 }).skip(skip).limit(limit + 1).lean();
  const jobs = {
    leads: query(Opportunity, { vendor: vendorId }, ['serviceName', 'eventDate', 'status'], '_id serviceName eventDate status'),
    quotes: query(Quote, { vendor: vendorId }, ['serviceName', 'eventDate', 'status'], '_id serviceName eventDate status'),
    bookings: query(CoreBooking, { vendorId }, ['bookingReference', 'serviceName', 'customerName', 'eventDate', 'bookingStatus', 'executionStatus'], '_id bookingReference serviceName eventDate bookingStatus executionStatus'),
    payments: async () => {
      const [bookings, quotes] = await Promise.all([
        query(CoreBooking, { vendorId, 'paymentSummary.providerOrderId': { $exists: true, $nin: ['', null] } }, ['paymentSummary.providerOrderId', 'paymentSummary.providerPaymentId', 'bookingReference', 'paymentStatus'], '_id bookingReference paymentStatus paymentSummary.providerOrderId paymentSummary.providerPaymentId')(),
        query(Quote, { vendor: vendorId, 'advancePayment.providerOrderId': { $exists: true, $nin: ['', null] } }, ['advancePayment.providerOrderId', 'advancePayment.providerPaymentId', 'advancePayment.status'], '_id serviceName advancePayment.providerOrderId advancePayment.providerPaymentId advancePayment.status')(),
      ]);
      const seen = new Set();
      return [...bookings, ...quotes.map(q => ({ ...q, paymentStatus: q.advancePayment.status, paymentSummary: q.advancePayment, target: 'quotes' }))]
        .filter(row => { const key = row.paymentSummary.providerOrderId; if (seen.has(key)) return false; seen.add(key); return true; });
    },
    // Identity identifiers and files never enter ordinary global search.
    documents: query(VendorDocument, { vendor: vendorId, type: { $nin: ['PAN', 'GST', 'ID_PROOF', 'BANK_PROOF'] } }, ['title', 'type', 'status'], '_id title type status'),
    services: query(VendorService, { vendor: vendorId }, ['name', 'category', 'status'], '_id name category status'),
    portfolio: query(PortfolioItem, { vendor: vendorId }, ['title', 'status'], '_id title status'),
    customers: async () => {
      const directory = await vendorDirectory(vendorId);
      const found = directory.customers.filter(row => expression.test(row.name || '') || String(row.customerId || '') === q);
      return { rows: found.slice(skip, skip + limit + 1).map(row => ({ _id: row.key, name: row.name, status: 'AUTHORIZED_RELATIONSHIP' })), partial: directory.truncated };
    },
  };
  if (input.type && !Object.hasOwn(jobs, input.type)) throw Object.assign(new Error('Choose a valid search category.'), { statusCode: 400, code: 'INVALID_SEARCH_TYPE' });
  const selected = input.type ? [input.type] : Object.keys(jobs);
  const settled = await Promise.allSettled(selected.map(async type => jobs[type]()));
  return { query: q, page, computedAt: new Date(), sections: selected.map((type, index) => {
    const result = settled[index];
    if (result.status !== 'fulfilled') return { type, status: 'UNAVAILABLE', results: null, retryable: true };
    const rows = Array.isArray(result.value) ? result.value : result.value.rows;
    return { type, status: result.value.partial ? 'PARTIAL' : 'READY', hasMore: rows.length > limit, results: rows.slice(0, limit).map(row => ({
      id: String(row._id), title: row.title || row.name || row.bookingReference || row.serviceName || row.type,
      status: row.status || row.paymentStatus || row.executionStatus || row.bookingStatus,
      date: row.eventDate || null,
      reference: row.paymentSummary?.providerPaymentId || row.paymentSummary?.providerOrderId || row.bookingReference || String(row._id),
      source: type === 'payments' ? row.target === 'quotes' ? 'VENDOR_QUOTE_PAYMENT_SUMMARY' : 'CORE_BOOKING_PAYMENT_SUMMARY' : type,
      url: `/vendor/${row.target || routes[type]}?record=${encodeURIComponent(String(row._id))}`,
    })) };
  }) };
}
