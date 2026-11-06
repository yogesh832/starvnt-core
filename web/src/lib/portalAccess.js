export const PORTAL_SURFACE = 'CUSTOMER';
export function portalNextPath(path, surface = PORTAL_SURFACE) {
  const base = surface === 'VENDOR' ? '/vendor' : '/customer';
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) return base;
  try { const url = new URL(path, 'https://portal.invalid'); return url.origin === 'https://portal.invalid' && (url.pathname === base || url.pathname.startsWith(`${base}/`)) ? `${url.pathname}${url.search}${url.hash}` : base; } catch { return base; }
}
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
export function portalSignupUrl(type, settings = configured()) {
  const url = new URL(portalLoginUrl(type, settings));
  url.pathname = '/signup';
  url.search = `?as=${type === 'VENDOR' ? 'vendor' : 'customer'}`;
  return url.href;
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
