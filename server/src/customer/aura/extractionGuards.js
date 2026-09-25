import { categoriesMentioned, normalizeCategory, normalizeEventType } from '../services/planCatalog.js';
import { isValidISODate } from '../services/dates.js';

/**
 * Structural guards on the model's `extracted` output. The prompt asks the
 * model to extract only what was stated; these guards enforce it, because
 * live Gemini still invents (e.g. "Kisan Palace Gardens" copied from a list).
 */

const PLACEHOLDERS = new Set(['', 'null', 'none', 'unknown', 'n/a', 'na', 'not specified', 'not provided', 'tbd', 'undefined', '-']);

const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

function cleanString(v, max = 80) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (PLACEHOLDERS.has(s.toLowerCase()) || s.length > max) return null;
  return s;
}

function cleanPositiveInt(v, max) {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r > 0 && r <= max ? r : null;
}

/** Every word of `value` must appear in the message. */
function valueStatedIn(value, message) {
  const msg = new Set(tokens(message));
  const words = tokens(value);
  return words.length > 0 && words.every((w) => msg.has(w));
}

/**
 * @param extracted raw model output
 * @param message   the customer's message this turn
 * @param askedTopic the topic Aura asked about last turn, e.g. 'requirement.venue'
 */
export function applyGuards(extracted, message, { askedTopic = null } = {}) {
  const x = extracted && typeof extracted === 'object' ? extracted : {};
  const mentioned = new Set(categoriesMentioned(message));
  const askedCategory = askedTopic?.startsWith('requirement.') ? askedTopic.slice('requirement.'.length) : null;
  const categoryInPlay = (c) => c && (mentioned.has(c) || c === askedCategory);
  const out = {};
  const dropped = [];

  // Event facts (current event)
  const eventType = cleanString(x.eventType);
  if (eventType) out.eventType = normalizeEventType(eventType);
  if (typeof x.date === 'string' && isValidISODate(x.date)) out.date = x.date;
  const g = cleanPositiveInt(x.guestCount, 100000);
  if (g) out.guestCount = g;
  const b = cleanPositiveInt(x.budget, 1e10);
  if (b) out.budget = b;
  const city = cleanString(x.city);
  if (city) {
    if (valueStatedIn(city, message)) out.city = city;
    else dropped.push('city');
  }

  // A different event mentioned for the first time
  const newType = cleanString(x.newEventType);
  if (newType) out.newEventType = normalizeEventType(newType);
  if (typeof x.newEventDate === 'string' && isValidISODate(x.newEventDate)) out.newEventDate = x.newEventDate;
  const ng = cleanPositiveInt(x.newEventGuestCount, 100000);
  if (ng) out.newEventGuestCount = ng;
  const nb = cleanPositiveInt(x.newEventBudget, 1e10);
  if (nb) out.newEventBudget = nb;
  const nc = cleanString(x.newEventCity);
  if (nc) {
    if (valueStatedIn(nc, message)) out.newEventCity = nc;
    else dropped.push('newEventCity');
  }

  // Preferences
  const style = cleanString(x.photographyStyle);
  if (style) out.photographyStyle = style;
  if (Array.isArray(x.cateringCuisine)) {
    const cuisines = x.cateringCuisine.map((c) => cleanString(c, 40)).filter(Boolean);
    if (cuisines.length) out.cateringCuisine = cuisines;
  }
  const theme = cleanString(x.decorTheme);
  if (theme) out.decorTheme = theme;

  // Service statements
  const providedCategory = normalizeCategory(x.providedCategory);
  const providedValue = cleanString(x.providedValue, 200);
  if (providedCategory && providedValue) {
    if (categoryInPlay(providedCategory) && valueStatedIn(providedValue, message)) {
      out.providedCategory = providedCategory;
      out.providedValue = providedValue;
    } else dropped.push('provided');
  }
  const help = normalizeCategory(x.needsHelpCategory);
  if (help) {
    if (categoryInPlay(help)) out.needsHelpCategory = help;
    else dropped.push('needsHelpCategory');
  }
  const tentative = normalizeCategory(x.tentativeCategory);
  if (tentative) {
    if (mentioned.has(tentative)) out.tentativeCategory = tentative;
    else dropped.push('tentativeCategory');
  }
  if (Array.isArray(x.neededCategories)) {
    const needed = [...new Set(x.neededCategories.map(normalizeCategory).filter((c) => c && mentioned.has(c)))];
    if (needed.length) out.neededCategories = needed;
  }

  return { extracted: out, dropped };
}
