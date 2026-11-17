import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EventCard } from './customerUi.jsx';
import { formatDate } from './format.js';
import { nextHomeAction } from './homeActions.js';

export function WelcomeHome({ firstName }) {
  const [choosing, setChoosing] = useState(false);
  return <section className="customer-home-intro">
    <p className="customer-eyebrow">WELCOME, {firstName}</p>
    <h1>A great event starts with an idea.</h1>
    <p>Start with what you know. Keep your plan, decisions and important details together.</p>
    {!choosing ? <button className="customer-primary-action" onClick={() => setChoosing(true)}>Create an Event</button> : <div className="customer-create-options" role="group" aria-label="Choose how to plan">
      <Link className="customer-primary-action" to="/customer/events/new">Fill in event details</Link>
      <Link className="customer-secondary-action" to="/customer/aura?new=1">Plan with Aura+</Link>
      <button className="customer-secondary-action" onClick={() => setChoosing(false)}>Back</button>
    </div>}
    <p className="customer-home-note">No enquiry, booking or payment is created until you take the relevant action.</p>
  </section>;
}

export function PastEventHome({ event, events }) {
  return <div className="space-y-5 customer-home-overview">
    <section className="customer-home-intro">
      <p className="customer-eyebrow">YOUR EVENT RECORDS</p>
      <h1>{event.title || 'Your past event'}</h1>
      <p>{event.status === 'cancelled' ? 'Cancelled event' : 'Completed event'}{event.eventDate ? ` · ${formatDate(event.eventDate)}` : ''}. Your history and important records are still here.</p>
      <div className="customer-create-options">
        <Link className="customer-primary-action" to={`/customer/events/${event.id}/history`}>Review event history</Link>
        <Link className="customer-secondary-action" to="/customer/documents">Find documents</Link>
        <Link className="customer-secondary-action" to="/customer/events/new">Plan another event</Link>
      </div>
    </section>
    <section className="customer-home-panel"><h2>Your events</h2><div className="grid sm:grid-cols-2 gap-3">{events.map(item => <EventCard key={item.id} event={item} />)}</div></section>
  </div>;
}

export function EventHomeHeader({ firstName, event, attention }) {
  const next = nextHomeAction(event, attention);
  return <section className="customer-home-intro">
    <p className="customer-eyebrow">WELCOME BACK, {firstName}</p>
    <h1>Your next step, made clear.</h1>
    <p>{event.title}{event.eventDate ? ` · ${formatDate(event.eventDate)}` : ' · Date not set'}{event.city ? ` · ${event.city}` : ''}</p>
    <div className="customer-next-action"><h2>{next.title}</h2><p>{next.detail}</p><Link className="customer-primary-action" to={next.to}>{next.label} →</Link></div>
    <div className="customer-record-shortcuts">
      <Link to={`/customer/events/${event.id}/requirements`}>Event plan</Link>
      <Link to={`/customer/events/${event.id}/bookings`}>Bookings & payments</Link>
      <Link to="/customer/documents">Documents</Link>
      <Link to={`/customer/events/${event.id}/circle`}>Conversations</Link>
    </div>
  </section>;
}
