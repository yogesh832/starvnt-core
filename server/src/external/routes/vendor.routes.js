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
import { VendorMessageThread } from '../models/VendorMessageThread.js';
import { VendorDocument } from '../models/VendorDocument.js';
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
    const { businessName, category, location, city, phone, website, bio } = req.body || {};
    if (businessName) req.vendor.businessName = businessName.trim();
    if (category) req.vendor.category = category.trim();
    const resolvedLoc = location !== undefined ? location : city;
    if (resolvedLoc !== undefined) req.vendor.location = resolvedLoc.trim();
    if (phone !== undefined) req.vendor.phone = phone.trim();
    if (website !== undefined) req.vendor.website = website.trim();
    if (bio !== undefined) req.vendor.bio = bio;

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
    const locations = await OperatingLocation.find({ vendor: req.vendorId }).sort({ isPrimary: -1, createdAt: -1 });
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

    const existingCount = await OperatingLocation.countDocuments({ vendor: req.vendorId });
    const shouldBePrimary = Boolean(isPrimary || existingCount === 0);

    if (shouldBePrimary) {
      await OperatingLocation.updateMany({ vendor: req.vendorId }, { isPrimary: false });
    }

    const location = await OperatingLocation.create({
      vendor: req.vendorId,
      label: label.trim(),
      type: type || 'STUDIO',
      address: address.trim(),
      locality: locality ? locality.trim() : '',
      city: city.trim(),
      state: state ? state.trim() : 'Maharashtra',
      postalCode: postalCode ? postalCode.trim() : '',
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
    if (label) loc.label = label.trim();
    if (type) loc.type = type;
    if (address) loc.address = address.trim();
    if (locality !== undefined) loc.locality = locality.trim();
    if (city) loc.city = city.trim();
    if (state !== undefined) loc.state = state.trim();
    if (postalCode !== undefined) loc.postalCode = postalCode.trim();
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
        for (const opp of opportunities) {
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
            lastMessageText: `Hi! We sent an enquiry regarding ${opp.serviceName} on ${opp.eventDate}.`,
            lastMessageAt: opp.createdAt || new Date(),
            unreadVendorCount: 1,
            messages: [
              {
                sender: 'SYSTEM',
                senderName: 'STARVNT Core',
                text: `Opportunity matched for ${opp.serviceName} at ${opp.serviceLocation?.locality || opp.serviceLocation?.city || 'Venue'}.`,
                createdAt: opp.createdAt || new Date(),
                isRead: true,
              },
              {
                sender: 'CLIENT',
                senderName: clientName,
                text: `Hi! We sent an enquiry regarding ${opp.serviceName} on ${opp.eventDate}. Could you share your availability and a formal quote?`,
                createdAt: opp.createdAt || new Date(),
                isRead: false,
              },
            ],
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

    res.json({ ok: true, thread });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/threads/:id', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'MESSAGE_TEXT_REQUIRED' });
    }

    const thread = await VendorMessageThread.findOne({
      _id: req.params.id,
      vendor: req.vendorId,
    });

    if (!thread) {
      return res.status(404).json({ error: 'THREAD_NOT_FOUND' });
    }

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
    await thread.save();

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

router.post('/documents', async (req, res, next) => {
  try {
    const { title, type, documentNumber, fileName, fileUrl, fileSize, notes, expiryDate } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'TITLE_REQUIRED' });
    }

    const doc = await VendorDocument.create({
      vendor: req.vendorId,
      title: title.trim(),
      type: type || 'OTHER',
      documentNumber: documentNumber ? documentNumber.trim() : '',
      fileName: fileName ? fileName.trim() : `${title.trim().replace(/\s+/g, '_')}.pdf`,
      fileUrl: fileUrl || '',
      fileSize: fileSize || '1.2 MB',
      status: 'SUBMITTED',
      notes: notes ? notes.trim() : '',
      expiryDate: expiryDate || '',
    });

    res.status(201).json({ ok: true, document: doc });
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
