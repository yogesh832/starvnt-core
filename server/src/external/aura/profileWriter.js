import { evaluateVendorActivation } from '../services/vendorActivation.service.js';
import { CATEGORIES } from './vendorContext.js';

/**
 * Business profile from chat: brand name, primary category, city, plus contact
 * phone, website and a short "about" — the same fields and completeness rule as
 * PUT /vendor/profile. Every value must be stated in the vendor's message; the
 * model can't invent one.
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

/** Share of the bio's words that appear in the message (models often trim or reorder a little). */
function overlap(value, message) {
  const want = tokens(value);
  if (!want.length) return 0;
  const have = new Set(tokens(message));
  return want.filter((t) => have.has(t)).length / want.length;
}

/**
 * Validate the model's `profile` against the message; returns only safe fields.
 * `categoryMissing`: the vendor has no category yet, so a category word in their
 * message ("we make cinematic wedding films") is used even if the model left it out.
 */
export function guardProfile(extracted, message, { categoryMissing = false, bioMissing = false } = {}) {
  const out = {};
  if (!extracted || typeof extracted !== 'object') extracted = {};
  const name = clean(extracted.businessName, 160);
  if (name && valueStatedIn(name, message)) out.businessName = name;
  const city = clean(extracted.city, 80);
  if (city && valueStatedIn(city, message)) out.location = city;
  if (extracted.category) {
    const cat = matchCategory(extracted.category, message);
    if (cat) out.category = cat;
  } else if (categoryMissing) {
    const cat = matchCategory('', message);
    if (cat) out.category = cat;
  }
  // Contact phone: the same 10–12 digits must appear in the message (spaces/dashes allowed).
  const digits = String(extracted.phone || '').replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 12 && String(message).replace(/\D/g, '').includes(digits.slice(-10))) {
    out.phone = digits.length === 10 ? `+91 ${digits}` : `+${digits}`;
  }
  // Website / Instagram link written in the message.
  const site = clean(extracted.website, 200);
  if (site && /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(site.replace(/^https?:\/\//i, '')) && String(message).toLowerCase().includes(site.replace(/^https?:\/\//i, '').toLowerCase())) {
    out.website = site;
  }
  // About the business, in the vendor's own words.
  const bio = clean(extracted.bio, 500);
  if (bio && bio.split(/\s+/).length >= 3 && overlap(bio, message) >= 0.8) out.bio = bio;
  else if (bioMissing) {
    const own = bioFrom(message);
    if (own) out.bio = own;
  }
  return out;
}

/**
 * A line where the vendor describes their work ("We make cinematic wedding films
 * across Bengal", "Hum 10 saal se shaadi shoot karte hain") — used when the model
 * leaves the bio out. Skips sentences about phone/website/price.
 */
export function bioFrom(message) {
  const sentence = String(message || '')
    .split(/[.!?\n]+|,\s+(?=(?:we|hum|our|hamari|hamara|i)\b)/i)
    .map((s) => s.trim())
    .find(
      (s) =>
        /^(we|we're|hum|our|hamari|hamara|hamare|i|i'm|main)\b/i.test(s) &&
        s.split(/\s+/).length >= 4 &&
        !/(number|phone|mobile|website|www\.|\.com|\.in|price|charge|rate|₹|rs\.?\s*\d|\d{3,}|km\b)/i.test(s)
    );
  return sentence ? sentence.slice(0, 500) : null;
}

const LABELS = { businessName: 'Business name', category: 'Category', location: 'City', phone: 'Phone', website: 'Website', bio: 'About' };

/** Save guarded fields on the vendor (same completeness rule as PUT /vendor/profile). */
export async function applyProfileFromChat(vendor, extracted, message, { askedAbout = false } = {}) {
  // The bio fallback only applies when Aura+ just asked about their work (so a line
  // like "We use Sony FX3" in a team answer never becomes the bio).
  const fields = guardProfile(extracted, message, { categoryMissing: !vendor.category, bioMissing: askedAbout && !vendor.bio });
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
