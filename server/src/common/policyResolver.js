import { CorePolicy } from '../admin/models/CorePolicy.js';
import { CorePolicyRevision } from '../admin/models/CorePolicyRevision.js';

export const DEFAULT_FALLBACK_POLICY = Object.freeze({
  minimumReservationPercent: null,
  defaultRadiusKm: 25,
  settlementCondition: null,
  settlementDelayDays: null,
  policyVersion: 0,
  policySource: 'POLICY_NOT_APPROVED',
  policyActive: false,
});

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function activeRevision(category, at) {
  return CorePolicyRevision.findOne({
    category: { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') },
    status: { $in: ['APPROVED', 'SCHEDULED'] },
    effectiveFrom: { $lte: at },
  }).sort({ effectiveFrom: -1, version: -1 }).lean();
}

/**
 * Resolve only an approved policy version whose effective date has arrived.
 * Legacy CorePolicy records remain readable for operational settings, but are
 * never treated as approval of financial terms.
 */
export async function getCommercialPolicyForCategory(category, at = new Date()) {
  try {
    let revision = category ? await activeRevision(category, at) : null;
    if (!revision) revision = await activeRevision('Global', at);
    const legacyOperational = await CorePolicy.findOne({ category: { $regex: /^Global$/i } }).select('defaultRadiusKm').lean();
    if (!revision) return { ...DEFAULT_FALLBACK_POLICY, defaultRadiusKm: legacyOperational?.defaultRadiusKm ?? DEFAULT_FALLBACK_POLICY.defaultRadiusKm, policyCategory: 'Global' };

    return {
      ...revision.values,
      defaultRadiusKm: legacyOperational?.defaultRadiusKm ?? DEFAULT_FALLBACK_POLICY.defaultRadiusKm,
      policyVersion: revision.version,
      policySource: 'APPROVED',
      policyActive: true,
      policyCategory: revision.category,
      policyId: String(revision._id),
      effectiveFrom: revision.effectiveFrom,
      draftAuthorId: String(revision.createdBy),
      draftAuthorEmail: revision.createdByEmail,
      approverId: String(revision.approvedBy),
      approverEmail: revision.approvedByEmail,
    };
  } catch (err) {
    console.warn('[PolicyResolver] Error resolving approved policy from DB:', err.message);
    return DEFAULT_FALLBACK_POLICY;
  }
}

/** Refund thresholds are minimum full calendar days before the event date. */
export function refundPercentForDays(refundTiers, daysBeforeEvent) {
  const days = Number(daysBeforeEvent);
  if (!Number.isInteger(days) || days < 0) return null;
  const entries = refundTiers instanceof Map ? [...refundTiers.entries()] : Object.entries(refundTiers || {});
  const eligible = entries
    .map(([minimumDays, percent]) => [Number(minimumDays), Number(percent)])
    .filter(([minimumDays, percent]) => Number.isInteger(minimumDays) && minimumDays >= 0 && Number.isFinite(percent) && percent >= 0 && percent <= 100 && days >= minimumDays)
    .sort((a, b) => b[0] - a[0]);
  return eligible[0]?.[1] ?? null;
}

export function calculateEligibleAdvanceRefund({ eligibleAdvance, refundTiers, daysBeforeEvent, alreadyRefunded = 0 } = {}) {
  const eligible = Number(eligibleAdvance);
  const refunded = Number(alreadyRefunded);
  const percent = refundPercentForDays(refundTiers, daysBeforeEvent);
  if (!Number.isFinite(eligible) || eligible < 0 || !Number.isFinite(refunded) || refunded < 0 || percent == null) return null;
  const cap = Math.max(0, Math.round(eligible * percent / 100) - Math.round(refunded));
  return { percent, amount: cap };
}
