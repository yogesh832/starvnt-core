import * as aura from '../aura/aura.service.js';

export const getSession = async (req, res) =>
  res.json(await aura.getSession(req.externalUser, req.params.sid, { eventId: req.query.eventId }));

export const chat = async (req, res) => {
  const { sessionId, message, eventId, skipTopic, budgetRange } = req.body || {};
  res.json(await aura.chat(req.externalUser, { sessionId, message, eventId, skipTopic, budgetRange }));
};
