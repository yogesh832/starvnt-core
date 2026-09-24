import { EventRequirement } from '../models/index.js';

export function listRequirements(eventId) {
  return EventRequirement.find({ event: eventId }).sort({ createdAt: 1 }).lean();
}

export function listRequirementsForEvents(eventIds) {
  return EventRequirement.find({ event: { $in: eventIds } }).lean();
}

export function findRequirement(eventId, category) {
  return EventRequirement.findOne({ event: eventId, category }).lean();
}

/** Insert plan rows that don't exist yet; existing rows (and their statements) are left alone. */
export async function insertMissingRequirements(eventId, categories) {
  if (!categories.length) return;
  await EventRequirement.bulkWrite(
    categories.map((category) => ({
      updateOne: {
        filter: { event: eventId, category },
        update: { $setOnInsert: { event: eventId, category, status: 'missing', source: 'system', preferences: {} } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

/**
 * Upsert one requirement. `preferences` are merged key by key.
 * `onlyIfStatusIn` guards against overwriting locked or customer statements.
 */
export async function upsertRequirement(
  eventId,
  category,
  { status, source, providedValue, preferences, selectedOptionId, selectedOption },
  { onlyIfStatusIn } = {}
) {
  const set = {};
  if (status !== undefined) set.status = status;
  if (source !== undefined) set.source = source;
  if (providedValue !== undefined) set.providedValue = providedValue;
  if (selectedOptionId !== undefined) set.selectedOptionId = selectedOptionId;
  if (selectedOption !== undefined) set.selectedOption = selectedOption;
  for (const [k, v] of Object.entries(preferences || {})) set[`preferences.${k}`] = v;

  const existing = await EventRequirement.findOne({ event: eventId, category }).lean();
  if (!existing) {
    const doc = await EventRequirement.create({
      event: eventId,
      category,
      status: status ?? 'missing',
      source: source ?? 'system',
      providedValue: providedValue ?? null,
      preferences: preferences || {},
      selectedOptionId: selectedOptionId ?? null,
      ...(selectedOption ? { selectedOption } : {}),
    });
    return { row: doc.toObject(), changed: true };
  }
  if (onlyIfStatusIn && !onlyIfStatusIn.includes(existing.status)) {
    return { row: existing, changed: false };
  }
  if (!Object.keys(set).length) return { row: existing, changed: false };
  const row = await EventRequirement.findOneAndUpdate(
    { _id: existing._id, status: existing.status },
    { $set: set },
    { new: true }
  ).lean();
  return { row: row || existing, changed: Boolean(row) };
}
