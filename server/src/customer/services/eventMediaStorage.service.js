import crypto from 'node:crypto';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { badRequest, HttpError } from '../utils/http.js';

function configureStorage() {
  if (process.env.CLOUDINARY_URL) {
    const url = new URL(process.env.CLOUDINARY_URL);
    if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password) throw new HttpError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Private media storage is unavailable.');
    cloudinary.config({ cloud_name: url.hostname, api_key: decodeURIComponent(url.username), api_secret: decodeURIComponent(url.password), secure: true });
  } else {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new HttpError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Private media storage is unavailable. Please try again later.');
    cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  }
}

export async function prepareEventMedia(file, { allowDocument = false } = {}) {
  if (!file?.buffer?.length || file.buffer.length > 20 * 1024 * 1024) throw badRequest('INVALID_MEDIA', 'Choose a photo or MP4 video up to 20 MB.');
  if (file.mimetype === 'video/mp4') {
    if (file.buffer.subarray(4, 8).toString() !== 'ftyp') throw badRequest('INVALID_MEDIA', 'Choose a valid MP4 video.');
    return { buffer: file.buffer, mime: 'video/mp4', kind: 'VIDEO' };
  }
  if (allowDocument && file.mimetype === 'application/pdf') {
    if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw badRequest('INVALID_MEDIA', 'Choose a valid PDF document.');
    return { buffer: file.buffer, mime: 'application/pdf', kind: 'DOCUMENT' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw badRequest('INVALID_MEDIA', 'Choose a JPEG, PNG, WebP photo or MP4 video.');
  try {
    const image = sharp(file.buffer, { limitInputPixels: 24000000 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Unsupported image');
    const buffer = await image.rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    return { buffer, mime: 'image/jpeg', kind: 'PHOTO' };
  } catch { throw badRequest('INVALID_MEDIA', 'This photo could not be read. Choose another photo.'); }
}

// Reuses the existing authenticated Cloudinary delivery arrangement. Provider URLs never leave the server.
export const eventMediaStorage = {
  async upload(eventId, actorId, prepared) {
    configureStorage();
    const hash = crypto.createHash('sha256').update(prepared.buffer).digest('hex');
    const stored = await cloudinary.uploader.upload(`data:${prepared.mime};base64,${prepared.buffer.toString('base64')}`, {
      public_id: `starvnt_private/events/${eventId}/${actorId}/${hash}`,
      type: 'authenticated', resource_type: prepared.kind === 'DOCUMENT' ? 'raw' : prepared.kind === 'VIDEO' ? 'video' : 'image', overwrite: false,
    });
    return { publicId: stored.public_id, resourceType: stored.resource_type, format: stored.format, mime: prepared.mime, bytes: prepared.buffer.length };
  },
  async read(storage, range) {
    configureStorage();
    const url = cloudinary.utils.private_download_url(storage.publicId, storage.format, {
      type: 'authenticated', resource_type: storage.resourceType, expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    return fetch(url, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(30000) });
  },
};
