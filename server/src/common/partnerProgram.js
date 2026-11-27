export const PARTNER_OFFER = Object.freeze({
  code: 'AURA6MONTHS', name: 'AURA+ Founding Partner offer', durationMonths: 6,
  autoRenewsToPaid: false,
  notice: 'Redeem AURA6MONTHS for six months of complimentary AURA+ access. The offer does not enroll you in a paid plan, collect a payment method, or renew into a paid subscription.',
});
export const PARTNER_OFFER_NOTICE_VERSION = '2026-11-27.offer1';
export function addCalendarMonths(date, months) {
  const start = new Date(date);
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}
export function validatePartnerPromo(value) {
  if (typeof value !== 'string' || value.length > 60) throw Object.assign(new Error('Enter a valid promotion code.'), { statusCode: 400, code: 'INVALID_PROMO_CODE' });
  const code = value.trim().toUpperCase();
  if (['AURA2025', 'FOUNDER2025'].includes(code)) return { recognized: false, code, status: 'EXPIRED', message: 'This campaign code is expired.' };
  if (code !== PARTNER_OFFER.code) return { recognized: false, code, status: 'UNRECOGNIZED', message: 'This code is not configured for the Partner program.' };
  return { recognized: true, ...PARTNER_OFFER, status: 'AVAILABLE', noticeVersion: PARTNER_OFFER_NOTICE_VERSION };
}
