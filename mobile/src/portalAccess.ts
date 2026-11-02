export const PORTAL_SURFACE = 'CUSTOMER' as const;
export function portalLoginUrl(type: string) {
  const label = type === 'VENDOR' ? 'vendor' : 'customer';
  const fallback = type === 'VENDOR' ? 'https://vendor.starvnt.com' : 'https://starvnt-core.vercel.app';
  const configured = type === 'VENDOR' ? process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL : process.env.EXPO_PUBLIC_CUSTOMER_PORTAL_URL;
  try {
    const url = new URL(configured || fallback);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
    url.pathname = '/login'; url.search = ''; url.hash = '';
    return url.href;
  } catch { return `${fallback}/login`; }
}
export function portalMismatchError(type: string) {
  const label = type === 'VENDOR' ? 'vendor' : 'customer';
  const message = `Your account is registered as a ${label}. Please sign in through the ${label} dashboard.`;
  return Object.assign(new Error(message), { data: { error: 'ACCOUNT_TYPE_MISMATCH', accountType: type, message } });
}
