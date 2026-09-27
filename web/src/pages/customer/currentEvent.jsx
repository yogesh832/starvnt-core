import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { customerApi } from './customerApi.js';
import { Empty } from './customerUi.jsx';
import { Link } from 'react-router-dom';

/**
 * The customer's "current event": what the workspace, the top-bar switcher
 * and the per-event sidebar links (Plans & Quotes, Bookings, …) point at.
 * The choice is a per-browser convenience; the events themselves come from
 * the backend.
 */
const KEY = 'starvnt_current_event';
const CLOSED = ['completed', 'cancelled'];
const Ctx = createContext(null);

function readStored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeStored(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* per-viewer convenience only */
  }
}

export function CurrentEventProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(readStored());

  const refresh = useCallback(() => {
    return customerApi
      .events()
      .then((d) => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = useMemo(() => {
    const byId = events.find((e) => e.id === selectedId);
    if (byId) return byId;
    return events.find((e) => !CLOSED.includes(e.status)) || events[0] || null;
  }, [events, selectedId]);

  const setCurrent = useCallback((id) => {
    setSelectedId(id);
    writeStored(id);
  }, []);

  const value = useMemo(() => ({ events, current, setCurrent, refresh, loading }), [events, current, setCurrent, refresh, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentEvent() {
  return useContext(Ctx) || { events: [], current: null, setCurrent: () => {}, refresh: () => Promise.resolve(), loading: false };
}

const SECTION_PATH = {
  quotes: 'quotes',
  bookings: 'bookings',
  payments: 'bookings',
  vendors: 'vendors',
  timeline: 'history',
  plan: 'requirements',
  budget: 'budget',
};

/** /customer/go/:section → the current event's page for that section. */
export function GoToSection() {
  const { section } = useParams();
  const { current, loading } = useCurrentEvent();
  if (loading) return <div className="text-xs text-muted">Loading…</div>;
  if (!current) {
    return (
      <div className="max-w-xl mx-auto">
        <Empty
          title="No event yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/customer/aura?new=1" className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">Plan with Aura+</Link>
              <Link to="/customer/events/new" className="rounded-xl border border-primary/40 text-primary text-xs font-bold px-4 py-2.5">Fill details manually</Link>
            </div>
          }
        >
          Create an event first — its plans, bookings and payments will show up here.
        </Empty>
      </div>
    );
  }
  return <Navigate to={`/customer/events/${current.id}/${SECTION_PATH[section] || ''}`} replace />;
}
