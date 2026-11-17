import { createHash } from 'node:crypto';
import { MeetingParticipation } from './meetingModels.js';

const conflict = () => Object.assign(new Error('Participation changed. Reload attendance and feedback before saving.'), { code: 'PARTICIPATION_CHANGED', status: 409 });
export async function recordParticipationEvidence(filter, { field, value, actor, actorType, expectedRevision, reason = '', create = false }) {
  if (!['attended', 'feedback'].includes(field) || (field === 'attended' ? typeof value !== 'boolean' : typeof value !== 'string') || !['ADMIN', 'VENDOR'].includes(actorType)) throw new Error('Invalid participation evidence command.');
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw conflict();
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await MeetingParticipation.findOne(filter).select('+evidenceHistory').slice('evidenceHistory', -1).lean();
    const revision = previous?.evidenceRevision || 0;
    if (!Number.isSafeInteger(revision) || revision < 0) throw conflict();
    const requestHash = createHash('sha256').update(JSON.stringify({ field, value, actor: String(actor), actorType, expectedRevision: expectedRevision ?? null, reason })).digest('hex');
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      const last = previous?.evidenceHistory?.at(-1);
      if (last?.priorRevision === expectedRevision && last.requestHash === requestHash) return previous;
      throw conflict();
    }
    if (previous && previous[field] === value) return previous;
    if (!previous && !create) return null;
    const at = new Date();
    const entry = { revision: revision + 1, priorRevision: revision, field, actor: String(actor), actorType, at, reason, requestHash,
      before: { known: previous?.[field] !== undefined, value: previous?.[field] ?? null }, after: value };
    const set = { [field]: value, ...(field === 'attended' ? { attendanceActor: String(actor), attendanceAt: at } : {}) };
    if (!previous) {
      try { return await MeetingParticipation.create({ ...filter, ...set, evidenceRevision: 1, evidenceHistory: [entry] }); }
      catch (error) { if (error.code !== 11000) throw error; continue; }
    }
    const versionFilter = revision === 0 ? { $or: [{ evidenceRevision: 0 }, { evidenceRevision: { $exists: false } }] } : { evidenceRevision: revision };
    const saved = await MeetingParticipation.findOneAndUpdate({ ...filter, _id: previous._id, ...versionFilter }, {
      $set: set, $inc: { evidenceRevision: 1 }, $push: { evidenceHistory: entry },
    }, { new: true, runValidators: true }).lean();
    if (saved) return saved;
  }
  throw conflict();
}
