import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';

export default function AuraEventMenu({ activeId, busy, onSwitch }) {
  const [open, setOpen] = useState(false), [events, setEvents] = useState([]), [query, setQuery] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const trigger = useRef(null), panel = useRef(null), search = useRef(null);
  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError(''); search.current?.focus();
    customerApi.events().then(data => { if (active) setEvents(data.events || []); }).catch(e => { if (active) setError(errorText(e, "Couldn't load your events.")); }).finally(() => { if (active) setLoading(false); });
    const key = event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
      if (event.key === 'Tab') {
        const focusable = panel.current?.querySelectorAll('button:not(:disabled), input');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { active = false; document.removeEventListener('keydown', key); trigger.current?.focus(); };
  }, [open, attempt]);
  const filtered = events.filter(event => `${event.title} ${event.city || ''} ${event.eventType}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button ref={trigger} type="button" aria-label="Aura event menu" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setQuery(''); setOpen(true); }} className="w-10 h-10 rounded-xl grid place-items-center text-navy dark:text-white hover:bg-lavender dark:hover:bg-white/10"><Icon name="menu" size={23} /></button>
    {open && <div className="fixed inset-0 z-[99990] flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={() => setOpen(false)}>
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="aura-event-menu-title" className="w-full max-w-md rounded-3xl bg-white dark:bg-[#161926] text-navy dark:text-slate-100 p-5 shadow-xl space-y-3" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 id="aura-event-menu-title" className="font-bold">Switch event</h2><button type="button" aria-label="Close event menu" onClick={() => setOpen(false)} className="h-11 w-11 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><Icon name="close" size={20} /></button></div>
        <p className="text-xs text-muted dark:text-slate-400">Say “switch to my wedding” or choose below. Your event details stay saved.</p>
        <input ref={search} aria-label="Find an event" placeholder="Search by name or city" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent p-3 text-sm" />
        {loading && <p role="status" className="text-xs text-muted">Loading your events…</p>}
        {error && <div role="alert" className="text-xs text-rose-500">{error}<button type="button" onClick={() => setAttempt(value => value + 1)} className="block min-h-11">Try again</button></div>}
        <div className="space-y-2 overflow-y-auto max-h-[45dvh]">
          {!loading && !error && !filtered.length && <p className="text-sm text-muted">{events.length ? 'No matching events.' : 'No saved events yet. Start planning with Aura.'}</p>}
          {filtered.map(event => <button key={event.id} type="button" aria-current={event.id === activeId ? 'true' : undefined} disabled={busy || event.id === activeId} onClick={() => { onSwitch(event); setOpen(false); }} className={`block w-full text-left p-3 rounded-2xl border transition disabled:cursor-default ${event.id === activeId ? 'border-primary bg-primary/10' : 'border-gray-200 dark:border-gray-700 hover:border-primary'} ${busy ? 'opacity-50' : ''}`}>
            <span className="block text-sm font-semibold">{event.title}</span><span className="block mt-1 text-[11px] text-muted dark:text-slate-400">{[event.city, event.eventDate || 'Date to be decided', event.id === activeId ? 'Current event' : event.status].filter(Boolean).join(' · ')}</span>
          </button>)}
        </div>
      </section>
    </div>}
  </>;
}
