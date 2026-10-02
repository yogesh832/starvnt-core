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
    const { sessionId, message, page, confirm, stream } = req.body || {};
    const wantsStream = Boolean(stream || req.query.stream === '1' || req.headers.accept?.includes('text/event-stream'));

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const onChunk = (chunkText) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunkText })}\n\n`);
        }
      };

      const onStatus = (stage) => {
        if (!res.writableEnded) {
          const messages = {
            context_retrieval: 'Getting the right information for you...',
            reasoning: 'Thinking...',
            generating: 'Putting this together...',
          };
          res.write(`data: ${JSON.stringify({ type: 'status', stage, message: messages[stage] || 'Thinking...' })}\n\n`);
        }
      };

      const result = await chat(
        { vendor: req.vendor, user: req.externalUser, sessionId, message, page, confirm },
        { onChunk, onStatus }
      );

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done', ok: true, ...result })}\n\n`);
        res.end();
      }
    } else {
      res.json({ ok: true, ...(await chat({ vendor: req.vendor, user: req.externalUser, sessionId, message, page, confirm })) });
    }
  } catch (err) {
    if (res.headersSent && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.error || err.message || 'CHAT_ERROR' })}\n\n`);
      res.end();
    } else {
      sendError(res, next, err);
    }
  }
});

export default router;
