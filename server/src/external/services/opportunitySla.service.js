import { Opportunity } from '../models/Opportunity.js';
import { incrementMetric } from '../../metrics.js';

export async function expireStaleOpportunities(now = new Date()) {
  const result = await Opportunity.updateMany(
    {
      status: { $in: ['NEW', 'VIEWED'] },
      slaExpiresAt: { $ne: null, $lt: now },
    },
    {
      $set: {
        status: 'EXPIRED',
        action: 'Expired - SLA missed',
      },
    }
  );
  if (result.modifiedCount) {
    incrementMetric('starvnt_opportunities_expired_total', {}, result.modifiedCount);
  }
  return result;
}
