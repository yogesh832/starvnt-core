import { useState } from 'react';
import { Link } from 'react-router-dom';
import useEventArchive from './useEventArchive.js';
import { accountHistory, CLOSED_EVENTS, isEventArchived } from './accountState.js';
import { formatDate } from './format.js';

export default function AccountEventHistory({ events }) {
  const { archivedIds, setArchived, error } = useEventArchive();
  const [view, setView] = useState('current'), [status, setStatus] = useState(''), [search, setSearch] = useState('');
  const rows = accountHistory(events, { archivedIds, view, status, search });
  return <section className="space-y-4" aria-labelledby="account-history-title"><h2 id="account-history-title" tabIndex={-1} className="text-lg font-bold">Event history</h2>
    <p className="text-sm text-muted">Archive hides completed or cancelled events from the main list on this browser. It keeps their status, bookings, payments and documents. This preference does not sync across devices.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">History view<select aria-label="History view" className="account-field" value={view} onChange={event => setView(event.target.value)}><option value="current">Main list</option><option value="archived">Archived on this browser</option><option value="all">All records</option></select></label><label className="text-sm">Event status<select aria-label="Event status" className="account-field" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['draft', 'planning', 'booked', 'in_progress', 'completed', 'cancelled'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Search event history<input className="account-field" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {!rows.length ? <div className="customer-home-panel"><p>No events match this view.</p><Link className="customer-secondary-action mt-3" to="/customer/events/new">Plan an event</Link></div> : rows.map(event => <article key={event.id} className="customer-home-panel space-y-3"><h3 className="font-bold">{event.title || event.eventTypeLabel || 'Event'}</h3><p className="text-sm">{event.eventDate ? formatDate(event.eventDate) : 'Date not set'} · {event.city || 'Location not set'} · {event.status}{isEventArchived(event, archivedIds) ? ' · Archived on this browser' : ''}</p><div className="flex flex-wrap gap-3"><Link className="customer-secondary-action" to={`/customer/events/${event.id}`}>{event.status === 'completed' ? 'Open event records' : 'Open event'}</Link><Link className="customer-secondary-action" to={`/customer/documents?event=${encodeURIComponent(event.id)}`}>Documents</Link><Link className="customer-secondary-action" to={`/customer/events/${event.id}/circle`}>Conversations</Link>{CLOSED_EVENTS.includes(event.status) && <button className="customer-secondary-action" onClick={() => { setArchived(event, !isEventArchived(event, archivedIds)); requestAnimationFrame(() => document.getElementById('account-history-title')?.focus()); }}>{isEventArchived(event, archivedIds) ? 'Restore to main list' : 'Archive on this browser'}</button>}</div></article>)}
  </section>;
}
