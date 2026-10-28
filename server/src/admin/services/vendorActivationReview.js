import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { evaluateVendorActivation } from '../../external/services/vendorActivation.service.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';
import { schedulingError } from '../../common/scheduleRules.js';

export async function reviewActivation(vendorId, input, actor) {
  const state = { APPROVE: 'ACTIVE', REJECT: 'REJECTED', REQUEST_INFORMATION: 'PROFILE_INCOMPLETE', SUSPEND: 'SUSPENDED' }[input.action];
  const reason = String(input.reason || '').trim().slice(0, 1000);
  const key = String(input.idempotencyKey || '').slice(0, 160);
  if (!state || !reason || !key) throw schedulingError('INVALID_ACTIVATION_REVIEW', 'Action, reason and request identifier are required.');
  return withVendorSchedule(vendorId, async assertLease => {
    const vendor = await VendorOrganization.findById(vendorId);
    if (!vendor) throw schedulingError('VENDOR_NOT_FOUND', 'Vendor not found.', 404);
    const prior = vendor.activationHistory?.find(row => row.idempotencyKey === key);
    if (prior) {
      if (prior.action !== input.action || prior.reason !== reason) throw schedulingError('IDEMPOTENCY_CONFLICT', 'Request identifier already used.', 409);
      return { vendor, status: await evaluateVendorActivation(vendorId) };
    }
    const readiness = await evaluateVendorActivation(vendorId);
    if (state === 'ACTIVE' && (!readiness.commercialReadiness || !readiness.checklist.verified)) throw schedulingError('VENDOR_NOT_READY', 'Complete profile, services, resources and verification before approval.', 409);
    await assertLease();
    const reviewedAt = new Date();
    const history = { actor: String(actor.id), role: actor.role, at: reviewedAt, action: input.action, reason, fromState: vendor.status, toState: state, idempotencyKey: key };
    const review = state === 'ACTIVE' ? 'APPROVED' : state === 'REJECTED' ? 'REJECTED' : state === 'SUSPENDED' ? 'SUSPENDED' : 'INFORMATION_REQUESTED';
    const updated = await VendorOrganization.findOneAndUpdate({ _id: vendorId, updatedAt: vendor.updatedAt }, {
      $set: { status: state, activationState: state, isCommerciallyActive: state === 'ACTIVE', isRestricted: state === 'SUSPENDED', restrictedUntil: null, 'activationReview.status': review, 'activationReview.reason': reason, 'activationReview.reviewedAt': reviewedAt, 'activationReview.reviewedBy': actor.id },
      $push: { activationHistory: history },
    }, { new: true, runValidators: true });
    if (!updated) throw schedulingError('STALE_REVIEW', 'Vendor changed during review. Refresh and retry.', 409);
    return { vendor: updated, status: await evaluateVendorActivation(vendorId) };
  });
}
