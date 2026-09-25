import express, { Router } from 'express';
import { requireCustomer } from '../middleware/requireCustomer.js';
import { requireInternal } from '../middleware/requireInternal.js';
import { asyncHandler as h, jsonErrorHandler } from '../utils/http.js';
import * as c from '../controllers/customer.controller.js';
import * as a from '../controllers/aura.controller.js';
import * as i from '../controllers/internal.controller.js';

/** /api/customer/* — Customer App API. Every route is customer-authenticated. */
export const customerRouter = Router();
customerRouter.use(requireCustomer);
customerRouter.get('/profile', h(c.getProfile));
customerRouter.patch('/profile', h(c.patchProfile));
customerRouter.get('/home', h(c.home));
customerRouter.get('/plan-options', h(c.planOptions));
customerRouter.get('/updates', h(c.updates));
customerRouter.get('/notifications', h(c.notifications));
customerRouter.post('/notifications/read-all', h(c.readAll));

customerRouter.get('/events', h(c.listEvents));
customerRouter.post('/events', h(c.createEvent));
customerRouter.get('/events/:id', h(c.getEvent));
customerRouter.patch('/events/:id', h(c.patchEvent));
customerRouter.post('/events/:id/confirm', h(c.confirmEvent));
customerRouter.get('/events/:id/dashboard', h(c.dashboard));
customerRouter.get('/events/:id/history', h(c.history));

customerRouter.get('/events/:id/requirements', h(c.listRequirements));
customerRouter.patch('/events/:id/requirements/:category', h(c.patchRequirement));
customerRouter.post('/events/:id/requirements/:category/select', h(c.selectOption));

customerRouter.get('/events/:id/services', h(c.services));
customerRouter.get('/events/:id/services/compare', h(c.compare));
customerRouter.get('/events/:id/services/:serviceId', h(c.serviceDetail));

customerRouter.get('/events/:id/quotes', h(c.listQuotes));
customerRouter.post('/events/:id/quotes', h(c.createQuote));
customerRouter.get('/quotes/:quoteId', h(c.getQuote));
customerRouter.post('/quotes/:quoteId/accept', h(c.acceptQuote));

customerRouter.get('/events/:id/reservations', h(c.bookings));
customerRouter.get('/events/:id/bookings', h(c.bookings));
customerRouter.post('/events/:id/reservations/:rid/pay', h(c.pay));
customerRouter.post('/events/:id/payments/:pid/checkout-complete', h(c.checkoutComplete));
customerRouter.get('/events/:id/event-day', h(c.eventDay));

customerRouter.get('/events/:id/circle', h(c.circle));
customerRouter.get('/events/:id/messages', h(c.listMessages));
customerRouter.post('/events/:id/messages', h(c.postMessage));
customerRouter.use(jsonErrorHandler);

/** /api/aura/* — Aura+ chat. */
export const auraRouter = Router();
auraRouter.use(requireCustomer);
auraRouter.get('/sessions/:sid', h(a.getSession));
auraRouter.post('/chat', h(a.chat));
auraRouter.use(jsonErrorHandler);

/** /api/internal/* — ops + admin simulation, x-internal-key only. */
export const internalRouter = Router();
internalRouter.use(requireInternal);
internalRouter.post('/ops/payments/:id/verify', h(i.verifyPayment));
internalRouter.post('/ops/events/:id/messages', h(i.message));
internalRouter.post('/ops/bookings/:id/execution', h(i.execution));
internalRouter.post('/ops/events/:id/complete', h(i.complete));
internalRouter.post('/admin/simulate-vendor-cancellation', h(i.simulateVendorCancellation));
internalRouter.post('/admin/reset', h(i.reset));
internalRouter.use(jsonErrorHandler);

/**
 * /api/webhooks/* — mounted BEFORE express.json(): the signature is
 * computed over the raw body.
 */
export const webhookRouter = Router();
webhookRouter.post('/razorpay', express.raw({ type: '*/*', limit: '1mb' }), h(i.razorpayWebhook));
webhookRouter.use(jsonErrorHandler);
