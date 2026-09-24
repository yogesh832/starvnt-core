import { categoriesMentioned } from '../services/planCatalog.js';
import { isValidISODate, toISO, todayISO } from '../services/dates.js';

/**
 * Deterministic fallback parser. Live Gemini often returns only eventType +
 * guestCount; this fills ONLY blank fields, and only from patterns literally
 * present in the message. It never overrides a model value.
 */

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const MONTH_WORDS = new Set(Object.keys(MONTHS));

function resolveDate(day, month, year, today) {
  if (year) {
    const iso = toISO(year, month, day);
    return isValidISODate(iso) ? { date: iso, yearStated: true } : null;
  }
  const thisYear = Number(today.slice(0, 4));
  for (const y of [thisYear, thisYear + 1]) {
    const iso = toISO(y, month, day);
    if (!isValidISODate(iso)) continue;
    if (iso >= today) return { date: iso, yearStated: false };
  }
  return null;
}

export function parseDate(text, today = todayISO()) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso && isValidISODate(iso[0])) return { date: iso[0], yearStated: true };

  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b\\.?(?:,?\\s+(20\\d{2}))?`, 'i').exec(text);
  if (dm) return resolveDate(Number(dm[1]), MONTHS[dm[2].toLowerCase()], dm[3] ? Number(dm[3]) : null, today);

  const md = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`, 'i').exec(text);
  if (md) return resolveDate(Number(md[2]), MONTHS[md[1].toLowerCase()], md[3] ? Number(md[3]) : null, today);
  return null;
}

export function parseGuests(text) {
  const m = text.match(/\b(\d[\d,]*)\s*\+?\s*(guests?|people|persons?|log|logo|pax|members|mehmaan|mehman)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isInteger(n) && n > 0 && n <= 100000 ? n : null;
}

const UNIT = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, k: 1e3, thousand: 1e3, hazaar: 1e3, hazar: 1e3, hajar: 1e3 };
const UNIT_RE = 'lakhs?|lacs?|crores?|cr|k|thousand|hazaar|hazar|hajar|l';
const AMOUNT = `(?:rs\\.?|inr|₹)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_RE})?\\b`;
const RANGE_TAIL = /^\s*(?:-|–|—|to)\s*(?:rs\.?|inr|₹)?\s*\d/i;

function toAmount(num, unit) {
  const n = Number(num.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const v = Math.round(n * (unit ? UNIT[unit.toLowerCase()] : 1));
  return v > 0 && v <= 1e10 ? v : null;
}

/** Only amounts tied to the word "budget"; ranges ("₹5–10 Lakh") are ignored. */
export function parseBudget(text) {
  const after = new RegExp(`budget[^\\d₹]{0,25}?${AMOUNT}`, 'i').exec(text);
  if (after) {
    const tail = text.slice(after.index + after[0].length);
    if (!RANGE_TAIL.test(tail)) return toAmount(after[1], after[2]);
    return null;
  }
  const before = new RegExp(`${AMOUNT}\\s*(?:ka\\s+|ki\\s+|of\\s+)?budget`, 'i').exec(text);
  if (before) {
    const head = text.slice(0, before.index);
    if (/\d\s*(?:-|–|—|to)\s*$/i.test(head)) return null;
    return toAmount(before[1], before[2]);
  }
  return null;
}

const CITY_STOPWORDS = new Set(['the', 'my', 'our', 'a', 'an', 'english', 'hindi', 'bengali', 'bangla', 'hinglish', 'morning', 'evening', 'afternoon', 'night', 'budget', 'india']);

/**
 * Capitalised words after "in" ("in Kolkata", "in New Delhi") or, in
 * Hinglish, before "mein/me/mai" ("Kolkata mein"). Months are excluded.
 */
export function parseCity(text) {
  const bad = (w) => MONTH_WORDS.has(w.toLowerCase()) || CITY_STOPWORDS.has(w.toLowerCase());
  const after = /\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/g;
  let m;
  while ((m = after.exec(text))) {
    const [first, second] = m[1].split(/\s+/);
    if (bad(first)) continue;
    return second && !bad(second) ? `${first} ${second}` : first;
  }
  const before = /\b((?:[A-Z][a-zA-Z]+\s+)?[A-Z][a-zA-Z]+)\s+(?:mein|me|mai|main)\b/g;
  while ((m = before.exec(text))) {
    const words = m[1].split(/\s+/).filter((w) => !bad(w));
    if (words.length) return words.join(' ');
  }
  return null;
}

const NEED_RE = /\b(need|needs|needed|want|wants|chahiye|require|required|looking for|help me find|find me)\b/i;
const HEDGE_RE = /\b(might|maybe|may be|perhaps|possibly|shayad|not sure|thinking of|thinking about|considering|probably)\b/i;
const NEGATION_RE = /\b(don't|dont|do not|no need|not need|nahi|nahin|without)\b/i;

/** Categories from sentences that state a need, excluding hedged or negated ones. */
export function parseStatedNeeds(text) {
  const found = new Set();
  for (const sentence of text.split(/[.!?\n;]+/)) {
    if (!NEED_RE.test(sentence) || HEDGE_RE.test(sentence) || NEGATION_RE.test(sentence)) continue;
    for (const c of categoriesMentioned(sentence)) found.add(c);
  }
  return [...found];
}

const blank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Returns a copy of `extracted` with blanks filled from the message, plus `dateYearStated`. */
export function backfillFacts(message, extracted = {}, { today = todayISO() } = {}) {
  const out = { ...extracted };
  const parsedDate = parseDate(message, today);
  if (blank(out.date) && blank(out.newEventDate) && parsedDate) out.date = parsedDate.date;
  if (blank(out.guestCount) && blank(out.newEventGuestCount)) {
    const g = parseGuests(message);
    if (g) out.guestCount = g;
  }
  if (blank(out.budget) && blank(out.newEventBudget)) {
    const b = parseBudget(message);
    if (b) out.budget = b;
  }
  if (blank(out.city) && blank(out.newEventCity)) {
    const c = parseCity(message);
    if (c) out.city = c;
  }
  if (blank(out.neededCategories)) {
    const needs = parseStatedNeeds(message);
    if (needs.length) out.neededCategories = needs;
  }
  return out;
}

/** True when the message itself states a 4-digit year. */
export function messageStatesYear(message) {
  return /\b20\d{2}\b/.test(message || '');
}
