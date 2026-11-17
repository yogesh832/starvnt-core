import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn } from '../src/db/index.js';
import { MeetingParticipation } from '../src/learning/meetingModels.js';
import { recordParticipationEvidence } from '../src/learning/participationEvidence.js';
let mongo;
const key = () => ({ vendor: new Types.ObjectId(), meeting: new Types.ObjectId(), scheduleVersion: 1 });
const attendance = (filter, value, extra = {}) => recordParticipationEvidence(filter, { field: 'attended', value, actor: 'fixture-staff', actorType: 'ADMIN', create: true, ...extra });
before(async () => { mongo = await MongoMemoryServer.create(); await externalConn.openUri(mongo.getUri('participation_evidence')); await MeetingParticipation.init(); }, { timeout: 120000 });
after(async () => { await externalConn.close(); await mongo?.stop(); });

test('concurrent attendance command receipts recover once and stale changed intent is denied', async () => {
  const filter = key();
  const receipts = await Promise.all(Array.from({ length: 4 }, () => attendance(filter, true, { expectedRevision: 0, reason: 'Observed attendance' })));
  assert.ok(receipts.every(row => row.evidenceRevision === 1));
  await attendance(filter, false, { expectedRevision: 1, reason: 'Correction after register review' });
  await assert.rejects(attendance(filter, true, { expectedRevision: 1, reason: 'Stale register' }), { code: 'PARTICIPATION_CHANGED' });
  const stored = await MeetingParticipation.findOne(filter).select('+evidenceHistory').lean();
  assert.equal(stored.evidenceRevision, 2); assert.equal(stored.evidenceHistory.length, 2);
  assert.deepEqual(stored.evidenceHistory[0].before, { known: false, value: null });
  assert.equal(stored.evidenceHistory[1].before.value, true); assert.equal(stored.evidenceHistory[1].after, false);
  assert.equal(stored.evidenceHistory[1].reason, 'Correction after register review');
  assert.equal((await MeetingParticipation.findOne(filter).lean()).evidenceHistory, undefined);
});

test('feedback corrections retain exact prior text and cannot write after attendance revocation', async () => {
  const filter = key(); await attendance(filter, true, { expectedRevision: 0 });
  const feedback = (value, revision) => recordParticipationEvidence({ ...filter, attended: true }, { field: 'feedback', value, actor: 'fixture-vendor', actorType: 'VENDOR', expectedRevision: revision });
  await feedback('Original feedback', 1); await feedback('Corrected feedback', 2); await feedback('Corrected feedback', 2);
  await assert.rejects(feedback('Different stale feedback', 2), { code: 'PARTICIPATION_CHANGED' });
  await attendance(filter, false, { expectedRevision: 3 });
  assert.equal(await recordParticipationEvidence({ ...filter, attended: true }, { field: 'feedback', value: 'After revocation', actor: 'fixture-vendor', actorType: 'VENDOR' }), null);
  const stored = await MeetingParticipation.findOne(filter).select('+evidenceHistory').lean();
  assert.equal(stored.evidenceHistory.length, 4);
  assert.equal(stored.evidenceHistory[2].before.value, 'Original feedback');
  assert.equal(stored.feedback, 'Corrected feedback');
  assert.equal(stored.evidenceHistory[2].actorType, 'VENDOR');
});

test('legacy participation starts explicit evidence history without inventing previous edit times or crossing schedules', async () => {
  const filter = key();
  await MeetingParticipation.collection.insertOne({ ...filter, attended: true, feedback: 'Legacy feedback' });
  await attendance(filter, false, { expectedRevision: 0 });
  const row = await MeetingParticipation.findOne(filter).select('+evidenceHistory').lean();
  assert.equal(row.evidenceHistory.length, 1); assert.deepEqual(row.evidenceHistory[0].before, { known: true, value: true });
  assert.equal(row.evidenceHistory[0].priorRevision, 0);
  await attendance({ ...filter, scheduleVersion: 2 }, true, { expectedRevision: 0 });
  assert.equal(await MeetingParticipation.countDocuments({ meeting: filter.meeting }), 2);
  assert.equal((await MeetingParticipation.findOne(filter)).attended, false);
});
