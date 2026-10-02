import * as aura from '../aura/aura.service.js';

export const getSession = async (req, res) =>
  res.json(await aura.getSession(req.externalUser, req.params.sid, { eventId: req.query.eventId }));

export const chat = async (req, res, next) => {
  try {
    const { sessionId, message, eventId, skipTopic, budgetRange, serviceLocation, stream } = req.body || {};
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

      const result = await aura.chat(
        req.externalUser,
        { sessionId, message, eventId, skipTopic, budgetRange, serviceLocation },
        { onChunk, onStatus }
      );

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
        res.end();
      }
    } else {
      res.json(await aura.chat(req.externalUser, { sessionId, message, eventId, skipTopic, budgetRange, serviceLocation }));
    }
  } catch (err) {
    if (res.headersSent && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'CHAT_ERROR' })}\n\n`);
      res.end();
    } else {
      next(err);
    }
  }
};
