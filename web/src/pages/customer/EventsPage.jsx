import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useCurrentEvent } from './currentEvent.jsx';
import { customerApi, errorText } from './customerApi.js';
import { CardSkeleton, Empty, EventCard, useLoad } from './customerUi.jsx';

function EventActions({ event, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const escape = e => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={ref} className="absolute top-2 right-2">
    <button type="button" aria-label={`Actions for ${event.title || 'event'}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)} className="w-9 h-9 rounded-xl text-xl grid place-items-center text-muted dark:text-slate-300 hover:bg-lavender dark:hover:bg-white/10">⋮</button>
    {open && <div role="menu" aria-label="Event actions" className="absolute top-10 right-0 z-30 w-56 p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2235] shadow-xl text-xs">
      <Link role="menuitem" to={`/customer/events/${event.id}`} className="block rounded-xl px-3 py-2.5 text-navy dark:text-white hover:bg-lavender dark:hover:bg-white/10">View event</Link>
      {['draft', 'planning'].includes(event.status) && <Link role="menuitem" to={`/customer/events/${event.id}?edit=1`} className="block rounded-xl px-3 py-2.5 text-navy dark:text-white hover:bg-lavender dark:hover:bg-white/10">Edit event</Link>}
      <button role="menuitem" type="button" disabled={event.status !== 'draft'} onClick={() => { setOpen(false); onDelete(event, ref.current?.querySelector('button')); }} className="w-full text-left rounded-xl px-3 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">Delete event</button>
      {event.status !== 'draft' && <p className="px-3 pb-2 text-[10px] text-muted">Only unconfirmed drafts can be deleted.</p>}
    </div>}
  </div>;
}

export default function EventsPage() {
  const { data, error, loading, setData } = useLoad(() => customerApi.events(), []);
  const { refresh, current: selectedEvent, setCurrent } = useCurrentEvent();
  const [deleting, setDeleting] = useState(null), [busy, setBusy] = useState(false), [deleteError, setDeleteError] = useState('');
  const deleteTrigger = useRef(null);
  const askDelete = (event, trigger) => { deleteTrigger.current = trigger; setDeleteError(''); setDeleting(event); };
  const keepEvent = () => { setDeleting(null); requestAnimationFrame(() => deleteTrigger.current?.focus()); };
  async function removeEvent() {
    if (!deleting || busy) return;
    setBusy(true); setDeleteError('');
    try {
      await customerApi.deleteEvent(deleting.id);
      setData({ ...data, events: events.filter(event => event.id !== deleting.id) });
      if (selectedEvent?.id === deleting.id) setCurrent(null);
      setDeleting(null);
      requestAnimationFrame(() => document.getElementById('events-title')?.focus());
      await refresh();
    } catch (error) { setDeleteError(errorText(error, 'Could not delete this event. Please try again.')); }
    finally { setBusy(false); }
  }
  const events = data?.events || [];
  const current = events.filter((e) => !['completed', 'cancelled'].includes(e.status));
  const past = events.filter((e) => ['completed', 'cancelled'].includes(e.status));

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 id="events-title" tabIndex={-1} className="text-xl font-extrabold text-navy">Events</h1>
          <p className="text-xs text-muted mt-0.5">Each event has its own plan.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Link to="/customer/events/new" className="rounded-xl border border-primary/40 text-primary text-xs font-bold px-4 py-2.5 hover:bg-primary-soft transition">Fill details manually</Link>
          <Link to="/customer/aura?new=1" className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 hover:bg-primary-dark transition">+ Create new event</Link>
        </div>
      </div>

      {loading && <CardSkeleton count={2} />}
      {error && <div className="text-xs text-red-500">{errorText(error, "Couldn't load your events.")}</div>}
      {!loading && !error && events.length === 0 && (
        <Empty title="No events yet">Start a conversation with Aura+ and your first event will appear here.</Empty>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {current.map((e) => <EventCard key={e.id} event={e} actions={<EventActions event={e} onDelete={askDelete} />} />)}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="text-sm font-extrabold text-navy pt-2">Past events</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {past.map((e) => <EventCard key={e.id} event={e} actions={<EventActions event={e} onDelete={askDelete} />} />)}
          </div>
        </>
      )}
      {deleting && <div onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); keepEvent(); }
        if (event.key === 'Tab') {
          const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
          if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
          else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
        }
      }} className="fixed inset-0 z-[70] bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title" aria-describedby="delete-event-description" className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1e2235] p-5 shadow-2xl">
          <h2 id="delete-event-title" className="text-lg font-bold text-navy dark:text-white">Delete {deleting.title || 'this event'}?</h2>
          <p id="delete-event-description" className="text-sm text-muted mt-2">This permanently deletes the draft, its plan and linked Aura conversations. This cannot be undone.</p>
          {deleteError && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <button autoFocus type="button" disabled={busy} onClick={keepEvent} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-navy dark:text-white disabled:opacity-50">Keep event</button>
            <button type="button" disabled={busy} onClick={removeEvent} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50">{busy ? 'Deleting…' : 'Delete permanently'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
