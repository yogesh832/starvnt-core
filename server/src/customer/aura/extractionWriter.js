import * as core from './coreClient.js';
import { HttpError } from '../utils/http.js';

/**
 * Persist guarded extraction through Core, using a whitelist.
 * Event facts → patch event; preferences / provided / needs → requirements.
 * Anything Core refuses (locked, closed, invalid) is reported as skipped.
 */
export async function writeExtraction({ customerId, event, extracted, yearStated }) {
  const written = [];
  const skipped = [];
  const eventId = event._id;

  const candidate = {};
  if (extracted.date) candidate.eventDate = extracted.date;
  if (extracted.guestCount) candidate.guestCount = extracted.guestCount;
  if (extracted.budget) candidate.budget = extracted.budget;
  if (extracted.city) candidate.city = extracted.city;

  // Same value → nothing to write. After confirmation Aura+ only fills blanks:
  // a date mentioned in a question ("free on 5 Dec?") must never silently move
  // the event. The customer changes confirmed facts with Edit.
  const facts = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (event[k] === v) continue;
    if (event.status !== 'draft' && event[k] != null) {
      skipped.push({ field: k, reason: 'confirmed_fact' });
      continue;
    }
    facts[k] = v;
  }

  if (Object.keys(facts).length) {
    let factsWritten = [];
    try {
      await core.patchEventFacts(customerId, eventId, facts);
      factsWritten = Object.keys(facts);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      // One bad fact (e.g. a past date) must not block the others.
      const bad = err.extra?.fields || {};
      const good = Object.fromEntries(Object.entries(facts).filter(([k]) => !bad[k]));
      if (Object.keys(bad).length && Object.keys(good).length) {
        try {
          await core.patchEventFacts(customerId, eventId, good);
          factsWritten = Object.keys(good);
        } catch (e2) {
          if (!(e2 instanceof HttpError)) throw e2;
        }
      }
      for (const k of Object.keys(facts)) {
        if (!factsWritten.includes(k)) skipped.push({ field: k, reason: bad[k] ? 'invalid' : err.code });
      }
    }
    written.push(...factsWritten);
    if (factsWritten.includes('eventDate')) {
      await core.setNote(
        eventId,
        'event.date',
        yearStated ? { date: facts.eventDate } : { date: facts.eventDate, note: 'year assumed' },
        yearStated ? 'KNOWN' : 'INFERRED'
      );
    }
  }

  const prefs = [
    ['photography', extracted.photographyStyle && { style: extracted.photographyStyle }],
    ['catering', extracted.cateringCuisine && { cuisine: extracted.cateringCuisine }],
    ['decor', extracted.decorTheme && { theme: extracted.decorTheme }],
  ];
  for (const [category, p] of prefs) {
    if (!p) continue;
    const r = await core.mergePreferences(customerId, eventId, category, p);
    (r.applied ? written : skipped).push(r.applied ? `${category}.preferences` : { field: `${category}.preferences`, reason: r.reason });
  }

  const statements = [];
  if (extracted.providedCategory) statements.push([extracted.providedCategory, { kind: 'provided', value: extracted.providedValue }]);
  if (extracted.needsHelpCategory) statements.push([extracted.needsHelpCategory, { kind: 'needs_help' }]);
  for (const c of extracted.neededCategories || []) {
    if (c !== extracted.providedCategory && c !== extracted.needsHelpCategory) statements.push([c, { kind: 'needed' }]);
  }
  for (const [category, st] of statements) {
    const r = await core.applyServiceStatement(customerId, eventId, category, st);
    if (r.applied) written.push(`requirement.${category}`);
    else if (r.reason !== 'unchanged') skipped.push({ field: `requirement.${category}`, reason: r.reason });
  }

  if (extracted.tentativeCategory) {
    await core.setNote(eventId, `tentative:${extracted.tentativeCategory}`, true, 'INFERRED');
    written.push(`note.tentative:${extracted.tentativeCategory}`);
  }

  return { written, skipped };
}
