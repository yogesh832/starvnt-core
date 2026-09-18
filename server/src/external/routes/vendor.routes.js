import { Router } from 'express';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { TravelPolicy } from '../models/TravelPolicy.js';
import { VendorResource } from '../models/VendorResource.js';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { Notification } from '../models/Notification.js';
import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { VendorReview } from '../models/VendorReview.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';
import { generateVendorInsights } from '../services/auraIntelligence.service.js';

const router = Router();

// Middleware: Authenticate and resolve vendor organization context
router.use(requireExternalAuth, requireAccountType('VENDOR'));

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

// ── Profile & Activation ───────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  res.json({ ok: true, vendor: req.vendor });
});

router.put('/profile', async (req, res, next) => {
  try {
    const { businessName, category, location, phone, website, bio } = req.body || {};
    if (businessName) req.vendor.businessName = businessName;
    if (category) req.vendor.category = category;
    if (location !== undefined) req.vendor.location = location;
    if (phone !== undefined) req.vendor.phone = phone;
    if (website !== undefined) req.vendor.website = website;
    if (bio !== undefined) req.vendor.bio = bio;

    await req.vendor.save();
    const activation = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, vendor: req.vendor, activation });
  } catch (err) {
    next(err);
  }
});

router.get('/activation-status', async (req, res, next) => {
  try {
    const status = await evaluateVendorActivation(req.vendorId);
    res.json({ ok: true, status });
  } catch (err) {
    next(err);
  }
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

router.put('/services/:id', async (req, res, next) => {
  try {
    const service = await VendorService.findOne({ _id: req.params.id, vendor: req.vendorId });
    if (!service) {
      return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    }

    const { name, category, pricing, leadTimeDays, status } = req.body || {};
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
    const deleted = await VendorService.findOneAndDelete({ _id: req.params.id, vendor: req.vendorId });
    if (!deleted) {
      return res.status(404).json({ error: 'SERVICE_NOT_FOUND' });
    }
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
    const locations = await OperatingLocation.find({ vendor: req.vendorId });
    res.json({ ok: true, locations });
  } catch (err) {
    next(err);
  }
});

router.post('/locations', async (req, res, next) => {
  try {
    const { label, type, address, locality, city, state, postalCode, coordinates, isPrimary } = req.body || {};
    if (!label || !address || !city) {
      return res.status(400).json({ error: 'MISSING_LOCATION_FIELDS' });
    }

    if (isPrimary) {
      await OperatingLocation.updateMany({ vendor: req.vendorId }, { isPrimary: false });
    }

    const location = await OperatingLocation.create({
      vendor: req.vendorId,
      label,
      type: type || 'STUDIO',
      address,
      locality: locality || '',
      city,
      state: state || 'West Bengal',
      postalCode: postalCode || '',
      coordinates: coordinates || { lat: 0, lng: 0 },
      isPrimary: Boolean(isPrimary),
    });

    const activation = await evaluateVendorActivation(req.vendorId);
    res.status(201).json({ ok: true, location, activation });
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

    const coverage = await ServiceCoverage.create({
      vendor: req.vendorId,
      vendorService: service._id,
      coverageType: coverageType || 'RADIUS',
      localities: localities || [],
      city: city || '',
      state: state || '',
      radiusKm: radiusKm !== undefined ? Number(radiusKm) : 40,
      confidence: 'SELF_DECLARED',
      outstationAllowed: Boolean(outstationAllowed),
    });

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
    const { freeRadiusKm, perKmRate, equipmentTransitFee, tollAndParkingIncluded, outstationDailyAllowance } =
      req.body || {};

    let policy = await TravelPolicy.findOne({ vendor: req.vendorId });
    if (!policy) {
      policy = new TravelPolicy({ vendor: req.vendorId });
    }

    if (freeRadiusKm !== undefined) policy.freeRadiusKm = Number(freeRadiusKm);
    if (perKmRate !== undefined) policy.perKmRate = Number(perKmRate);
    if (equipmentTransitFee !== undefined) policy.equipmentTransitFee = Number(equipmentTransitFee);
    if (tollAndParkingIncluded !== undefined) policy.tollAndParkingIncluded = Boolean(tollAndParkingIncluded);
    if (outstationDailyAllowance !== undefined) policy.outstationDailyAllowance = Number(outstationDailyAllowance);

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

    const resource = await VendorResource.create({
      vendor: req.vendorId,
      type,
      name,
      identifier: identifier || '',
      capacityUnits: capacityUnits || 1,
      status: status || 'AVAILABLE',
      notes: notes || '',
    });

    res.status(201).json({ ok: true, resource });
  } catch (err) {
    next(err);
  }
});

// ── Vendor Availability & Calendar Management ──────────────────────────────
router.get('/availability/blockouts', async (req, res, next) => {
  try {
    const blockouts = await VendorBlockout.find({ vendor: req.vendorId }).sort({ date: 1 });
    res.json({ ok: true, blockouts });
  } catch (err) {
    next(err);
  }
});

router.post('/availability/blockouts', async (req, res, next) => {
  try {
    const { date, startTime, endTime, allDay, reason } = req.body || {};
    if (!date) {
      return res.status(400).json({ error: 'DATE_REQUIRED' });
    }

    const blockout = await VendorBlockout.create({
      vendor: req.vendorId,
      date,
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
      allDay: allDay !== false,
      reason: reason || 'Unavailable',
    });

    res.status(201).json({ ok: true, blockout });
  } catch (err) {
    next(err);
  }
});

router.delete('/availability/blockouts/:id', async (req, res, next) => {
  try {
    const deleted = await VendorBlockout.findOneAndDelete({ _id: req.params.id, vendor: req.vendorId });
    if (!deleted) {
      return res.status(404).json({ error: 'BLOCKOUT_NOT_FOUND' });
    }
    res.json({ ok: true, deleted: true });
  } catch (err) {
    next(err);
  }
});

router.get('/availability/bookings', async (req, res, next) => {
  try {
    const bookings = await VendorBookingSlot.find({ vendor: req.vendorId }).sort({ date: 1 });
    res.json({ ok: true, bookings });
  } catch (err) {
    next(err);
  }
});

router.post('/availability/bookings', async (req, res, next) => {
  try {
    const { vendorServiceId, date, startTime, endTime, serviceLocation, assignedResources } = req.body || {};
    if (!date || !vendorServiceId) {
      return res.status(400).json({ error: 'DATE_AND_SERVICE_REQUIRED' });
    }

    const slot = await VendorBookingSlot.create({
      vendor: req.vendorId,
      vendorService: vendorServiceId,
      date,
      startTime: startTime || '09:00',
      endTime: endTime || '18:00',
      serviceLocation: serviceLocation || {},
      assignedResources: assignedResources || [],
      status: 'CONFIRMED',
    });

    res.status(201).json({ ok: true, slot });
  } catch (err) {
    next(err);
  }
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
      { isRead: true },
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
    await Notification.updateMany({ vendor: req.vendorId, isRead: false }, { isRead: true });
    res.json({ ok: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

router.get('/badge-counts', async (req, res, next) => {
  try {
    const [enquiriesCount, quotesCount, bookingsCount, unreadNotificationsCount] = await Promise.all([
      Opportunity.countDocuments({ vendor: req.vendorId, status: 'NEW' }),
      Quote.countDocuments({ vendor: req.vendorId, status: { $in: ['DRAFT', 'SUBMITTED'] } }),
      CoreBooking.countDocuments({ vendorId: req.vendorId, bookingStatus: 'CONFIRMED' }),
      Notification.countDocuments({ vendor: req.vendorId, isRead: false }),
    ]);

    res.json({
      ok: true,
      enquiriesCount,
      quotesCount,
      bookingsCount,
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

    res.json({
      ok: true,
      reviews,
      stats: {
        averageRating,
        totalReviews,
        recommendPercentage,
        distribution,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews', async (req, res, next) => {
  try {
    const {
      customerName,
      customerEmail,
      bookingReference,
      serviceName,
      eventType,
      eventDate,
      rating,
      reviewText,
      wouldRecommend,
    } = req.body || {};

    if (!customerName || !rating || !reviewText) {
      return res.status(400).json({ error: 'MISSING_REQUIRED_REVIEW_FIELDS' });
    }

    const review = await VendorReview.create({
      vendor: req.vendorId,
      customerName: customerName.trim(),
      customerEmail: (customerEmail || '').trim(),
      bookingReference: (bookingReference || '').trim(),
      serviceName: (serviceName || 'Photography & Production').trim(),
      eventType: (eventType || 'Wedding').trim(),
      eventDate: eventDate || new Date().toISOString().slice(0, 10),
      rating: Number(rating),
      reviewText: reviewText.trim(),
      wouldRecommend: wouldRecommend !== false,
      isVerified: true,
      status: 'PUBLISHED',
    });

    // Keep VendorOrganization rating in sync
    const allReviews = await VendorReview.find({ vendor: req.vendorId, status: 'PUBLISHED' });
    const count = allReviews.length;
    const avg = count > 0 ? allReviews.reduce((acc, r) => acc + r.rating, 0) / count : 0;
    await VendorOrganization.findByIdAndUpdate(req.vendorId, {
      'rating.average': Number(avg.toFixed(1)),
      'rating.count': count,
    });

    res.status(201).json({ ok: true, review });
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

    const review = await VendorReview.findOne({ _id: req.params.id, vendor: req.vendorId });
    if (!review) {
      return res.status(404).json({ error: 'REVIEW_NOT_FOUND' });
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

export default router;
