import { acceptPortalSession } from './portalAccess.js';
/** Customer OS entry policy. Vendor OS remains in main and shared development. */
export const CUSTOMER_SURFACE = 'CUSTOMER';
export const customerPayload = (payload = {}) => ({ ...payload, accountType: CUSTOMER_SURFACE });
export function customerNextPath(path) {
  return typeof path === 'string' && /^\/customer(?:\/|\?|$)/.test(path) && !path.includes('\\') ? path : '/customer';
}
export function acceptCustomerSession(data, api, isCurrent = () => true) {
  return acceptPortalSession(data, api, isCurrent, CUSTOMER_SURFACE);
}
