import { createHash } from 'node:crypto';
import { Schema } from 'mongoose';
import { externalConn } from '../db/index.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';

const observation = new Schema({
  vendor: { type: Schema.Types.ObjectId, required: true }, step: { type: String, required: true },
  revision: { type: Number, default: 0 }, evidenceHash: String,
  completed: Boolean, firstCompletedObservedAt: Date,
  history: [{ actor: String, action: String, at: Date, completed: Boolean, evidence: Schema.Types.Mixed, calculationVersion: String }],
}, { timestamps: true });
observation.index({ vendor: 1, step: 1 }, { unique: true });
export const LaunchpadObservation = externalConn.model('LaunchpadObservation', observation);
export const launchpadCalculationVersion = 'launchpad/2026-11-17.1';

export async function observeLaunchpad(vendorId, steps, at) {
  return withVendorSchedule(`launchpad:${vendorId}`, async () => {
    for (const step of steps.filter(row => row.sourceStatus === 'READY')) {
      const evidenceHash = createHash('sha256').update(JSON.stringify({ completed: step.completed, evidence: step.evidence, version: launchpadCalculationVersion })).digest('hex');
      const old = await LaunchpadObservation.findOne({ vendor: vendorId, step: step.key });
      if (old?.evidenceHash === evidenceHash) continue;
      const row = old || new LaunchpadObservation({ vendor: vendorId, step: step.key });
      row.revision++; row.evidenceHash = evidenceHash; row.completed = step.completed;
      if (step.completed && !row.firstCompletedObservedAt) row.firstCompletedObservedAt = at;
      row.history.push({ actor: 'SYSTEM:LAUNCHPAD_EVALUATOR', action: old ? 'EVIDENCE_CHANGED' : 'FIRST_OBSERVATION', at, completed: step.completed, evidence: step.evidence, calculationVersion: launchpadCalculationVersion });
      await row.save();
    }
    const rows = await LaunchpadObservation.find({ vendor: vendorId }).lean();
    return new Map(rows.map(row => [row.step, row]));
  });
}
