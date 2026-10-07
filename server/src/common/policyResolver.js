import { CorePolicy } from '../admin/models/CorePolicy.js';

export const DEFAULT_FALLBACK_POLICY = {
  minimumReservationPercent: 30,
  defaultRadiusKm: 25,
  settlementCondition: 'EVENT_DATE_PASSED',
  settlementDelayDays: 0,
};

/**
 * Central Policy Engine Resolver (Spec §18, §26, §27).
 * Dynamically resolves platform/category/service reservation percentage,
 * search radius policy, and settlement delay from CorePolicy database truth.
 *
 * Precedence: Category-Specific Policy -> Global Policy -> System Default
 */
export async function getCommercialPolicyForCategory(category) {
  try {
    if (category) {
      // Try exact category match or case-insensitive match
      const specificPolicy = await CorePolicy.findOne({
        category: { $regex: new RegExp(`^${category}$`, 'i') },
      });
      if (specificPolicy) {
        return {
          minimumReservationPercent: specificPolicy.minimumReservationPercent ?? DEFAULT_FALLBACK_POLICY.minimumReservationPercent,
          defaultRadiusKm: specificPolicy.defaultRadiusKm ?? DEFAULT_FALLBACK_POLICY.defaultRadiusKm,
          settlementCondition: specificPolicy.settlementCondition ?? DEFAULT_FALLBACK_POLICY.settlementCondition,
          settlementDelayDays: specificPolicy.settlementDelayDays ?? DEFAULT_FALLBACK_POLICY.settlementDelayDays,
          cancellationRefunds: specificPolicy.customerCancellationRefunds,
        };
      }
    }

    const globalPolicy = await CorePolicy.findOne({ category: 'Global' });
    return {
      minimumReservationPercent: globalPolicy?.minimumReservationPercent ?? DEFAULT_FALLBACK_POLICY.minimumReservationPercent,
      defaultRadiusKm: globalPolicy?.defaultRadiusKm ?? DEFAULT_FALLBACK_POLICY.defaultRadiusKm,
      settlementCondition: globalPolicy?.settlementCondition ?? DEFAULT_FALLBACK_POLICY.settlementCondition,
      settlementDelayDays: globalPolicy?.settlementDelayDays ?? DEFAULT_FALLBACK_POLICY.settlementDelayDays,
      cancellationRefunds: globalPolicy?.customerCancellationRefunds,
    };
  } catch (err) {
    console.warn('[PolicyResolver] Error resolving policy from DB:', err.message);
    return DEFAULT_FALLBACK_POLICY;
  }
}
