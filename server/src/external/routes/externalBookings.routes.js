import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { saveCommitment, transitionExternalBooking, recordExternalReceipt, recordExternalRefund } from '../services/commitments.service.js';
import { externalFinancials, EXTERNAL_CHANNELS, EXTERNAL_TRANSITIONS } from '../../common/externalBookingContract.js';
import { schedulingError } from '../../common/scheduleRules.js';
import { asyncHandler as h } from '../../customer/utils/http.js';
import { withVendorSchedule } from '../services/scheduleLock.js';

const router = Router();
const actor = req => ({ id: req.externalUser._id, role: 'VENDOR' });
export function serializeExternalBooking(doc) {
  const row = doc.toObject?.() || { ...doc };
  const b = row.externalBooking || {};
  row.externalBooking = { ...b, lifecycle: b.lifecycle || (row.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'), acquisitionChannel: b.acquisitionChannel || 'LEGACY_UNKNOWN', attachments: (b.attachments || []).map(a => ({ _id: a._id, name: a.name, kind: a.kind, at: a.at })) };
  delete row.requestHash;
  return { ...row, financials: externalFinancials(row), source: 'VENDOR_PRIVATE', verificationStatus: 'REPORTED' };
}
async function owned(req) {
  const row = mongoose.isValidObjectId(req.params.id) && await VendorBlockout.findOne({ _id: req.params.id, vendor: req.vendorId, recordType: 'EXTERNAL_COMMITMENT' });
  if (!row) throw schedulingError('RECORD_NOT_FOUND', 'External booking not found.', 404);
  return row;
}
router.get('/', h(async (req, res) => {
  const filter = { vendor: req.vendorId, recordType: 'EXTERNAL_COMMITMENT' };
  if (req.query.lifecycle) {
    if (!Object.hasOwn(EXTERNAL_TRANSITIONS, req.query.lifecycle)) throw schedulingError('INVALID_FILTER', 'Choose a valid lifecycle.');
    filter['externalBooking.lifecycle'] = req.query.lifecycle;
  }
  if (req.query.source) {
    if (!EXTERNAL_CHANNELS.includes(req.query.source)) throw schedulingError('INVALID_FILTER', 'Choose a valid source.');
    filter['externalBooking.acquisitionChannel'] = req.query.source;
  }
  if (req.query.after) {
    if (!mongoose.isValidObjectId(req.query.after)) throw schedulingError('INVALID_CURSOR', 'Invalid page cursor.');
    filter._id = { $lt: req.query.after };
  }
  const rows = await VendorBlockout.find(filter).sort({ _id: -1 }).limit(51).lean();
  res.json({ ok: true, bookings: rows.slice(0, 50).map(serializeExternalBooking), nextCursor: rows.length > 50 ? String(rows[49]._id) : null });
}));
router.get('/legacy', h(async (req, res) => res.json({ ok: true, bookings: await VendorBookingSlot.find({ vendor: req.vendorId }).sort({ date: -1 }).limit(100).lean(), readOnlyLegacy: true })));
router.get('/financial-summary', h(async (req, res) => {
  const totals = { contractedAmount: 0, pipelineAmount: 0, reportedReceivedAmount: 0, refundedAmount: 0, netReceivedAmount: 0, outstandingAmount: 0, overdueAmount: 0, bookingCount: 0 };
  for await (const row of VendorBlockout.find({ vendor: req.vendorId, recordType: 'EXTERNAL_COMMITMENT' }).cursor()) {
    const f = externalFinancials(row), lifecycle = row.externalBooking?.lifecycle || 'CONFIRMED';
    const contracted = row.status !== 'CANCELLED' && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(lifecycle);
    if (contracted) { totals.contractedAmount += f.totalAmount; totals.outstandingAmount += f.outstandingAmount; if (f.overdue) totals.overdueAmount += f.outstandingAmount; }
    else if (row.status !== 'CANCELLED') totals.pipelineAmount += f.totalAmount;
    totals.reportedReceivedAmount += f.receivedAmount; totals.refundedAmount += f.refundedAmount; totals.netReceivedAmount += f.netReceivedAmount; totals.bookingCount++;
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
  res.json({ ok: true, source: 'VENDOR_PRIVATE', verification: 'VENDOR_REPORTED', excludedFromStarvntRevenue: true, ...totals });
}));
router.post('/', h(async (req, res) => {
  if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(req.body?.externalBooking?.lifecycle)) throw schedulingError('INVALID_INITIAL_STATE', 'Start with an enquiry, quote, hold or confirmed booking.');
  const row = await saveCommitment(req.vendorId, { ...req.body, recordType: 'EXTERNAL_COMMITMENT' }, actor(req));
  res.status(201).json({ ok: true, booking: serializeExternalBooking(row) });
}));
router.get('/:id', h(async (req, res) => res.json({ ok: true, booking: serializeExternalBooking(await owned(req)) })));
router.patch('/:id', h(async (req, res) => {
  if (!Number.isInteger(req.body?.revision) || typeof req.body?.idempotencyKey !== 'string') throw schedulingError('REVISION_REQUIRED', 'A current revision and request key are required.');
  const before = await owned(req);
  const row = await saveCommitment(req.vendorId, { ...before.toObject(), ...req.body, recordType: 'EXTERNAL_COMMITMENT', externalBooking: req.body?.externalBooking }, actor(req), before._id, { commercialEdit: true });
  res.json({ ok: true, booking: serializeExternalBooking(row) });
}));
for (const [path, work] of [['lifecycle', transitionExternalBooking], ['receipts', recordExternalReceipt], ['refunds', recordExternalRefund]]) router.post(`/:id/${path}`, h(async (req, res) => { if (path === 'lifecycle' && !Number.isInteger(req.body?.revision)) throw schedulingError('REVISION_REQUIRED', 'Refresh the booking and provide its revision.'); res.json({ ok: true, booking: serializeExternalBooking(await work(req.vendorId, req.params.id, actor(req), req.body)) }); }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
export function validateExternalAttachment(file, kind) {
  const b = file?.buffer;
  const signatures = {
    'application/pdf': b?.subarray(0, 5).toString() === '%PDF-',
    'image/png': b?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': b?.[0] === 255 && b?.[1] === 216 && b?.[2] === 255,
    'image/webp': b?.subarray(0, 4).toString() === 'RIFF' && b?.subarray(8, 12).toString() === 'WEBP',
  };
  if (!b?.length || b.length > 10 * 1024 * 1024 || !signatures[file.mimetype] || !['INVOICE', 'RECEIPT', 'OTHER'].includes(kind)) throw schedulingError('INVALID_ATTACHMENT', 'Upload a PDF, JPEG, PNG or WebP up to 10 MB and choose its purpose.');
}
function mediaConfig() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw schedulingError('PRIVATE_STORAGE_UNAVAILABLE', 'Private document storage is unavailable. Try later.', 503);
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
}
router.post('/:id/attachments', (req, res, next) => upload.single('file')(req, res, err => { if (err) { err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400; } next(err); }), h(async (req, res) => {
  await owned(req);
  validateExternalAttachment(req.file, req.body.kind);
  const key = String(req.body.idempotencyKey || '').trim();
  if (!key || key.length > 160) throw schedulingError('IDEMPOTENCY_KEY_REQUIRED', 'A request key is required.');
  const hash = crypto.createHash('sha256').update(req.file.buffer).update(req.body.kind).digest('hex');
  const booking = await withVendorSchedule(req.vendorId, async assertLease => {
    const row = await owned(req), previous = row.history.find(h => h.idempotencyKey === key);
    if (previous) { if (previous.requestHash !== hash) throw schedulingError('IDEMPOTENCY_CONFLICT', 'Request key reused.', 409); return row; }
    if (row.externalBooking.attachments.length >= 20) throw schedulingError('ATTACHMENT_LIMIT', 'This booking already has 20 documents.');
    mediaConfig();
    const stored = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
      public_id: `starvnt_private/external/${req.vendorId}/${row._id}/${hash}`, resource_type: 'auto', type: 'authenticated', overwrite: false,
    });
    await assertLease();
    return VendorBlockout.findOneAndUpdate({ _id: row._id, vendor: req.vendorId, revision: row.revision }, { $inc: { revision: 1 }, $push: {
      'externalBooking.attachments': { key, name: String(req.file.originalname).replace(/[\\/\r\n]/g, '_').slice(0, 160), kind: req.body.kind, publicId: stored.public_id, resourceType: stored.resource_type, format: stored.format || (req.file.mimetype === 'application/pdf' ? 'pdf' : ''), actor: String(req.externalUser._id), at: new Date() },
      history: { actor: String(req.externalUser._id), role: 'VENDOR', at: new Date(), action: 'PRIVATE_ATTACHMENT_ADDED', idempotencyKey: key, requestHash: hash },
    } }, { new: true, runValidators: true });
  });
  res.status(201).json({ ok: true, booking: serializeExternalBooking(booking) });
}));
router.get('/:id/attachments/:attachmentId/download', h(async (req, res) => {
  const row = await owned(req), attachment = row.externalBooking.attachments.id(req.params.attachmentId);
  if (!attachment) throw schedulingError('ATTACHMENT_NOT_FOUND', 'Document not found.', 404);
  mediaConfig();
  const expiry = Math.floor(Date.now() / 1000) + 300;
  res.json({ url: cloudinary.utils.private_download_url(attachment.publicId, attachment.format, { resource_type: attachment.resourceType, type: 'authenticated', expires_at: expiry, attachment: true }), expiresAt: new Date(expiry * 1000) });
}));
export default router;
