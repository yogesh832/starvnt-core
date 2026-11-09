import { PortfolioItem } from '../models/PortfolioItem.js';

/**
 * Portfolio & Media Ingestion Pipeline Service (Spec §7, §8, Golden Test M).
 *
 * BULK UPLOAD -> PROCESSING -> TYPE DETECTION -> CLASSIFICATION
 * -> TAG SUGGESTION -> THUMBNAIL/TRANSCODING -> VENDOR REVIEW -> PUBLISH
 * -> VERIFICATION -> OPTIONAL BOOKING-PROVEN EVIDENCE
 */

/**
 * Automatically infers media type and category based on filename and metadata.
 */
export function inferMediaAttributes(item) {
  const filename = (item.originalFilename || item.url || '').toLowerCase();
  const mime = (item.mimeType || '').toLowerCase();

  let mediaType = item.mediaType || 'IMAGE';
  let deliverableType = 'Photo Deliverable';

  const isYouTube = filename.includes('youtube.com') || filename.includes('youtu.be');
  const isVimeo = filename.includes('vimeo.com');

  if (
    filename.endsWith('.mp4') ||
    filename.endsWith('.mov') ||
    filename.endsWith('.mkv') ||
    filename.endsWith('.webm') ||
    filename.startsWith('data:video/') ||
    mime.startsWith('video/') ||
    isYouTube ||
    isVimeo
  ) {
    if (item.durationSeconds && item.durationSeconds <= 60) {
      mediaType = 'REEL';
      deliverableType = 'Social Media Reel';
    } else if (item.durationSeconds && item.durationSeconds <= 300) {
      mediaType = 'HIGHLIGHT_FILM';
      deliverableType = 'Cinematic Teaser';
    } else {
      mediaType = 'VIDEO';
      deliverableType = 'Full Event Coverage Video';
    }
  } else {
    mediaType = 'IMAGE';
    deliverableType = 'High-Res Photo';
  }

  // Aura+ Classification & Tag suggestions
  const tags = new Set(item.tags || []);
  if (filename.includes('candid')) tags.add('Candid');
  if (filename.includes('wedding')) tags.add('Wedding');
  if (filename.includes('traditional')) tags.add('Traditional');
  if (filename.includes('cinematic')) tags.add('Cinematic');
  if (filename.includes('reception')) tags.add('Reception');
  if (filename.includes('haldi')) tags.add('Haldi');
  if (filename.includes('drone')) tags.add('Aerial/Drone');

  // Fallback defaults
  if (tags.size === 0) {
    tags.add(item.style || 'Candid');
    tags.add(item.eventType || 'Wedding');
  }

  let thumbnailUrl = item.thumbnailUrl;
  if (!thumbnailUrl) {
    if (isYouTube) {
      const ytMatch = filename.match(/(?:youtu\.be\/|v=|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
      thumbnailUrl = ytMatch && ytMatch[1] ? `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg` : item.url;
    } else if (mediaType === 'IMAGE') {
      thumbnailUrl = item.url.startsWith('data:') ? item.url : `${item.url}?w=300&q=80`;
    } else {
      thumbnailUrl = `${item.url}-poster.jpg`;
    }
  }

  return {
    mediaType,
    deliverableType,
    tags: Array.from(tags),
    thumbnailUrl,
  };
}

/**
 * Bulk ingests a large batch of media files (e.g. 50+ photos + multiple videos).
 */
export async function bulkIngestMedia(vendorId, items = [], defaultContext = {}) {
  if (!items || items.length === 0) {
    throw new Error('NO_MEDIA_ITEMS_PROVIDED');
  }

  const processedDocs = items.map((item, idx) => {
    const inferred = inferMediaAttributes(item);

    return {
      vendor: vendorId,
      vendorService: item.vendorServiceId || defaultContext.vendorServiceId || null,
      mediaType: inferred.mediaType,
      url: item.url,
      thumbnailUrl: inferred.thumbnailUrl,
      originalFilename: item.originalFilename || `media_${Date.now()}_${idx}`,
      mimeType: item.mimeType || (inferred.mediaType === 'IMAGE' ? 'image/jpeg' : 'video/mp4'),
      sizeBytes: item.sizeBytes || 1024 * 1024 * 2, // 2MB default
      durationSeconds: item.durationSeconds || (inferred.mediaType === 'VIDEO' ? 180 : 0),
      title: item.title || `Portfolio Item ${idx + 1}`,
      description: item.description || '',
      eventType: item.eventType || defaultContext.eventType || 'Wedding',
      style: item.style || defaultContext.style || 'Candid',
      location: {
        venue: item.location?.venue || defaultContext.venue || 'Kisan Palace',
        locality: item.location?.locality || defaultContext.locality || 'New Town',
        city: item.location?.city || defaultContext.city || 'Kolkata',
      },
      deliverableType: inferred.deliverableType,
      tags: inferred.tags,
      isFeatured: !!item.isFeatured,
      visibility: item.visibility || 'PUBLIC',
      status: 'VENDOR_REVIEW', // Ready for vendor to review suggestions before publishing
    };
  });

  const inserted = await PortfolioItem.insertMany(processedDocs);

  return {
    ingestedCount: inserted.length,
    photoCount: inserted.filter((d) => d.mediaType === 'IMAGE').length,
    videoCount: inserted.filter((d) => ['VIDEO', 'REEL', 'HIGHLIGHT_FILM'].includes(d.mediaType)).length,
    items: inserted,
  };
}

/**
 * Vendor reviews Aura+ classifications and publishes the portfolio items.
 */
export async function vendorReviewAndPublish(vendorId, itemIds, bulkUpdates = {}) {
  const editable = ['title', 'description', 'eventType', 'style', 'tags', 'visibility', 'isFeatured'];
  if (!bulkUpdates || typeof bulkUpdates !== 'object' || Array.isArray(bulkUpdates) ||
      Object.keys(bulkUpdates).some(key => key !== 'status' && !editable.includes(key))) {
    throw Object.assign(new Error('Only portfolio presentation fields can be edited.'), { status: 400, code: 'INVALID_PORTFOLIO_UPDATE' });
  }
  const query = {
    _id: { $in: itemIds },
    vendor: vendorId, // Strict tenant isolation
  };

  const updateFields = Object.fromEntries(editable.filter(key => Object.hasOwn(bulkUpdates, key)).map(key => [key, bulkUpdates[key]]));
  if (Object.hasOwn(bulkUpdates, 'status')) {
    // Existing clients include the displayed status when editing details.
    // Treat it as a precondition and never accept a caller-supplied transition.
    if (typeof bulkUpdates.status !== 'string') {
      throw Object.assign(new Error('The portfolio status is invalid.'), { status: 400, code: 'INVALID_PORTFOLIO_UPDATE' });
    }
    query.status = bulkUpdates.status;
  } else {
    query.status = { $in: ['UPLOADED', 'PROCESSING', 'VENDOR_REVIEW', 'PUBLISHED'] };
    updateFields.status = 'PUBLISHED';
  }
  if (Object.keys(updateFields).length) {
    await PortfolioItem.updateMany(query, { $set: updateFields }, { runValidators: true });
  }

  const published = await PortfolioItem.find({
    ...query, status: Object.hasOwn(bulkUpdates, 'status') ? bulkUpdates.status : 'PUBLISHED',
  });
  return {
    publishedCount: published.length,
    items: published,
  };
}

/**
 * Core validation & verification of portfolio items (Spec §7).
 */
export async function verifyPortfolioItem(itemId, adminActor = 'CORE_ADMIN') {
  const item = await PortfolioItem.findById(itemId);
  if (!item) {
    throw new Error(`Portfolio item ${itemId} not found`);
  }

  item.status = 'VERIFIED';
  item.verifiedBy = adminActor;
  item.verifiedAt = new Date();
  await item.save();

  return item;
}

/**
 * Links portfolio item to confirmed booking as proven evidence (Spec §7).
 */
export async function linkPortfolioToBooking(itemId, bookingId) {
  const item = await PortfolioItem.findById(itemId);
  if (!item) {
    throw new Error(`Portfolio item ${itemId} not found`);
  }

  item.status = 'BOOKING_PROVEN';
  item.provenBookingId = bookingId;
  await item.save();

  return item;
}

/**
 * Retrieves vendor portfolio with location-linked and category filters.
 */
export async function queryVendorPortfolio(vendorId, filters = {}, { publicOnly = false } = {}) {
  const query = { vendor: vendorId };

  if (filters.mediaType) query.mediaType = filters.mediaType;
  if (filters.eventType) query.eventType = filters.eventType;
  if (filters.style) query.style = filters.style;
  if (filters.locality) query['location.locality'] = filters.locality;
  if (publicOnly) {
    query.visibility = 'PUBLIC';
    query.status = { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] };
  } else if (filters.status) {
    query.status = filters.status;
  }

  return await PortfolioItem.find(query)
    .sort({ isFeatured: -1, createdAt: -1 })
    .maxTimeMS(8000)
    .lean();
}
