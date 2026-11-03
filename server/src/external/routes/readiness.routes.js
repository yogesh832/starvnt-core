import { Router } from 'express';
import { vendorGrowthEvidence } from '../services/discoveryReadiness.service.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';
import { withVendorSchedule } from '../services/scheduleLock.js';
import { schedulingError } from '../../common/scheduleRules.js';
import { asyncHandler as h } from '../../customer/utils/http.js';
const router = Router();
router.get('/growth/evidence', h(async (req, res) => res.json(await vendorGrowthEvidence(req.vendorId))));
router.put('/growth-preferences', h(async (req, res) => {
  const { marketingOptIn, idempotencyKey } = req.body || {};
  if (typeof marketingOptIn !== 'boolean' || typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 160) throw schedulingError('INVALID_GROWTH_PREFERENCE', 'Choose a marketing preference and provide a request key.');
  await withVendorSchedule(req.vendorId, async assertLease => {
    const org = await VendorOrganization.findById(req.vendorId);
    const old = org.growthPreferences?.history?.find(h => h.key === idempotencyKey);
    if (old) { if (old.enabled !== marketingOptIn) throw schedulingError('IDEMPOTENCY_CONFLICT', 'Request key reused.', 409); return; }
    await assertLease();
    await VendorOrganization.updateOne({ _id: req.vendorId }, { $set: { 'growthPreferences.marketingOptIn': marketingOptIn }, $push: { 'growthPreferences.history': { actor: String(req.externalUser._id), at: new Date(), enabled: marketingOptIn, key: idempotencyKey } } });
  });
  res.json({ ok: true, status: await evaluateVendorActivation(req.vendorId) });
}));
router.post('/google-business/sync', h(async (req, res) => {
  const placeId = req.vendor.googlePlaceId;
  if (!placeId || !/^[a-zA-Z0-9_-]{3,200}$/.test(placeId) || /^(place_|osm_)/.test(placeId)) throw schedulingError('GOOGLE_PLACE_REQUIRED', 'Select a Google listing in your business profile first.');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw schedulingError('GOOGLE_SYNC_UNAVAILABLE', 'Google listing synchronization is not configured.', 503);
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,googleMapsUri' }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw schedulingError('GOOGLE_SYNC_FAILED', 'Google could not return this listing. Try later.', 502);
  const data = await response.json();
  if (data.id !== placeId || !data.displayName?.text) throw schedulingError('GOOGLE_SYNC_FAILED', 'Google returned an invalid listing response.', 502);
  const snapshot = { placeId, displayName: String(data.displayName.text).slice(0, 200), rating: Number.isFinite(data.rating) ? data.rating : null, reviewCount: Number.isInteger(data.userRatingCount) ? data.userRatingCount : null, mapsUrl: data.googleMapsUri || '', syncedAt: new Date() };
  const updated = await VendorOrganization.findOneAndUpdate({ _id: req.vendorId, googlePlaceId: placeId }, { $set: { googleBusiness: snapshot }, $push: { activationHistory: { actor: String(req.externalUser._id), role: 'VENDOR', at: new Date(), action: 'GOOGLE_LISTING_SYNCED', reason: 'Linked public Google listing refreshed separately from STARVNT ratings' } } }, { new: true });
  if (!updated) throw schedulingError('GOOGLE_PLACE_CHANGED', 'Your linked listing changed. Refresh and retry.', 409);
  res.json({ ok: true, googleBusiness: snapshot, source: 'GOOGLE_PLACES', ownershipVerified: false });
}));
export default router;
