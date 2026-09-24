import * as auraRepo from '../repositories/aura.repo.js';
import * as core from './coreClient.js';
import { getLlmAdapter } from './llmAdapter.js';
import { buildContext } from './contextBuilder.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { applyGuards } from './extractionGuards.js';
import { backfillFacts, messageStatesYear } from './factBackfill.js';
import { writeExtraction } from './extractionWriter.js';
import { buildUnderstanding, nextQuestion, serializeEvent } from '../services/understanding.js';
import { findBudgetRange, budgetRangesFor, normalizeEventType } from '../services/planCatalog.js';
import { badRequest, forbidden, notFound, HttpError } from '../utils/http.js';

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const SKIP_TOPIC_RE = /^(event|requirement)\.[a-z_]+$/;
const MAX_MESSAGE = 2000;

const FALLBACK_REPLY =
  "Sorry, I'm having trouble thinking right now. I've kept what you told me — please check the card, or try again in a moment.";

async function ownedSession(customerId, sessionId) {
  if (!SESSION_ID_RE.test(sessionId || '')) throw badRequest('INVALID_SESSION', 'Invalid session id');
  const session = await auraRepo.findSession(sessionId);
  if (session && String(session.customer) !== String(customerId)) throw forbidden('This conversation belongs to someone else');
  return session;
}

async function ownedEventOr404(customerId, eventId) {
  const event = await core.getEvent(customerId, eventId).catch(() => null);
  if (!event) throw notFound('Event not found');
  return event;
}

async function stateFor(customerId, eventId) {
  if (!eventId) return { activeEvent: null, understanding: null, nextQuestion: nextQuestion(null, [], []) };
  const event = await core.getEvent(customerId, eventId);
  if (!event) return { activeEvent: null, understanding: null, nextQuestion: nextQuestion(null, [], []) };
  const [requirements, contextRows] = await Promise.all([core.listRequirements(event._id), core.listContext(event._id)]);
  return {
    activeEvent: serializeEvent(event),
    understanding: buildUnderstanding(event, requirements, contextRows),
    nextQuestion: nextQuestion(event, requirements, contextRows),
  };
}

export async function getSession(customer, sessionId, { eventId } = {}) {
  const session = await ownedSession(customer._id, sessionId);
  let scopedEventId = session?.event || null;
  if (!session && eventId) scopedEventId = (await ownedEventOr404(customer._id, eventId))._id;
  const messages = session ? await auraRepo.listMessages(sessionId) : [];
  return {
    sessionId,
    messages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    ...(await stateFor(customer._id, scopedEventId)),
  };
}

function hasNewEventFields(x) {
  return Boolean(x.newEventType || x.newEventDate || x.newEventGuestCount || x.newEventBudget || x.newEventCity);
}

function newEventFacts(x) {
  return {
    eventType: x.newEventType || x.eventType,
    date: x.newEventDate || x.date,
    guestCount: x.newEventGuestCount || x.guestCount,
    budget: x.newEventBudget || x.budget,
    city: x.newEventCity || x.city,
  };
}

/** Move newEvent* values onto the top-level fields (same event re-emitted). */
function salvageOntoCurrent(x) {
  const out = { ...x };
  if (x.newEventDate) out.date ||= x.newEventDate;
  if (x.newEventGuestCount) out.guestCount ||= x.newEventGuestCount;
  if (x.newEventBudget) out.budget ||= x.newEventBudget;
  if (x.newEventCity) out.city ||= x.newEventCity;
  for (const k of ['newEventType', 'newEventDate', 'newEventGuestCount', 'newEventBudget', 'newEventCity']) delete out[k];
  return out;
}

/**
 * While there is no event or it is a draft, Aura+ asks exactly one question:
 * the one computed from what was actually saved this turn (never the model's).
 */
function composeReply(reply, { event, nextQuestion: q, assumedDate }) {
  const parts = [reply.trim()];
  if (assumedDate) {
    parts.push(`I've assumed the year ${assumedDate.slice(0, 4)} for the date — please check it on the card.`);
  }
  const asking = !event || event.status === 'draft';
  if (asking && q?.question && !reply.includes(q.question)) parts.push(q.question);
  return parts.join('\n\n');
}

// The draft starts with its type only; the other facts go through the writer,
// so one invalid fact (e.g. a past date) can't block creating the event.
function createDraftFrom(customerId, facts) {
  return core.createDraftEvent(customerId, { eventType: normalizeEventType(facts.eventType) });
}

/**
 * POST /aura/chat pipeline (Blueprint §5.1).
 */
export async function chat(customer, { sessionId, message, eventId, skipTopic, budgetRange } = {}) {
  const customerId = customer._id;
  const text = typeof message === 'string' ? message.trim().slice(0, MAX_MESSAGE) : '';
  if (!text) throw badRequest('MESSAGE_REQUIRED', 'Please type a message');

  // 1. Session (customer-owned)
  let session = await ownedSession(customerId, sessionId);
  if (!session) {
    session = await auraRepo.createSession(sessionId, customerId, null);
    if (String(session.customer) !== String(customerId)) throw forbidden('This conversation belongs to someone else');
  }

  // 2. Active event: explicit (must be owned) or the session's. No demo fallback.
  let event = null;
  if (eventId) {
    event = await ownedEventOr404(customerId, eventId);
    if (String(session.event || '') !== String(event._id)) await auraRepo.setSessionEvent(sessionId, event._id);
  } else if (session.event) {
    event = await core.getEvent(customerId, session.event);
  }

  // What Aura asked last turn (before this turn's writes) — used by the guards.
  const before = event ? await stateFor(customerId, event._id) : await stateFor(customerId, null);
  const askedTopic = before.nextQuestion?.topic || null;

  // 3. Chips first
  const chipWrites = [];
  if (skipTopic !== undefined && skipTopic !== null) {
    if (typeof skipTopic !== 'string' || !SKIP_TOPIC_RE.test(skipTopic)) throw badRequest('INVALID_SKIP_TOPIC', 'Invalid topic');
    if (!event) throw badRequest('NO_ACTIVE_EVENT', 'Tell me about your event first');
    await core.setNote(event._id, `skip:${skipTopic}`, true, 'KNOWN', 'customer');
    chipWrites.push(`skip:${skipTopic}`);
  }
  if (budgetRange !== undefined && budgetRange !== null) {
    const range = findBudgetRange(String(budgetRange));
    if (!range) throw badRequest('INVALID_BUDGET_RANGE', 'Unknown budget range');
    if (!event) throw badRequest('NO_ACTIVE_EVENT', 'Tell me about your event first');
    if (!budgetRangesFor(event.eventType).some((r) => r.id === range.id)) throw badRequest('INVALID_BUDGET_RANGE', 'That range is not offered for this event');
    await core.patchEventFacts(customerId, event._id, { budgetRange: range.id });
    chipWrites.push('budgetRange');
  }
  if (event && chipWrites.length) event = await core.getEvent(customerId, event._id);

  // 4. Context
  const { prompt: context } = await buildContext({ customer, event });
  const history = await auraRepo.recentMessages(sessionId, 12);

  // 5. LLM
  let reply = '';
  let rawExtracted = {};
  try {
    const out = await getLlmAdapter().chat({ systemPrompt: buildSystemPrompt(context), history, message: text });
    reply = out.text;
    rawExtracted = out.extracted || {};
  } catch (err) {
    console.warn('[aura] LLM unavailable:', err?.message || err);
    reply = FALLBACK_REPLY;
  }

  // 6–7. Guards, then the deterministic fallback parser (blanks only)
  const { extracted: guarded, dropped } = applyGuards(rawExtracted, text, { askedTopic });
  let x = backfillFacts(text, guarded);
  if (chipWrites.includes('budgetRange')) delete x.budget; // the chip is the statement
  if (hasNewEventFields(x)) {
    // These leak from the current event into the new one.
    delete x.photographyStyle;
    delete x.cateringCuisine;
    delete x.decorTheme;
  }
  const yearStated = messageStatesYear(text);

  // 8. Event creation / switching
  let createdEventId = null;
  if (!event) {
    const facts = newEventFacts(x);
    if (facts.eventType) {
      event = await createDraftFrom(customerId, facts);
      createdEventId = event._id;
      x = { ...salvageOntoCurrent({ ...x, ...facts }), eventType: undefined };
    }
  } else {
    const requestedType = x.newEventType || (x.eventType && x.eventType !== event.eventType ? x.eventType : null);
    if (requestedType && requestedType !== event.eventType) {
      // A different event: its own draft ("second event" flow).
      // Facts in the message that introduces the new event belong to it.
      const facts = { ...newEventFacts(x), eventType: requestedType };
      event = await createDraftFrom(customerId, facts);
      createdEventId = event._id;
      x = {
        date: facts.date,
        guestCount: facts.guestCount,
        budget: facts.budget,
        city: facts.city,
        neededCategories: x.neededCategories,
        providedCategory: x.providedCategory,
        providedValue: x.providedValue,
        needsHelpCategory: x.needsHelpCategory,
        tentativeCategory: x.tentativeCategory,
      };
    } else if (hasNewEventFields(x)) {
      x = salvageOntoCurrent(x);
    }
  }
  if (createdEventId) await auraRepo.setSessionEvent(sessionId, createdEventId);

  // 9–10. Persist through Core (whitelist) + year inference note
  let writes = { written: [], skipped: [] };
  if (event) {
    try {
      writes = await writeExtraction({ customerId, event, extracted: x, yearStated });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      writes.skipped.push({ field: '*', reason: err.code });
    }
  }

  // 11. State AFTER this turn's writes; the one next question comes from it
  const after = await stateFor(customerId, event?._id || null);
  reply = composeReply(reply || FALLBACK_REPLY, {
    event: after.activeEvent,
    nextQuestion: after.nextQuestion,
    assumedDate: writes.written.includes('eventDate') && !yearStated ? after.understanding?.facts.date.value : null,
  });
  await auraRepo.addMessages(sessionId, [
    { role: 'user', content: text },
    { role: 'model', content: reply },
  ]);
  return {
    reply,
    extracted: x,
    dropped,
    written: [...chipWrites, ...writes.written],
    skipped: writes.skipped,
    createdEventId: createdEventId ? String(createdEventId) : null,
    ...after,
  };
}
