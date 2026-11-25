export const PARTNER_OFFER = Object.freeze({
  code: 'AURA6MONTHS', name: 'AURA+ Founding Partner offer', durationMonths: 6,
  approvalStatus: 'PENDING_COMMERCIAL_APPROVAL', autoRenewsToPaid: false,
  notice: 'Six-month offer request, subject to approved offer terms and eligibility review. A request does not activate a subscription, change matching eligibility or authorize billing.',
});
export const PARTNER_OFFER_NOTICE_VERSION = '2026-11-25.draft1';
export function validatePartnerPromo(value) {
  if (typeof value !== 'string' || value.length > 60) throw Object.assign(new Error('Enter a valid promotion code.'), { statusCode: 400, code: 'INVALID_PROMO_CODE' });
  const code = value.trim().toUpperCase();
  if (['AURA2025', 'FOUNDER2025'].includes(code)) return { recognized: false, code, status: 'EXPIRED', message: 'This campaign code is expired.' };
  if (code !== PARTNER_OFFER.code) return { recognized: false, code, status: 'UNRECOGNIZED', message: 'This code is not configured for the Partner program.' };
  return { recognized: true, ...PARTNER_OFFER, status: 'REQUEST_ONLY', noticeVersion: PARTNER_OFFER_NOTICE_VERSION };
}
