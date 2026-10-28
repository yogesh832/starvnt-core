import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';
import { schedulingError } from '../../common/scheduleRules.js';

const schema = new mongoose.Schema({ _id: String, token: String, expiresAt: Date });
const Lock = externalConn.model('VendorScheduleLock', schema);
// Shared across processes and all schedule/booking writers. Busy requests retry
// through the caller; no unsafe write proceeds if the lease cannot be acquired.
export async function withVendorSchedule(vendorId, work) {
  const token = crypto.randomUUID();
  const _id = String(vendorId);
  let lease;
  try {
    // Never steal a timed-out owner automatically: a paused process might
    // resume after its last ownership check. A crashed owner is recovered only
    // after writers have stopped (see the rollout runbook).
    lease = await Lock.findOneAndUpdate({ _id, token: null }, { $set: { token, expiresAt: new Date(Date.now() + 120000) } }, { upsert: true, new: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  if (!lease) throw schedulingError('SCHEDULE_BUSY', 'This schedule is being updated. Please retry.', 409);
  let lost = false;
  const heartbeat = setInterval(() => {
    Lock.updateOne({ _id, token }, { $set: { expiresAt: new Date(Date.now() + 120000) } }).then(result => { if (!result.matchedCount) lost = true; }).catch(() => { lost = true; });
  }, 20000);
  heartbeat.unref();
  const assertLease = async () => {
    if (lost || !await Lock.exists({ _id, token, expiresAt: { $gt: new Date() } })) throw schedulingError('SCHEDULE_LEASE_LOST', 'The schedule changed. Retry your request.', 409);
  };
  try { return await work(assertLease); }
  finally { clearInterval(heartbeat); await Lock.updateOne({ _id, token }, { $set: { token: null, expiresAt: new Date(0) } }); }
}
