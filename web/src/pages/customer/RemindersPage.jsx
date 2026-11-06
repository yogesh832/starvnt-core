import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { useCurrentEvent } from './currentEvent.jsx';
import { customerApi, errorText } from './customerApi.js';
import { useLoad } from './customerUi.jsx';
import { CLOSED_EVENTS } from './accountState.js';
import { deviceReminderTime, reminderTimeLabel, reminderStatus, mergeReminders } from './reminderState.js';

export default function RemindersPage() {
  const [params, setParams] = useSearchParams(), { user } = useExternalAuth();
  const eventId = params.get('event') || '', status = params.get('status') || 'active';
  const change = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); };
  return <ReminderManager key={`${user?.id || user?._id}:${eventId}:${status}`} eventId={eventId} status={status} change={change} />;
}
function ReminderManager({ eventId, status, change }) {
  const { events, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useCurrentEvent();
  const source = useLoad(() => customerApi.reminders({ eventId, status, limit: 25 }), [eventId, status]);
  const [moreBusy, setMoreBusy] = useState(false), [moreError, setMoreError] = useState(''), [cancelId, setCancelId] = useState(''), [cancelBusy, setCancelBusy] = useState(false), [cancelError, setCancelError] = useState(''), [actionMessage, setActionMessage] = useState('');
  const version = useRef(0), alive = useRef(true), cancelHeading = useRef(null), cancelTrigger = useRef(null);
  useEffect(() => { if (cancelId) cancelHeading.current?.focus(); }, [cancelId]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; version.current++; }; }, []);
  const refresh = () => { version.current++; setMoreError(''); source.reload(); };
  async function more() {
    if (moreBusy || !source.data?.nextCursor) return;
    const epoch = version.current, cursor = source.data.nextCursor; setMoreBusy(true); setMoreError('');
    try { const next = await customerApi.reminders({ eventId, status, limit: 25, cursor }); if (alive.current && version.current === epoch) source.setData(previous => ({ reminders: mergeReminders(previous.reminders, next.reminders), nextCursor: next.nextCursor })); }
    catch (err) { if (alive.current && version.current === epoch) setMoreError(errorText(err)); }
    finally { if (alive.current) setMoreBusy(false); }
  }
  async function cancel() {
    if (!cancelId || cancelBusy) return;
    setCancelBusy(true); setCancelError('');
    try { await customerApi.cancelReminder(cancelId); if (alive.current) { setCancelId(''); setActionMessage('Reminder cancellation recorded.'); refresh(); requestAnimationFrame(() => document.getElementById('saved-reminders-title')?.focus()); } }
    catch (err) { if (alive.current) { setCancelError(errorText(err)); if (err.status >= 400 && err.status < 500) { setCancelId(''); refresh(); requestAnimationFrame(() => document.getElementById('saved-reminders-title')?.focus()); } } }
    finally { if (alive.current) setCancelBusy(false); }
  }
  const rows = source.data?.reminders || [], cancelling = rows.find(row => row._id === cancelId);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'device local timezone';
  return <div className="customer-account max-w-3xl mx-auto space-y-4"><h1 className="text-xl font-extrabold">My event reminders</h1><p className="text-sm text-muted">One-off reminders you explicitly request. They stop when the linked event is completed or cancelled. Notifications follow your saved preferences; a created notification does not confirm external delivery.</p>
    <div className="flex flex-wrap gap-3"><Link className="customer-secondary-action" to="/customer/me">Account & history</Link><Link className="customer-secondary-action" to="/customer/settings">Notification & privacy preferences</Link>{eventId && <Link className="customer-secondary-action" to={`/customer/events/${eventId}`}>Open linked event</Link>}</div>
    <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Filter reminders by event<select aria-label="Filter reminders by event" className="account-field" value={eventId} onChange={event => change('event', event.target.value)}><option value="">All my events</option>{events.map(event => <option key={event.id} value={event.id}>{event.title || event.eventTypeLabel}</option>)}</select></label><label className="text-sm">Reminder status<select aria-label="Reminder status" className="account-field" value={status} onChange={event => change('status', event.target.value)}><option value="active">Scheduled & processing</option><option value="all">All statuses</option>{['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED', 'SUPPRESSED'].map(value => <option key={value} value={value}>{reminderStatus(value)}</option>)}</select></label></div>
    {eventsError && <p role="alert" className="text-red-600 text-sm">The event list is unavailable. Reminder creation waits for your saved events. <button className="customer-secondary-action" onClick={refreshEvents}>Retry event list</button></p>}
    <ReminderForm key={eventId} eventId={eventId} events={events} disabled={eventsLoading || Boolean(eventsError)} onSaved={refresh} />
    <section className="space-y-3" aria-labelledby="saved-reminders-title"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="saved-reminders-title" tabIndex={-1} className="text-lg font-bold">Saved reminders</h2><button className="customer-secondary-action" disabled={source.loading || cancelBusy} onClick={refresh}>{source.loading ? 'Refreshing…' : 'Refresh reminders'}</button></div><p className="text-xs text-muted">Times below use {zone}. Ordered by scheduled time, earliest first. History reflects saved reminder records, not provider delivery receipts.</p>
      {source.error && <p role="alert" className="text-red-600">Reminders could not be refreshed. {source.data ? 'Showing the last loaded records. ' : ''}{errorText(source.error)}</p>}
      {source.loading && !source.data && <p role="status">Loading saved reminders…</p>}
      {cancelError && <p role="alert" className="text-red-600">{cancelError}</p>}
      {actionMessage && <p role="status" className="text-sm">{actionMessage}</p>}
      {!source.loading && !source.error && !rows.length && <div className="customer-home-panel">No reminders match this view.</div>}
      {rows.map(row => <article className="customer-home-panel space-y-3" key={row._id}><h3 className="font-bold">{row.title}</h3><p className="text-sm">{row.eventTitle || 'Linked event unavailable'} · {reminderStatus(row.status)}</p><p className="text-sm">{reminderTimeLabel(row.dueAt)}</p><div className="flex flex-wrap gap-3">{row.eventTitle && <Link className="customer-secondary-action" to={`/customer/events/${row.event}`}>Open event</Link>}{row.status === 'PENDING' && <button className="customer-secondary-action" disabled={source.loading || cancelBusy} onClick={event => { cancelTrigger.current = event.currentTarget; setCancelError(''); setActionMessage(''); setCancelId(row._id); }}>Cancel reminder</button>}</div>{row.status === 'PROCESSING' && <p className="text-xs text-muted">Processing has started; cancellation is unavailable.</p>}</article>)}
      {cancelling && <section className="customer-home-panel space-y-3" aria-label="Confirm reminder cancellation"><h3 ref={cancelHeading} tabIndex={-1} className="font-bold">Cancel this reminder?</h3><p>{cancelling.title} · {reminderTimeLabel(cancelling.dueAt)}</p><div className="flex flex-wrap gap-3"><button className="customer-primary-action" disabled={cancelBusy} onClick={cancel}>{cancelBusy ? 'Cancelling…' : 'Confirm cancellation'}</button><button className="customer-secondary-action" disabled={cancelBusy} onClick={() => { setCancelId(''); requestAnimationFrame(() => cancelTrigger.current?.isConnected && cancelTrigger.current.focus()); }}>Keep reminder</button></div></section>}
      {moreError && <p role="alert" className="text-red-600">{moreError}</p>}{source.data?.nextCursor && <button className="customer-secondary-action" disabled={moreBusy || source.loading || cancelBusy} onClick={more}>{moreBusy ? 'Loading…' : 'Load more reminders'}</button>}
    </section>
  </div>;
}
function ReminderForm({ eventId, events, disabled, onSaved }) {
  const [selected, setSelected] = useState(eventId), [title, setTitle] = useState(''), [when, setWhen] = useState(''), [review, setReview] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(null);
  const command = useRef(null), heading = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (review) heading.current?.focus(); }, [review]);
  const event = events.find(event => event.id === selected), at = deviceReminderTime(when), closed = event && CLOSED_EVENTS.includes(event.status), zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'device local timezone';
  function prepare(e) { e.preventDefault(); setError(''); setSaved(null); if (!event || closed || !title.trim() || !at || new Date(at) <= new Date()) { setError('Choose an active event, a title and a valid future time in your device timezone.'); return; } setReview(true); }
  async function save() {
    if (busy) return;
    if (!command.current) { if (!at || new Date(at) <= new Date()) { setReview(false); setError('Choose a future time.'); return; } command.current = { eventId: selected, title: title.trim(), dueAt: at, idempotencyKey: crypto.randomUUID() }; }
    setBusy(true); setError('');
    try {
      const response = await customerApi.createReminder(command.current);
      if (!alive.current) return;
      setSaved({ ...response.reminder, eventTitle: event?.title }); command.current = null; setUncertain(false); setTitle(''); setWhen(''); setReview(false); onSaved();
    } catch (err) {
      if (!alive.current) return;
      const rejected = err.status >= 400 && err.status < 500;
      if (rejected) { command.current = null; setUncertain(false); setReview(false); } else setUncertain(true);
      setError(errorText(err, 'The save could not be confirmed. Retry the same request before creating another reminder.'));
    } finally { if (alive.current) setBusy(false); }
  }
  return <section className="customer-home-panel space-y-3"><h2 className="font-bold">Create a one-off reminder</h2><p className="text-xs text-muted">Enter the time in your device timezone: {zone}. Review the resolved time and offset before saving.</p><form onSubmit={prepare} className="space-y-3"><fieldset disabled={disabled || busy || uncertain || review} className="space-y-3"><label className="block text-sm">Event for reminder<select aria-label="Event for reminder" className="account-field" required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose an active event</option>{events.map(event => <option key={event.id} value={event.id} disabled={CLOSED_EVENTS.includes(event.status)}>{event.title || event.eventTypeLabel}{CLOSED_EVENTS.includes(event.status) ? ` · ${event.status}` : ''}</option>)}</select></label><label className="block text-sm">Reminder title<input className="account-field" required maxLength={140} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="block text-sm">When (device timezone)<input className="account-field" type="datetime-local" required value={when} onChange={e => setWhen(e.target.value)} /></label></fieldset>{closed && <p className="text-sm">This event is {event.status}. Choose an active event to request a reminder.</p>}{!review && <button className="customer-secondary-action" disabled={disabled || busy || closed || !event}>Review reminder</button>}</form>
    {review && <section aria-label="Review reminder" className="border-t pt-3 space-y-3"><h3 ref={heading} tabIndex={-1} className="font-bold">Review your reminder</h3><p>{event?.title} · {title.trim()}</p><p>{reminderTimeLabel(command.current?.dueAt || at)}</p><p className="text-xs">This schedules one reminder. Notification channels and quiet hours use your saved preferences.</p><div className="flex flex-wrap gap-3"><button className="customer-primary-action" disabled={busy || disabled} onClick={save}>{busy ? 'Saving…' : uncertain ? 'Retry same save' : 'Confirm reminder'}</button><button className="customer-secondary-action" disabled={busy || uncertain} onClick={() => setReview(false)}>Edit reminder</button></div></section>}
    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}{uncertain && <p role="status" className="text-sm">The save acknowledgement is uncertain. Retry uses the same request key.</p>}{saved && <div role="status" className="space-y-2 text-sm"><p>Reminder saved for {saved.eventTitle || 'your event'} · {reminderTimeLabel(saved.dueAt)} · {reminderStatus(saved.status)}</p><Link className="customer-secondary-action" to={`/customer/reminders?event=${encodeURIComponent(saved.event)}&status=all`}>View saved reminder history</Link></div>}
  </section>;
}
