import * as events from '../services/events.service.js';
import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as auraRepo from '../repositories/aura.repo.js';
import * as catalog from '../services/catalog.service.js';
import * as commerceRepo from '../repositories/commerce.repo.js';

/**
 * The ONLY door from Aura+ into Core. Everything Aura+ reads or writes goes
 * through these functions, which call Core's own services (and therefore its
 * validation and lock rules). Aura+ acts as `actorType: 'aura'`.
 *
 * Deliberately absent: any booking, payment, settlement, refund or
 * completion write. Aura+ can never confirm or verify anything.
 */
const AURA = { actorType: 'aura' };

export const getEvent = (customerId, eventId) => eventsRepo.findOwnedEvent(customerId, eventId);
export const listEvents = (customerId) => eventsRepo.listEventsForCustomer(customerId);
export const listRequirements = (eventId) => reqRepo.listRequirements(eventId);
export const listContext = (eventId) => auraRepo.listContext(eventId);
export const optionStats = (event) => catalog.optionStats(event);
export const compactOptions = (event, categories) => catalog.compactOptionsFor(event, categories);
// Read-only views of commitments. There is no write counterpart here.
export const readBookings = (eventId) => commerceRepo.listBookings(eventId);
export const readPayments = (eventId) => commerceRepo.listPayments(eventId);
export const readReservations = (eventId) => commerceRepo.listReservations(eventId);

export const createDraftEvent = (customerId, facts) => events.createDraftEvent(customerId, facts, AURA);
export const patchEventFacts = (customerId, eventId, facts) => events.patchEvent(customerId, eventId, facts, AURA);
export const applyServiceStatement = (customerId, eventId, category, statement) =>
  events.applyServiceStatement(customerId, eventId, category, statement, AURA);
export const mergePreferences = (customerId, eventId, category, prefs) =>
  events.mergePreferences(customerId, eventId, category, prefs, AURA);

/** Aura+'s own notes (aura_context). Never business state. */
export const setNote = (eventId, field, value, state, source = 'aura') => auraRepo.setContext(eventId, field, { value, state, source });
