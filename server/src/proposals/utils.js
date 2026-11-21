import crypto from 'node:crypto';

/** Deterministic JSON: object keys sorted, ObjectIds/Dates normalized via toJSON. */
export function canonical(value) {
  const plain = JSON.parse(JSON.stringify(value ?? null));
  const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
    : v;
  return JSON.stringify(sort(plain));
}

export function hashOf(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

export function proposalError(code, message, statusCode = 409, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  err.expose = true; // our own message, safe to show even for 5xx (e.g. AI provider down)
  if (details) err.details = details;
  return err;
}

export const rupees = (n) => Math.round(Number(n) || 0);

/** Express wrapper that keeps gate `details` (reasons) in the response body. */
export function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err?.statusCode && (err.statusCode < 500 || err.expose)) {
        return res.status(err.statusCode).json({ error: err.code || 'INVALID_REQUEST', message: err.message, ...(err.details || {}) });
      }
      next(err);
    }
  };
}
