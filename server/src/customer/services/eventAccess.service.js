import mongoose from 'mongoose';
import { CustomerEvent } from '../models/index.js';
import { EventCircleMember } from '../models/eventCircle.models.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { forbidden, notFound, conflict } from '../utils/http.js';

const roles = {
  OWNER: ['read', 'message', 'invite', 'upload', 'moderate', 'memory.read', 'memory.edit', 'publish', 'operations'],
  VIEWER: ['read', 'memory.read'],
  PARTICIPANT: ['read', 'message', 'upload', 'memory.read'],
  COORDINATOR: ['read', 'message', 'upload', 'moderate', 'memory.read', 'operations'],
  VENDOR: ['read', 'message', 'upload', 'operations'],
  ADMIN: ['read', 'message', 'upload', 'moderate', 'memory.read', 'operations'],
};

export function listEligibleEventBookings(event) {
  if (event.status === 'cancelled') return Promise.resolve([]);
  return CoreBooking.find({
    customerEvent: event._id, customerId: event.customer,
    bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED',
  }).lean();
}

/** All consumers, including file reads, must re-evaluate access on each request. */
export async function authorizeEventAccess(actor, eventId, { permission = 'read', bookingId = null } = {}) {
  if (!mongoose.isValidObjectId(eventId)) throw notFound('Event not found');
  const event = await CustomerEvent.findById(eventId).lean();
  if (!event || !actor?.id) throw notFound('Event not found');
  const bookings = await listEligibleEventBookings(event);
  let role, memberId = null;
  if (actor.type === 'CUSTOMER' && String(event.customer) === String(actor.id)) role = 'OWNER';
  else if (actor.type === 'ADMIN' && (actor.role === 'SUPER_ADMIN' || actor.permissions?.some(p => ['operations.read', 'operations.manage'].includes(p)))) {
    role = 'ADMIN';
    if (['moderate', 'upload', 'message', 'operations'].includes(permission) && actor.role !== 'SUPER_ADMIN' && !actor.permissions?.includes('operations.manage')) throw forbidden();
  } else if (actor.type === 'VENDOR' && actor.vendorId) {
    if (!bookings.some(b => String(b.vendorId) === String(actor.vendorId))) throw notFound('Event not found');
    role = 'VENDOR';
  } else if (actor.type === 'CUSTOMER') {
    const member = await EventCircleMember.findOne({ event: event._id, user: actor.id, state: 'ACTIVE' }).lean();
    if (!member) throw notFound('Event not found');
    role = member.role;
    memberId = member._id;
  } else throw notFound('Event not found');

  const permissions = role === 'ADMIN' && actor.role !== 'SUPER_ADMIN' && !actor.permissions?.includes('operations.manage')
    ? ['read', 'memory.read'] : roles[role];
  if (!permissions?.includes(permission)) throw forbidden('Your event role does not allow this action.');
  // Owners retain their own records. Collaboration requires a current verified booking.
  if (!bookings.length && !(['read', 'memory.read', 'memory.edit', 'publish'].includes(permission) && role === 'OWNER')) {
    throw conflict('CIRCLE_LOCKED', 'Event Circle becomes available after a verified service booking.');
  }
  const permittedBookings = role === 'VENDOR' ? bookings.filter(b => String(b.vendorId) === String(actor.vendorId)) : bookings;
  if (bookingId && !permittedBookings.some(b => String(b._id) === String(bookingId) || String(b.customerBookingId) === String(bookingId))) {
    throw notFound('Booking not found in your event access.');
  }
  return { event, role, permissions, bookings: permittedBookings, memberId, unlocked: bookings.length > 0 };
}

export function projectEventForActor(access, { now = new Date() } = {}) {
  const { event, role, permissions } = access;
  const result = { id: String(event._id), title: event.title, eventType: event.eventType, eventDate: event.eventDate, city: event.city, status: event.status };
  if (permissions.includes('operations')) {
    const location = role === 'VENDOR' ? access.bookings[0]?.serviceLocation : event.location;
    result.location = {
      venueName: location?.venueName, locality: location?.locality,
      address: location?.address, coordinates: location?.coordinates,
    };
    const eventTime = new Date(`${event.eventDate}T00:00:00+05:30`).getTime();
    const nearEvent = Number.isFinite(eventTime) && now.getTime() >= eventTime - 2 * 86400000;
    if (role === 'OWNER' || role === 'ADMIN' || nearEvent) {
      result.location.arrivalInstructions = location?.landmark;
      result.location.accessInstructions = location?.notes;
    }
  }
  return result;
}
