import { evaluateVendorActivation } from '../services/vendorActivation.service.js';
import { CATEGORIES } from './vendorContext.js';

/**
 * Profile setup from chat: the only write Vendor Aura+ makes. It saves the
 * vendor's own brand basics (business name, primary category, city) — the same
 * fields and completeness rule as PUT /vendor/profile — and nothing else.
 * Every value must be stated in the vendor's message; the model can't invent one.
 */

const PLACEHOLDERS = new Set(['n/a', 'na', 'none', 'null', 'unknown', 'tbd', 'not sure', 'my business', 'business', 'city']);

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Every word of `value` appears in `message`. */
export function valueStatedIn(value, message) {
  const want = tokens(value);
  if (!want.length) return false;
  const have = new Set(tokens(message));
  return want.every((t) => have.has(t));
}

function clean(value, max) {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v || v.length > max || PLACEHOLDERS.has(v.toLowerCase())) return null;
  return v;
}

// Words a vendor would actually say → canonical category.
const CATEGORY_WORDS = [
  [/\b(cinematic|cinematography|films?|film ?making)\b/i, 'Cinematic Production'],
  [/\b(photo|photos|photography|photographer|photographers)\b/i, 'Photography'],
  [/\b(video|videos|videography|videographer)\b/i, 'Videography'],
  [/\b(decor|decoration|decorations|decorator|styling)\b/i, 'Decor & Styling'],
  [/\b(catering|caterer|caterers|food)\b/i, 'Catering'],
  [/\b(makeup|make-up|make up|mua|bridal makeup)\b/i, 'Makeup & Styling'],
  [/\b(dj|music|band|sound)\b/i, 'DJ & Music'],
  [/\b(venue|banquet|hall|lawn|resort)\b/i, 'Venue'],
  [/\b(planner|planning|event planning|wedding planner)\b/i, 'Event Planning'],
];

/** Canonical category only if the vendor's own message names it. */
export function matchCategory(raw, message) {
  const text = String(message || '');
  const exact = CATEGORIES.find((c) => c.toLowerCase() === String(raw || '').trim().toLowerCase());
  if (exact && valueStatedIn(exact.split(/[&]/)[0], text)) return exact;
  for (const [re, cat] of CATEGORY_WORDS) {
    if (re.test(text) && (!raw || cat === exact || re.test(String(raw)))) return cat;
  }
  return null;
}

/** Validate the model's `profile` against the message; returns only safe fields. */
export function guardProfile(extracted, message) {
  const out = {};
  if (!extracted || typeof extracted !== 'object') return out;
  const name = clean(extracted.businessName, 160);
  if (name && valueStatedIn(name, message)) out.businessName = name;
  const city = clean(extracted.city, 80);
  if (city && valueStatedIn(city, message)) out.location = city;
  if (extracted.category) {
    const cat = matchCategory(extracted.category, message);
    if (cat) out.category = cat;
  }
  return out;
}

const LABELS = { businessName: 'Business name', category: 'Category', location: 'City' };

/** Save guarded fields on the vendor (same completeness rule as PUT /vendor/profile). */
export async function applyProfileFromChat(vendor, extracted, message) {
  const fields = guardProfile(extracted, message);
  const saved = [];
  for (const [k, v] of Object.entries(fields)) {
    if (vendor[k] !== v) {
      vendor[k] = v;
      saved.push({ field: k, label: LABELS[k], value: v });
    }
  }
  if (!saved.length) return { saved, activation: null };

  const hasBrand = Boolean(vendor.businessName && vendor.businessName.trim());
  const hasCat = Boolean(vendor.category && vendor.category.trim());
  const hasLoc = Boolean(vendor.location && vendor.location.trim());
  vendor.isProfileCompleted = Boolean(hasBrand && hasCat && hasLoc);
  await vendor.save();
  const activation = await evaluateVendorActivation(vendor._id);
  return { saved, activation };
}
