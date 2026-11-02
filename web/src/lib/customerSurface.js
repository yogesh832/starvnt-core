/** Customer OS entry policy. Vendor OS remains in main and shared development. */
export const CUSTOMER_SURFACE = 'CUSTOMER';
export const customerPayload = (payload = {}) => ({ ...payload, accountType: CUSTOMER_SURFACE });
export function customerNextPath(path) {
  return typeof path === 'string' && /^\/customer(?:\/|\?|$)/.test(path) && !path.includes('\\') ? path : '/customer';
}
export async function acceptCustomerSession(data, api, isCurrent = () => true) {
  if (!data?.user || !isCurrent()) return null;
  try {
    if (data.accessToken) api.setToken(data.accessToken);
    if (data.user.accountType === 'VENDOR') {
      data = await api.call('/auth/switch-surface', { method: 'POST', body: { targetSurface: CUSTOMER_SURFACE } });
      if (!isCurrent()) return null;
      if (data?.accessToken) api.setToken(data.accessToken);
    }
    if (data?.user?.accountType !== CUSTOMER_SURFACE) throw new Error('Please sign in to your customer workspace.');
    return data.user;
  } catch (error) {
    if (isCurrent()) api.setToken(null);
    throw error;
  }
}
