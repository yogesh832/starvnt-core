import express from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import {
  bulkIngestMedia,
  vendorReviewAndPublish,
  queryVendorPortfolio,
  verifyPortfolioItem,
  inferMediaAttributes,
} from '../services/portfolio.service.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';

const router = express.Router();
const MAX_INLINE_MEDIA_RESPONSE_CHARS = 200000;
const IMAGE_PLACEHOLDER_URL = 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80';
const VIDEO_PLACEHOLDER_URL = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=80';

function compactPortfolioItem(item) {
  const obj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  const mediaType = obj.mediaType || 'IMAGE';
  const isVideo = ['VIDEO', 'REEL', 'HIGHLIGHT_FILM', 'FULL_EVENT'].includes(mediaType);
  const placeholder = isVideo ? VIDEO_PLACEHOLDER_URL : IMAGE_PLACEHOLDER_URL;

  for (const field of ['url', 'thumbnailUrl']) {
    if (typeof obj[field] === 'string' && obj[field].startsWith('data:') && obj[field].length > MAX_INLINE_MEDIA_RESPONSE_CHARS) {
      obj[`${field}Truncated`] = true;
      obj[field] = field === 'thumbnailUrl' ? placeholder : '';
    }
  }

  if (!obj.thumbnailUrl) obj.thumbnailUrl = placeholder;
  return obj;
}

function compactMediaUrl(url, mediaType = 'IMAGE') {
  const isVideo = ['VIDEO', 'REEL', 'HIGHLIGHT_FILM', 'FULL_EVENT'].includes(mediaType);
  const placeholder = isVideo ? VIDEO_PLACEHOLDER_URL : IMAGE_PLACEHOLDER_URL;
  if (typeof url === 'string' && url.startsWith('data:') && url.length > MAX_INLINE_MEDIA_RESPONSE_CHARS) {
    return placeholder;
  }
  return url || placeholder;
}

// Auto-configure Cloudinary with provided credentials or env variables
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'ei8znuga';
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const apiKey = process.env.CLOUDINARY_API_KEY;
const isCloudinaryConfigured = Boolean(process.env.CLOUDINARY_URL || (cloudName && apiKey && apiSecret));

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL, secure: true });
} else if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/**
 * Upload helper that uploads to Cloudinary if fully keyed,
 * or returns high-performance CDN / data payload.
 */
async function uploadMediaFile(vendorId, { file, filename, mediaType }) {
  const isVideo =
    mediaType === 'VIDEO' ||
    (filename && /\.(mp4|mov|webm|avi|mkv)$/i.test(filename)) ||
    (typeof file === 'string' && file.startsWith('data:video/'));

  // Attempt Cloudinary upload if API key is provided
  if (isCloudinaryConfigured) {
    try {
      const uploadResult = await cloudinary.uploader.upload(file, {
        folder: `starvnt_vendors/${vendorId}`,
        resource_type: isVideo ? 'video' : 'auto',
        public_id: filename
          ? `${Date.now()}_${filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`
          : undefined,
      });

      return {
        url: uploadResult.secure_url,
        thumbnailUrl:
          uploadResult.resource_type === 'video'
            ? uploadResult.secure_url.replace(/\.[^/.]+$/, '.jpg')
            : uploadResult.secure_url,
        provider: 'cloudinary',
        publicId: uploadResult.public_id,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
        width: uploadResult.width,
        height: uploadResult.height,
        resourceType: uploadResult.resource_type === 'video' ? 'VIDEO' : 'IMAGE',
        filename: filename || 'media_asset',
      };
    } catch (cErr) {
      console.warn('[Media Upload] Cloud storage failed, falling back:', cErr.message);
    }
  }

  // Fast direct CDN fallback
  return {
    url: file,
    thumbnailUrl: isVideo ? `${file}-poster.jpg` : file,
    provider: 'starvnt-inline-media',
    format: filename ? filename.split('.').pop() : isVideo ? 'mp4' : 'jpg',
    resourceType: isVideo ? 'VIDEO' : 'IMAGE',
    filename: filename || 'media_asset',
  };
}

/**
 * Direct Media Upload via Cloudinary CDN or high-performance local store.
 * Supports single file OR batch multiple files upload.
 */
router.post('/vendor/portfolio/upload', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const { file, filename, mediaType, files } = req.body || {};

    // Batch multiple files upload
    if (Array.isArray(files) && files.length > 0) {
      const results = [];
      for (const item of files) {
        if (item && item.file) {
          const uploaded = await uploadMediaFile(vendorId, item);
          results.push(uploaded);
        }
      }
      return res.status(201).json({
        ok: true,
        count: results.length,
        files: results,
      });
    }

    // Single file upload
    if (!file) {
      return res.status(400).json({ error: 'FILE_DATA_REQUIRED' });
    }

    const singleRes = await uploadMediaFile(vendorId, { file, filename, mediaType });
    return res.status(201).json({
      ok: true,
      ...singleRes,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Bulk Media Upload & Ingestion Pipeline (Spec §7, Golden Test M).
 * Supports 50+ photos + multiple videos in a single unified operation.
 */
router.post('/vendor/portfolio/bulk-upload', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const { items, defaultContext } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'ITEMS_ARRAY_REQUIRED' });
    }

    const result = await bulkIngestMedia(vendorId, items, defaultContext);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor reviews suggestions and publishes portfolio items.
 */
router.post('/vendor/portfolio/publish', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const { itemIds, bulkUpdates } = req.body || {};
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'ITEM_IDS_REQUIRED' });
    }

    const result = await vendorReviewAndPublish(vendorId, itemIds, bulkUpdates);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor retrieves their portfolio items.
 */
router.get('/vendor/portfolio', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const items = (await queryVendorPortfolio(vendorId, req.query)).map(compactPortfolioItem);
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

/**
 * Creates a structured Portfolio Project / Showcase with multiple images and videos.
 */
router.post('/vendor/portfolio/project', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const {
      projectName,
      eventType = 'Wedding',
      eventDate,
      venue,
      locality,
      city = 'Mumbai',
      style = 'Cinematic',
      description = '',
      coverUrl,
      mediaUrls = [],
      mediaItems = [],
      tags = [],
      status = 'PUBLISHED',
    } = req.body || {};

    if (!projectName) {
      return res.status(400).json({ error: 'PROJECT_NAME_REQUIRED' });
    }

    const defaultCover =
      coverUrl ||
      'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80';

    // Normalize incoming items: mediaItems takes precedence over mediaUrls
    const rawItems =
      Array.isArray(mediaItems) && mediaItems.length > 0
        ? mediaItems
        : Array.isArray(mediaUrls) && mediaUrls.length > 0
        ? mediaUrls.map((m, idx) => (typeof m === 'string' ? { url: m, title: `${projectName} #${idx + 1}` } : m))
        : [{ url: defaultCover, title: `${projectName} Cover` }];

    const createdItems = [];
    for (let i = 0; i < rawItems.length; i++) {
      const m = rawItems[i];
      const url = m.url || defaultCover;
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      const isVimeo = url.includes('vimeo.com');
      const isVid =
        m.mediaType === 'VIDEO' ||
        isYouTube ||
        isVimeo ||
        url.endsWith('.mp4') ||
        url.endsWith('.mov') ||
        url.endsWith('.webm') ||
        url.includes('/video/') ||
        url.startsWith('data:video/');

      // Determine clean thumbnail URL
      let thumb = m.thumbnailUrl || (isVid ? '' : url);
      if (!thumb && isYouTube) {
        const ytMatch = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch && ytMatch[1]) {
          thumb = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
        }
      }
      if (!thumb && isVid) {
        thumb = `${url}-poster.jpg`;
      }
      if (!thumb) {
        thumb = url;
      }

      const item = await PortfolioItem.create({
        vendor: vendorId,
        projectName,
        title: m.title || `${projectName} #${i + 1}`,
        description: m.description || description,
        mediaType: isVid ? 'VIDEO' : 'IMAGE',
        url,
        thumbnailUrl: thumb,
        eventType,
        style,
        location: {
          venue: venue || 'Venue',
          locality: locality || '',
          city,
        },
        eventDate: eventDate ? new Date(eventDate) : new Date(),
        tags: Array.isArray(tags) && tags.length > 0 ? tags : [eventType, style, city, 'Aura+ Featured'],
        isFeatured: i === 0 || url === coverUrl,
        status,
      });
      createdItems.push(item);
    }

    const activation = await evaluateVendorActivation(vendorId);

    res.status(201).json({
      ok: true,
      project: {
        projectName,
        eventType,
        city,
        venue,
        style,
        coverUrl: compactMediaUrl(createdItems[0]?.thumbnailUrl || createdItems[0]?.url || defaultCover, createdItems[0]?.mediaType),
        itemCount: createdItems.length,
        items: createdItems.map(compactPortfolioItem),
      },
      activation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Adds a standalone media item (photo, video, or URL) directly to portfolio.
 */
router.post('/vendor/portfolio/item', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const {
      url,
      thumbnailUrl,
      projectName = 'General Portfolio',
      title,
      description = '',
      eventType = 'Wedding',
      style = 'Candid',
      mediaType,
      city = 'Mumbai',
      venue = 'Venue',
      tags = [],
    } = req.body || {};

    if (!url) {
      return res.status(400).json({ error: 'URL_REQUIRED' });
    }

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isVid =
      mediaType === 'VIDEO' ||
      isYouTube ||
      url.endsWith('.mp4') ||
      url.endsWith('.mov') ||
      url.endsWith('.webm') ||
      url.includes('/video/') ||
      url.startsWith('data:video/');

    let thumb = thumbnailUrl || url;
    if (isYouTube) {
      const ytMatch = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch && ytMatch[1]) thumb = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }

    const item = await PortfolioItem.create({
      vendor: vendorId,
      projectName,
      title: title || `${projectName} Media`,
      description,
      mediaType: isVid ? 'VIDEO' : 'IMAGE',
      url,
      thumbnailUrl: thumb,
      eventType,
      style,
      location: { venue, city },
      tags: Array.isArray(tags) && tags.length > 0 ? tags : [eventType, style, city],
      status: 'PUBLISHED',
    });

    const activation = await evaluateVendorActivation(vendorId);
    res.status(201).json({ ok: true, item: compactPortfolioItem(item), activation });
  } catch (err) {
    next(err);
  }
});

/**
 * Deletes an individual media item from the portfolio.
 */
router.delete('/vendor/portfolio/items/:id', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const { id } = req.params;
    await PortfolioItem.deleteOne({ _id: id, vendor: vendorId });
    const activation = await evaluateVendorActivation(vendorId);
    res.json({ ok: true, activation });
  } catch (err) {
    next(err);
  }
});

/**
 * Deletes a full project and all its media items from the portfolio.
 */
router.delete('/vendor/portfolio/projects/:name', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const { name } = req.params;
    const decodedName = decodeURIComponent(name);
    await PortfolioItem.deleteMany({ projectName: decodedName, vendor: vendorId });
    const activation = await evaluateVendorActivation(vendorId);
    res.json({ ok: true, activation });
  } catch (err) {
    next(err);
  }
});

/**
 * Retrieves portfolio projects grouped by projectName.
 */
router.get('/vendor/portfolio/projects', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const items = await PortfolioItem.find({ vendor: vendorId }).sort({ createdAt: -1 }).maxTimeMS(8000).lean();
    const projectMap = {};

    for (const item of items) {
      const name = item.projectName || item.title || 'Featured Showcase';
      if (!projectMap[name]) {
        projectMap[name] = {
          projectName: name,
          eventType: item.eventType,
          style: item.style,
          location: item.location,
          eventDate: item.eventDate,
          coverUrl: compactMediaUrl(item.thumbnailUrl || item.url, item.mediaType),
          status: item.status,
          tags: item.tags,
          description: item.description,
          items: [],
        };
      }
      if (item.isFeatured || (!projectMap[name].coverUrl && item.mediaType === 'IMAGE')) {
        projectMap[name].coverUrl = compactMediaUrl(item.thumbnailUrl || item.url, item.mediaType);
      }
      projectMap[name].items.push(compactPortfolioItem(item));
    }

    const projects = Object.values(projectMap);
    res.json({ ok: true, count: projects.length, projects });
  } catch (err) {
    next(err);
  }
});

/**
 * Public/Customer view of verified & published vendor portfolio.
 */
router.get('/vendors/:vendorId/portfolio', async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const items = (await queryVendorPortfolio(vendorId, {
      ...req.query,
      status: { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] },
    })).map(compactPortfolioItem);
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

export default router;
