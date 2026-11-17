import { Router } from 'express';
import { asyncHandler as h } from '../utils/http.js';
import { bookingWorkflow, eventWorkflows, acknowledgeCustomerCompletion, reportCustomerIssue, supplementCustomerIssue, customerReplacementOptions, selectCustomerReplacement } from '../services/bookingWorkflow.service.js';

export const bookingWorkflowRoutes = Router();
const me = req => req.externalUser._id;
bookingWorkflowRoutes.get('/events/:id/workflows', h(async (req, res) => res.json(await eventWorkflows(me(req), req.params.id))));
bookingWorkflowRoutes.get('/bookings/:id/workflow', h(async (req, res) => res.json(await bookingWorkflow(me(req), req.params.id, req.query.eventId))));
bookingWorkflowRoutes.post('/bookings/:id/acknowledge-completion', h(async (req, res) => res.json(await acknowledgeCustomerCompletion(me(req), req.params.id, req.body))));
bookingWorkflowRoutes.post('/bookings/:id/issues', h(async (req, res) => res.status(201).json(await reportCustomerIssue(me(req), req.params.id, req.body))));
bookingWorkflowRoutes.post('/bookings/:id/issues/:caseId/evidence', h(async (req, res) => res.json(await supplementCustomerIssue(me(req), req.params.id, req.params.caseId, req.body))));
bookingWorkflowRoutes.get('/bookings/:id/replacements', h(async (req, res) => res.json(await customerReplacementOptions(me(req), req.params.id, req.query.eventId))));
bookingWorkflowRoutes.post('/bookings/:id/replacements/select', h(async (req, res) => res.json(await selectCustomerReplacement(me(req), req.params.id, req.body))));
