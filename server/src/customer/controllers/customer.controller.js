import * as events from '../services/events.service.js';
import * as profile from '../services/profile.service.js';
import * as decision from '../services/decision.service.js';
import * as commerce from '../services/commerce.service.js';
import * as circleSvc from '../services/circle.service.js';

const me = (req) => req.externalUser._id;

export const getProfile = async (req, res) => res.json({ profile: await profile.getProfile(me(req)) });
export const patchProfile = async (req, res) => res.json({ profile: await profile.updateProfile(me(req), req.body) });

export const planOptions = async (req, res) => res.json(events.planOptions(req.query.eventType));

export const listEvents = async (req, res) => res.json({ events: await events.listEvents(me(req)) });
export const getEvent = async (req, res) => res.json(await events.eventDetail(me(req), req.params.id));
export const patchEvent = async (req, res) => {
  await events.patchEvent(me(req), req.params.id, req.body, { actorType: 'customer', actorId: me(req) });
  res.json(await events.eventDetail(me(req), req.params.id));
};
export const confirmEvent = async (req, res) => res.json(await events.confirmEvent(me(req), req.params.id));

export const home = async (req, res) => res.json(await events.home(me(req)));
export const dashboard = async (req, res) => res.json(await events.dashboard(me(req), req.params.id));
export const history = async (req, res) => res.json(await events.eventHistory(me(req), req.params.id));
export const services = async (req, res) =>
  res.json(
    req.query.category
      ? await events.serviceOptions(me(req), req.params.id, req.query.category)
      : await events.serviceCategories(me(req), req.params.id)
  );
export const serviceDetail = async (req, res) => res.json(await events.serviceDetail(me(req), req.params.id, req.params.serviceId));
export const compare = async (req, res) => res.json(await events.compareServices(me(req), req.params.id, req.query.ids));
export const selectOption = async (req, res) => {
  if (!req.body || !('optionId' in req.body)) {
    return res.status(400).json({ error: 'OPTION_REQUIRED', message: 'Choose an option (or null to clear)' });
  }
  const requirement = await decision.selectOption(me(req), req.params.id, req.params.category, req.body.optionId);
  res.json({ requirement });
};
export const listQuotes = async (req, res) => res.json(await decision.listQuotes(me(req), req.params.id));
export const createQuote = async (req, res) => res.status(201).json({ quote: await decision.createQuote(me(req), req.params.id) });
export const getQuote = async (req, res) => res.json({ quote: await decision.getQuote(me(req), req.params.quoteId) });
export const createEvent = async (req, res) => res.status(201).json(await events.createManualEvent(me(req), req.body));
export const acceptQuote = async (req, res) => res.json(await commerce.acceptQuote(me(req), req.params.quoteId));
export const bookings = async (req, res) => res.json(await commerce.bookingsView(me(req), req.params.id));
export const pay = async (req, res) => res.json(await commerce.payReservation(req.externalUser, req.params.id, req.params.rid));
export const checkoutComplete = async (req, res) =>
  res.json(await commerce.checkoutComplete(me(req), req.params.id, req.params.pid, req.body));
export const eventDay = async (req, res) => res.json(await events.eventDay(me(req), req.params.id));
export const circle = async (req, res) => res.json(await circleSvc.circle(me(req), req.params.id));
export const listMessages = async (req, res) =>
  res.json(await circleSvc.listMessages(me(req), req.params.id, { bookingId: req.query.bookingId, requirementId: req.query.requirementId }));
export const postMessage = async (req, res) => res.status(201).json(await circleSvc.postMessage(me(req), req.params.id, req.body));
export const updates = async (req, res) => res.json(await circleSvc.updates(me(req)));
export const notifications = async (req, res) => {
  const u = await circleSvc.updates(me(req));
  res.json({ notifications: u.notifications, unread: u.unread });
};
export const readAll = async (req, res) => res.json(await circleSvc.readAll(me(req)));
export const listRequirements = async (req, res) => res.json(await events.requirementsDetail(me(req), req.params.id));
export const patchRequirement = async (req, res) => {
  const requirement = await events.setRequirement(me(req), req.params.id, req.params.category, req.body);
  res.json({ requirement, ...(await events.requirementsDetail(me(req), req.params.id)) });
};
