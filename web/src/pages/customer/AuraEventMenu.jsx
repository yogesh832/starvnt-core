import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';

/** Aura's local sidebar; it never replaces the dashboard navigation. */
export default function AuraEventMenu({ activeId, busy, onSwitch, onNew, open, onClose, triggerRef }) {
  const [events, setEvents] = useState([]), [query, setQuery] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const panel = useRef(null), search = useRef(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError('');
    customerApi.events().then(data => { if (active) setEvents(data.events || []); }).catch(e => { if (active) setError(errorText(e, "Couldn't load your events.")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, attempt]);
  useEffect(() => {
    if (!open) return;
    setQuery(''); search.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      // Only the narrow, overlay sidebar traps focus; the docked sidebar is ordinary navigation.
      if (event.key === 'Tab' && panel.current?.closest('.aura-chat-shell')?.clientWidth < 720) {
        const focusable = panel.current?.querySelectorAll('button:not(:disabled), input');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); triggerRef.current?.focus(); };
  }, [open, onClose, triggerRef]);
  const filtered = events.filter(event => `${event.title} ${event.city || ''} ${event.eventType || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    {open && <button type="button" className="aura-sidebar-backdrop" aria-label="Close Aura sidebar" tabIndex={-1} onClick={onClose} />}
    <aside ref={panel} id="aura-chat-sidebar" aria-label="Aura conversations and events" aria-hidden={!open} inert={!open ? '' : undefined} className={`aura-chat-sidebar ${open ? 'aura-chat-sidebar--open' : ''}`}>
      <div className="aura-chat-sidebar-inner">
        <div className="flex items-center justify-between mb-3"><span className="text-sm font-extrabold">Aura+</span><button type="button" aria-label="Close Aura sidebar" title="Close sidebar" onClick={onClose} className="w-10 h-10 rounded-xl grid place-items-center hover:bg-primary/10"><Icon name="panelLeft" size={21} /></button></div>
        <button type="button" disabled={busy} onClick={() => { onNew(); onClose(); }} className="flex items-center gap-3 w-full min-h-11 rounded-xl px-3 mb-4 text-sm font-semibold hover:bg-primary/10 disabled:opacity-50"><Icon name="edit" size={18} />New chat</button>
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5"><Icon name="search" size={16} /><input ref={search} aria-label="Find an event" placeholder="Search your events" value={query} onChange={event => setQuery(event.target.value)} className="w-full min-w-0 bg-transparent text-xs outline-none" /></label>
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-slate-400 mt-6 mb-3">Your events</h2>
        <p className="text-[11px] text-muted dark:text-slate-400 mb-3">Choose an event, or ask Aura to switch.</p>
        {loading && <p role="status" className="text-xs text-muted">Loading your events…</p>}
        {error && <div role="alert" className="text-xs text-rose-500">{error}<button type="button" onClick={() => setAttempt(value => value + 1)} className="block min-h-11">Try again</button></div>}
        <div className="space-y-1">
          {!loading && !error && !filtered.length && <p className="text-xs text-muted leading-relaxed">{events.length ? 'No matching events.' : 'No saved events yet. Start a new chat to plan one.'}</p>}
          {filtered.map(event => <button key={event.id} type="button" aria-current={event.id === activeId ? 'true' : undefined} disabled={busy || event.id === activeId} onClick={() => { onSwitch(event); onClose(); }} className={`block w-full text-left p-3 rounded-xl transition disabled:cursor-default ${event.id === activeId ? 'bg-primary/15 text-primary dark:text-[#b4a6ff]' : 'hover:bg-primary/10'} ${busy ? 'opacity-50' : ''}`}>
            <span className="block text-xs font-semibold break-words">{event.title}</span><span className="block mt-1 text-[10px] text-muted dark:text-slate-400">{[event.city, event.eventDate || 'Date to be decided', event.id === activeId ? 'Current event' : event.status].filter(Boolean).join(' · ')}</span>
          </button>)}
        </div>
      </div>
    </aside>
  </>;
}
