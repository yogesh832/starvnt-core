import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';

/**
 * Profile-setup actions Vendor Aura+ can carry out from chat/voice:
 * add a service, team & gear, operating location, coverage area.
 *
 * Flow: the model proposes an action → validate() → the vendor sees a summary
 * and confirms ("yes" / ✓ button) → execute(). Nothing is saved without that
 * confirmation. Defaults mirror the POST routes in vendor.routes.js.
 */

const PRICING_TYPES = ['FIXED', 'HOURLY', 'PER_PERSON', 'TIERED', 'CUSTOM'];
const UNITS = { FIXED: 'event', HOURLY: 'hour', PER_PERSON: 'guest', TIERED: 'event', CUSTOM: 'event' };
const LOCATION_TYPES = ['STUDIO', 'HEAD_OFFICE', 'BRANCH', 'WAREHOUSE', 'KITCHEN', 'EQUIPMENT_HUB', 'STORAGE'];

const str = (v, max) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};
const list = (v, max = 12) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((x) => str(String(x), 60))
    .filter(Boolean)
    .slice(0, max);
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Every amount written in the text: 25000, 25,000, 25k, 25 hazar, 1.5 lakh. */
export function amountsIn(text) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)*)\s*(k|thousand|hazaar|hazar|hajar|lakh|lac|lakhs)?\b/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = m[1].includes('.') && !m[1].includes(',') ? m[1] : m[1].replace(/,/g, '');
    let n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const unit = (m[2] || '').toLowerCase();
    if (['k', 'thousand', 'hazaar', 'hazar', 'hajar'].includes(unit)) n *= 1000;
    if (['lakh', 'lac', 'lakhs'].includes(unit)) n *= 100000;
    out.push(Math.round(n));
  }
  return out;
}

/** Last number in the text followed by one of `words` ("4 log", "30 km"). */
function numberBefore(text, words) {
  const re = new RegExp(`(\\d+)\\s*(?:${words})`, 'gi');
  let m;
  let last = null;
  while ((m = re.exec(String(text || '')))) last = Number(m[1]);
  return last;
}

/** Most recent amount that looks like a price (≥ ₹100) — the model sometimes drops the number. */
function statedPrice(text) {
  const prices = amountsIn(text).filter((n) => n >= 100);
  return prices.length ? prices[prices.length - 1] : null;
}

function normalizePricingType(v) {
  const t = String(v || '').toUpperCase();
  if (t.includes('HOUR')) return 'HOURLY';
  if (t.includes('PERSON') || t.includes('PLATE') || t.includes('GUEST') || t.includes('HEAD')) return 'PER_PERSON';
  if (t.includes('TIER')) return 'TIERED';
  if (t.includes('CUSTOM')) return 'CUSTOM';
  return 'FIXED';
}

/**
 * Turn the model's proposal into a clean action, or { error } explaining what is missing.
 * `said` = the vendor's recent messages (oldest → newest). Prices and counts must appear
 * there; when the model leaves a number out, it is read from what the vendor said.
 */
export function validateAction(raw, { said, vendor, services }) {
  const kind = raw?.kind;
  const stated = new Set(amountsIn(said));

  if (kind === 'service') {
    const s = raw.service || {};
    const name = str(s.name, 120);
    const basePrice = Number(s.basePrice) > 0 ? Number(s.basePrice) : statedPrice(said);
    if (!name) return { error: 'the service name' };
    if (!(basePrice > 0) || !stated.has(Math.round(basePrice))) return { error: 'the base price' };
    const pricingType = PRICING_TYPES.includes(String(s.pricingType).toUpperCase()) ? String(s.pricingType).toUpperCase() : normalizePricingType(s.pricingType || said.split('\n').pop());
    const category = str(s.category, 60) || vendor.category || 'Photography';
    return {
      action: { kind, service: { name, category, pricingType, basePrice: Math.round(basePrice), unit: UNITS[pricingType] } },
    };
  }

  if (kind === 'capability') {
    const c = raw.capability || {};
    const teamSize = Number(c.teamSize) || numberBefore(said, 'log|logon|people|persons?|members?|jan|crew|team|photographers?|staff');
    if (!(teamSize >= 1 && teamSize <= 500) || !stated.has(teamSize)) return { error: 'your team size' };
    const service = pickService(services, c.serviceName);
    if (!service) return { error: 'a service first (add one before team & gear)' };
    return {
      action: {
        kind,
        capability: {
          serviceId: String(service._id),
          serviceName: service.name,
          teamSize,
          equipment: list(c.equipment),
          styles: list(c.styles),
          format: str(c.format, 40) || 'Full day',
        },
      },
    };
  }

  if (kind === 'location') {
    const l = raw.location || {};
    const city = str(l.city, 80) || str(vendor.location?.split(',').pop(), 80);
    const locality = str(l.locality, 80);
    const address = str(l.address, 200) || locality;
    if (!address) return { error: 'the studio / office address or area' };
    if (!city) return { error: 'the city' };
    const type = LOCATION_TYPES.includes(String(l.type).toUpperCase()) ? String(l.type).toUpperCase() : 'STUDIO';
    return {
      action: {
        kind,
        location: { label: str(l.label, 80) || `${vendor.businessName || 'Main'} ${type === 'STUDIO' ? 'Studio' : 'Office'}`, type, address, locality: locality || '', city, state: str(l.state, 60) || '', postalCode: str(l.postalCode, 12) || '' },
      },
    };
  }

  if (kind === 'coverage') {
    const c = raw.coverage || {};
    const radiusKm = Number(c.radiusKm) || numberBefore(said, 'km|kms|kilometers?|kilometres?');
    if (!(radiusKm >= 1 && radiusKm <= 2000) || !stated.has(Math.round(radiusKm))) return { error: 'how far you travel (in km)' };
    const service = pickService(services, c.serviceName);
    if (!service) return { error: 'a service first (add one before coverage)' };
    const city = str(c.city, 80) || str(vendor.location?.split(',').pop(), 80) || '';
    return {
      action: {
        kind,
        coverage: { serviceId: String(service._id), serviceName: service.name, radiusKm: Math.round(radiusKm), city, localities: list(c.localities), outstationAllowed: c.outstationAllowed === true },
      },
    };
  }

  return { error: null };
}

function pickService(services, name) {
  const active = services.filter((s) => s.status !== 'ARCHIVED');
  if (!active.length) return null;
  const n = String(name || '').toLowerCase().trim();
  return (n && active.find((s) => s.name.toLowerCase().includes(n))) || active[0];
}

/** One-line summary the vendor confirms. */
export function describeAction(a) {
  if (a.kind === 'service') {
    const s = a.service;
    return `Add service “${s.name}” (${s.category}) — ${inr(s.basePrice)}${s.pricingType === 'FIXED' ? ' per event' : ` per ${s.unit}`}`;
  }
  if (a.kind === 'capability') {
    const c = a.capability;
    return `Team & gear for “${c.serviceName}” — team of ${c.teamSize}${c.equipment.length ? `, equipment: ${c.equipment.join(', ')}` : ''}${c.styles.length ? `, styles: ${c.styles.join(', ')}` : ''}`;
  }
  if (a.kind === 'location') {
    const l = a.location;
    return `Add ${l.type.toLowerCase().replace('_', ' ')} location “${l.label}” — ${[l.address, l.locality !== l.address ? l.locality : '', l.city].filter(Boolean).join(', ')}`;
  }
  if (a.kind === 'coverage') {
    const c = a.coverage;
    return `Coverage for “${c.serviceName}” — up to ${c.radiusKm} km${c.city ? ` around ${c.city}` : ''}${c.outstationAllowed ? ', outstation allowed' : ''}`;
  }
  return 'Unknown action';
}

/** Carry out a confirmed action for this vendor (same defaults as the vendor routes). */
export async function executeAction(vendor, a) {
  const vendorId = vendor._id;

  if (a.kind === 'service') {
    const s = a.service;
    await VendorService.create({
      vendor: vendorId,
      name: s.name,
      category: s.category,
      pricing: { pricingType: s.pricingType, basePrice: s.basePrice, unit: s.unit, taxIncluded: true, conditionalCharges: [] },
      leadTimeDays: 7,
      cancellationPolicy: 'Standard 48-hour',
      deliverables: [],
      status: 'ACTIVE',
    });
  } else if (a.kind === 'capability') {
    const c = a.capability;
    const service = await VendorService.findOne({ _id: c.serviceId, vendor: vendorId });
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    const existing = await VendorCapability.findOne({ vendor: vendorId, vendorService: service._id });
    if (existing) {
      existing.teamSize = c.teamSize;
      if (c.equipment.length) existing.equipment = c.equipment;
      if (c.styles.length) existing.styles = c.styles;
      existing.format = c.format;
      await existing.save();
    } else {
      await VendorCapability.create({ vendor: vendorId, vendorService: service._id, styles: c.styles, format: c.format, teamSize: c.teamSize, simultaneousEventLimit: 1, equipment: c.equipment, categoryAttributes: {} });
    }
  } else if (a.kind === 'location') {
    const l = a.location;
    const isPrimary = (await OperatingLocation.countDocuments({ vendor: vendorId })) === 0;
    const loc = await OperatingLocation.create({ vendor: vendorId, ...l, state: l.state || 'West Bengal', coordinates: { lat: 0, lng: 0 }, isPrimary });
    if (isPrimary || !vendor.location) {
      vendor.location = `${loc.locality ? `${loc.locality}, ` : ''}${loc.city}`;
      if (vendor.businessName && vendor.category) vendor.isProfileCompleted = true;
      await vendor.save();
    }
  } else if (a.kind === 'coverage') {
    const c = a.coverage;
    const service = await VendorService.findOne({ _id: c.serviceId, vendor: vendorId });
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    const existing = await ServiceCoverage.findOne({ vendor: vendorId, vendorService: service._id });
    if (existing) {
      existing.coverageType = 'RADIUS';
      existing.radiusKm = c.radiusKm;
      if (c.city) existing.city = c.city;
      if (c.localities.length) existing.localities = c.localities;
      existing.outstationAllowed = c.outstationAllowed;
      await existing.save();
    } else {
      await ServiceCoverage.create({ vendor: vendorId, vendorService: service._id, coverageType: 'RADIUS', localities: c.localities, city: c.city, state: '', radiusKm: c.radiusKm, confidence: 'SELF_DECLARED', outstationAllowed: c.outstationAllowed });
    }
  } else {
    throw new Error('UNKNOWN_ACTION');
  }

  return evaluateVendorActivation(vendorId);
}

// No \b here: it doesn't work for Devanagari/Bengali.
const YES_START = /^\s*(yes|yeah|yep|ok|okay|sure|confirm|save|haan|haa|ha|han|ji|theek|thik|kar do|kardo|done|go ahead|হ্যাঁ|হাঁ|হ্যা|ঠিক|हाँ|हां|ठीक|जी)(?=[\s!.,]|$)/i;
const NO_START = /^\s*(no|nope|cancel|stop|nahi|nahin|na|mat|rehne do|না|नहीं|नही|मत)(?=[\s!.,]|$)/i;
const HAS_NUMBER = /\d/;

/**
 * Did the vendor answer the pending confirmation? true / false / null (something else).
 * A short reply starting with yes/haan counts as yes ("haan save karo", "yes please");
 * anything with a number or longer is treated as a change, not a confirmation.
 */
export function readConfirmation(message) {
  const text = String(message || '').trim();
  const short = text.split(/\s+/).length <= 5 && !HAS_NUMBER.test(text);
  if (NO_START.test(text) && text.split(/\s+/).length <= 6) return false;
  if (YES_START.test(text) && short) return true;
  return null;
}
