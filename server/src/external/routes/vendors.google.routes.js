import { Router } from 'express';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { OperatingLocation } from '../models/OperatingLocation.js';

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function ensureMapsUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'maps.app.goo.gl' ||
      host.endsWith('google.com') ||
      host.endsWith('google.co.in')
    ) {
      return value;
    }
  } catch {
    return '';
  }
  return '';
}

async function resolveOwnVendor(req, res) {
  const { vendorId } = req.params;
  const ownVendorId = req.externalUser.vendorOrganization;
  if (!ownVendorId || String(ownVendorId) !== String(vendorId)) {
    res.status(403).json({ error: 'FORBIDDEN_VENDOR_GOOGLE_PROFILE' });
    return null;
  }

  const vendor = await VendorOrganization.findById(vendorId);
  if (!vendor) {
    res.status(404).json({ error: 'VENDOR_NOT_FOUND' });
    return null;
  }

  return vendor;
}

async function getSearchContext(vendor, locationId) {
  let loc = null;
  if (locationId) {
    loc = await OperatingLocation.findOne({ _id: locationId, vendor: vendor._id });
  }
  if (!loc) {
    loc = await OperatingLocation.findOne({ vendor: vendor._id, isPrimary: true });
  }

  let query = `${vendor.businessName} ${vendor.location || ''}`.trim();
  let locationBias = null;

  if (loc) {
    query = [
      vendor.businessName,
      loc.label,
      loc.address,
      loc.locality,
      loc.city,
      loc.state,
    ].filter(Boolean).join(', ');

    if (loc.coordinates?.lat && loc.coordinates?.lng) {
      locationBias = {
        circle: {
          center: {
            latitude: loc.coordinates.lat,
            longitude: loc.coordinates.lng,
          },
          radius: 50000,
        },
      };
    }
  }

  return { loc, query };
}

function mapPlaceDetails(data, fallbackUrl = '', fallbackName = '') {
  return {
    linked: true,
    placeId: data.id,
    rating: data.rating || 0,
    reviewCount: data.userRatingCount || 0,
    reviews: data.reviews || [],
    googleMapsUrl: data.googleMapsUri || fallbackUrl,
    manualUrl: fallbackUrl,
    address: data.formattedAddress || '',
    businessName: data.displayName?.text || fallbackName,
    syncedAt: new Date(),
  };
}

async function fetchPlaceDetails(placeId, apiKey, fallbackUrl = '', fallbackName = '') {
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,rating,userRatingCount,reviews,googleMapsUri,formattedAddress&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.error) {
    const err = new Error('GOOGLE_API_ERROR');
    err.status = 502;
    err.details = data.error;
    throw err;
  }
  return mapPlaceDetails(data, fallbackUrl, fallbackName);
}

router.use(requireExternalAuth, requireAccountType('VENDOR'));

// GET /api/vendors/:vendorId/google?locationId=...
router.get('/:vendorId/google', asyncHandler(async (req, res) => {
  const vendor = await resolveOwnVendor(req, res);
  if (!vendor) return;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const manualUrl = vendor.googleBusinessUrl || '';

  const shouldSearchSelectedLocation = Boolean(req.query.locationId || req.query.q);

  if (vendor.googlePlaceId && !shouldSearchSelectedLocation) {
    if (apiKey) {
      try {
        const snapshot = await fetchPlaceDetails(vendor.googlePlaceId, apiKey, manualUrl, vendor.businessName);
        vendor.googleRating = snapshot;
        vendor.googleBusinessUrl = snapshot.googleMapsUrl || vendor.googleBusinessUrl;
        await vendor.save();
        return res.json({ ok: true, ...snapshot });
      } catch (err) {
        if (!vendor.googleRating) {
          return res.status(err.status || 502).json({ error: err.message || 'GOOGLE_API_ERROR', details: err.details });
        }
      }
    }

    if (vendor.googleRating) {
      return res.json({ ok: true, ...vendor.googleRating, linked: true, manualUrl });
    }
  }

  if (!apiKey) {
    return res.json({
      ok: true,
      needsApiKey: true,
      manualUrl,
      matches: [],
      message: 'GOOGLE_PLACES_API_KEY is not configured. Add a Google Business/Maps URL manually or configure the API key to search ratings.',
    });
  }

  const { query: defaultQuery, loc } = await getSearchContext(vendor, req.query.locationId);
  const query = String(req.query.q || defaultQuery).trim();
  const requestBody = { textQuery: query };

  if (loc?.coordinates?.lat && loc?.coordinates?.lng) {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: loc.coordinates.lat,
          longitude: loc.coordinates.lng,
        },
        radius: 50000,
      },
    };
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (data.error) {
    return res.status(502).json({ error: 'GOOGLE_API_ERROR', details: data.error });
  }

  const matches = (data.places || []).map((p) => ({
    placeId: p.id,
    businessName: p.displayName?.text,
    address: p.formattedAddress,
    rating: p.rating || 0,
    reviewCount: p.userRatingCount || 0,
    googleMapsUrl: p.googleMapsUri,
  }));

  return res.json({
    ok: true,
    linked: false,
    manualUrl,
    searchQuery: query,
    selectedLocationId: loc?._id || null,
    notFound: matches.length === 0,
    matches,
  });
}));

// POST /api/vendors/:vendorId/google
router.post('/:vendorId/google', asyncHandler(async (req, res) => {
  const vendor = await resolveOwnVendor(req, res);
  if (!vendor) return;

  const { placeId, googleMapsUrl } = req.body || {};
  const cleanUrl = ensureMapsUrl(googleMapsUrl);

  if (!placeId && !cleanUrl) {
    return res.status(400).json({ error: 'GOOGLE_PLACE_OR_URL_REQUIRED' });
  }

  if (placeId) vendor.googlePlaceId = String(placeId).trim();
  if (cleanUrl) vendor.googleBusinessUrl = cleanUrl;
  if (placeId && process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const snapshot = await fetchPlaceDetails(
        vendor.googlePlaceId,
        process.env.GOOGLE_PLACES_API_KEY,
        vendor.googleBusinessUrl || '',
        vendor.businessName
      );
      vendor.googleRating = snapshot;
      vendor.googleBusinessUrl = snapshot.googleMapsUrl || vendor.googleBusinessUrl;
    } catch (err) {
      if (!vendor.googleRating) vendor.googleRating = null;
    }
  } else if (cleanUrl && !vendor.googleRating) {
    vendor.googleRating = {
      linked: true,
      placeId: vendor.googlePlaceId || null,
      rating: 0,
      reviewCount: 0,
      reviews: [],
      googleMapsUrl: cleanUrl,
      manualUrl: cleanUrl,
      address: '',
      businessName: vendor.businessName,
      syncedAt: new Date(),
    };
  }
  await vendor.save();

  return res.json({
    ok: true,
    ...(vendor.googleRating || {}),
    linked: true,
    placeId: vendor.googlePlaceId,
    googleBusinessUrl: vendor.googleBusinessUrl,
  });
}));

export default router;
