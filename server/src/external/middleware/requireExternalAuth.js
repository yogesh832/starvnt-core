import { verifyExternalAccessToken } from '../utils/tokens.js';
import { ExternalUser } from '../models/ExternalUser.js';
import { ExternalSession } from '../models/ExternalSession.js';

/**
 * Authentication gate for the EXTERNAL identity domain.
 * Rejects any token not signed by the external domain secret with the
 * external audience — including internal Admin tokens (401).
 */
export async function requireExternalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    let payload;
    try {
      payload = verifyExternalAccessToken(token);
    } catch {
      // Wrong secret, wrong audience, expired, admin token, etc. — all 401.
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    const [user, session] = await Promise.all([
      ExternalUser.findById(payload.sub),
      ExternalSession.findById(payload.sid),
    ]);

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED_OR_MISSING' });
    }
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'SESSION_REVOKED' });
    }

    req.externalUser = user;
    req.externalSession = session;
    next();
  } catch (err) {
    next(err);
  }
}

/** Surface-level authorization: Customer App vs Vendor OS. */
export function requireAccountType(...types) {
  return (req, res, next) => {
    if (!req.externalUser || !types.includes(req.externalUser.accountType)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  };
}
