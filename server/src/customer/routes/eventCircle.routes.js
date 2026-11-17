import { Router } from 'express';
import { asyncHandler as h } from '../utils/http.js';
import { collaboration, inviteMember, invitations, acceptInvitation, revokeMember, circleMessages, customerActor } from '../services/eventCircle.service.js';

export const eventCircleRoutes = Router();
const actor = req => customerActor(req.externalUser._id);
eventCircleRoutes.get('/circle-invitations', h(async (req, res) => res.json(await invitations(actor(req)))));
eventCircleRoutes.post('/circle-invitations/:invitationId/accept', h(async (req, res) => res.json(await acceptInvitation(actor(req), req.params.invitationId, req.body || {}))));
eventCircleRoutes.get('/events/:id/collaboration', h(async (req, res) => res.json(await collaboration(actor(req), req.params.id))));
eventCircleRoutes.post('/events/:id/circle/members', h(async (req, res) => res.status(201).json(await inviteMember(actor(req), req.params.id, req.body || {}))));
eventCircleRoutes.post('/events/:id/circle/members/:memberId/revoke', h(async (req, res) => res.json(await revokeMember(actor(req), req.params.id, req.params.memberId, req.body || {}))));
eventCircleRoutes.get('/events/:id/circle/messages', h(async (req, res) => res.json(await circleMessages(actor(req), req.params.id, req.query))));
eventCircleRoutes.post('/events/:id/circle/messages', h(async (req, res) => res.status(201).json(await circleMessages(actor(req), req.params.id, req.body || {}, { post: true }))));
