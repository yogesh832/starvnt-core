import { externalConn } from '../../db/index.js';
import { CustomerEvent, EventRequirement, EventHistory, AuraContext, AuraSession, AuraMessage, CustomerQuote, Reservation, Payment, Booking, EventMessage, CustomerNotification, OptionAvailability } from '../models/index.js';
import { Opportunity } from '../../external/models/Opportunity.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { conflict, notFound } from '../utils/http.js';

/** Delete an uncommitted draft atomically. Commerce and confirmed events stay intact. */
export async function deleteDraftEvent(customerId, eventId) {
  return externalConn.transaction(async session => {
    const filter = { _id: eventId, customer: customerId };
    const event = await CustomerEvent.findOne(filter).session(session).lean();
    if (!event) throw notFound('Event not found');
    if (event.status !== 'draft') throw conflict('EVENT_DELETE_LOCKED', 'Only unconfirmed drafts can be deleted. Confirmed events must be managed through their booking and payment workflows.');
    for (const [model, query] of [
      [Booking, { event: event._id }], [Payment, { event: event._id }],
      [Reservation, { event: event._id }], [CustomerQuote, { event: event._id }],
      [Opportunity, { customerEvent: event._id }], [OptionAvailability, { event: event._id, status: 'booked' }],
    ]) {
      if (await model.exists(query).session(session)) throw conflict('EVENT_HAS_COMMITMENTS', 'This event has vendor requests, quotes or payment activity and cannot be deleted.');
    }
    // Core has a separate connection; never delete or change its contracts here.
    if (await CoreBooking.exists({ customerId, customerEvent: event._id })) throw conflict('EVENT_HAS_COMMITMENTS', 'This event has a booking contract and cannot be deleted.');
    const conversations = await AuraSession.find({ customer: customerId, event: event._id }).session(session).lean();
    const sessionIds = conversations.map(row => row._id);
    const deleted = await CustomerEvent.deleteOne({ ...filter, status: 'draft' }).session(session);
    if (deleted.deletedCount !== 1) throw conflict('EVENT_CHANGED', 'The event changed. Refresh and try again.');
    for (const model of [EventRequirement, EventHistory, AuraContext, EventMessage, CustomerNotification, OptionAvailability]) {
      await model.deleteMany({ event: event._id }).session(session);
    }
    if (sessionIds.length) {
      await AuraMessage.deleteMany({ session: { $in: sessionIds } }).session(session);
      await AuraSession.deleteMany({ customer: customerId, _id: { $in: sessionIds } }).session(session);
    }
    await AuraSession.updateMany({ customer: customerId, previousEvent: event._id }, { $set: { previousEvent: null } }).session(session);
    await AuraSession.updateMany({ customer: customerId, switchChoices: event._id }, { $pull: { switchChoices: event._id } }).session(session);
    return { ok: true, deletedEventId: String(event._id) };
  });
}
