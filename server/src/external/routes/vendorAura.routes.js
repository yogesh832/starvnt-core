import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { chat, getSession } from '../aura/vendorAura.service.js';

/**
 * Vendor Aura+ (mounted inside vendor.routes.js after resolveVendorContext,
 * so req.externalUser and req.vendor are already set).
 */
const router = Router();

const auraLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.externalUser._id),
  message: { error: 'RATE_LIMITED' },
});

function sendError(res, next, err) {
  if (err?.status && err?.error) return res.status(err.status).json({ error: err.error });
  return next(err);
}

router.get('/sessions/:sid', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await getSession({ vendor: req.vendor, sessionId: req.params.sid })) });
  } catch (err) {
    sendError(res, next, err);
  }
});

router.post('/chat', auraLimiter, async (req, res, next) => {
  try {
    const { sessionId, message, page, confirm } = req.body || {};
    res.json({ ok: true, ...(await chat({ vendor: req.vendor, user: req.externalUser, sessionId, message, page, confirm })) });
  } catch (err) {
    sendError(res, next, err);
  }
});

export default router;
