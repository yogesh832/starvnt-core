import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CustomerEvent } from '../customer/models/index.js';
import { categoryLabel } from '../customer/services/planCatalog.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';
import { VisualAsset, EventManifest } from './models.js';
import { proposalError } from './utils.js';

/**
 * Visual asset library for proposals. Every image carries a source label that
 * is derived from its source type (never free text), so an AI concept can
 * never be captioned as a real event. Only APPROVED assets reach a proposal.
 */

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSET_DIR = process.env.PROPOSAL_ASSET_DIR || path.join(SERVER_ROOT, 'var', 'assets');
const MIN_WIDTH = 600;
const MAX_EDGE = 2000;

export const SOURCE_LABELS = {
  APPROVED_PORTFOLIO: 'Vendor portfolio — actual past work',
  VENDOR_REFERENCE: 'Vendor-submitted reference',
  CUSTOMER_REFERENCE: 'Your reference image',
  AI_CONCEPT: 'AI-generated concept — illustrative only, not an actual event',
  ILLUSTRATIVE: 'Illustrative reference — not a guaranteed deliverable',
  STARVNT_PHOTO: 'STARVNT event photograph',
};
const ADMIN_UPLOAD_TYPES = ['APPROVED_PORTFOLIO', 'VENDOR_REFERENCE', 'ILLUSTRATIVE', 'STARVNT_PHOTO'];
const LICENCE_REQUIRED = ['APPROVED_PORTFOLIO', 'VENDOR_REFERENCE', 'ILLUSTRATIVE', 'STARVNT_PHOTO'];

/** Validates, strips metadata (EXIF/GPS) and normalises to JPEG. Returns the stored record fields. */
async function storeImage(buffer) {
  let meta;
  try { meta = await sharp(buffer).metadata(); } catch { throw proposalError('INVALID_IMAGE', 'This file is not a valid image.', 400); }
  if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw proposalError('UNSUPPORTED_IMAGE', 'Use a JPEG, PNG or WebP image.', 400);
  if ((meta.width || 0) < MIN_WIDTH) throw proposalError('IMAGE_TOO_SMALL', `Images must be at least ${MIN_WIDTH}px wide for print quality.`, 400);
  const { data, info } = await sharp(buffer).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  await fs.mkdir(ASSET_DIR, { recursive: true });
  const storageKey = `${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(ASSET_DIR, storageKey), data, { flag: 'wx' });
  return { storageKey, width: info.width, height: info.height, mime: 'image/jpeg' };
}

export async function readAssetFile(asset) {
  if (!/^[0-9a-f-]{36}\.jpg$/.test(String(asset?.storageKey))) throw proposalError('ASSET_NOT_FOUND', 'Image not found.', 404);
  return fs.readFile(path.join(ASSET_DIR, asset.storageKey));
}

function cleanCategory(category) {
  const c = String(category || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
  if (!c) throw proposalError('CATEGORY_REQUIRED', 'Choose where the image belongs (cover or a service).', 400);
  return c;
}

function audit(actor, actorType, action, asset, toState, why) {
  return recordBusinessAudit({ actorId: String(actor), actorType, action, resourceType: 'VisualAsset', resourceId: String(asset._id), referenceId: asset.links?.event ? String(asset.links.event) : undefined, toState, why, source: 'PROPOSAL_STUDIO' });
}

export async function uploadAdminAsset({ buffer, sourceType, category, eventId, vendorId, caption, licence }, admin) {
  if (!buffer?.length) throw proposalError('FILE_REQUIRED', 'Choose an image to upload.', 400);
  if (!ADMIN_UPLOAD_TYPES.includes(sourceType)) throw proposalError('INVALID_SOURCE_TYPE', `Source must be one of ${ADMIN_UPLOAD_TYPES.join(', ')}.`, 400);
  if (LICENCE_REQUIRED.includes(sourceType) && !String(licence || '').trim()) {
    throw proposalError('LICENCE_REQUIRED', 'Record who owns this image and that STARVNT may use it.', 400);
  }
  if (eventId && !(await CustomerEvent.exists({ _id: eventId }))) throw proposalError('EVENT_NOT_FOUND', 'Event not found.', 404);
  const stored = await storeImage(buffer);
  const asset = await VisualAsset.create({
    ...stored,
    url: '',
    sourceType,
    label: SOURCE_LABELS[sourceType],
    caption: String(caption || '').slice(0, 200),
    license: { type: 'authorised', holder: String(licence || '').slice(0, 300), evidence: '' },
    links: { event: eventId || undefined, vendor: vendorId || undefined },
    tags: { category: cleanCategory(category) },
    status: 'PENDING',
    uploadedBy: { type: 'admin', id: String(admin._id) },
  });
  await audit(admin._id, 'ADMIN', 'ASSET_UPLOADED', asset, 'PENDING', `${sourceType} uploaded`);
  return asset;
}

export async function uploadCustomerReference({ buffer, eventId, category, caption }, customerId) {
  if (!buffer?.length) throw proposalError('FILE_REQUIRED', 'Choose an image to upload.', 400);
  const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).select('_id').lean();
  if (!event) throw proposalError('EVENT_NOT_FOUND', 'Event not found.', 404);
  const count = await VisualAsset.countDocuments({ 'links.event': event._id, sourceType: 'CUSTOMER_REFERENCE', status: { $ne: 'REJECTED' } });
  if (count >= 20) throw proposalError('TOO_MANY_REFERENCES', 'You can share up to 20 reference images per event.', 409);
  const stored = await storeImage(buffer);
  const asset = await VisualAsset.create({
    ...stored,
    url: '',
    sourceType: 'CUSTOMER_REFERENCE',
    label: SOURCE_LABELS.CUSTOMER_REFERENCE,
    caption: String(caption || '').slice(0, 200),
    license: { type: 'customer-supplied', holder: 'Customer', evidence: 'Uploaded by the customer for their own event' },
    links: { event: event._id, customer: customerId },
    tags: { category: category ? cleanCategory(category) : 'cover' },
    status: 'PENDING',
    uploadedBy: { type: 'customer', id: String(customerId) },
  });
  await audit(customerId, 'CUSTOMER', 'ASSET_UPLOADED', asset, 'PENDING', 'Customer reference image');
  return asset;
}

// ── AI concept generation ──────────────────────────────────────────────────
let imageGenerator = null;
/** Tests register a stub: async ({ prompt }) => Buffer (PNG/JPEG). */
export function registerImageGenerator(fn) { imageGenerator = fn; }

async function geminiImage({ prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw proposalError('AI_IMAGES_UNAVAILABLE', 'AI image generation is not configured (GEMINI_API_KEY).', 503);
  const { GoogleGenAI, Modality } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.PROPOSAL_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const res = await ai.models.generateContent({ model, contents: prompt, config: { responseModalities: [Modality.IMAGE, Modality.TEXT] } });
  const part = res?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw proposalError('AI_IMAGE_EMPTY', 'The image model did not return an image. Try a different prompt.', 502);
  return Buffer.from(part.inlineData.data, 'base64');
}

/** Builds the prompt from the frozen manifest only: event type, theme, palette, venue, guest count, approved scope. */
export function conceptPrompt(manifest, category, extra = '') {
  const e = manifest.eventInfo;
  const req = manifest.requirements.find((r) => r.category === category);
  const prefs = req ? Object.entries(req.details || {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k}: ${v}`).join(', ') : '';
  return [
    `Photorealistic event design concept for a ${e.type || 'celebration'}${e.theme ? ` with a "${e.theme}" theme` : ''}.`,
    category === 'cover' ? 'Wide hero view of the decorated event space.' : `Focus: ${categoryLabel(category)}.`,
    e.colourPalette?.length ? `Colour palette: ${e.colourPalette.join(', ')}.` : '',
    e.guestCount ? `Scaled for about ${e.guestCount} guests.` : '',
    e.city ? `Indian setting, ${e.city}.` : '',
    prefs ? `Customer preferences: ${prefs}.` : '',
    String(extra || '').slice(0, 300),
    'No people\'s faces, no text, no logos, no watermarks. Elegant, premium, warm lighting.',
  ].filter(Boolean).join(' ');
}

export async function generateConcept({ eventId, category, extra }, admin) {
  const cat = cleanCategory(category);
  const manifest = await EventManifest.findOne({ event: eventId }).sort({ version: -1 }).lean();
  if (!manifest) throw proposalError('MANIFEST_REQUIRED', 'Build the event manifest first so the concept matches the approved requirements.', 409);
  const prompt = conceptPrompt(manifest, cat, extra);
  let buffer;
  try {
    buffer = await (imageGenerator || geminiImage)({ prompt });
  } catch (err) {
    if (err.statusCode) throw err;
    throw proposalError('AI_IMAGE_FAILED', `AI image generation failed: ${String(err.message).slice(0, 200)}`, 502);
  }
  const stored = await storeImage(buffer);
  const asset = await VisualAsset.create({
    ...stored,
    url: '',
    sourceType: 'AI_CONCEPT',
    label: SOURCE_LABELS.AI_CONCEPT,
    license: { type: 'ai-generated', holder: 'STARVNT', evidence: process.env.PROPOSAL_IMAGE_MODEL || 'gemini-2.5-flash-image' },
    links: { event: manifest.event },
    tags: { category: cat, eventType: manifest.eventInfo.type, theme: manifest.eventInfo.theme },
    ai: { provider: imageGenerator ? 'test' : 'gemini', model: process.env.PROPOSAL_IMAGE_MODEL || 'gemini-2.5-flash-image', prompt },
    status: 'PENDING',
    uploadedBy: { type: 'admin', id: String(admin._id) },
  });
  await audit(admin._id, 'ADMIN', 'ASSET_AI_GENERATED', asset, 'PENDING', 'AI concept generated');
  return asset;
}

export async function decideAsset(assetId, { decision, reason = '' }, admin) {
  const asset = await VisualAsset.findById(assetId);
  if (!asset) throw proposalError('ASSET_NOT_FOUND', 'Image not found.', 404);
  if (asset.status !== 'PENDING') throw proposalError('ASSET_NOT_PENDING', 'This image has already been reviewed.');
  const to = { APPROVE: 'APPROVED', REJECT: 'REJECTED' }[decision];
  if (!to) throw proposalError('INVALID_DECISION', 'Decision must be APPROVE or REJECT.', 400);
  if (to === 'REJECTED' && !String(reason).trim()) throw proposalError('REJECTION_REASON_REQUIRED', 'Give a reason for rejecting.', 400);
  const updated = await VisualAsset.findOneAndUpdate(
    { _id: asset._id, status: 'PENDING' },
    { $set: { status: to, approvedBy: String(admin._id), approvedAt: new Date(), decisionReason: String(reason).slice(0, 300) } },
    { new: true }
  );
  await audit(admin._id, 'ADMIN', `ASSET_${to}`, updated, to, reason || `Image ${to.toLowerCase()}`);
  return updated;
}

/**
 * Approved images for a proposal snapshot, grouped by section. Event-specific
 * images first, then portfolio images of vendors with an approved agreement.
 */
export async function approvedVisualsFor(eventId, agreements = []) {
  const vendorIds = agreements.map((a) => a.vendor).filter(Boolean);
  const assets = await VisualAsset.find({
    status: 'APPROVED',
    $or: [{ 'links.event': eventId }, ...(vendorIds.length ? [{ 'links.vendor': { $in: vendorIds }, 'links.event': { $exists: false }, sourceType: 'APPROVED_PORTFOLIO' }] : [])],
  }).sort({ createdAt: 1 }).lean();
  const byVendorCategory = new Map(agreements.map((a) => [String(a.vendor), a.category]));
  const visuals = {};
  for (const a of assets) {
    const section = a.links?.event ? a.tags?.category : (byVendorCategory.get(String(a.links?.vendor)) || a.tags?.category);
    if (!section) continue;
    (visuals[section] ||= []);
    if (visuals[section].length < 4) visuals[section].push({ assetId: String(a._id), sourceType: a.sourceType, label: a.label, caption: a.caption || '' });
  }
  return visuals;
}

export function assetForAdmin(a) {
  return {
    id: a._id, sourceType: a.sourceType, label: a.label, caption: a.caption, status: a.status, category: a.tags?.category,
    width: a.width, height: a.height, licence: a.license?.holder, event: a.links?.event, vendor: a.links?.vendor,
    uploadedBy: a.uploadedBy?.type, aiPrompt: a.ai?.prompt, decisionReason: a.decisionReason, createdAt: a.createdAt,
  };
}
