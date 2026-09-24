/**
 * Event plan templates, category labels and budget ranges (Blueprint §3).
 * Code constants: templates are suggestions (RECOMMENDED), never business state.
 */

export const EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'puja', 'anniversary', 'other'];

export const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate event',
  puja: 'Puja',
  anniversary: 'Anniversary',
  other: 'Event',
};

export const EVENT_PLAN_TEMPLATES = {
  wedding: {
    essential: ['venue', 'catering', 'photography', 'decor', 'makeup', 'sound', 'ceremony'],
    recommended: ['transport', 'accommodation', 'hospitality', 'invitation', 'anchor', 'entertainment'],
    optional: ['photo_booth', 'special_effects', 'live_streaming'],
  },
  birthday: {
    essential: ['venue', 'catering', 'decor', 'cake'],
    recommended: ['photography', 'entertainment', 'anchor', 'sound'],
    optional: ['photo_booth', 'special_effects'],
  },
  corporate: {
    essential: ['venue', 'catering', 'sound'],
    recommended: ['photography', 'anchor', 'accommodation', 'transport'],
    optional: ['live_streaming', 'special_effects'],
  },
  puja: {
    essential: ['venue', 'catering', 'ceremony', 'decor'],
    recommended: ['photography', 'sound'],
    optional: ['live_streaming'],
  },
  other: {
    essential: ['venue', 'catering'],
    recommended: ['photography', 'decor'],
    optional: [],
  },
};

export const CATEGORY_LABELS = {
  venue: 'Venue',
  catering: 'Catering',
  photography: 'Photography',
  decor: 'Decoration',
  makeup: 'Makeup',
  sound: 'Sound',
  ceremony: 'Ceremony / Purohit',
  transport: 'Transport',
  accommodation: 'Accommodation',
  hospitality: 'Hospitality',
  invitation: 'Invitations',
  anchor: 'Anchor / Host',
  entertainment: 'Entertainment',
  photo_booth: 'Photo booth',
  special_effects: 'Special effects',
  live_streaming: 'Live streaming',
  cake: 'Cake',
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS);

// Anything a customer or the model might say, mapped to one category.
const CATEGORY_SYNONYMS = {
  venue: ['venue', 'venues', 'hall', 'banquet', 'banquet hall', 'lawn', 'marriage hall'],
  catering: ['catering', 'caterer', 'caterers', 'food', 'khana'],
  photography: ['photography', 'photographer', 'photographers', 'photo', 'photos', 'videography', 'videographer', 'cinematic production', 'cinematography', 'wedding film'],
  decor: ['decor', 'decoration', 'decorations', 'decorator', 'decorators', 'sajawat'],
  makeup: ['makeup', 'make-up', 'make up', 'makeup artist', 'bridal makeup', 'mua'],
  sound: ['sound', 'sound system', 'audio', 'speakers'],
  ceremony: ['ceremony', 'purohit', 'pandit', 'priest', 'pujari'],
  transport: ['transport', 'transportation', 'cab', 'cabs', 'car', 'cars', 'shuttle', 'bus'],
  accommodation: ['accommodation', 'hotel', 'hotels', 'stay', 'rooms'],
  hospitality: ['hospitality', 'guest management'],
  invitation: ['invitation', 'invitations', 'invite', 'invites', 'invitation cards', 'wedding cards'],
  anchor: ['anchor', 'host', 'emcee', 'mc'],
  entertainment: ['entertainment', 'dj', 'band', 'music', 'magic show', 'magician', 'dancers'],
  photo_booth: ['photo booth', 'photobooth', 'photo_booth'],
  special_effects: ['special effects', 'special_effects', 'fireworks', 'pyro', 'cold pyro'],
  live_streaming: ['live streaming', 'live stream', 'livestream', 'live_streaming'],
  cake: ['cake', 'cakes', 'bakery'],
};

const SYNONYM_LOOKUP = new Map();
for (const [category, words] of Object.entries(CATEGORY_SYNONYMS)) {
  for (const w of words) SYNONYM_LOOKUP.set(w, category);
  SYNONYM_LOOKUP.set(category, category);
}

/** Normalise any category word to a known category, or null (unknown ones are dropped). */
export function normalizeCategory(value) {
  if (!value || typeof value !== 'string') return null;
  const key = value.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return SYNONYM_LOOKUP.get(key) || SYNONYM_LOOKUP.get(key.replace(/ /g, '_')) || null;
}

/** Categories whose name or a synonym literally appears in the text. */
export function categoriesMentioned(text) {
  if (!text) return [];
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9ऀ-෿\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  const found = new Set();
  for (const [word, category] of SYNONYM_LOOKUP) {
    const needle = ` ${word.replace(/_/g, ' ')} `;
    if (lower.includes(needle)) found.add(category);
  }
  return [...found];
}

export function normalizeEventType(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.toLowerCase().trim();
  if (EVENT_TYPES.includes(v)) return v;
  if (/(wedding|marriage|shaadi|shadi|biye|vivah|reception|engagement|sangeet|mehendi)/.test(v)) return 'wedding';
  if (/(birthday|bday|janmdin)/.test(v)) return 'birthday';
  if (/(corporate|office|conference|seminar|offsite|company)/.test(v)) return 'corporate';
  if (/(puja|pooja|havan|griha pravesh|satyanarayan)/.test(v)) return 'puja';
  if (/anniversary/.test(v)) return 'anniversary';
  return 'other';
}

export function templateFor(eventType) {
  return EVENT_PLAN_TEMPLATES[eventType] || EVENT_PLAN_TEMPLATES.other;
}

export function tierOf(eventType, category) {
  const t = templateFor(eventType);
  if (t.essential.includes(category)) return 'essential';
  if (t.recommended.includes(category)) return 'recommended';
  if (t.optional.includes(category)) return 'optional';
  return 'custom';
}

export const categoryLabel = (c) => CATEGORY_LABELS[c] || c;

const LAKH = 100000;

// Fixed list; the only values the budget-range chips may write.
export const BUDGET_RANGES = {
  wedding: [
    { id: 'w_5_10', label: '₹5–10 Lakh', min: 5 * LAKH, max: 10 * LAKH },
    { id: 'w_10_15', label: '₹10–15 Lakh', min: 10 * LAKH, max: 15 * LAKH },
    { id: 'w_15_20', label: '₹15–20 Lakh', min: 15 * LAKH, max: 20 * LAKH },
    { id: 'w_20_plus', label: '₹20 Lakh+', min: 20 * LAKH, max: null },
  ],
  other: [
    { id: 'o_under_50k', label: 'Under ₹50K', min: 0, max: 50000 },
    { id: 'o_50k_1l', label: '₹50K–1 Lakh', min: 50000, max: LAKH },
    { id: 'o_1_3l', label: '₹1–3 Lakh', min: LAKH, max: 3 * LAKH },
    { id: 'o_3l_plus', label: '₹3 Lakh+', min: 3 * LAKH, max: null },
  ],
};

export function budgetRangesFor(eventType) {
  return eventType === 'wedding' ? BUDGET_RANGES.wedding : BUDGET_RANGES.other;
}

export function findBudgetRange(id) {
  return [...BUDGET_RANGES.wedding, ...BUDGET_RANGES.other].find((r) => r.id === id) || null;
}

/** Label for a stored min/max pair, e.g. "₹10–15 Lakh". */
export function budgetRangeLabel(min, max) {
  if (min == null && max == null) return null;
  const match = [...BUDGET_RANGES.wedding, ...BUDGET_RANGES.other].find(
    (r) => r.min === (min ?? 0) && r.max === (max ?? null)
  );
  if (match) return match.label;
  const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
  if (max == null) return `${fmt(min)}+`;
  return `${fmt(min ?? 0)}–${fmt(max)}`;
}
