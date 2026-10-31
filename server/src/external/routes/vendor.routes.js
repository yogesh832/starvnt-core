import { observeProduct } from '../../common/productObservability.js';
import { withVendorSchedule } from '../services/scheduleLock.js';
import { notificationPreferencesRoutes } from '../../notifications/preferences.routes.js';
import { vendorCategoryError } from '../../common/vendorCategories.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { TravelPolicy } from '../models/TravelPolicy.js';
import { VendorResource } from '../models/VendorResource.js';
import { saveCommitment, cancelCommitment, cancelLegacyCommitment } from '../services/commitments.service.js';
import { checkTrueAvailability } from '../services/availability.service.js';
import { normaliseCommitment } from '../../common/scheduleRules.js';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { Notification } from '../models/Notification.js';
import { Opportunity } from '../models/Opportunity.js';
import { maskOpportunityCustomer } from '../services/opportunityPrivacy.service.js';
import { Quote } from '../models/Quote.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { VendorReview } from '../models/VendorReview.js';
import { VendorMessageThread } from '../models/VendorMessageThread.js';
import { VendorDocument } from '../models/VendorDocument.js';
import { validateVendorGoalInput, listVendorBusinessGoals, createVendorBusinessGoal, updateVendorBusinessGoal, deleteVendorBusinessGoal } from '../services/vendorBusinessGoals.service.js';
import { Booking as CustomerBooking, EventMessage } from '../../customer/models/index.js';
import { notifyCustomer } from '../../notifications/notification.service.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';
import { generateVendorInsights } from '../services/auraIntelligence.service.js';
import { verifyGstin } from '../services/gstinVerification.service.js';
import { verifyPan } from '../services/panVerification.service.js';
import { v2 as cloudinary } from 'cloudinary';
import vendorAuraRoutes from './vendorAura.routes.js';
import financialRoutes from './financial.routes.js';
import { vendorFinancialTruth } from '../../common/financialTruth.service.js';
import { getVendorFirstResponseMetrics } from '../services/vendorFirstResponseMetrics.service.js';
import { getVendorDashboard } from '../services/vendorDashboard.service.js';
import rateLimit from 'express-rate-limit';
import { openBookingThread, openServiceThread, draftThreadMessage, draftVendorMessage } from '../services/vendorMessaging.service.js';

const router = Router();
const draftLimiter = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

function googleRatingFromPlaces(placeData, fallbackName) {
  if (!placeData || placeData.error || typeof placeData.rating !== 'number') return null;
  return {
    source: 'GOOGLE_PLACES',
    rating: placeData.rating,
    reviewCount: placeData.userRatingCount || 0,
    googleMapsUrl: placeData.googleMapsUri || '',
    reviews: placeData.reviews || [],
    address: placeData.formattedAddress || '',
    name: placeData.displayName?.text || fallbackName || '',
    lat: placeData.location?.latitude || null,
    lng: placeData.location?.longitude || null,
  };
}

// Middleware: Authenticate and resolve vendor organization context
router.use(requireExternalAuth, requireAccountType('VENDOR'));

function normalizePrimaryCategory(category) {
  if (category === undefined || category === null) return { value: undefined };
  if (Array.isArray(category)) return { error: 'PRIMARY_CATEGORY_SINGLE_ONLY' };
  const value = String(category).trim();
  const error = vendorCategoryError(value);
  if (error) return { error };
  if (!value) return { value: '' };
  if (/[|;]+/.test(value) || value.split(',').filter(Boolean).length > 1) {
    return { error: 'PRIMARY_CATEGORY_SINGLE_ONLY' };
  }
  return { value };
}

async function resolveVendorContext(req, res, next) {
  const vendorId = req.externalUser.vendorOrganization;
  if (!vendorId) {
    return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
  }
  const vendor = await VendorOrganization.findById(vendorId);
  if (!vendor) {
    return res.status(404).json({ error: 'VENDOR_ORGANIZATION_NOT_FOUND' });
  }
  req.vendor = vendor;
  req.vendorId = vendor._id;
  next();
}

router.use(resolveVendorContext);
router.use(notificationPreferencesRoutes('VENDOR'));

// ── Aura+ assistant & Financial Onboarding ──────────────────────────────────
router.use('/aura', vendorAuraRoutes);
router.use('/financial', financialRoutes);

// ── Profile & Activation ───────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  let googleRating = null;
  if (req.vendor.googlePlaceId) {
    try {
      const key = process.env.GOOGLE_PLACES_API_KEY || '';
      if (key && !req.vendor.googlePlaceId.startsWith('place_') && !req.vendor.googlePlaceId.startsWith('osm_')) {
        const url = `https://places.googleapis.com/v1/places/${req.vendor.googlePlaceId}?fields=id,displayName,rating,userRatingCount,reviews,googleMapsUri,formattedAddress,location&key=${key}`;
        const gRes = await fetch(url);
        const gData = await gRes.json();
        googleRating = googleRatingFromPlaces(gData, req.vendor.businessName);
      }
    } catch (err) {
      console.warn('[vendor/profile] Google Places fetch failed:', err.message);
    }
  }
  res.json({ ok: true, vendor: req.vendor, googleRating });
});

router.get('/google-places/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    if (!query || query.length < 2) {
      return res.json({ ok: true, places: [] });
    }

    const key = process.env.GOOGLE_PLACES_API_KEY || '';
    let places = [];

    if (key) {
      try {
        const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.location',
          },
          body: JSON.stringify({ textQuery: query }),
        });
        const data = await resp.json();
        if (data && Array.isArray(data.places)) {
          places = data.places.map((p) => ({
            id: p.id,
            name: p.displayName?.text || '',
            address: p.formattedAddress || '',
            rating: p.rating || 0,
            reviewCount: p.userRatingCount || 0,
            googleMapsUrl: p.googleMapsUri || '',
            lat: p.location?.latitude || null,
            lng: p.location?.longitude || null,
            source: 'GOOGLE_PLACES',
          }));
        }
      } catch (err) {
        console.warn('[google-places/search] Google Places API searchText error:', err.message);
      }
    }

    // Fallback search via OpenStreetMap Nominatim if no key or no results from Google API
    if (places.length === 0) {
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`,
          { headers: { 'User-Agent': 'starvnt-app/1.0', 'Accept-Language': 'en' } }
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          places = (nomData || []).map((item) => ({
            id: `place_${item.place_id}`,
            name: item.name || item.display_name.split(',')[0],
            address: item.display_name,
            rating: null,
            reviewCount: 0,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.display_name)}`,
            lat: Number(item.lat),
            lng: Number(item.lon),
            source: 'OPENSTREETMAP_UNRATED',
          }));
        }
      } catch (nomErr) {
        console.warn('[google-places/search] Nominatim search error:', nomErr.message);
      }
    }

    res.json({ ok: true, places });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const { businessName, brandName, category, location, city, phone, website, bio, googlePlaceId } = req.body || {};
    if (businessName) req.vendor.businessName = businessName.trim();
    if (brandName !== undefined) req.vendor.brandName = brandName.trim();
    const categoryResult = normalizePrimaryCategory(category);
    if (categoryResult.error) {
      return res.status(400).json({ error: categoryResult.error });
    }
    if (categoryResult.value !== undefined) req.vendor.category = categoryResult.value;
    const resolvedLoc = location !== undefined ? location : city;
    if (resolvedLoc !== undefined) req.vendor.location = resolvedLoc.trim();
    if (phone !== undefined) req.vendor.phone = phone.trim();
    if (website !== undefined) req.vendor.website = website.trim();
    if (bio !== undefined) req.vendor.bio = bio;
    if (googlePlaceId !== undefined) req.vendor.googlePlaceId = googlePlaceId ? googlePlaceId.trim() : null;

    // A profile is completed when brand name, category, and operating city/location are all provided
    const hasBrand = Boolean(req.vendor.businessName && req.vendor.businessName.trim());
    const hasCat = Boolean(req.vendor.category && req.vendor.category.trim());
    const hasLoc = Boolean(req.vendor.location && req.vendor.location.trim());
    req.vendor.isProfileCompleted = Boolean(hasBrand && hasCat && hasLoc);

    await req.vendor.save();
    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, vendor: req.vendor, activation });
  } catch (err) {
    next(err);
  }
});

router.put('/profile/picture', async (req, res, next) => {
  try {
    const { image } = req.body || {};
    if (image === undefined || image === null) {
      return res.status(400).json({ error: 'IMAGE_DATA_REQUIRED' });
    }

    let profilePicUrl = image;

    // Upload to Cloudinary if configured
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (image && cloudName && apiKey && apiSecret) {
      try {
        cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
        const uploadResult = await cloudinary.uploader.upload(image, {
          folder: `starvnt_vendors/${req.vendorId}/profile`,
          resource_type: 'auto',
          public_id: `profile_${Date.now()}`,
          transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
        });
        profilePicUrl = uploadResult.secure_url;
      } catch (cErr) {
        console.warn('[Cloudinary] Profile pic upload failed, ', cErr.message);
return res.status(502).json({ error: 'MEDIA_UPLOAD_FAILED' });
} } else if (image) { return res.status(503).json({ error: 'CLOUDINARY_NOT_CONFIGURED' }); }
req.vendor.profilePicUrl = profilePicUrl;
    await req.vendor.save();
    res.json({ ok: true, profilePicUrl });
  } catch (err) {
    next(err);
  }
});

router.post('/support-actions', async (req, res, next) => {
  try {
    const { action, outcome = 'OPEN_REQUESTED' } = req.body || {};
    if (!['WHATSAPP', 'CALL'].includes(action) || !['OPEN_REQUESTED', 'OPENED', 'FAILED'].includes(outcome)) return res.status(400).json({ error: 'INVALID_SUPPORT_ACTION' });
    await observeProduct('support_link', outcome, req.vendorId, true);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
router.post('/activation-review', async (req, res) => {
  try {
    await withVendorSchedule(req.vendorId, async assertLease => {
      const status = await evaluateVendorActivation(req.vendorId);
      if (['ACTIVE', 'UNDER_REVIEW'].includes(status.activationState)) return;
      if (!status.commercialReadiness || !status.checklist.verified || ['REJECTED', 'SUSPENDED'].includes(status.activationState)) throw Object.assign(new Error('Complete the outstanding requirements or contact support before submission.'), { statusCode: 409, code: 'PROFILE_NOT_READY' });
      await assertLease();
      await VendorOrganization.updateOne({ _id: req.vendorId }, { $set: { status: 'UNDER_REVIEW', activationState: 'UNDER_REVIEW', 'activationReview.status': 'PENDING', 'activationReview.requestedAt': new Date() }, $push: { activationHistory: { actor: String(req.externalUser._id), role: 'VENDOR', at: new Date(), action: 'SUBMITTED', reason: 'Vendor submitted profile for activation review', fromState: status.activationState, toState: 'UNDER_REVIEW' } } });
    });
    res.json({ ok: true, status: await evaluateVendorActivation(req.vendorId) });
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.code || 'REVIEW_SUBMISSION_FAILED', message: err.message }); }
});
router.get('/activation-status', async (req, res, next) => {
  try {
    const status = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, status });
  } catch (err) {
    next(err);
  }
});

router.get('/financial-truth', async (req, res, next) => {
  try {
    res.json({ ok: true, financialTruth: await vendorFinancialTruth(req.vendorId) });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', async (req, res, next) => {
  const periodDays = Number(req.query.periodDays ?? 30);
  if (![7, 30, 60, 90].includes(periodDays)) return res.status(400).json({ ok: false, error: 'INVALID_PERIOD_DAYS' });
  try {
    res.set('Cache-Control', 'private, no-store');
    res.json({ ok: true, dashboard: await getVendorDashboard(req.vendorId, { periodDays }) });
  } catch (err) { next(err); }
});

router.get('/metrics/first-response', async (req, res, next) => {
  const periodDays = Number(req.query.periodDays ?? 30);
  if (![30, 60, 90].includes(periodDays)) return res.status(400).json({ ok: false, error: 'INVALID_PERIOD_DAYS' });
  try {
    res.json({ ok: true, metrics: await getVendorFirstResponseMetrics(req.vendorId, { periodDays }) });
  } catch (err) {
    next(err);
  }
});

// ── Vendor-owned business goals ───────────────────────────────────────────
router.get('/goals', async (req, res, next) => {
  try {
    res.json({ ok: true, goals: await listVendorBusinessGoals(req.vendorId) });
  } catch (err) { next(err); }
});

router.post('/goals', async (req, res) => {
  const validated = validateVendorGoalInput(req.body || {});
  if (validated.error) return res.status(400).json({ ok: false, error: validated.error });
  try {
    const goal = await withVendorSchedule(req.vendorId, async assertLease => {
      await assertLease();
      return createVendorBusinessGoal({ vendorId: req.vendorId, userId: req.externalUser._id, values: validated.value });
    });
    res.status(201).json({ ok: true, goal });
  } catch (err) {
    res.status(err.statusCode || 400).json({ ok: false, error: err.code || 'GOAL_CREATE_FAILED', message: err.message });
  }
});

router.patch('/goals/:goalId', async (req, res) => {
  const body = req.body || {};
  if (!mongoose.isValidObjectId(req.params.goalId)) return res.status(400).json({ ok: false, error: 'INVALID_GOAL_ID' });
  const hasConfiguration = ['name', 'metric', 'targetValue', 'startDate', 'endDate'].some((key) => Object.hasOwn(body, key));
  if (!hasConfiguration && body.status === undefined) return res.status(400).json({ ok: false, error: 'EMPTY_GOAL_UPDATE' });
  const validated = hasConfiguration ? validateVendorGoalInput(body) : null;
  if (validated?.error) return res.status(400).json({ ok: false, error: validated.error });
  try {
    const goal = await withVendorSchedule(req.vendorId, async assertLease => {
      await assertLease();
      return updateVendorBusinessGoal({ vendorId: req.vendorId, userId: req.externalUser._id, goalId: req.params.goalId, values: validated?.value, status: body.status });
    });
    if (!goal) return res.status(404).json({ ok: false, error: 'GOAL_NOT_FOUND' });
    res.json({ ok: true, goal });
  } catch (err) {
    res.status(err.statusCode || 400).json({ ok: false, error: err.code || 'GOAL_UPDATE_FAILED', message: err.message });
  }
});

router.delete('/goals/:goalId', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.goalId)) return res.status(400).json({ ok: false, error: 'INVALID_GOAL_ID' });
  try {
    const goal = await deleteVendorBusinessGoal({ vendorId: req.vendorId, userId: req.externalUser._id, goalId: req.params.goalId });
    if (!goal) return res.status(404).json({ ok: false, error: 'GOAL_NOT_FOUND' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Services & Capabilities ────────────────────────────────────────────────
router.get('/services', async (req, res, next) => {
  try {
    const services = await VendorService.find({ vendor: req.vendorId });
    const capabilities = await VendorCapability.find({ vendor: req.vendorId });
    const coverages = await ServiceCoverage.find({ vendor: req.vendorId });

    const combined = services.map((svc) => ({
      ...svc.toObject(),
      capabilities: capabilities.filter((c) => String(c.vendorService) === String(svc._id)),
      coverage: coverages.filter((cov) => String(cov.vendorService) === String(svc._id)),
    }));

    res.json({ ok: true, services: combined });
  } catch (err) {
    next(err);
  }
});

router.post('/services', async (req, res, next) => {
  try {
    const { name, category, pricing, leadTimeDays, cancellationPolicy, deliverables, status } = req.body || {};
    if (vendorCategoryError(category)) return res.status(400).json({ error: vendorCategoryError(category) });
    if (!name || !category || !pricing || pricing.basePrice === undefined) {
      return res.status(400).json({ error: 'MISSING_SERVICE_FIELDS' });
    }

    const service = await VendorService.create({
      vendor: req.vendorId, // Strictly tenant resolved
      name,
      category,
      pricing: {
        pricingType: pricing.pricingType || 'FIXED',
        basePrice: Number(pricing.basePrice),
        unit: pricing.unit || 'event',
        taxIncluded: pricing.taxIncluded !== false,
        conditionalCharges: pricing.conditionalCharges || [],
      },
      leadTimeDays: leadTimeDays || 7,
      cancellationPolicy: cancellationPolicy || 'Standard 48-hour',
      deliverables: deliverables || [],
      status: status || 'ACTIVE',
    });

    const activation = await evaluateVendorActivation(req.vendorId);
    res.status(201).json({ ok: true, service, activation });
  } catch (err) {
    next(err);
  }
});

router.put('/services/:id/resources', async (req, res, next) => {
  try {
    const ids = [...new Set((req.body.requiredResourceIds || []).map(String))];
    if (ids.length && await VendorResource.countDocuments({ _id: { $in: ids }, vendor: req.vendorId, status: { $ne: 'RETIRED' } }) !== ids.length) return res.status(403).json({ error: 'RESOURCE_NOT_OWNED_BY_VENDOR' });
    const setup = Number(req.body.setupBufferMinutes ?? 45);
    if (!Number.isFinite(setup) || setup < 0 || setup > 1440) return res.status(400).json({ error: 'INVALID_SETUP_BUFFER' });
    const service = await withVendorSchedule(req.vendorId, async assertLease => {
      const current = await VendorService.findOne({ _id: req.params.id, vendor: req.vendorId });
      if (!current) return null;
      const before = { requiredResourceIds: current.requiredResourceIds.map(String).sort(), setupBufferMinutes: current.setupBufferMinutes };
      const after = { requiredResourceIds: ids.sort(), setupBufferMinutes: setup };
      if (JSON.stringify(before) === JSON.stringify(after)) return current;
      await assertLease();
      return VendorService.findOneAndUpdate({ _id: req.params.id, vendor: req.vendorId }, { $set: after, $push: { schedulingHistory: { actor: req.externalUser._id, at: new Date(), before, after } } }, { new: true, runValidators: true });
    });
    if (!service) return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    res.json({ ok: true, service });
  } catch (err) { next(err); }
});

router.put('/services/:id', async (req, res, next) => {
  try {
    const service = await VendorService.findOne({ _id: req.params.id, vendor: req.vendorId });
    if (!service) {
      return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    }

    const { name, category, pricing, leadTimeDays, status } = req.body || {};
    if (vendorCategoryError(category)) return res.status(400).json({ error: vendorCategoryError(category) });
    if (name) service.name = name;
    if (category) service.category = category;
    if (pricing) service.pricing = { ...service.pricing, ...pricing };
    if (leadTimeDays !== undefined) service.leadTimeDays = leadTimeDays;
    if (status) service.status = status;

    await service.save();
    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, service, activation });
  } catch (err) {
    next(err);
  }
});

router.delete('/services/:id', async (req, res, next) => {
  try {
    const service = await VendorService.findOne({ _id: req.params.id, vendor: req.vendorId });
    if (!service) {
      return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    }
    const [hasQuotes, hasBookings] = await Promise.all([
      Quote.exists({ vendorService: service._id }),
      CoreBooking.exists({ vendorService: service._id }),
    ]);
    if (hasQuotes || hasBookings) {
      service.status = 'ARCHIVED';
      await service.save();
      const activation = await evaluateVendorActivation(req.vendorId);
      return res.json({ ok: true, deleted: false, archived: true, service, activation });
    }
    await VendorService.deleteOne({ _id: service._id, vendor: req.vendorId });
    await VendorCapability.deleteMany({ vendorService: req.params.id });
    await ServiceCoverage.deleteMany({ vendorService: req.params.id });
    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, deleted: true, activation });
  } catch (err) {
    next(err);
  }
});

// ── Capabilities ───────────────────────────────────────────────────────────
router.post('/capabilities', async (req, res, next) => {
  try {
    const { vendorServiceId, styles, format, teamSize, equipment, categoryAttributes, simultaneousEventLimit } =
      req.body || {};

    const service = await VendorService.findOne({ _id: vendorServiceId, vendor: req.vendorId });
    if (!service) {
      return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    }

    let capability = await VendorCapability.findOne({ vendorService: service._id, vendor: req.vendorId });
    if (capability) {
      if (styles) capability.styles = styles;
      if (format) capability.format = format;
      if (teamSize !== undefined) capability.teamSize = teamSize;
      if (simultaneousEventLimit !== undefined) capability.simultaneousEventLimit = simultaneousEventLimit;
      if (equipment) capability.equipment = equipment;
      if (categoryAttributes) capability.categoryAttributes = categoryAttributes;
      await capability.save();
    } else {
      capability = await VendorCapability.create({
        vendor: req.vendorId,
        vendorService: service._id,
        styles: styles || [],
        format: format || 'Full day',
        teamSize: teamSize || 2,
        simultaneousEventLimit: simultaneousEventLimit || 1,
        equipment: equipment || [],
        categoryAttributes: categoryAttributes || {},
      });
    }

    const activation = await evaluateVendorActivation(req.vendorId);
    res.status(201).json({ ok: true, capability, activation });
  } catch (err) {
    next(err);
  }
});

// ── Operating Locations ────────────────────────────────────────────────────
router.get('/locations', async (req, res, next) => {
  try {
    const locations = await OperatingLocation.find({ vendor: req.vendorId }).sort({ isPrimary: -1, createdAt: -1 });
    res.json({ ok: true, locations });
  } catch (err) {
    next(err);
  }
});

router.post('/locations', async (req, res, next) => {
  try {
    const { label, type, address, locality, city, state, postalCode, coordinates, isPrimary } = req.body || {};
    const trimmedLabel = (label && String(label).trim()) || 'Main Studio';
    const trimmedCity = (city && String(city).trim()) || (req.vendor.location ? String(req.vendor.location).split(',')[0].trim() : '');
    if (!trimmedCity) {
      return res.status(400).json({ error: 'MISSING_LOCATION_FIELDS', message: 'City is required for operating origin.' });
    }

    const trimmedLocality = locality ? String(locality).trim() : '';
    const trimmedAddress = (address && String(address).trim()) || [trimmedLocality, trimmedCity].filter(Boolean).join(', ') || trimmedCity;

    const existingCount = await OperatingLocation.countDocuments({ vendor: req.vendorId });
    const shouldBePrimary = Boolean(isPrimary || existingCount === 0);

    if (shouldBePrimary) {
      await OperatingLocation.updateMany({ vendor: req.vendorId }, { isPrimary: false });
    }

    const location = await OperatingLocation.create({
      vendor: req.vendorId,
      label: trimmedLabel,
      type: type || 'STUDIO',
      address: trimmedAddress,
      locality: trimmedLocality,
      city: trimmedCity,
      state: state ? String(state).trim() : 'West Bengal',
      postalCode: postalCode ? String(postalCode).trim() : '',
      coordinates: coordinates && typeof coordinates.lat === 'number' && typeof coordinates.lng === 'number'
        ? { lat: Number(coordinates.lat), lng: Number(coordinates.lng) }
        : { lat: 0, lng: 0 },
      isPrimary: shouldBePrimary,
    });

    if (shouldBePrimary || !req.vendor.location) {
      req.vendor.location = `${location.locality ? location.locality + ', ' : ''}${location.city}`;
      if (req.vendor.businessName && req.vendor.category) {
        req.vendor.isProfileCompleted = true;
      }
      await req.vendor.save();
    }

    const activation = await evaluateVendorActivation(req.vendorId);
    res.status(201).json({ ok: true, location, activation });
  } catch (err) {
    next(err);
  }
});

router.put('/locations/:id', async (req, res, next) => {
  try {
    const loc = await OperatingLocation.findOne({ _id: req.params.id, vendor: req.vendorId });
    if (!loc) {
      return res.status(404).json({ error: 'LOCATION_NOT_FOUND' });
    }

    const { label, type, address, locality, city, state, postalCode, coordinates, isPrimary } = req.body || {};
    if (label !== undefined && String(label).trim()) loc.label = String(label).trim();
    if (type !== undefined) loc.type = type;
    if (city !== undefined && String(city).trim()) loc.city = String(city).trim();
    if (locality !== undefined) loc.locality = String(locality).trim();
    if (address !== undefined) {
      const trimmed = String(address).trim();
      loc.address = trimmed || [loc.locality, loc.city].filter(Boolean).join(', ') || loc.city || 'Studio Base';
    } else if (!loc.address) {
      loc.address = [loc.locality, loc.city].filter(Boolean).join(', ') || loc.city || 'Studio Base';
    }
    if (state !== undefined) loc.state = String(state).trim();
    if (postalCode !== undefined) loc.postalCode = String(postalCode).trim();
    if (coordinates && typeof coordinates.lat === 'number' && typeof coordinates.lng === 'number') {
      loc.coordinates = { lat: Number(coordinates.lat), lng: Number(coordinates.lng) };
    }

    if (isPrimary !== undefined) {
      if (isPrimary) {
        await OperatingLocation.updateMany({ vendor: req.vendorId }, { isPrimary: false });
      }
      loc.isPrimary = Boolean(isPrimary);
    }

    await loc.save();

    if (loc.isPrimary || !req.vendor.location) {
      req.vendor.location = `${loc.locality ? loc.locality + ', ' : ''}${loc.city}`;
      await req.vendor.save();
    }

    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, location: loc, activation });
  } catch (err) {
    next(err);
  }
});

router.patch('/locations/:id/primary', async (req, res, next) => {
  try {
    const loc = await OperatingLocation.findOne({ _id: req.params.id, vendor: req.vendorId });
    if (!loc) {
      return res.status(404).json({ error: 'LOCATION_NOT_FOUND' });
    }

    await OperatingLocation.updateMany({ vendor: req.vendorId }, { isPrimary: false });
    loc.isPrimary = true;
    if (!loc.address) {
      loc.address = [loc.locality, loc.city].filter(Boolean).join(', ') || loc.city || 'Studio Base';
    }
    await loc.save();

    req.vendor.location = `${loc.locality ? loc.locality + ', ' : ''}${loc.city}`;
    await req.vendor.save();

    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, location: loc, activation });
  } catch (err) {
    next(err);
  }
});

router.delete('/locations/:id', async (req, res, next) => {
  try {
    const deleted = await OperatingLocation.findOneAndDelete({ _id: req.params.id, vendor: req.vendorId });
    if (!deleted) {
      return res.status(404).json({ error: 'LOCATION_NOT_FOUND' });
    }

    if (deleted.isPrimary) {
      const remaining = await OperatingLocation.findOne({ vendor: req.vendorId }).sort({ createdAt: 1 });
      if (remaining) {
        remaining.isPrimary = true;
        if (!remaining.address) {
          remaining.address = [remaining.locality, remaining.city].filter(Boolean).join(', ') || remaining.city || 'Studio Base';
        }
        await remaining.save();
        req.vendor.location = `${remaining.locality ? remaining.locality + ', ' : ''}${remaining.city}`;
        await req.vendor.save();
      }
    }

    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, deleted: true, activation });
  } catch (err) {
    next(err);
  }
});

// ── Service Coverage ───────────────────────────────────────────────────────
router.get('/coverage', async (req, res, next) => {
  try {
    const coverages = await ServiceCoverage.find({ vendor: req.vendorId });
    res.json({ ok: true, coverages });
  } catch (err) {
    next(err);
  }
});

router.post('/coverage', async (req, res, next) => {
  try {
    const { vendorServiceId, coverageType, localities, city, state, radiusKm, outstationAllowed } = req.body || {};
    const service = await VendorService.findOne({ _id: vendorServiceId, vendor: req.vendorId });
    if (!service) {
      return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    }

    let coverage = await ServiceCoverage.findOne({ vendor: req.vendorId, vendorService: service._id });
    if (coverage) {
      coverage.coverageType = coverageType || 'RADIUS';
      if (localities !== undefined) coverage.localities = localities;
      if (city !== undefined) coverage.city = city.trim();
      if (state !== undefined) coverage.state = state.trim();
      if (radiusKm !== undefined) coverage.radiusKm = Number(radiusKm);
      if (outstationAllowed !== undefined) coverage.outstationAllowed = Boolean(outstationAllowed);
      await coverage.save();
    } else {
      coverage = await ServiceCoverage.create({
        vendor: req.vendorId,
        vendorService: service._id,
        coverageType: coverageType || 'RADIUS',
        localities: localities || [],
        city: city ? city.trim() : '',
        state: state ? state.trim() : '',
        radiusKm: radiusKm !== undefined ? Number(radiusKm) : 40,
        confidence: 'SELF_DECLARED',
        outstationAllowed: Boolean(outstationAllowed),
      });
    }

    const activation = await evaluateVendorActivation(req.vendorId);
    res.status(201).json({ ok: true, coverage, activation });
  } catch (err) {
    next(err);
  }
});

router.delete('/coverage/:id', async (req, res, next) => {
  try {
    const deleted = await ServiceCoverage.findOneAndDelete({ _id: req.params.id, vendor: req.vendorId });
    if (!deleted) {
      return res.status(404).json({ error: 'COVERAGE_NOT_FOUND' });
    }
    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, deleted: true, activation });
  } catch (err) {
    next(err);
  }
});

// ── Travel Policy ──────────────────────────────────────────────────────────
router.get('/travel-policy', async (req, res, next) => {
  try {
    let policy = await TravelPolicy.findOne({ vendor: req.vendorId });
    if (!policy) {
      policy = await TravelPolicy.create({ vendor: req.vendorId });
    }
    res.json({ ok: true, travelPolicy: policy });
  } catch (err) {
    next(err);
  }
});

router.put('/travel-policy', async (req, res, next) => {
  try {
    const {
      freeRadiusKm,
      perKmRate,
      equipmentTransitFee,
      tollAndParkingIncluded,
      outstationDailyAllowance,
      accommodationRequiredBeyondKm,
    } = req.body || {};

    let policy = await TravelPolicy.findOne({ vendor: req.vendorId });
    if (!policy) {
      policy = new TravelPolicy({ vendor: req.vendorId });
    }

    if (freeRadiusKm !== undefined) policy.freeRadiusKm = Number(freeRadiusKm);
    if (perKmRate !== undefined) policy.perKmRate = Number(perKmRate);
    if (equipmentTransitFee !== undefined) policy.equipmentTransitFee = Number(equipmentTransitFee);
    if (tollAndParkingIncluded !== undefined) policy.tollAndParkingIncluded = Boolean(tollAndParkingIncluded);
    if (outstationDailyAllowance !== undefined) policy.outstationDailyAllowance = Number(outstationDailyAllowance);
    if (accommodationRequiredBeyondKm !== undefined)
      policy.accommodationRequiredBeyondKm = Number(accommodationRequiredBeyondKm);

    await policy.save();
    res.json({ ok: true, travelPolicy: policy });
  } catch (err) {
    next(err);
  }
});

// ── Vendor Resources ───────────────────────────────────────────────────────
router.get('/resources', async (req, res, next) => {
  try {
    const resources = await VendorResource.find({ vendor: req.vendorId });
    res.json({ ok: true, resources });
  } catch (err) {
    next(err);
  }
});

router.post('/resources', async (req, res, next) => {
  try {
    const { type, name, identifier, capacityUnits, status, notes } = req.body || {};
    if (!type || !name) {
      return res.status(400).json({ error: 'MISSING_RESOURCE_FIELDS' });
    }

    const typeMapping = {
      STAFF: 'TEAM_MEMBER',
      TEAM: 'TEAM_MEMBER',
      FACILITY: 'SPACE',
    };
    const upperType = String(type).toUpperCase().trim();
    const resolvedType = typeMapping[upperType] || upperType;

    const resource = await VendorResource.create({
      vendor: req.vendorId,
      type: resolvedType,
      name: String(name).trim(),
      identifier: identifier ? String(identifier).trim() : '',
      capacityUnits: Number(capacityUnits) || 1,
      status: status || 'AVAILABLE',
      notes: notes ? String(notes).trim() : '',
    });

    res.status(201).json({ ok: true, resource });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message });
    }
    next(err);
  }
});

router.delete('/resources/:id', async (req, res, next) => {
  try {
    const deleted = await VendorResource.findOneAndDelete({ _id: req.params.id, vendor: req.vendorId });
    if (!deleted) {
      return res.status(404).json({ error: 'RESOURCE_NOT_FOUND' });
    }
    res.json({ ok: true, deleted: true });
  } catch (err) {
    next(err);
  }
});

// ── Vendor Availability & Calendar Management ──────────────────────────────
router.get('/availability/hours', async (req, res, next) => {
  try {
    const defaultHours = {
      Monday: { isOpen: true, hours: '9 AM – 7 PM' },
      Tuesday: { isOpen: true, hours: '9 AM – 7 PM' },
      Wednesday: { isOpen: true, hours: '9 AM – 7 PM' },
      Thursday: { isOpen: true, hours: '9 AM – 7 PM' },
      Friday: { isOpen: true, hours: '9 AM – 9 PM' },
      Saturday: { isOpen: true, hours: 'Full day' },
      Sunday: { isOpen: false, hours: 'Off' },
    };
    const vendor = await VendorOrganization.findById(req.vendorId);
    res.json({ ok: true, workingHours: vendor?.workingHours || defaultHours });
  } catch (err) {
    next(err);
  }
});

router.put('/availability/hours', async (req, res, next) => {
  try {
    const { workingHours } = req.body || {};
    if (!workingHours) {
      return res.status(400).json({ error: 'WORKING_HOURS_REQUIRED' });
    }
    const updated = await VendorOrganization.findByIdAndUpdate(
      req.vendorId,
      { $set: { workingHours } },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'VENDOR_NOT_FOUND' });
    }
    req.vendor = updated;
    res.json({ ok: true, workingHours: updated.workingHours });
  } catch (err) {
    next(err);
  }
});

router.get('/availability/blockouts', async (req, res, next) => {
  try {
    const blockouts = await VendorBlockout.find({ vendor: req.vendorId, status: { $ne: 'CANCELLED' } }).sort({ date: 1 });
    res.json({ ok: true, blockouts });
  } catch (err) {
    next(err);
  }
});

const scheduleActor = req => ({ id: req.externalUser._id, role: 'VENDOR' });
function scheduleFailure(res, err) {
  return res.status(err.statusCode || 400).json({ error: err.code || 'SCHEDULE_ERROR', message: err.message, conflicts: err.conflicts || [] });
}
router.post('/availability/validateBlockout', async (req, res) => {
  try {
    const data = normaliseCommitment(req.body);
    const result = await checkTrueAvailability({ vendorId: req.vendorId, ...data, vendorServiceId: data.vendorService, requestedResources: data.resourceIds, excludeId: req.body.id, blockAll: data.recordType === 'VENDOR_BLOCK' });
    res.status(result.feasible ? 200 : 409).json({ ok: result.feasible, ...result });
  } catch (err) { scheduleFailure(res, err); }
});
router.post('/availability/blockouts', async (req, res) => {
  try { res.status(201).json({ ok: true, blockout: await saveCommitment(req.vendorId, req.body, scheduleActor(req)) }); }
  catch (err) { scheduleFailure(res, err); }
});
router.patch('/availability/blockouts/:id', async (req, res) => {
  try { res.json({ ok: true, blockout: await saveCommitment(req.vendorId, req.body, scheduleActor(req), req.params.id) }); }
  catch (err) { scheduleFailure(res, err); }
});
router.delete('/availability/blockouts/:id', async (req, res) => {
  try { res.json({ ok: true, blockout: await cancelCommitment(req.vendorId, req.params.id, scheduleActor(req), req.body?.reason) }); }
  catch (err) { scheduleFailure(res, err); }
});

router.get('/availability/bookings', async (req, res, next) => {
  try {
    const bookings = await VendorBookingSlot.find({ vendor: req.vendorId }).sort({ date: 1 });
    res.json({ ok: true, bookings });
  } catch (err) {
    next(err);
  }
});

// Legacy clients use the same validated reported-commitment store.
router.delete('/availability/bookings/:id', async (req, res) => {
  try { res.json({ ok: true, slot: await cancelLegacyCommitment(req.vendorId, req.params.id, scheduleActor(req), req.body?.reason) }); }
  catch (err) { scheduleFailure(res, err); }
});
router.post('/availability/bookings', async (req, res) => {
  try {
    const input = { ...req.body, recordType: 'EXTERNAL_COMMITMENT', scope: req.body.assignedResources?.length ? 'RESOURCE' : 'SERVICE', vendorService: req.body.vendorServiceId, resourceIds: req.body.assignedResources || [] };
    const slot = await saveCommitment(req.vendorId, input, scheduleActor(req));
    res.status(201).json({ ok: true, slot });
  } catch (err) { scheduleFailure(res, err); }
});

// ── Aura+ Growth Intelligence (Spec §16) ──────────────────────────────────
router.get('/intelligence/recommendations', async (req, res, next) => {
  try {
    const insights = await generateVendorInsights(req.vendorId);
    res.json({ ok: true, ...insights });
  } catch (err) {
    next(err);
  }
});

// ── Notifications & Dynamic Badges ─────────────────────────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ vendor: req.vendorId }).sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ vendor: req.vendorId, isRead: false });
    res.json({ ok: true, count: notifications.length, unreadCount, notifications });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, vendor: req.vendorId },
      { isRead: true, readAt: new Date(), status: 'READ' },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
    }
    res.json({ ok: true, notification });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications/read-all', async (req, res, next) => {
  try {
    const readAt = new Date();
    const [notifications, conversations] = await Promise.all([
      Notification.updateMany({ vendor: req.vendorId, isRead: false }, { isRead: true, readAt, status: 'READ' }),
      VendorMessageThread.updateMany({ vendor: req.vendorId, status: { $ne: 'BLOCKED' }, unreadVendorCount: { $gt: 0 } }, { $set: { unreadVendorCount: 0 } }),
    ]);
    res.json({
      ok: true,
      message: 'All notifications and conversations marked as read',
      markedNotifications: notifications.modifiedCount || 0,
      markedConversations: conversations.modifiedCount || 0,
      unread: 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/badge-counts', async (req, res, next) => {
  try {
    const [enquiriesCount, quotesCount, bookingsCount, messagesCount, unreadNotificationsCount, messageActionItems] = await Promise.all([
      Opportunity.countDocuments({ vendor: req.vendorId, status: 'NEW' }),
      Quote.countDocuments({ vendor: req.vendorId, status: { $in: ['DRAFT', 'SUBMITTED'] } }),
      CoreBooking.countDocuments({ vendorId: req.vendorId, bookingStatus: 'CONFIRMED' }),
      VendorMessageThread.countDocuments({
        vendor: req.vendorId,
        status: { $ne: 'BLOCKED' },
        unreadVendorCount: { $gt: 0 },
      }),
      Notification.countDocuments({ vendor: req.vendorId, isRead: false }),
      VendorMessageThread.find({ vendor: req.vendorId, status: { $ne: 'BLOCKED' }, unreadVendorCount: { $gt: 0 } })
        .select('_id eventName eventDate unreadVendorCount lastMessageAt')
        .sort({ lastMessageAt: -1 })
        .limit(6)
        .lean(),
    ]);

    res.json({
      ok: true,
      source: 'CORE_VENDOR_OS',
      metricSource: {
        enquiriesCount: 'Opportunity.status=NEW',
        quotesCount: 'Quote.status in DRAFT,SUBMITTED',
        bookingsCount: 'CoreBooking.bookingStatus=CONFIRMED',
        messagesCount: 'VendorMessageThread.unreadVendorCount',
        messageActionItems: 'VendorMessageThread.unreadVendorCount>0; vendor-scoped summary fields only',
        unreadNotificationsCount: 'Notification.isRead=false',
      },
      enquiriesCount,
      quotesCount,
      bookingsCount,
      messagesCount,
      messageActionItems: messageActionItems.map((thread) => ({
        threadId: String(thread._id),
        eventName: thread.eventName || 'Customer conversation',
        eventDate: thread.eventDate || null,
        unreadCount: Number(thread.unreadVendorCount || 0),
        lastMessageAt: thread.lastMessageAt || null,
      })),
      unreadNotificationsCount,
    });
  } catch (err) {
    next(err);
  }
});

// ── Reviews & Authentic Client Ratings (Strictly DB/API Driven) ────────────
router.get('/reviews', async (req, res, next) => {
  try {
    const reviews = await VendorReview.find({
      vendor: req.vendorId,
      status: 'PUBLISHED',
      isVerified: true,
    }).sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    let sum = 0;
    let recommendCount = 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    for (const r of reviews) {
      sum += r.rating;
      if (r.wouldRecommend !== false && r.rating >= 4) {
        recommendCount++;
      }
      const star = Math.round(r.rating);
      if (distribution[star] !== undefined) {
        distribution[star]++;
      }
    }

    const averageRating = totalReviews > 0 ? (sum / totalReviews).toFixed(1) : '0.0';
    const recommendPercentage =
      totalReviews > 0 ? `${Math.round((recommendCount / totalReviews) * 100)}%` : '0%';

    let googleRating = null;
    const vendorOrg = req.vendor || (await VendorOrganization.findById(req.vendorId).lean());
    if (vendorOrg?.googlePlaceId) {
      try {
        const key = process.env.GOOGLE_PLACES_API_KEY || '';
        const url = `https://places.googleapis.com/v1/places/${vendorOrg.googlePlaceId}?fields=id,displayName,rating,userRatingCount,reviews,googleMapsUri,formattedAddress&key=${key}`;
        const gRes = await fetch(url);
        const gData = await gRes.json();
        googleRating = googleRatingFromPlaces(gData, vendorOrg.businessName);
      } catch (err) {
        console.warn('[vendor/reviews] Google Places fetch failed:', err.message);
      }
    }

    res.json({
      ok: true,
      reviews,
      stats: {
        averageRating,
        totalReviews,
        recommendPercentage,
        distribution,
      },
      googleRating,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews', async (req, res, next) => {
  try {
    return res.status(403).json({
      error: 'REVIEW_CREATION_CORE_ONLY',
      message: 'Vendor OS cannot create verified ratings. Reviews must come from completed customer bookings or admin-moderated Core workflows.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews/:id/reply', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'REPLY_TEXT_REQUIRED' });
    }

    const review = await VendorReview.findOne({ _id: req.params.id, vendor: req.vendorId, status: 'PUBLISHED' });
    if (!review) {
      return res.status(404).json({ error: 'ELIGIBLE_REVIEW_NOT_FOUND' });
    }
    if (review.vendorReply?.text?.trim()) {
      return res.status(409).json({ error: 'REVIEW_ALREADY_REPLIED' });
    }

    review.vendorReply = {
      text: text.trim(),
      repliedAt: new Date(),
    };
    await review.save();

    res.json({ ok: true, review });
  } catch (err) {
    next(err);
  }
});

// ── Real-Time Messaging & Direct Client Communications (Spec §9, §14, §19) ─
router.get('/messages/threads', async (req, res, next) => {
  try {
    let threads = await VendorMessageThread.find({ vendor: req.vendorId, status: { $ne: 'BLOCKED' } })
      .sort({ lastMessageAt: -1 })
      .lean();

    // If no threads exist yet, check if there are opportunities that can seed initial threads
    if (threads.length === 0) {
      const opportunities = await Opportunity.find({ vendor: req.vendorId })
        .populate('customer', 'fullName phone email')
        .sort({ createdAt: -1 })
        .limit(5);

      if (opportunities.length > 0) {
        for (const rawOpp of opportunities) {
          const opp = maskOpportunityCustomer(rawOpp);
          const clientName = opp.customer?.fullName || 'Prospective Client';
          await VendorMessageThread.create({
            vendor: req.vendorId,
            customer: opp.customer?._id || null,
            opportunity: opp._id,
            clientName,
            clientPhone: opp.customer?.phone || '',
            clientEmail: opp.customer?.email || '',
            eventName: opp.serviceName || 'Service Request',
            eventType: opp.requiredCapability || 'Enquiry',
            eventDate: opp.eventDate || '',
            venueLocation: opp.serviceLocation?.address || opp.serviceLocation?.locality || opp.serviceLocation?.city || '',
            lastMessageText: '',
            lastMessageAt: opp.createdAt || new Date(),
            unreadVendorCount: 0,
            customerEvent: opp.customerEvent || null,
            customerRequirement: opp.customerRequirement || null,
            messages: [],
          });
        }
        threads = await VendorMessageThread.find({ vendor: req.vendorId, status: { $ne: 'BLOCKED' } })
          .sort({ lastMessageAt: -1 })
          .lean();
      }
    }

    res.json({ ok: true, threads });
  } catch (err) {
    next(err);
  }
});

router.get('/messages/threads/:id', async (req, res, next) => {
  try {
    const thread = await VendorMessageThread.findOne({
      _id: req.params.id,
      vendor: req.vendorId,
    });

    if (!thread) {
      return res.status(404).json({ error: 'THREAD_NOT_FOUND' });
    }

    // Mark client messages as read
    let updated = false;
    for (const msg of thread.messages) {
      if (msg.sender === 'CLIENT' && !msg.isRead) {
        msg.isRead = true;
        updated = true;
      }
    }
    if (thread.unreadVendorCount > 0) {
      thread.unreadVendorCount = 0;
      updated = true;
    }
    if (updated) {
      await thread.save();
    }
    await Notification.updateMany(
      {
        vendor: req.vendorId,
        type: 'MESSAGE',
        isRead: false,
        $or: [
          { 'metadata.threadId': String(thread._id) },
          ...(thread.customerBooking ? [{ 'metadata.customerBookingId': String(thread.customerBooking) }] : []),
          ...(thread.customerRequirement ? [{ 'metadata.customerRequirementId': String(thread.customerRequirement) }] : []),
        ],
      },
      { isRead: true, readAt: new Date(), status: 'READ' }
    );

    res.json({ ok: true, thread });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/:id/message-thread', async (req, res, next) => {
  try {
    const thread = await openBookingThread({ vendorId: req.vendorId, bookingId: req.params.id });
    res.json({ ok: true, thread });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    next(err);
  }
});

router.post('/messages/context/:type/:id', async (req, res, next) => {
  try {
    const thread = await openServiceThread({ vendorId: req.vendorId, type: req.params.type, id: req.params.id });
    res.json({ ok: true, thread });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    next(err);
  }
});

router.post('/messages/threads/:id/draft', draftLimiter, async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await draftThreadMessage({ vendorId: req.vendorId, threadId: req.params.id, instructions: req.body?.instructions })) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    next(err);
  }
});

router.post('/messages/draft', draftLimiter, async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await draftVendorMessage({ vendorId: req.vendorId, context: req.body?.context, instructions: req.body?.instructions })) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    next(err);
  }
});

router.post('/messages/threads/:id', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) {
      return res.status(400).json({ error: 'MESSAGE_TEXT_REQUIRED' });
    }

    const thread = await VendorMessageThread.findOne({
      _id: req.params.id,
      vendor: req.vendorId,
    });

    if (!thread) {
      return res.status(404).json({ error: 'THREAD_NOT_FOUND' });
    }

    if (thread.status === 'BLOCKED') return res.status(409).json({ error: 'THREAD_BLOCKED' });

    const newMsg = {
      sender: 'VENDOR',
      senderName: req.vendor.businessName || 'Vendor',
      text: text.trim(),
      isRead: false,
      createdAt: new Date(),
    };

    thread.messages.push(newMsg);
    thread.lastMessageText = text.trim();
    thread.lastMessageAt = new Date();
    thread.unreadClientCount = (thread.unreadClientCount || 0) + 1;
    await thread.save();

    if (thread.customerBooking) {
      const booking = await CustomerBooking.findById(thread.customerBooking).lean();
      if (booking) {
        await Promise.all([
          EventMessage.create({
            event: booking.event,
            booking: booking._id,
            senderType: 'vendor',
            senderName: req.vendor.businessName || 'Vendor',
            body: text.trim(),
          }),
          notifyCustomer({
            customerId: booking.customer,
            eventId: booking.event,
            bookingId: booking._id,
            type: 'message',
            title: `${req.vendor.businessName || 'Vendor'} replied`,
            payload: { threadId: String(thread._id) },
            body: text.trim().slice(0, 180),
            actionUrl: `/customer/events/${booking.event}/circle?booking=${booking._id}`,
            idempotencyKey: `customer.vendor-reply.booking.${thread._id}.${thread.messages.length}`,
          }),
        ]);
      }
    } else if (thread.customerEvent && thread.customerRequirement && thread.customer) {
      await Promise.all([
        EventMessage.create({
          event: thread.customerEvent,
          requirement: thread.customerRequirement,
          senderType: 'vendor',
          senderName: req.vendor.businessName || 'Vendor',
          body: text.trim(),
        }),
        notifyCustomer({
          customerId: thread.customer,
          eventId: thread.customerEvent,
          type: 'message',
          title: `${req.vendor.businessName || 'Vendor'} replied`,
          payload: { threadId: String(thread._id) },
          body: text.trim().slice(0, 180),
          actionUrl: `/customer/events/${thread.customerEvent}/circle?service=${thread.customerRequirement}`,
          idempotencyKey: `customer.vendor-reply.requirement.${thread._id}.${thread.messages.length}`,
        }),
      ]);
    }

    if (thread.customer && !thread.customerBooking && !thread.customerRequirement) {
      await notifyCustomer({
        customerId: thread.customer, type: 'message',
        title: `${req.vendor.businessName || 'Vendor'} replied`, body: text.trim().slice(0, 180),
        payload: { threadId: String(thread._id) },
        actionUrl: `/customer/updates?tab=messages&thread=${thread._id}`,
        idempotencyKey: `customer.vendor-reply.thread.${thread._id}.${thread.messages.length}`,
      });
    }
    res.status(201).json({ ok: true, thread, message: newMsg });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/threads', async (req, res, next) => {
  try {
    const { opportunityId, bookingId, clientName, eventName, eventType, eventDate, venueLocation, text } = req.body || {};

    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'CLIENT_NAME_REQUIRED' });
    }

    // Check if thread already exists for this opportunity
    let thread = null;
    if (opportunityId) {
      thread = await VendorMessageThread.findOne({ vendor: req.vendorId, opportunity: opportunityId });
    } else if (bookingId) {
      thread = await VendorMessageThread.findOne({ vendor: req.vendorId, booking: bookingId });
    }

    if (!thread) {
      thread = new VendorMessageThread({
        vendor: req.vendorId,
        opportunity: opportunityId || null,
        booking: bookingId || null,
        clientName: clientName.trim(),
        eventName: eventName || 'Event Service',
        eventType: eventType || 'Service',
        eventDate: eventDate || '',
        venueLocation: venueLocation || '',
        messages: [],
      });
    }

    if (text && text.trim()) {
      const newMsg = {
        sender: 'VENDOR',
        senderName: req.vendor.businessName || 'Vendor',
        text: text.trim(),
        isRead: true,
        createdAt: new Date(),
      };
      thread.messages.push(newMsg);
      thread.lastMessageText = text.trim();
      thread.lastMessageAt = new Date();
    }

    await thread.save();
    res.status(201).json({ ok: true, thread });
  } catch (err) {
    next(err);
  }
});

// ── Vendor Documents & KYC Verification (Working Section) ──────────────────
router.get('/documents', async (req, res, next) => {
  try {
    const documents = await VendorDocument.find({ vendor: req.vendorId }).sort({ createdAt: -1 });
    res.json({ ok: true, documents });
  } catch (err) {
    next(err);
  }
});

router.post('/documents/verify-pan', async (req, res, next) => {
  try {
    const { pan } = req.body || {};
    if (!pan || !String(pan).trim()) {
      return res.status(400).json({ error: 'PAN_REQUIRED' });
    }
    const result = await verifyPan(String(pan).trim(), req.vendor.businessName);
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

router.post('/documents/verify-gstin', async (req, res, next) => {
  try {
    const { gstin } = req.body || {};
    if (!gstin || !String(gstin).trim()) {
      return res.status(400).json({ error: 'GSTIN_REQUIRED' });
    }
    const result = await verifyGstin(String(gstin).trim(), req.vendor.businessName);
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

function providerReviewReason(result, label) {
  const code = String(result?.error || '').toLowerCase();
  const message = String(result?.message || '').toLowerCase();
  if (code.includes('insufficient') || code.includes('credit') || message.includes('insufficient') || message.includes('credit')) {
    return `${label} automatic verification could not run because provider credits are unavailable.`;
  }
  if (code.includes('fetch') || message.includes('failed to fetch')) {
    return `${label} automatic verification could not reach the provider.`;
  }
  if (code.includes('not_configured')) {
    return `${label} automatic verification is not configured.`;
  }
  return `${label} check could not auto-verify.`;
}

router.post('/documents', async (req, res, next) => {
  try {
    const { title, type, documentNumber, fileName, fileUrl, fileSize, notes, expiryDate } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'TITLE_REQUIRED' });
    }

    const normalizedType = type || 'OTHER';
    const normalizedDocumentNumber = documentNumber ? String(documentNumber).trim().toUpperCase() : '';
    let status = 'SUBMITTED';
    let verificationSource = 'MANUAL';
    let verificationResult = undefined;
    let resolvedNotes = notes ? notes.trim() : '';
    let manualReview = { required: false, status: 'NONE' };

    if (normalizedType === 'GST') {
      verificationSource = 'GSTIN_API';
      const result = await verifyGstin(normalizedDocumentNumber, req.vendor.businessName);
      verificationResult = {
        matched: Boolean(result.matched),
        confidence: result.confidence || 'NONE',
        legalName: result.legalName || '',
        tradeName: result.tradeName || '',
        taxpayerType: result.taxpayerType || '',
        gstinStatus: result.gstinStatus || '',
        registrationDate: result.registrationDate || '',
        address: result.address || '',
        raw: result.raw || null,
        checkedAt: result.checkedAt || new Date(),
        error: result.error || '',
      };

      if (result.ok && result.matched) {
        status = 'VERIFIED';
        resolvedNotes = `GSTIN verified. Legal name: ${result.legalName || 'not provided'}${result.tradeName ? `; Trade name: ${result.tradeName}` : ''}`;
      } else {
        status = 'SUBMITTED';
        const reason = result.ok
          ? `GSTIN found, but name did not confidently match "${req.vendor.businessName}".`
          : providerReviewReason(result, 'GSTIN');
        resolvedNotes = [resolvedNotes, `${reason} Admin review required.`].filter(Boolean).join(' ');
        manualReview = { required: true, reason, status: 'NEEDS_REVIEW', requestedAt: new Date() };
      }
    } else if (normalizedType === 'PAN') {
      verificationSource = 'PAN_API';
      const result = await verifyPan(normalizedDocumentNumber, req.vendor.businessName);
      verificationResult = {
        matched: Boolean(result.matched),
        confidence: result.confidence || 'NONE',
        legalName: result.legalName || result.registeredName || '',
        tradeName: result.tradeName || '',
        registeredName: result.registeredName || result.legalName || '',
        pan: normalizedDocumentNumber,
        panStatus: result.panStatus || '',
        entityType: result.entityType || '',
        taxpayerType: result.taxpayerType || '',
        registrationDate: result.registrationDate || '',
        address: result.address || '',
        raw: result.raw || null,
        checkedAt: result.checkedAt || new Date(),
        error: result.error || '',
      };

      if (result.ok && result.matched) {
        status = 'VERIFIED';
        resolvedNotes = `Corporate PAN verified (${result.entityType || 'Corporate'}). Legal name: ${result.legalName || result.registeredName || 'not provided'}${result.tradeName ? `; Trade name: ${result.tradeName}` : ''}`;
      } else {
        status = 'SUBMITTED';
        const reason = result.ok
          ? `Corporate PAN found, but registered name did not confidently match "${req.vendor.businessName}".`
          : providerReviewReason(result, 'Corporate PAN');
        resolvedNotes = [resolvedNotes, `${reason} Admin review required.`].filter(Boolean).join(' ');
        manualReview = { required: true, reason, status: 'NEEDS_REVIEW', requestedAt: new Date() };
      }
    }

    const doc = await VendorDocument.create({
      vendor: req.vendorId,
      title: title.trim(),
      type: normalizedType,
      documentNumber: normalizedDocumentNumber,
      fileName: fileName ? fileName.trim() : `${title.trim().replace(/\s+/g, '_')}.pdf`,
      fileUrl: fileUrl || '',
      fileSize: fileSize || '1.2 MB',
      status,
      notes: resolvedNotes,
      expiryDate: expiryDate || '',
      verificationSource,
      verificationResult,
      manualReview,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    });

    let activation = null;
    if (status === 'VERIFIED' && (normalizedType === 'GST' || normalizedType === 'PAN')) {
      const isPan = normalizedType === 'PAN';
      req.vendor.verification = {
        ...(req.vendor.verification?.toObject?.() || req.vendor.verification || {}),
        isVerified: true,
        verifiedAt: new Date(),
        documentType: normalizedType,
        documentRef: doc._id,
        notes: isPan
          ? `Auto-verified by Corporation PAN API legal/trade name match (${verificationResult?.legalName || verificationResult?.registeredName || ''}).`
          : 'Auto-verified by GSTIN API legal/trade name match.',
      };
      await req.vendor.save();
      activation = await evaluateVendorActivation(req.vendorId);
    } else if (manualReview.required) {
      req.vendor.manualReview = {
        status: 'NEEDS_REVIEW',
        reason: manualReview.reason,
        provider: verificationSource,
        documentRef: doc._id,
        requestedAt: manualReview.requestedAt,
        notes: resolvedNotes,
      };
      await req.vendor.save();
    }

    res.status(201).json({ ok: true, document: doc, activation });
  } catch (err) {
    next(err);
  }
});

router.delete('/documents/:id', async (req, res, next) => {
  try {
    const doc = await VendorDocument.findOneAndDelete({
      _id: req.params.id,
      vendor: req.vendorId,
    });
    if (!doc) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    }
    res.json({ ok: true, message: 'Document deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
