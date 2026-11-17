import { Link } from 'react-router-dom';
import { formatINR } from './format.js';
import { bookingLabel } from './transactionState.js';

export default function PostEventRecords({ event, bookings = [], payments = [] }) {
  const verified = payments.filter(payment => payment.status === 'verified');
  const awaiting = payments.filter(payment => ['pending', 'processing', 'paid'].includes(payment.status));
  return <section className="customer-account customer-home-panel space-y-4" aria-labelledby="post-event-records-title">
    <h2 id="post-event-records-title" className="text-lg font-bold">Your event records, kept together</h2>
    <Link className="customer-secondary-action" to={`/customer/events/${event.id}/memory`}>Open your Event Memory →</Link>
    <p className="text-sm">{event.status === 'cancelled' ? 'This event is marked cancelled. Existing records remain available; the event status alone does not confirm a refund.' : 'This event is marked complete. Individual bookings and payments keep their recorded statuses; event completion does not verify a payment or settle a balance.'}</p>
    <div className="grid sm:grid-cols-3 gap-3"><div><p className="text-xs text-muted">Saved bookings</p><p className="font-bold">{bookings.length}</p></div><div><p className="text-xs text-muted">Verified payment records</p><p className="font-bold">{verified.length}</p></div><div><p className="text-xs text-muted">Payment records awaiting verification</p><p className="font-bold">{awaiting.length}</p></div></div>
    {awaiting.length > 0 && <p role="status" className="text-sm text-amber-700">A payment record is awaiting verification. Check the booking and payment screen or open the event conversation for help.</p>}
    {bookings.length > 0 && <ul className="space-y-3">{bookings.map(booking => <li key={booking.id} className="border-t pt-3 text-sm"><p className="font-semibold">{booking.vendorName || 'Recorded vendor'} · {booking.packageName || booking.label || 'Service'}</p><p>{bookingLabel(booking)[0]}{booking.balanceAmount != null ? ` · Recorded balance ${formatINR(booking.balanceAmount)}` : ''}</p></li>)}</ul>}
    <Link className="customer-secondary-action" to={`/customer/events/${event.id}/budget`}>Review saved budget</Link>
    <div className="flex flex-wrap gap-3"><Link className="customer-secondary-action" to={`/customer/events/${event.id}/bookings`}>Review bookings & payments</Link><Link className="customer-secondary-action" to={`/customer/documents?event=${encodeURIComponent(event.id)}`}>Find event documents</Link><Link className="customer-secondary-action" to={`/customer/events/${event.id}/circle`}>Open event conversations</Link><Link className="customer-secondary-action" to={`/customer/events/${event.id}/history`}>View event timeline</Link><Link className="customer-secondary-action" to="/customer/customer-360#feedback">Feedback & service relationships</Link><Link className="customer-secondary-action" to="/customer/me">Manage event history</Link></div>
    <p className="text-xs text-muted">Event files remain in their authorised document or conversation records. Chat attachments and service-completion evidence are not automatically published as a photo gallery.</p>
  </section>;
}
