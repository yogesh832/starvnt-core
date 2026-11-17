import crypto from 'node:crypto';
import { externalConn } from '../../db/index.js';
import { CustomerEvent, EventRequirement, EventHistory, AuraContext, LOCKED_REQUIREMENT_STATUSES } from '../models/index.js';
import { createDraftEvent, validateFacts } from './events.service.js';
import { serializeEvent, serializeRequirement, buildUnderstanding, progressOf } from './understanding.js';
import { normalizeCategory } from './planCatalog.js';
import { validateDetails, validateServiceLocation } from './serviceRequirements.js';
import { badRequest, conflict, notFound } from '../utils/http.js';

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
function assertObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('INVALID_DRAFT', 'Supply a draft object.');
}
function requestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw badRequest('INVALID_REQUEST_KEY', 'Use a valid save request key.');
  return value;
}
export function planningVersion(event, requirements) {
  return digest({ event: serializeEvent(event), requirements: requirements.map(row => ({ ...serializeRequirement(event.eventType, row), updatedAt: row.updatedAt })).sort((a, b) => a.category.localeCompare(b.category)) });
}
export async function planningDraft(customerId, eventId) {
  // Read a coherent event/requirement snapshot, including timestamps used for conflicts.
  let result;
  await externalConn.transaction(async session => {
    const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).session(session).lean();
    if (!event) throw notFound('Event not found');
    const requirements = await EventRequirement.find({ event: event._id }).session(session).lean();
    const context = await AuraContext.find({ event: event._id }).session(session).lean();
    result = { event: serializeEvent(event), requirements: requirements.map(row => serializeRequirement(event.eventType, row)), planningVersion: planningVersion(event, requirements), understanding: buildUnderstanding(event, requirements, context), progress: progressOf(event, requirements) };
  });
  return result;
}
export async function createPlanningDraft(customerId, body = {}) {
  assertObject(body);
  if (Object.keys(body).some(key => !['eventType', 'idempotencyKey'].includes(key))) throw badRequest('INVALID_DRAFT', 'Create a draft with an event type and request key.');
  const key = requestKey(body.idempotencyKey);
  const event = await createDraftEvent(customerId, { eventType: body.eventType, idempotencyKey: `manual-draft:${key}` }, { actorType: 'customer', actorId: customerId });
  if (event.eventType !== String(body.eventType).toLowerCase().trim()) throw conflict('IDEMPOTENCY_CONFLICT', 'This draft request was already used for a different event type.');
  return planningDraft(customerId, event._id);
}
function validateServices(eventType, services) {
  if (!Array.isArray(services) || services.length > 40) throw badRequest('INVALID_SERVICES', 'Supply up to 40 service changes.');
  const seen = new Set();
  return services.map(input => {
    const category = normalizeCategory(input?.category);
    if (!category || seen.has(category)) throw badRequest('INVALID_SERVICES', 'Each service must have a valid, unique category.');
    seen.add(category);
    if (Object.keys(input).some(key => !['category', 'status', 'providedValue', 'details', 'serviceLocation', 'specialRequirements', 'confirmSuggestion'].includes(key))) throw badRequest('INVALID_SERVICES', 'Unknown service field.');
    if (input.confirmSuggestion !== undefined && typeof input.confirmSuggestion !== 'boolean') throw badRequest('INVALID_SERVICES', 'Suggestion confirmation must be explicit.');
    if (!['missing', 'pending', 'customer_provided'].includes(input.status)) throw badRequest('INVALID_STATUS', 'Choose needed, arranged by you, or not required yet.');
    const providedValue = String(input.providedValue ?? '').trim();
    const notes = String(input.specialRequirements ?? '').trim();
    if (providedValue.length > 200 || notes.length > 1000) throw badRequest('INVALID_SERVICES', 'Service details are too long.');
    return { category, confirmSuggestion: input.confirmSuggestion === true, status: input.status, providedValue: input.status === 'customer_provided' ? providedValue || null : null,
      ...(input.details !== undefined ? { preferences: validateDetails(category, eventType, input.details) } : {}),
      ...(input.serviceLocation !== undefined ? { serviceLocation: validateServiceLocation(category, input.serviceLocation) } : {}),
      specialRequirements: notes || null };
  });
}
export async function savePlanningDraft(customerId, eventId, body = {}) {
  assertObject(body);
  assertObject(body.facts || {});
  if (Object.keys(body).some(key => !['facts', 'services', 'expectedVersion', 'idempotencyKey'].includes(key))) throw badRequest('INVALID_DRAFT', 'Unknown draft field.');
  const key = requestKey(body.idempotencyKey);
  if (!/^[a-f0-9]{64}$/.test(body.expectedVersion || '')) throw badRequest('VERSION_REQUIRED', 'Reload the saved draft before editing.');
  const facts = validateFacts(body.facts || {});
  const requestHash = digest(body);
  let savedVersion;
  await externalConn.transaction(async session => {
    const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).session(session).lean();
    if (!event) throw notFound('Event not found');
    const receipt = await EventHistory.findOne({ event: event._id, idempotencyKey: `planning-save:${key}` }).session(session).lean();
    if (receipt) {
      if (receipt.details?.requestHash !== requestHash) throw conflict('IDEMPOTENCY_CONFLICT', 'This save key was used with different changes.');
      const currentRequirements = await EventRequirement.find({ event: event._id }).session(session).lean();
      savedVersion = receipt.details?.resultVersion;
      if (planningVersion(event, currentRequirements) !== savedVersion) throw conflict('DRAFT_CHANGED', 'Your earlier save succeeded, but the plan changed afterwards. Reload the saved version.');
      return; // A lost acknowledgement may be retried without repeating mutations.
    }
    if (event.status !== 'draft') throw conflict('DRAFT_LOCKED', 'This event is no longer a draft. Open its event workspace.');
    const requirements = await EventRequirement.find({ event: event._id }).session(session).lean();
    if (planningVersion(event, requirements) !== body.expectedVersion) throw conflict('DRAFT_CHANGED', 'This plan changed elsewhere. Reload the saved version before continuing.');
    const services = validateServices(facts.eventType || event.eventType, body.services || []);
    for (const service of services) {
      const existing = requirements.find(row => row.category === service.category);
      if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) throw conflict('REQUIREMENT_LOCKED', 'A committed service cannot be changed in draft planning.');
      const { category, confirmSuggestion, ...fields } = service;
      const source = existing?.source === 'aura_inferred' && !confirmSuggestion ? 'aura_inferred' : 'customer';
      await EventRequirement.findOneAndUpdate({ event: event._id, category }, { $set: { ...fields, source,
        ...(service.status !== 'pending' ? { selectedOptionId: null, selectedOption: { vendorName: null, packageName: null, price: null, isDemo: false } } : {}) } }, { session, upsert: true, runValidators: true });
    }
    // Every draft save writes the parent: concurrent fact/Aura changes cause a
    // transaction retry and version conflict, rather than a silent overwrite.
    await CustomerEvent.updateOne({ _id: event._id, customer: customerId, status: 'draft' }, { $set: facts }, { session, runValidators: true });
    if (Object.hasOwn(facts, 'eventDate')) await AuraContext.findOneAndUpdate({ event: event._id, field: 'event.date' }, { $set: { value: { date: facts.eventDate }, state: 'KNOWN', source: 'customer' } }, { session, upsert: true });
    const savedEvent = await CustomerEvent.findById(event._id).session(session).lean();
    const savedRequirements = await EventRequirement.find({ event: event._id }).session(session).lean();
    savedVersion = planningVersion(savedEvent, savedRequirements);
    await EventHistory.create([{ event: event._id, actorType: 'customer', actorId: String(customerId), action: 'planning_draft_saved', idempotencyKey: `planning-save:${key}`, details: { requestHash, resultVersion: savedVersion, fields: Object.keys(facts), categories: services.map(row => row.category) } }], { session });
  });
  const result = await planningDraft(customerId, eventId);
  if (result.planningVersion !== savedVersion) throw conflict('DRAFT_CHANGED', 'The plan changed after your save. Reload the saved version before continuing.');
  return result;
}
