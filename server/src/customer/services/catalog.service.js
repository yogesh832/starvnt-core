import * as catalogRepo from '../repositories/catalog.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import { normalizeCategory, categoryLabel } from './planCatalog.js';
import { badRequest, notFound } from '../utils/http.js';

/**
 * Discovery (Blueprint §7). Options come from two honest sources:
 *  - real vendors: ACTIVE services of commercially active Vendor OS vendors;
 *  - demo listings (development only, always labelled isDemo).
 * Nothing is invented: no ratings without reviews, no assumed availability.
 */

export const demoListingsEnabled = () => process.env.NODE_ENV !== 'production';

const vsId = (id) => `vs_${id}`;
const demoId = (ref) => `demo_${ref}`;

/**
 * Listed total for a real service, or null when it can't be known honestly.
 * FIXED → base price. PER_PERSON → base × guests (needs a guest count).
 * Hourly / tiered / custom pricing has no single total.
 */
export function listedTotal(pricing, guestCount) {
  if (!pricing || !Number.isFinite(pricing.basePrice)) return null;
  if (pricing.pricingType === 'FIXED') return pricing.basePrice;
  if (pricing.pricingType === 'PER_PERSON') return guestCount ? pricing.basePrice * guestCount : null;
  return null;
}

function fromVendor({ service, vendor }, { guestCount } = {}) {
  const reviewCount = vendor?.rating?.count || 0;
  const price = listedTotal(service.pricing, guestCount);
  return {
    id: vsId(service._id),
    source: 'vendor',
    category: normalizeCategory(service.category),
    packageName: service.name,
    description: service.description || '',
    vendorId: String(vendor._id),
    vendorName: vendor.businessName,
    vendorLocation: vendor.location || '',
    vendorBio: vendor.bio || '',
    price,
    costBreakdown: price == null ? null : { base: price, travel: null, additional: null },
    pricingType: service.pricing?.pricingType || null,
    basePrice: service.pricing?.basePrice ?? null,
    unit: service.pricing?.unit || null,
    mayApply: (service.pricing?.conditionalCharges || []).map((c) => ({ name: c.name, amount: c.amount, condition: c.condition || '' })),
    includes: service.deliverables || [],
    images: vendor.profilePicUrl ? [vendor.profilePicUrl] : [],
    rating: reviewCount > 0 ? vendor.rating.average : null,
    reviewCount,
    cancellationPolicy: service.cancellationPolicy || null,
    isDemo: false,
  };
}

function fromDemo(l) {
  return {
    id: demoId(l.externalRef),
    source: 'demo',
    category: l.category,
    packageName: l.packageName,
    description: l.description,
    vendorId: null,
    vendorName: l.vendorName,
    vendorLocation: '',
    vendorBio: '',
    price: l.price,
    costBreakdown: { base: l.costBreakdown?.base ?? l.price, travel: l.costBreakdown?.travel ?? 0, additional: l.costBreakdown?.additional ?? 0 },
    pricingType: 'FIXED',
    basePrice: l.costBreakdown?.base ?? l.price,
    unit: 'event',
    mayApply: [],
    includes: l.includes || [],
    images: [],
    rating: null,
    reviewCount: 0,
    cancellationPolicy: null,
    isDemo: true,
  };
}

/** All options for an event's city (real) plus demo listings in development. */
async function allOptions(event) {
  const [real, demo] = await Promise.all([
    catalogRepo.listBookableServices({ city: event?.city || null }),
    demoListingsEnabled() ? catalogRepo.listDemoListings() : [],
  ]);
  return [...real.map((r) => fromVendor(r, event || {})), ...demo.map(fromDemo)].filter((o) => o.category);
}

/**
 * Honest availability for the event date:
 * no_event_date | blocked | booked | unconfirmed. Never assumed "available".
 */
async function withAvailability(options, event) {
  if (!event?.eventDate) return options.map((o) => ({ ...o, availability: 'no_event_date' }));
  const vendorIds = [...new Set(options.filter((o) => o.vendorId).map((o) => o.vendorId))];
  const [{ blocked, booked }, ours] = await Promise.all([
    catalogRepo.vendorCommitments(vendorIds, event.eventDate),
    commerceRepo.bookedOptionDates(options.map((o) => o.id), event.eventDate),
  ]);
  // Booked through STARVNT by another event on this date.
  const bookedByOthers = new Set(ours.filter((r) => String(r.event) !== String(event._id)).map((r) => r.optionId));
  return options.map((o) => {
    let availability = 'unconfirmed';
    if (o.vendorId && blocked.has(o.vendorId)) availability = 'blocked';
    else if ((o.vendorId && booked.has(o.vendorId)) || bookedByOthers.has(o.id)) availability = 'booked';
    return { ...o, availability };
  });
}

export const isBookable = (o) => o.availability !== 'blocked' && o.availability !== 'booked';

/** Lowest validated total among bookable options. */
function bestValueId(options) {
  let best = null;
  for (const o of options) {
    if (!isBookable(o) || o.price == null) continue;
    if (!best || o.price < best.price) best = o;
  }
  return best?.id || null;
}

/** category → { optionCount, lowestPrice, lowestIsDemo } for summaries. */
export async function optionStats(event) {
  const options = await allOptions(event);
  const stats = new Map();
  for (const o of options) {
    const s = stats.get(o.category) || { optionCount: 0, lowestPrice: null, lowestIsDemo: false };
    s.optionCount += 1;
    if (o.price != null && (s.lowestPrice == null || o.price < s.lowestPrice)) {
      s.lowestPrice = o.price;
      s.lowestIsDemo = o.isDemo;
    }
    stats.set(o.category, s);
  }
  return stats;
}

export async function optionsForCategory(event, categoryParam) {
  const category = normalizeCategory(categoryParam);
  if (!category) throw badRequest('UNKNOWN_CATEGORY', 'Unknown service');
  const options = await withAvailability((await allOptions(event)).filter((o) => o.category === category), event);
  // Recommended order: bookable first, then price (unknown prices last).
  options.sort((a, b) => Number(isBookable(b)) - Number(isBookable(a)) || (a.price ?? Infinity) - (b.price ?? Infinity));
  return { category, label: categoryLabel(category), bestValueId: bestValueId(options), options };
}

export async function getOption(event, optionId) {
  let option = null;
  if (typeof optionId === 'string' && optionId.startsWith('vs_')) {
    const row = await catalogRepo.findBookableService(optionId.slice(3));
    // Real options are only offered in the event's city.
    if (row && (!event?.city || (row.vendor.location || '').toLowerCase().includes(event.city.toLowerCase()))) {
      option = fromVendor(row, event || {});
    }
  } else if (typeof optionId === 'string' && optionId.startsWith('demo_') && demoListingsEnabled()) {
    const l = await catalogRepo.findDemoListing(optionId.slice(5));
    if (l) option = fromDemo(l);
  }
  if (!option || !option.category) throw notFound('Option not found');
  const [withAvail] = await withAvailability([option], event);
  return withAvail;
}

export async function compareOptions(event, ids) {
  const list = [...new Set(String(ids || '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (list.length < 2 || list.length > 4) throw badRequest('COMPARE_COUNT', 'Choose 2 to 4 options to compare');
  const options = await Promise.all(list.map((id) => getOption(event, id)));
  if (new Set(options.map((o) => o.category)).size > 1) throw badRequest('COMPARE_CATEGORY', 'Compare options from the same service');
  const best = bestValueId(options);
  const bestPrice = options.find((o) => o.id === best)?.price ?? null;
  return {
    category: options[0].category,
    label: categoryLabel(options[0].category),
    bestValueId: best,
    options: options.map((o) => ({
      ...o,
      summary: !isBookable(o)
        ? 'Not available'
        : o.id === best
          ? 'Best value'
          : o.price != null && bestPrice != null
            ? `+₹${(o.price - bestPrice).toLocaleString('en-IN')} vs best value`
            : 'No price listed',
    })),
  };
}

/** Compact options for Aura+'s prompt: only categories still needed, 3 cheapest each. */
export async function compactOptionsFor(event, categories) {
  if (!categories.length) return [];
  const options = await withAvailability((await allOptions(event)).filter((o) => categories.includes(o.category)), event);
  const out = [];
  for (const c of categories) {
    options
      .filter((o) => o.category === c)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
      .slice(0, 3)
      .forEach((o) =>
        out.push({
          service: categoryLabel(c),
          // The label travels with the name so the model can't drop it.
          vendor: o.isDemo ? `${o.vendorName} (demo listing)` : o.vendorName,
          package: o.packageName,
          price: o.price,
          availability: o.availability,
          isDemo: o.isDemo,
          rating: o.rating,
        })
      );
  }
  return out;
}
