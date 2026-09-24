import { AuraContext, AuraSession, AuraMessage } from '../models/index.js';

// ── aura_context: Aura+'s own notes ─────────────────────────────────────────
export function listContext(eventId) {
  return AuraContext.find({ event: eventId }).lean();
}

export function setContext(eventId, field, { value, state, source = 'aura' }) {
  return AuraContext.findOneAndUpdate(
    { event: eventId, field },
    { $set: { value, state, source } },
    { upsert: true, new: true }
  ).lean();
}

// ── sessions & messages ─────────────────────────────────────────────────────
export function findSession(sessionId) {
  return AuraSession.findById(sessionId).lean();
}

export async function createSession(sessionId, customerId, eventId = null) {
  try {
    const doc = await AuraSession.create({ _id: sessionId, customer: customerId, event: eventId });
    return doc.toObject();
  } catch (err) {
    // Concurrent first message: somebody created it; the caller re-checks ownership.
    if (err?.code === 11000) return AuraSession.findById(sessionId).lean();
    throw err;
  }
}

export function listSessionsForCustomer(customerId) {
  return AuraSession.find({ customer: customerId }).sort({ updatedAt: -1 }).limit(50).lean();
}

export function setSessionEvent(sessionId, eventId) {
  return AuraSession.findByIdAndUpdate(sessionId, { $set: { event: eventId } }, { new: true }).lean();
}

export function listMessages(sessionId, limit = 100) {
  return AuraMessage.find({ session: sessionId }).sort({ createdAt: 1, _id: 1 }).limit(limit).lean();
}

export async function recentMessages(sessionId, limit = 12) {
  const rows = await AuraMessage.find({ session: sessionId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return rows.reverse();
}

export async function addMessages(sessionId, messages) {
  await AuraMessage.insertMany(messages.map((m) => ({ session: sessionId, role: m.role, content: m.content })));
  await AuraSession.updateOne({ _id: sessionId }, { $set: { updatedAt: new Date() } }, { timestamps: false });
}
