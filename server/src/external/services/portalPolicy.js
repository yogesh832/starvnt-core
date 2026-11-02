import { config } from '../../config.js';

const surfaces = ['CUSTOMER', 'VENDOR'];
export function requestedSurface(req, allowBody = true) {
  // The browser's portal takes precedence over a role query/body override.
  try {
    const host = new URL(req.get('origin')).hostname;
    if (/^(customer|customers)\./i.test(host)) return 'CUSTOMER';
    if (/^(vendor|partner)\./i.test(host)) return 'VENDOR';
    for (const type of surfaces) {
      if (new URL(config[`${type.toLowerCase()}PortalUrl`]).hostname === host) return type;
    }
  } catch { /* Native/local clients declare their requested surface explicitly. */ }
  const header = req.get('x-starvnt-surface');
  const value = header || (allowBody ? req.body?.accountType || req.body?.targetSurface : null);
  return surfaces.includes(value) ? value : null;
}

export function portalMismatch(accountType) {
  const label = accountType === 'VENDOR' ? 'vendor' : 'customer';
  const configured = config[`${label}PortalUrl`];
  let url;
  try {
    url = new URL(configured);
    if (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) throw new Error();
  } catch { url = new URL(`https://${label}.starvnt.com`); }
  url.pathname = '/login'; url.search = ''; url.hash = '';
  return {
    error: 'ACCOUNT_TYPE_MISMATCH', accountType,
    message: `Your account is registered as a ${label}. Please sign in through the ${label} dashboard.`,
    loginUrl: url.href,
  };
}

export function rejectPortalMismatch(req, res, user, allowBody = true) {
  const requested = requestedSurface(req, allowBody);
  if (!requested || requested === user.accountType) return false;
  res.status(403).json(portalMismatch(user.accountType));
  return true;
}
