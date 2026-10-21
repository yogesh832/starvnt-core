import mongoose from 'mongoose';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { Booking, CustomerContractDocument, CustomerEvent, CustomerFavorite, EventRequirement, Payment } from '../models/index.js';
import { badRequest, notFound } from '../utils/http.js';

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const asId = (doc) => String(doc?._id || '');
const money = (n) => (Number.isFinite(Number(n)) ? `INR ${Number(n).toLocaleString('en-IN')}` : 'Not recorded');
const ymd = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

function serializeEvent(event) {
  if (!event) return null;
  return {
    id: asId(event),
    title: event.title || event.eventType || 'Event',
    eventDate: event.eventDate || null,
    city: event.city || event.location?.city || null,
    status: event.status,
  };
}

function paymentReceipt(payment, event, booking) {
  return {
    id: `payment_receipt_${asId(payment)}`,
    type: 'receipt',
    title: `Payment receipt${booking?.vendorName ? ` - ${booking.vendorName}` : ''}`,
    event: serializeEvent(event),
    bookingReference: booking ? `Customer booking ${asId(booking).slice(-6).toUpperCase()}` : null,
    vendorName: booking?.vendorName || null,
    serviceName: booking?.packageName || null,
    amount: payment.amount,
    currency: payment.currency || 'INR',
    status: payment.status,
    issuedAt: payment.verifiedAt || payment.createdAt,
    canDownload: ['paid', 'verified'].includes(payment.status),
    downloadUrl: `/api/customer/documents/payment_receipt_${asId(payment)}/download`,
  };
}

function coreInvoice(core) {
  const invoiceNumber = core.taxSummary?.invoiceNumber || '';
  return {
    id: `core_invoice_${asId(core)}`,
    type: 'invoice',
    title: invoiceNumber ? `Invoice ${invoiceNumber}` : `Invoice for ${core.bookingReference}`,
    event: {
      id: null,
      title: core.serviceName || core.category || 'Booked service',
      eventDate: core.eventDate,
      city: core.serviceLocation?.city || null,
      status: core.bookingStatus,
    },
    bookingReference: core.bookingReference,
    vendorName: core.vendorName || null,
    serviceName: core.serviceName || null,
    amount: core.totalAmount,
    currency: 'INR',
    status: core.paymentStatus,
    issuedAt: core.taxSummary?.invoiceIssuedAt || core.paymentSummary?.paidAt || core.createdAt,
    canDownload: Boolean(invoiceNumber) || core.paymentStatus === 'PAYMENT_VERIFIED',
    downloadUrl: `/api/customer/documents/core_invoice_${asId(core)}/download`,
  };
}

function contractDocument(contract, event, booking, coreBooking) {
  return {
    id: `contract_${asId(contract)}`,
    type: 'contract',
    title: contract.title,
    event: serializeEvent(event) || (coreBooking ? {
      id: null,
      title: coreBooking.serviceName || coreBooking.category || 'Booked service',
      eventDate: coreBooking.eventDate,
      city: coreBooking.serviceLocation?.city || null,
      status: coreBooking.bookingStatus,
    } : null),
    bookingReference: coreBooking?.bookingReference || (booking ? `Customer booking ${asId(booking).slice(-6).toUpperCase()}` : null),
    vendorName: coreBooking?.vendorName || booking?.vendorName || null,
    serviceName: coreBooking?.serviceName || booking?.packageName || null,
    amount: coreBooking?.totalAmount || booking?.amount || null,
    currency: 'INR',
    status: contract.status,
    issuedAt: contract.createdAt,
    canDownload: true,
    fileName: contract.fileName,
    downloadUrl: `/api/customer/documents/contract_${asId(contract)}/download`,
  };
}

export async function listDocuments(customerId) {
  const [events, bookings, payments, coreBookings, contracts] = await Promise.all([
    CustomerEvent.find({ customer: customerId }).lean(),
    Booking.find({ customer: customerId }).lean(),
    Payment.find({ customer: customerId, status: { $in: ['paid', 'verified'] } }).sort({ createdAt: -1 }).lean(),
    CoreBooking.find({ customerId }).sort({ createdAt: -1 }).lean(),
    CustomerContractDocument.find({ customer: customerId, status: { $ne: 'ARCHIVED' } }).sort({ createdAt: -1 }).lean(),
  ]);
  const eventById = new Map(events.map((event) => [asId(event), event]));
  const bookingByPayment = new Map(bookings.map((booking) => [asId(booking.payment), booking]));
  const bookingById = new Map(bookings.map((booking) => [asId(booking), booking]));
  const coreBookingById = new Map(coreBookings.map((booking) => [asId(booking), booking]));

  const documents = [
    ...contracts.map((contract) => contractDocument(contract, eventById.get(asId(contract.event)), bookingById.get(asId(contract.booking)), coreBookingById.get(asId(contract.coreBooking)))),
    ...coreBookings.map(coreInvoice),
    ...payments.map((payment) => paymentReceipt(payment, eventById.get(asId(payment.event)), bookingByPayment.get(asId(payment)))),
  ];
  documents.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));
  return { documents };
}

export async function createContract(customerId, body = {}) {
  const title = String(body.title || '').trim();
  const fileUrl = String(body.fileUrl || '').trim();
  if (!title) throw badRequest('TITLE_REQUIRED', 'Contract title is required.');
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) throw badRequest('FILE_URL_REQUIRED', 'A secure uploaded contract URL is required.');

  let event = null;
  let booking = null;
  let coreBooking = null;
  if (body.bookingId) {
    if (!isObjectId(body.bookingId)) throw badRequest('INVALID_BOOKING', 'Booking id is invalid.');
    booking = await Booking.findOne({ _id: body.bookingId, customer: customerId }).lean();
    coreBooking = booking ? null : await CoreBooking.findOne({ _id: body.bookingId, customerId }).lean();
    if (!booking && !coreBooking) throw notFound('Booking not found');
    if (booking?.event) event = await CustomerEvent.findOne({ _id: booking.event, customer: customerId }).lean();
  } else if (body.eventId) {
    if (!isObjectId(body.eventId)) throw badRequest('INVALID_EVENT', 'Event id is invalid.');
    event = await CustomerEvent.findOne({ _id: body.eventId, customer: customerId }).lean();
    if (!event) throw notFound('Event not found');
  }

  const contract = await CustomerContractDocument.create({
    customer: customerId,
    event: event?._id || booking?.event || null,
    booking: booking?._id || null,
    coreBooking: coreBooking?._id || null,
    title,
    fileName: String(body.fileName || `${title}.pdf`).trim(),
    fileUrl,
    mimeType: String(body.mimeType || 'application/pdf').trim(),
    fileSize: String(body.fileSize || '').trim(),
    notes: body.notes ? String(body.notes).trim() : '',
  });
  return { document: contractDocument(contract.toObject(), event, booking, coreBooking) };
}

function selectedFavorite(requirement, event) {
  return {
    id: `selected_${asId(requirement)}`,
    type: 'selected_option',
    source: 'selected_option',
    event: serializeEvent(event),
    category: requirement.category,
    optionId: requirement.selectedOptionId,
    vendorName: requirement.selectedOption?.vendorName || 'Selected vendor',
    packageName: requirement.selectedOption?.packageName || null,
    price: requirement.selectedOption?.price ?? null,
    notes: 'Selected in your event plan.',
    createdAt: requirement.updatedAt || requirement.createdAt,
    removable: false,
  };
}

function savedFavorite(favorite, event) {
  return {
    id: asId(favorite),
    type: 'saved_vendor',
    source: favorite.source,
    event: serializeEvent(event),
    category: favorite.category,
    optionId: favorite.optionId,
    vendorId: favorite.vendorId,
    vendorName: favorite.vendorName,
    packageName: favorite.packageName,
    price: favorite.price,
    notes: favorite.notes,
    createdAt: favorite.createdAt,
    removable: true,
  };
}

export async function listFavorites(customerId) {
  const events = await CustomerEvent.find({ customer: customerId }).lean();
  const eventById = new Map(events.map((event) => [asId(event), event]));
  const eventIds = events.map((event) => event._id);
  const [selected, saved] = await Promise.all([
    EventRequirement.find({ event: { $in: eventIds }, selectedOptionId: { $ne: null } }).lean(),
    CustomerFavorite.find({ customer: customerId }).sort({ createdAt: -1 }).lean(),
  ]);

  const savedRows = saved.map((favorite) => savedFavorite(favorite, favorite.event ? eventById.get(asId(favorite.event)) : null));
  const savedOptionIds = new Set(savedRows.map((favorite) => favorite.optionId).filter(Boolean));
  const selectedRows = selected
    .map((requirement) => selectedFavorite(requirement, eventById.get(asId(requirement.event))))
    .filter((favorite) => !favorite.optionId || !savedOptionIds.has(favorite.optionId));
  const favorites = [...savedRows, ...selectedRows];
  favorites.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return { favorites };
}

export async function saveFavorite(customerId, body = {}) {
  const vendorName = String(body.vendorName || '').trim();
  if (!vendorName) throw badRequest('VENDOR_NAME_REQUIRED', 'Vendor name is required.');
  let event = null;
  if (body.eventId) {
    if (!isObjectId(body.eventId)) throw badRequest('INVALID_EVENT', 'Event id is invalid.');
    event = await CustomerEvent.findOne({ _id: body.eventId, customer: customerId }).lean();
    if (!event) throw notFound('Event not found');
  }
  const payload = {
    customer: customerId,
    event: event?._id || null,
    optionId: body.optionId ? String(body.optionId).trim() : null,
    vendorId: body.vendorId ? String(body.vendorId).trim() : null,
    vendorName,
    category: body.category ? String(body.category).trim() : null,
    packageName: body.packageName ? String(body.packageName).trim() : null,
    price: body.price == null || body.price === '' ? null : Number(body.price),
    notes: body.notes ? String(body.notes).trim() : null,
  };
  if (payload.price != null && !Number.isFinite(payload.price)) throw badRequest('INVALID_PRICE', 'Price must be a number.');

  const favorite = payload.optionId
    ? await CustomerFavorite.findOneAndUpdate(
        { customer: customerId, optionId: payload.optionId },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean()
    : await CustomerFavorite.create(payload).then((doc) => doc.toObject());
  return { favorite: savedFavorite(favorite, event) };
}

export async function removeFavorite(customerId, favoriteId) {
  if (!isObjectId(favoriteId)) throw notFound('Favorite not found');
  const deleted = await CustomerFavorite.findOneAndDelete({ _id: favoriteId, customer: customerId }).lean();
  if (!deleted) throw notFound('Favorite not found');
  return { ok: true };
}

function escapePdfText(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildSimplePdf(lines) {
  const safeLines = lines.map((line) => escapePdfText(line));
  const content = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    '(STARVNT Core) Tj',
    '/F1 11 Tf',
    '0 -28 Td',
    ...safeLines.map((line) => `(${line}) Tj\n0 -18 Td`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export async function documentPdf(customerId, documentId) {
  if (documentId.startsWith('contract_')) {
    const id = documentId.replace('contract_', '');
    if (!isObjectId(id)) throw notFound('Document not found');
    const contract = await CustomerContractDocument.findOne({ _id: id, customer: customerId, status: { $ne: 'ARCHIVED' } }).lean();
    if (!contract) throw notFound('Document not found');
    return {
      filename: contract.fileName || `${contract.title}.pdf`,
      redirectUrl: contract.fileUrl,
      mimeType: contract.mimeType || 'application/pdf',
    };
  }

  if (documentId.startsWith('core_invoice_')) {
    const id = documentId.replace('core_invoice_', '');
    if (!isObjectId(id)) throw notFound('Document not found');
    const core = await CoreBooking.findOne({ _id: id, customerId }).lean();
    if (!core) throw notFound('Document not found');
    return {
      filename: `${core.taxSummary?.invoiceNumber || core.bookingReference || 'starvnt-invoice'}.pdf`,
      buffer: buildSimplePdf([
        `Document: ${core.taxSummary?.invoiceNumber ? 'Invoice' : 'Booking invoice'}`,
        `Invoice number: ${core.taxSummary?.invoiceNumber || 'Pending issue'}`,
        `Booking reference: ${core.bookingReference || 'Not recorded'}`,
        `Service: ${core.serviceName || core.category || 'Not recorded'}`,
        `Vendor: ${core.vendorName || 'Not recorded'}`,
        `Event date: ${core.eventDate || 'Not recorded'}`,
        `Total amount: ${money(core.totalAmount)}`,
        `Paid amount: ${money(core.paymentSummary?.paidAmount)}`,
        `Payment status: ${core.paymentStatus || 'Not recorded'}`,
        `Generated: ${ymd(new Date())}`,
        'Generated from STARVNT Core booking records.',
      ]),
    };
  }

  if (documentId.startsWith('payment_receipt_')) {
    const id = documentId.replace('payment_receipt_', '');
    if (!isObjectId(id)) throw notFound('Document not found');
    const payment = await Payment.findOne({ _id: id, customer: customerId, status: { $in: ['paid', 'verified'] } }).lean();
    if (!payment) throw notFound('Document not found');
    const [event, booking] = await Promise.all([
      CustomerEvent.findOne({ _id: payment.event, customer: customerId }).lean(),
      Booking.findOne({ payment: payment._id, customer: customerId }).lean(),
    ]);
    return {
      filename: `starvnt-receipt-${asId(payment).slice(-8)}.pdf`,
      buffer: buildSimplePdf([
        'Document: Payment receipt',
        `Event: ${event?.title || event?.eventType || asId(payment.event)}`,
        `Service: ${booking?.packageName || booking?.category || 'Not recorded'}`,
        `Vendor: ${booking?.vendorName || 'Not recorded'}`,
        `Amount: ${money(payment.amount)}`,
        `Status: ${payment.status}`,
        `Provider: ${payment.provider || 'Not recorded'}`,
        `Provider order: ${payment.providerOrderId || 'Not recorded'}`,
        `Provider reference: ${payment.providerRef || 'Not recorded'}`,
        `Verified at: ${ymd(payment.verifiedAt) || 'Not recorded'}`,
        `Generated: ${ymd(new Date())}`,
        'Generated from STARVNT Core payment records.',
      ]),
    };
  }

  throw notFound('Document not found');
}
