import { EventManifest } from './models.js';
import { currentFrozenManifest } from './manifest.service.js';
import { agreementInvalidReason, agreementIsValid, currentAgreements } from './agreement.service.js';
import { currentCommercialApproval, reconciliation } from './commercial.service.js';

/**
 * The single server-side authority for final proposal generation.
 * The UI only displays this result; generate and render re-run it.
 *
 * States (handbook §2.7): REQUIREMENTS_INCOMPLETE → VENDOR_APPROVAL_PENDING →
 * COMMERCIAL_APPROVAL_PENDING / PRICING_MISMATCH / SNAPSHOT_CHANGED → READY_FOR_GENERATION.
 */
export async function evaluateGate(eventId, { now = new Date() } = {}) {
  const reasons = [];
  const result = (state, extra = {}) => ({ ready: state === 'READY_FOR_GENERATION', state, reasons, ...extra });

  const manifest = await currentFrozenManifest(eventId);
  if (!manifest) {
    const draft = await EventManifest.findOne({ event: eventId }).sort({ version: -1 }).lean();
    reasons.push(draft?.validation?.status === 'INVALID'
      ? { code: 'MANIFEST_INVALID', message: 'Event requirements have validation errors.', errors: draft.validation.errors }
      : { code: 'MANIFEST_NOT_FROZEN', message: 'Event requirements are not validated and frozen yet.' });
    return result('REQUIREMENTS_INCOMPLETE');
  }
  if (manifest.validation?.status !== 'VALID') {
    reasons.push({ code: 'MANIFEST_INVALID', message: 'Event requirements have validation errors.', errors: manifest.validation.errors });
    return result('REQUIREMENTS_INCOMPLETE', { manifest });
  }

  const agreements = await currentAgreements(eventId);
  const byCategory = new Map(agreements.map((a) => [a.category, a]));
  for (const req of manifest.requirements.filter((r) => r.mandatory)) {
    const agreement = byCategory.get(req.category);
    if (!agreementIsValid(agreement, now)) {
      reasons.push({ code: 'VENDOR_AGREEMENT_NOT_APPROVED', category: req.category, status: agreementInvalidReason(agreement, now), message: `${req.label} agreement is ${agreementInvalidReason(agreement, now)}.` });
    }
  }
  if (reasons.length) return result('VENDOR_APPROVAL_PENDING', { manifest, agreements });

  const commercial = await currentCommercialApproval(eventId);
  if (!commercial) {
    reasons.push({ code: 'COMMERCIAL_APPROVAL_MISSING', message: 'Internal commercial approval is not complete.' });
    return result('COMMERCIAL_APPROVAL_PENDING', { manifest, agreements });
  }

  if (String(commercial.manifest) !== String(manifest._id) || commercial.manifestHash !== manifest.contentHash) {
    reasons.push({ code: 'SNAPSHOT_CHANGED', message: 'Event requirements changed after commercial approval. Re-approve pricing.' });
  }
  const validNow = new Map(agreements.filter((a) => agreementIsValid(a, now)).map((a) => [String(a._id), a]));
  for (const ref of commercial.agreementRefs) {
    if (validNow.get(String(ref.agreement))?.version !== ref.version) {
      reasons.push({ code: 'SNAPSHOT_CHANGED', category: ref.category, message: `${ref.category} agreement changed or lapsed after commercial approval.` });
    }
  }
  const approvedCategories = new Set(commercial.agreementRefs.map((r) => r.category));
  for (const a of agreements.filter((x) => agreementIsValid(x, now) && !approvedCategories.has(x.category))) {
    reasons.push({ code: 'SNAPSHOT_CHANGED', category: a.category, message: `${a.category} agreement was approved after pricing and is not priced.` });
  }
  if (reasons.length) return result('SNAPSHOT_CHANGED', { manifest, agreements, commercial });

  const check = reconciliation(commercial.customerFacing);
  if (!check.ok) {
    reasons.push(...check.problems.map((message) => ({ code: 'PRICING_MISMATCH', message })));
    return result('PRICING_MISMATCH', { manifest, agreements, commercial });
  }

  return result('READY_FOR_GENERATION', { manifest, agreements: agreements.filter((a) => agreementIsValid(a, now)), commercial });
}

/** Strip internal objects for API responses. */
export function gateSummary(gate) {
  return {
    ready: gate.ready,
    state: gate.state,
    reasons: gate.reasons,
    manifest: gate.manifest ? { id: gate.manifest._id, version: gate.manifest.version, status: gate.manifest.status } : null,
    agreements: (gate.agreements || []).map((a) => ({ id: a._id, category: a.category, version: a.version, status: a.status, mandatory: a.mandatory })),
    commercial: gate.commercial ? { id: gate.commercial._id, status: gate.commercial.status, approvedAt: gate.commercial.approvedAt } : null,
  };
}
