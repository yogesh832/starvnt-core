export const PORTAL_SURFACE = 'VENDOR';
const configured = () => ({
  CUSTOMER: import.meta.env?.VITE_CUSTOMER_PORTAL_URL,
  VENDOR: import.meta.env?.VITE_VENDOR_PORTAL_URL,
});
export function portalLoginUrl(type, settings = configured()) {
  const label = type === 'VENDOR' ? 'vendor' : 'customer';
  const fallback = type === 'VENDOR' ? 'https://vendor.starvnt.com' : 'https://starvnt-core.vercel.app';
  try {
    const url = new URL(settings[type] || fallback);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
    url.pathname = '/login'; url.search = ''; url.hash = '';
    return url.href;
  } catch { return `${fallback}/login`; }
}
export function mismatchError(type) {
  const label = type === 'VENDOR' ? 'vendor' : 'customer';
  const error = new Error(`Your account is registered as a ${label}. Please sign in through the ${label} dashboard.`);
  error.data = { error: 'ACCOUNT_TYPE_MISMATCH', accountType: type, message: error.message };
  return error;
}
export const portalPayload = (payload = {}) => ({ ...payload, accountType: PORTAL_SURFACE });
export async function acceptPortalSession(data, api, isCurrent = () => true, expectedSurface = PORTAL_SURFACE) {
  if (!data?.user || !isCurrent()) return null;
  if (data.user.accountType !== expectedSurface) {
    api.setToken(null);
    throw mismatchError(data.user.accountType);
  }
  if (data.accessToken) api.setToken(data.accessToken);
  return data.user;
}
