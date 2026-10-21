import * as auraRepo from '../repositories/aura.repo.js';
import * as core from './coreClient.js';
import { getLlmAdapter } from './llmAdapter.js';
import { buildContext } from './contextBuilder.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { applyGuards } from './extractionGuards.js';
import { backfillFacts, messageStatesYear, parseGuests, parseDate } from './factBackfill.js';
import { writeExtraction } from './extractionWriter.js';
import { buildUnderstanding, nextQuestion, serializeEvent } from '../services/understanding.js';
import { findBudgetRange, budgetRangesFor, normalizeEventType } from '../services/planCatalog.js';
import { badRequest, forbidden, notFound, HttpError } from '../utils/http.js';
import { classifyAuraRequest } from '../../common/auraRouter.js';
import { createPerformanceTracker } from '../../common/streamUtils.js';
import { conversationLanguage, localizeAuraQuestion, auraLanguageInstruction } from '../../common/auraLanguage.js';
import { resolveEventSwitch, eventChoices, switchReply } from './eventSwitch.js';
import { isVendorRequest, isCatalogLookupOnly, selectVendorRows, vendorTruthReply, scopeMatchesEvent } from './vendorTruth.js';
import { rememberCatalog, catalogScopeFor } from './catalogMemory.js';
import { activityAnswer } from '../../common/auraActivityAnswer.js';

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const SKIP_TOPIC_RE = /^(event|requirement|location)\.[a-z_]+$/;
const MAX_MESSAGE = 2000;

const FALLBACK_REPLY =
  "Sorry, I'm having trouble thinking right now. I've kept what you told me — please check the card, or try again in a moment.";
const WEAK_REPLY_RE = /^(pata nahi|i don't know|not sure|main abhi|sorry,? i('| a)m having trouble|sorry,? i can('|no)t|please check the (card|plan))/i;

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

async function refreshCatalog(memory, event) {
  const scope = catalogScopeFor(memory, event);
  if (!scope) return { vendorSuggestions: [], vendorSearch: null };
  const vendorSuggestions = selectVendorRows(await core.vendorCatalog(scope), memory.query);
  return { vendorSuggestions, vendorSearch: { source: 'customer_catalog_api', query: memory.query, city: scope.city || null, date: scope.eventDate || null, guestCount: scope.guestCount || null, resultCount: vendorSuggestions.length, scopeMatchesEvent: scopeMatchesEvent(scope, event), checkedAt: new Date().toISOString() } };
}

export async function getSession(customer, sessionId, { eventId } = {}) {
  const session = await ownedSession(customer._id, sessionId);
  let scopedEventId = session?.event || null;
  if (!session && eventId) scopedEventId = (await ownedEventOr404(customer._id, eventId))._id;
  const messages = session ? await auraRepo.listMessages(sessionId) : [];
  const state = await stateFor(customer._id, scopedEventId);
  const activity = await core.readActivity(customer._id, scopedEventId);
  const language = conversationLanguage('', messages);
  const choices = session?.switchChoices?.length ? eventChoices((await core.listEvents(customer._id)).filter(event => session.switchChoices.map(String).includes(String(event._id)))) : [];
  const lastQuery = [...messages].reverse().find(message => message.role === 'user')?.content || '';
  let memory = session?.catalogSearch || null;
  if (!choices.length && !memory && isVendorRequest(lastQuery)) {
    const city = await core.catalogLocationHint(lastQuery);
    const scope = { ...(state.activeEvent || {}), _id: scopedEventId, ...(city ? { city, location: city.toLowerCase() === state.activeEvent?.city?.toLowerCase() ? state.activeEvent?.location : null } : {}), ...(parseGuests(lastQuery) ? { guestCount: parseGuests(lastQuery) } : {}), ...(parseDate(lastQuery) ? { eventDate: parseDate(lastQuery).date } : {}) };
    memory = rememberCatalog(lastQuery, scope, state.activeEvent);
    if (session) await auraRepo.setCatalogSearch(sessionId, memory);
  }
  const { vendorSuggestions, vendorSearch } = choices.length ? { vendorSuggestions: [], vendorSearch: null } : await refreshCatalog(memory, state.activeEvent);
  return {
    sessionId,
    messages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    ...state,
    nextQuestion: choices.length || isCatalogLookupOnly(lastQuery) || activityAnswer(lastQuery, activity, language) ? null : localizeAuraQuestion(state.nextQuestion, language, state.activeEvent),
    eventChoices: choices,
    vendorSuggestions, vendorSearch, activity,
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
function composeReply(reply, { event, nextQuestion: q, assumedDate, language = 'en' }) {
  const parts = [reply.trim()];
  if (assumedDate) {
    const year = assumedDate.slice(0, 4);
    parts.push(language === 'hi' ? `मैं तारीख के लिए ${year} मान रही हूँ। कृपया कार्ड में तारीख जाँच लें।` : language === 'hinglish' ? `Main tareekh ke liye ${year} maan rahi hoon. Kripya card mein date check kar lein.` : `I've assumed the year ${year} for the date — please check it on the card.`);
  }
  const asking = !event || event.status === 'draft';
  const alreadyAsksQuestion = /[?？]/.test(reply);
  if (asking && q?.question && !alreadyAsksQuestion && !reply.toLowerCase().includes(q.question.toLowerCase())) {
    parts.push(q.question);
  }
  return parts.join('\n\n');
}

function isWeakReply(reply = '') {
  const text = String(reply || '').trim();
  return !text || WEAK_REPLY_RE.test(text) || text.length < 30;
}

function deterministicReply({ activeEvent, extracted = {}, text = '', language = 'en' }) {
  if (language === 'hi') return activeEvent ? 'जो जानकारी मिल सकी, उसे कार्ड पर दिखा रही हूँ। आपकी मंज़ूरी के बिना कोई बुकिंग नहीं होगी।' : 'मैं आपका इवेंट प्लान करने में मदद कर सकती हूँ।';
  if (language === 'hinglish') return activeEvent ? 'Jo jaankari mil saki, use card par dikha rahi hoon. Aapki manzoori ke bina koi booking nahi hogi.' : 'Main aapka event plan karne mein madad kar sakti hoon.';
  return activeEvent ? "I've added the details I could save to your event card. Nothing is booked until you approve it." : 'I can help you plan your event.';
}

// The draft starts with its type only; the other facts go through the writer,
// so one invalid fact (e.g. a past date) can't block creating the event.
function createDraftFrom(customerId, facts) {
  const eventType = normalizeEventType(facts.eventType);
  return core.createDraftEvent(customerId, { eventType, ...(eventType === 'other' && facts.customType ? { customType: facts.customType } : {}) });
}

/**
 * POST /aura/chat pipeline (Blueprint §5.1).
 */
export async function chat(customer, { sessionId, message, eventId, switchEventId, skipTopic, budgetRange, serviceLocation } = {}, options = {}) {
  const tracker = createPerformanceTracker();
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

  if (switchEventId !== undefined && (typeof switchEventId !== 'string' || !/^[a-f\d]{24}$/i.test(switchEventId))) throw badRequest('INVALID_EVENT', 'Invalid event');
  const navigation = resolveEventSwitch(text, await core.listEvents(customerId), { currentId: event?._id, previousId: session.previousEvent, pendingIds: session.switchChoices || [], explicitId: switchEventId });
  if (navigation) {
    if (navigation.kind === 'switch' && !navigation.event) throw notFound('Event not found');
    const history = await auraRepo.recentMessages(sessionId, 12);
    const language = conversationLanguage(switchEventId ? '' : text, history);
    const selected = navigation.event;
    const choices = selected ? [] : eventChoices(navigation.events);
    if (selected) await auraRepo.setSessionEvent(sessionId, selected._id);
    else await auraRepo.setSwitchChoices(sessionId, choices.map(choice => choice.id));
    const state = await stateFor(customerId, selected?._id || event?._id);
    state.nextQuestion = selected ? localizeAuraQuestion(state.nextQuestion, language, state.activeEvent) : null;
    const reply = switchReply(language, selected, choices, navigation.notFound);
    await auraRepo.addMessages(sessionId, [{ role: 'user', content: text }, { role: 'model', content: reply }]);

    console.log('\n' + '═'.repeat(70));
    console.log(`[Aura Customer Chat ⇄ Switch Event]`);
    console.log(`👤 Customer : ${customer.fullName || 'Customer'} (${customer.email || customerId})`);
    console.log(`💬 Session  : ${sessionId}`);
    console.log(`📩 User Msg : "${text}"`);
    console.log(`🤖 Aura Rep : "${reply}"`);
    console.log('═'.repeat(70) + '\n');

    return { reply, ...state, eventChoices: choices, eventSwitched: !!selected, written: [], skipped: [], createdEventId: null };
  }
  if (session.switchChoices?.length) await auraRepo.setSwitchChoices(sessionId, []);

  // What Aura asked last turn (before this turn's writes) — used by the guards.
  const before = event ? await stateFor(customerId, event._id) : await stateFor(customerId, null);
  const askedTopic = before.nextQuestion?.topic || null;

  // 3. Chips first
  const chipWrites = [];
  const readOnlyCatalog = isCatalogLookupOnly(text);
  if (!readOnlyCatalog && skipTopic !== undefined && skipTopic !== null) {
    if (typeof skipTopic !== 'string' || !SKIP_TOPIC_RE.test(skipTopic)) throw badRequest('INVALID_SKIP_TOPIC', 'Invalid topic');
    if (!event) throw badRequest('NO_ACTIVE_EVENT', 'Tell me about your event first');
    await core.setNote(event._id, `skip:${skipTopic}`, true, 'KNOWN', 'customer');
    chipWrites.push(`skip:${skipTopic}`);
  }
  if (!readOnlyCatalog && budgetRange !== undefined && budgetRange !== null) {
    const range = findBudgetRange(String(budgetRange));
    if (!range) throw badRequest('INVALID_BUDGET_RANGE', 'Unknown budget range');
    if (!event) throw badRequest('NO_ACTIVE_EVENT', 'Tell me about your event first');
    if (!budgetRangesFor(event.eventType).some((r) => r.id === range.id)) throw badRequest('INVALID_BUDGET_RANGE', 'That range is not offered for this event');
    await core.patchEventFacts(customerId, event._id, { budgetRange: range.id });
    chipWrites.push('budgetRange');
  }
  // "At the event venue" chip for a service location.
  if (!readOnlyCatalog && serviceLocation !== undefined && serviceLocation !== null) {
    if (typeof serviceLocation !== 'object' || serviceLocation.mode !== 'event' || typeof serviceLocation.category !== 'string') {
      throw badRequest('INVALID_SERVICE_LOCATION', 'Invalid service location');
    }
    if (!event) throw badRequest('NO_ACTIVE_EVENT', 'Tell me about your event first');
    const r = await core.applyServiceLocation(customerId, event._id, serviceLocation.category, { mode: 'event' });
    if (r.reason === 'unknown_category') throw badRequest('INVALID_SERVICE_LOCATION', 'Unknown service');
    chipWrites.push(`location.${serviceLocation.category}`);
  }
  if (event && chipWrites.length) event = await core.getEvent(customerId, event._id);

  // 4. Context & Request Routing
  tracker.markContextStart();
  if (options.onStatus) options.onStatus('context_retrieval');
  const vendorRequest = isVendorRequest(text);
  const cityHint = vendorRequest ? await core.catalogLocationHint(text) : null;
  const searchScope = {
    ...(event || {}), ...(cityHint && cityHint.toLowerCase() !== event?.city?.toLowerCase() ? { city: cityHint, location: null } : {}),
    ...(vendorRequest && parseGuests(text) ? { guestCount: parseGuests(text) } : {}),
    ...(vendorRequest && parseDate(text) ? { eventDate: parseDate(text).date } : {}),
  };
  const { prompt: context } = await buildContext({ customer, event, catalogScope: searchScope });
  const history = await auraRepo.recentMessages(sessionId, 12);
  const language = conversationLanguage(text, history);
  tracker.markContextEnd();

  const operational = activityAnswer(text, context.activity, language);
  if (operational) {
    await auraRepo.addMessages(sessionId, [{ role: 'user', content: text }, { role: 'model', content: operational.reply }]);
    return { ...operational, ...(await stateFor(customerId, event?._id)), nextQuestion: null, activity: context.activity, written: [], skipped: [], createdEventId: null };
  }

  const searchMessage = /find one|ढूँढ|dhoondh/i.test(text) && askedTopic?.startsWith('requirement.') ? `${text} ${askedTopic.split('.')[1]}` : text;
  if (isCatalogLookupOnly(text)) {
    const vendorSuggestions = selectVendorRows(context.vendors, searchMessage);
    const reply = vendorTruthReply(vendorSuggestions, searchScope, language, searchMessage);
    await auraRepo.setCatalogSearch(sessionId, rememberCatalog(searchMessage, searchScope, event));
    await auraRepo.addMessages(sessionId, [{ role: 'user', content: text }, { role: 'model', content: reply }]);
    return { reply, ...(await stateFor(customerId, event?._id)), nextQuestion: null, vendorSuggestions, vendorSearch: { ...context.vendorSearch, query: searchMessage, resultCount: vendorSuggestions.length, scopeMatchesEvent: scopeMatchesEvent(searchScope, event), checkedAt: new Date().toISOString() }, written: [], skipped: [], createdEventId: null };
  }

  const route = classifyAuraRequest(text, { intent: event?.eventType ? 'EVENT_PLAN' : 'GENERAL' });
  if (options.onStatus) options.onStatus(route.stage);

  // 5. LLM
  let reply = '';
  let rawExtracted = {};
  const literal = backfillFacts(text, {}, { askedTopic });
  const literalOnly = !/[?？]|\b(why|how|should|explain|suggest|recommend|kya|kyon|kyu|kaise|batao|batayein)\b/i.test(text) && Object.values(literal).some(value => value != null && value !== '' && (!Array.isArray(value) || value.length));
  tracker.markGeminiStart();
  if (!literalOnly) try {
    const out = await getLlmAdapter().chat({
      systemPrompt: `${buildSystemPrompt(context)}\n\n${auraLanguageInstruction(language)}`,
      history,
      message: text,
      model: route.model,
      thinkingLevel: route.thinkingLevel,
      onChunk: options.onChunk && !vendorRequest ? (token) => {
        tracker.markFirstToken();
        options.onChunk(token);
      } : undefined,
      onStatus: options.onStatus,
    });
    reply = out.text;
    rawExtracted = out.extracted || {};
  } catch (err) {
    console.warn('[aura] LLM unavailable:', err?.message || err);
    reply = '';
  }
  tracker.markGenerationEnd();

  // 6–7. Guards, then the deterministic fallback parser (blanks only)
  const { extracted: guarded, dropped } = applyGuards(rawExtracted, text, { askedTopic });
  let x = backfillFacts(text, guarded, { askedTopic });
  // A catalogue-backed place match is safe for a planning statement, including
  // lowercase Roman Hindi. Pure catalogue queries returned above without writes.
  if (!x.city && !x.newEventCity && cityHint) x.city = cityHint;
  if (chipWrites.includes('budgetRange')) {
    // the chip is the statement
    delete x.budget;
    delete x.budgetMin;
    delete x.budgetMax;
  }
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
      event = await createDraftFrom(customerId, { ...facts, customType: x.customType });
      createdEventId = event._id;
      x = { ...salvageOntoCurrent({ ...x, ...facts }), eventType: undefined };
    }
  } else {
    const requestedType = x.newEventType || (x.eventType && x.eventType !== event.eventType ? x.eventType : null);
    if (requestedType && requestedType !== event.eventType) {
      // A different event: its own draft ("second event" flow).
      // Facts in the message that introduces the new event belong to it.
      const facts = { ...newEventFacts(x), eventType: requestedType };
      event = await createDraftFrom(customerId, { ...facts, customType: x.customType });
      createdEventId = event._id;
      x = {
        date: facts.date,
        guestCount: facts.guestCount,
        budget: facts.budget,
        budgetMin: x.budgetMin,
        budgetMax: x.budgetMax,
        city: facts.city,
        venueName: x.venueName,
        area: x.area,
        serviceLocations: x.serviceLocations,
        neededCategories: x.neededCategories,
        serviceBriefs: x.serviceBriefs,
        providedCategory: x.providedCategory,
        providedCategories: x.providedCategories,
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
      writes = await writeExtraction({ customerId, event, extracted: x, yearStated, isQuestion: text.includes('?') });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      writes.skipped.push({ field: '*', reason: err.code });
    }
  }

  // 11. State AFTER this turn's writes; the one next question comes from it
  const after = await stateFor(customerId, event?._id || null);
  let vendorSuggestions = [];
  if (vendorRequest) {
    const freshScope = { ...searchScope, ...(event || {}), ...(after.activeEvent || {}), _id: event?._id, ...(cityHint ? { city: cityHint, location: cityHint.toLowerCase() !== after.activeEvent?.city?.toLowerCase() ? null : after.activeEvent?.location } : {}) };
    vendorSuggestions = selectVendorRows(await core.vendorCatalog(freshScope), searchMessage);
    reply = vendorTruthReply(vendorSuggestions, freshScope, language, searchMessage);
    after.vendorSearch = { source: 'customer_catalog_api', query: searchMessage, city: freshScope.city || null, date: freshScope.eventDate || null, resultCount: vendorSuggestions.length, scopeMatchesEvent: scopeMatchesEvent(freshScope, after.activeEvent), checkedAt: new Date().toISOString() };
    await auraRepo.setCatalogSearch(sessionId, rememberCatalog(searchMessage, freshScope, after.activeEvent));
  } else if (session.catalogSearch) {
    const refreshed = await refreshCatalog(session.catalogSearch, after.activeEvent);
    vendorSuggestions = refreshed.vendorSuggestions;
    after.vendorSearch = refreshed.vendorSearch;
    const scope = catalogScopeFor(session.catalogSearch, after.activeEvent);
    if (scope) await auraRepo.setCatalogSearch(sessionId, rememberCatalog(session.catalogSearch.query, scope, after.activeEvent));
  }
  after.nextQuestion = localizeAuraQuestion(after.nextQuestion, language, after.activeEvent);
  if (isWeakReply(reply)) {
    reply = deterministicReply({ activeEvent: after.activeEvent, extracted: x, text, language });
  }
  reply = composeReply(reply || deterministicReply({ activeEvent: after.activeEvent, extracted: x, text, language }), {
    language,
    event: after.activeEvent,
    nextQuestion: after.nextQuestion,
    assumedDate: writes.written.includes('eventDate') && !yearStated ? after.understanding?.facts.date.value : null,
  });
  await auraRepo.addMessages(sessionId, [
    { role: 'user', content: text },
    { role: 'model', content: reply },
  ]);

  const metrics = tracker.getMetrics();
  console.log('\n' + '═'.repeat(70));
  console.log(`[Aura Customer Chat]`);
  console.log(`👤 Customer : ${customer.fullName || 'Customer'} (${customer.email || customerId})`);
  console.log(`💬 Session  : ${sessionId}`);
  if (after.activeEvent) {
    console.log(`📅 Event    : ${after.activeEvent.title || 'Untitled'} (${after.activeEvent.eventType || 'N/A'}) | City: ${after.activeEvent.city || 'N/A'} | Date: ${after.activeEvent.eventDate || 'N/A'}`);
  }
  console.log(`📩 User Msg : "${text}"`);
  if (chipWrites.length) {
    console.log(`⚡ Action   : ${chipWrites.join(', ')}`);
  }
  const cleanFacts = Object.entries(x || {}).filter(([_, v]) => v !== undefined && v !== null && v !== '');
  if (cleanFacts.length) {
    console.log(`🔍 Extracted:`, JSON.stringify(Object.fromEntries(cleanFacts)));
  }
  if (writes.written.length) {
    console.log(`💾 Saved    : ${writes.written.join(', ')}`);
  }
  console.log(`🤖 Aura (${route.model}) [${language}]:\n"${reply}"`);
  if (after.nextQuestion?.question) {
    console.log(`❓ Next Q   : "${after.nextQuestion.question}"`);
  }
  if (metrics?.totalDurationMs) {
    console.log(`⏱️ Perf     : Total ${metrics.totalDurationMs}ms | FirstToken ${metrics.firstTokenMs || 'N/A'}ms`);
  }
  console.log('═'.repeat(70) + '\n');

  return {
    reply,
    extracted: x,
    dropped,
    written: [...chipWrites, ...writes.written],
    skipped: writes.skipped,
    createdEventId: createdEventId ? String(createdEventId) : null,
    metrics: tracker.getMetrics(),
    model: route.model,
    thinkingLevel: route.thinkingLevel,
    vendorSuggestions,
    ...after,
  };
}
