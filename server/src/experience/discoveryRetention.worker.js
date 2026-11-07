import { DiscoveryProject } from './discoveryRewards.models.js';

// Disabled until operations configures an explicit retention period.
export async function runDiscoveryRetentionBatch({ days = Number(process.env.DISCOVERY_WITHDRAWN_RETENTION_DAYS), now = new Date(), limit = 100 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 3650) return { enabled: false, purged: 0 };
  const cutoff = new Date(now.getTime() - days * 86400000);
  // Legacy withdrawn records without a recorded withdrawal date require review.
  const rows = await DiscoveryProject.find({ status: 'WITHDRAWN', withdrawnAt: { $lte: cutoff }, mediaPurgedAt: { $exists: false } }).select('_id').limit(limit).lean();
  let purged = 0;
  for (const row of rows) {
    const result = await DiscoveryProject.updateOne({ _id: row._id, status: 'WITHDRAWN', withdrawnAt: { $lte: cutoff }, mediaPurgedAt: { $exists: false } }, { $unset: { image: 1 }, $set: { mediaPurgedAt: now }, $push: { history: { actor: 'SYSTEM', action: 'MEDIA_PURGED', reason: `Configured ${days}-day withdrawn-media retention expired` } } });
    purged += result.modifiedCount;
  }
  return { enabled: true, purged };
}
