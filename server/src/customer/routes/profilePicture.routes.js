import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { updateCustomer } from '../repositories/customers.repo.js';
import { asyncHandler as h, badRequest, HttpError, notFound } from '../utils/http.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
export const profilePictureRoutes = Router();
profilePictureRoutes.put('/profile/picture', (req, res, next) => {
  upload.single('image')(req, res, error => {
    if (error) return next(badRequest('INVALID_IMAGE', error.code === 'LIMIT_FILE_SIZE' ? 'Choose a photo smaller than 5 MB.' : 'Choose one JPEG, PNG or WebP photo.'));
    next();
  });
}, h(async (req, res) => {
  if (!req.file || !['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) throw badRequest('INVALID_IMAGE', 'Choose a JPEG, PNG or WebP photo.');
  let image;
  try {
    const source = sharp(req.file.buffer, { limitInputPixels: 24000000 });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Unsupported image');
    image = await source.rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
  } catch { throw badRequest('INVALID_IMAGE', 'This photo could not be read. Choose a JPEG, PNG or WebP photo.'); }
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (CLOUDINARY_URL) {
    try {
      const url = new URL(CLOUDINARY_URL);
      if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password) throw new Error('Unavailable');
      cloudinary.config({ cloud_name: url.hostname, api_key: decodeURIComponent(url.username), api_secret: decodeURIComponent(url.password), secure: true });
    } catch { throw new HttpError(503, 'CLOUDINARY_NOT_CONFIGURED', 'Photo uploads are temporarily unavailable. Please try again later.'); }
  }
  else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  else throw new HttpError(503, 'CLOUDINARY_NOT_CONFIGURED', 'Photo uploads are temporarily unavailable. Please try again later.');
  let stored;
  try {
    stored = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `starvnt_customers/${req.externalUser._id}/profile`, resource_type: 'image', format: 'jpg' }, (error, result) => error ? reject(error) : resolve(result));
      stream.on('error', reject); stream.end(image);
    });
    if (!stored?.secure_url?.startsWith('https://')) throw new Error('Upload unavailable');
  } catch { throw new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'Your photo could not be uploaded. Please try again.'); }
  const user = await updateCustomer(req.externalUser._id, { avatarUrl: stored.secure_url });
  if (!user) throw notFound('Profile not found.');
  res.json({ ok: true, profile: user.toSafeJSON() });
}));
profilePictureRoutes.delete('/profile/picture', h(async (req, res) => {
  const user = await updateCustomer(req.externalUser._id, { avatarUrl: '' });
  if (!user) throw notFound('Profile not found.');
  res.json({ ok: true, profile: user.toSafeJSON() });
}));
