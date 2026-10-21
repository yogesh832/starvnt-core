import { categoriesMentioned, normalizeEventType } from '../services/planCatalog.js';
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

/** A stated budget range: "budget is 10 to 15 lakh", "10-15 lakh budget". */
export function parseBudgetRange(text) {
  const RANGE = `(?:rs\\.?|inr|₹)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_RE})?\\s*(?:-|–|—|to|se)\\s*(?:rs\\.?|inr|₹)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_RE})?\\b`;
  const m =
    new RegExp(`budget[^\\d₹]{0,25}?${RANGE}`, 'i').exec(text) ||
    new RegExp(`${RANGE}\\s*(?:ka\\s+|ki\\s+|of\\s+)?budget`, 'i').exec(text);
  if (!m) return null;
  const unit = m[4] || m[2];
  const lo = toAmount(m[1], m[2] || unit);
  const hi = toAmount(m[3], unit);
  return lo && hi && lo < hi ? { min: lo, max: hi } : null;
}

// Capitalised name words (case-sensitive on purpose; stops at punctuation).
const CAP_WORDS = "([A-Z][\\w'&-]*(?:\\s+(?:[A-Z][\\w'&-]*|of|the|and|&)){0,4})";

/** "venue is Kisan Palace", "It is at Kisan Palace". Not when another service is the subject. */
export function parseVenue(text) {
  const explicit = new RegExp(`\\b[Vv]enue\\s+(?:is|will be|hai|:)\\s+(?:actually\\s+)?(?:at\\s+)?${CAP_WORDS}`).exec(text);
  if (explicit) return explicit[1].trim();
  const sentence = text.split(/[.!?\n]/)[0] || '';
  const others = categoriesMentioned(sentence).filter((c) => c !== 'venue');
  if (others.length) return null;
  const at = new RegExp(`\\b(?:at|venue)\\s+${CAP_WORDS}`).exec(sentence);
  if (!at) return null;
  const words = at[1].split(/\s+/);
  if (MONTH_WORDS.has(words[0].toLowerCase())) return null;
  return at[1].replace(/[,.]+$/, '').trim();
}

/** "Makeup will be at my hotel", "guests picked up from Salt Lake and taken to the venue". */
export function parseServiceLocations(text) {
  const found = [];
  for (const sentence of text.split(/[.!?\n]+/)) {
    const cats = categoriesMentioned(sentence).filter((c) => c !== 'venue');
    const pickup = /\bpick(?:ed)?[\s-]?up\s+from\s+([^,.;]+?)(?=\s+(?:and|to|then|&)\b|[,.;]|$)/i.exec(sentence);
    const drop = /\b(?:taken|dropped|drop(?:ped)? off|go(?:ing)?)\s+to\s+([^,.;]+?)(?=[,.;]|$)/i.exec(sentence);
    if (pickup || (drop && /\b(guests|cab|transport|shuttle|car)\b/i.test(sentence))) {
      const d = drop?.[1]?.trim() || null;
      const dropIsEventLocation = Boolean(d && /\b(venue|event location)\b/i.test(d));
      found.push({ category: 'transport', mode: 'custom', pickup: pickup?.[1]?.trim() || null, drop: dropIsEventLocation ? null : d, dropIsEventLocation });
      continue;
    }
    if (!cats.length) continue;
    // The service is the subject BEFORE the verb ("Makeup will be at my hotel": makeup, not accommodation).
    const m = /^(.*?)\b(?:will be|is|hoga|hogi|happens?)\s+(?:at|in)\s+([^,.;]+)$/i.exec(sentence.trim());
    if (!m) continue;
    const subject = categoriesMentioned(m[1]).filter((c) => c !== 'venue');
    if (subject.length !== 1) continue;
    const place = m[2].trim();
    if (/^(the\s+)?(venue|event location)$/i.test(place)) found.push({ category: subject[0], mode: 'event' });
    else found.push({ category: subject[0], mode: 'custom', place });
  }
  return found;
}

/**
 * A short reply to the question Aura just asked ("Kolkata.", "New Town",
 * "Kisan Palace") is an answer to that question. Nothing else is inferred.
 */
export function parseShortAnswer(text, askedTopic) {
  if (!['event.city', 'event.area', 'requirement.venue'].includes(askedTopic)) return null;
  const t = text.trim().replace(/[.!]+$/, '');
  if (!t || t.includes('?') || /\d/.test(t) || t.split(/\s+/).length > 5) return null;
  if (/^(yes|no|haan|nahi|ok|okay|skip|not sure|help)/i.test(t)) return null;
  if (/\b(?:roman|hindi|english|hinglish|bengali|bangla|urdu)\b/i.test(t) && /\b(?:mein|me|in|reply|speak|bolo|baat|answer)\b/i.test(t)) return null;
  const cleaned = t.replace(/^(it(?:'s| is)?|in|at|the venue is|venue is|area is)\s+/i, '').replace(/^(in|at)\s+/i, '').trim();
  return cleaned || null;
}

const CITY_STOPWORDS = new Set(['the', 'my', 'our', 'a', 'an', 'roman', 'english', 'hindi', 'bengali', 'bangla', 'hinglish', 'urdu', 'morning', 'evening', 'afternoon', 'night', 'budget', 'india']);

/**
 * Capitalised words after "in" ("in Kolkata", "in New Delhi") or, in
 * Hinglish, before "mein/me/mai" ("Kolkata mein"). Months are excluded.
 */
export function parseCity(text) {
  const bad = (w) => MONTH_WORDS.has(w.toLowerCase()) || CITY_STOPWORDS.has(w.toLowerCase());
  // A city followed by a stated Indian state is an address, even without "in".
  // Do not let later language instructions ("Roman Hindi mein") become a place.
  const stateAddress = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)[,\s]+(?:Uttarakhand|Uttar Pradesh|Himachal Pradesh|Madhya Pradesh|Andhra Pradesh|Arunachal Pradesh|West Bengal|Tamil Nadu|Maharashtra|Karnataka|Kerala|Gujarat|Rajasthan|Punjab|Haryana|Bihar|Jharkhand|Odisha|Assam|Goa|Telangana|Chhattisgarh|Sikkim|Meghalaya|Manipur|Mizoram|Nagaland|Tripura)\b/.exec(text);
  if (stateAddress && stateAddress[1].split(/\s+/).every(word => !bad(word))) return stateAddress[1];
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
  for (const sentence of text.split(/[.!?\n;,]+|\b(?:bas|but|lekin)\b/i)) {
    if (!NEED_RE.test(sentence) || HEDGE_RE.test(sentence) || NEGATION_RE.test(sentence)) continue;
    for (const c of categoriesMentioned(sentence)) found.add(c);
  }
  return [...found];
}

/** Multiple services explicitly handled by the customer, never guessed from a vendor result. */
export function parseProvidedCategories(text) {
  const found = new Set();
  const provided = /\b(?:already (?:have|arranged|booked)|(?:hum|ham|main|we)\s+(?:khud\s+)?(?:kar|kr|sambhal|handle|will handle|will do)|(?:maine|hamne|humne)\s+(?:khud\s+)?(?:arrange|book|kar|kr)|(?:arranged|sorted)\s*(?:hai|hain))\b/i;
  for (const sentence of text.split(/[.!\n;]+|\b(?:bas|but|lekin)\b/i)) {
    const clauses = sentence.split(',');
    const safe = clause => !clause.includes('?') && !HEDGE_RE.test(clause) && !NEGATION_RE.test(clause);
    for (let i=0;i<clauses.length;i++) {
      if (!safe(clauses[i]) || !provided.test(clauses[i])) continue;
      for (const category of categoriesMentioned(clauses[i])) found.add(category);
      // A comma-separated list shares its explicit predicate, but a new need,
      // denial, question or completed statement starts a different clause.
      for (const direction of [-1,1]) for(let j=i+direction;j>=0&&j<clauses.length;j+=direction) {
        const clause=clauses[j], categories=categoriesMentioned(clause);
        if (!safe(clause)||NEED_RE.test(clause)||provided.test(clause)||!categories.length) break;
        for(const category of categories) found.add(category);
      }
    }
  }
  if (/\b(?:ghar|home)\s+(?:par|pe|mein|me)\b/i.test(text) && !/\?/.test(text)) found.add('venue');
  return [...found];
}

/** A stated event type is enough to start a draft when the model cannot extract it. */
export function parseStatedEventType(text, askedTopic) {
  if (askedTopic !== 'event.type' && !/\b(?:mera|mere|meri|hamara|our|my|planning|plan kar|krwana|karwana)\b/i.test(text)) return null;
  const type = normalizeEventType(text);
  return type && type !== 'other' ? type : null;
}

const blank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Returns a copy of `extracted` with blanks filled from the message, plus `dateYearStated`. */
export function backfillFacts(message, extracted = {}, { today = todayISO(), askedTopic = null } = {}) {
  const out = { ...extracted };
  const statedType = parseStatedEventType(message, askedTopic);
  if (blank(out.eventType) && blank(out.newEventType) && statedType) out.eventType = statedType;
  const provided = parseProvidedCategories(message);
  if (provided.length) out.providedCategories = provided;
  if (blank(out.venueName) && provided.includes('venue')) out.venueName = /\b(?:ghar|home)\b/i.exec(message)?.[0];
  const parsedDate = parseDate(message, today);
  if (blank(out.date) && blank(out.newEventDate) && parsedDate) out.date = parsedDate.date;
  if (blank(out.guestCount) && blank(out.newEventGuestCount)) {
    const g = parseGuests(message);
    if (g) out.guestCount = g;
  }
  if (blank(out.budget) && blank(out.budgetMin) && blank(out.newEventBudget)) {
    const range = parseBudgetRange(message);
    if (range) {
      out.budgetMin = range.min;
      out.budgetMax = range.max;
    } else {
      const b = parseBudget(message);
      if (b) out.budget = b;
    }
  }
  const short = parseShortAnswer(message, askedTopic);
  if (blank(out.city) && blank(out.newEventCity)) {
    const c = askedTopic === 'event.city' && short ? short : parseCity(message);
    if (c) out.city = c;
  }
  if (blank(out.area) && askedTopic === 'event.area' && short) out.area = short;
  if (blank(out.venueName)) {
    const v = parseVenue(message) || (askedTopic === 'requirement.venue' && short ? short : null);
    if (v && v !== out.city) out.venueName = v;
  }
  if (blank(out.serviceLocations)) {
    const locs = parseServiceLocations(message);
    if (locs.length) out.serviceLocations = locs;
  }
  if (blank(out.neededCategories)) {
    const needs = parseStatedNeeds(message);
    if (needs.length) out.neededCategories = needs;
  }
  // Preserve the customer's service wording (including timing) for the enquiry.
  // This comes from explicit need clauses, never from a model's invented brief.
  const serviceBriefs = [];
  for (const category of out.neededCategories || []) {
    if (provided.includes(category)) continue;
    const clauses = message.split(/[.!?\n;]+/).filter(clause => NEED_RE.test(clause) && !HEDGE_RE.test(clause) && !NEGATION_RE.test(clause) && categoriesMentioned(clause).includes(category));
    if (clauses.length) serviceBriefs.push({ category, brief: clauses.join('. ').trim().slice(0, 1000) });
  }
  if (serviceBriefs.length) out.serviceBriefs = serviceBriefs;
  return out;
}

/** True when the message itself states a 4-digit year. */
export function messageStatesYear(message) {
  return /\b20\d{2}\b/.test(message || '');
}
