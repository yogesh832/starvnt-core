import { Router } from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { ExternalUser } from '../models/ExternalUser.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { publicSocialLinks, socialPlatforms, validateSocialUrl } from '../services/socialLinks.service.js';

export const vendorIdentityRoutes = Router();
export const publicVendorIdentityRoutes = Router();

function publicOrigin() {
  try {
    const url = new URL(process.env.STARVNT_VENDOR_PUBLIC_ORIGIN);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      return url.origin;
    }
  } catch { /* Profile sharing requires an approved origin. */ }
  return null;
}

function isPublishable(vendor, owner) {
  return vendor.status === 'ACTIVE' && vendor.activationReview?.status === 'APPROVED' &&
    !vendor.isRestricted && owner?.status === 'ACTIVE' && owner.accountType === 'VENDOR' && !owner.isRestricted;
}

function ownerView(vendor, owner) {
  const identity = vendor.socialIdentity;
  const origin = publicOrigin();
  const publishable = Boolean(origin && isPublishable(vendor, owner));
  const publishProfile = identity?.publishProfile === true;
  return {
    revision: identity?.revision || 0,
    links: identity?.links || [],
    publishProfile,
    publishable,
    reason: !origin ? 'The public profile site is unavailable.' : !publishable ? 'Your business needs active vendor approval before you can publish a profile.' : '',
    url: publishable && publishProfile ? `${origin}/vendors/${vendor._id}` : null,
    platforms: socialPlatforms,
  };
}

vendorIdentityRoutes.get('/profile/social-links', (req, res) => {
  res.set('Cache-Control', 'no-store').json(ownerView(req.vendor, req.externalUser));
});

vendorIdentityRoutes.put('/profile/social-links', async (req, res, next) => {
  try {
    const { revision, publishProfile, links } = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 ||
        typeof publishProfile !== 'boolean' || !Array.isArray(links) || links.length > socialPlatforms.length) {
      return res.status(400).json({ error: 'INVALID_SOCIAL_PROFILE', message: 'Review the profile settings and try again.' });
    }
    const savedLinks = [];
    const selectedPlatforms = new Set();
    for (const link of links) {
      const url = validateSocialUrl(link?.platform, link?.url);
      if (!url || typeof link.public !== 'boolean' || selectedPlatforms.has(link.platform)) {
        return res.status(400).json({ error: 'INVALID_SOCIAL_LINK', message: 'Enter one valid profile URL for each selected platform.' });
      }
      selectedPlatforms.add(link.platform);
      savedLinks.push({ platform: link.platform, url, public: link.public });
    }
    if (publishProfile && !req.vendor.socialIdentity?.publishProfile && !ownerView(req.vendor, req.externalUser).publishable) {
      return res.status(409).json({ error: 'PROFILE_NOT_PUBLISHABLE', message: 'Your public profile is not available for publication.' });
    }
    const currentRevision = revision === 0
      ? { $or: [{ 'socialIdentity.revision': 0 }, { 'socialIdentity.revision': { $exists: false } }] }
      : { 'socialIdentity.revision': revision };
    const vendor = await VendorOrganization.findOneAndUpdate(
      { _id: req.vendorId, owner: req.externalUser._id, ...currentRevision },
      { $set: { socialIdentity: { revision: revision + 1, publishProfile, links: savedLinks } } },
      { new: true, runValidators: true, timestamps: false },
    );
    if (!vendor) return res.status(409).json({ error: 'SOCIAL_PROFILE_CHANGED', message: 'This profile changed. Reload it before saving.' });
    return res.set('Cache-Control', 'no-store').json(ownerView(vendor, req.externalUser));
  } catch (error) { next(error); }
});

vendorIdentityRoutes.post('/profile/share-qr', async (req, res, next) => {
  try {
    const { url } = ownerView(req.vendor, req.externalUser);
    if (!url) return res.status(404).json({ error: 'PUBLIC_PROFILE_UNAVAILABLE', message: 'Publish your profile before generating a QR.' });
    const qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 512, margin: 4 });
    return res.set('Cache-Control', 'no-store').json({ url, qrDataUrl });
  } catch (error) { next(error); }
});

publicVendorIdentityRoutes.get('/vendors/:vendorId/public-profile', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const unavailable = () => res.status(404).json({ error: 'PUBLIC_PROFILE_UNAVAILABLE', message: 'This profile is unavailable.' });
    if (!publicOrigin() || !mongoose.isObjectIdOrHexString(req.params.vendorId)) return unavailable();
    const vendor = await VendorOrganization.findOne({ _id: req.params.vendorId, 'socialIdentity.publishProfile': true })
      .select('businessName brandName category owner status activationReview.status isRestricted socialIdentity').lean();
    if (!vendor) return unavailable();
    const owner = await ExternalUser.findById(vendor.owner).select('status accountType isRestricted').lean();
    if (!isPublishable(vendor, owner)) return unavailable();
    return res.json({
      name: vendor.brandName || vendor.businessName,
      category: vendor.category,
      socialLinks: publicSocialLinks(vendor.socialIdentity.links),
    });
  } catch (error) { next(error); }
});
