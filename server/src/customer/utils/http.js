/**
 * HTTP helpers for the customer module.
 * Services throw HttpError; the module's error handler turns it into JSON.
 */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (code, message, extra) => new HttpError(400, code, message, extra);
export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code, message, extra) => new HttpError(409, code, message, extra);
export const forbidden = (message = 'Forbidden') => new HttpError(403, 'FORBIDDEN', message);

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
export function jsonErrorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Not found' });
  }
  console.error('[customer]', err);
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
}
