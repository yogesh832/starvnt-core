export const PORTAL_SURFACE = 'VENDOR' as const;
export function portalLoginUrl(type: string) {
  const label = type === 'VENDOR' ? 'vendor' : 'customer';
  const configured = type === 'VENDOR' ? process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL : process.env.EXPO_PUBLIC_CUSTOMER_PORTAL_URL;
  try {
    const url = new URL(configured || `https://${label}.starvnt.com`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
    url.pathname = '/login'; url.search = ''; url.hash = '';
    return url.href;
  } catch { return `https://${label}.starvnt.com/login`; }
}
export function portalMismatchError(type: string) {
  const label = type === 'VENDOR' ? 'vendor' : 'customer';
  const message = `Your account is registered as a ${label}. Please sign in through the ${label} dashboard.`;
  return Object.assign(new Error(message), { data: { error: 'ACCOUNT_TYPE_MISMATCH', accountType: type, message } });
}
