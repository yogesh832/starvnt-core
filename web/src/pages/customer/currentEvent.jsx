import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { customerApi } from './customerApi.js';
import { CustomerErrorScreen, CustomerLoadingScreen, Empty } from './customerUi.jsx';
import { Link } from 'react-router-dom';

/**
 * The customer's "current event": what the workspace, the top-bar switcher
 * and the per-event sidebar links (Plans & Quotes, Bookings, …) point at.
 * The choice is a per-browser convenience; the events themselves come from
 * the backend.
 */
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { eventStorageKey, latestRequestGate, resolveCurrentEvent, routeEventId } from './eventContext.js';
const Ctx = createContext(null);

function readStored(key) {
  try {
    return key ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function writeStored(key, id) {
  if (!key) return;
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    /* per-viewer convenience only */
  }
}

export function CurrentEventProvider({ children }) {
  const { user } = useExternalAuth();
  const { pathname, search } = useLocation();
  const key = eventStorageKey(user?.id || user?._id);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(() => readStored(key));
  const gate = useRef(latestRequestGate());
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    const request = gate.current.next();
    setError(null);
    if (!loaded.current) setLoading(true);
    try {
      const data = await customerApi.events();
      if (gate.current.current(request)) {
        setEvents(data.events || []);
        loaded.current = true;
      }
    } catch (err) {
      if (gate.current.current(request)) setError(err);
    } finally {
      if (gate.current.current(request)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => gate.current.invalidate();
  }, [refresh]);

  const current = useMemo(() => resolveCurrentEvent(events, selectedId, pathname, search), [events, selectedId, pathname, search]);
  const routedId = routeEventId(pathname, search);
  useEffect(() => {
    if (!routedId || !events.some(event => event.id === routedId)) return;
    setSelectedId(routedId);
    writeStored(key, routedId);
  }, [routedId, events, key]);

  const setCurrent = useCallback((id) => {
    setSelectedId(id);
    writeStored(key, id);
  }, [key]);

  const value = useMemo(() => ({ events, current, setCurrent, refresh, loading, error }), [events, current, setCurrent, refresh, loading, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentEvent() {
  return useContext(Ctx) || { events: [], current: null, setCurrent: () => {}, refresh: () => Promise.resolve(), loading: false, error: null };
}

const SECTION_PATH = {
  quotes: 'quotes',
  bookings: 'bookings',
  payments: 'payments',
  vendors: 'vendors',
  timeline: 'history',
  plan: 'requirements',
  budget: 'budget',
};

/** /customer/go/:section → the current event's page for that section. */
export function GoToSection() {
  const { section } = useParams();
  const { current, loading, error, refresh } = useCurrentEvent();
  if (loading) return <CustomerLoadingScreen title="Opening your event" detail="Finding your latest plan, quotes and bookings..." />;
  if (error) {
    return (
      <CustomerErrorScreen
        title="We couldn't open your event"
        message="We're having trouble connecting to STARVNT servers right now. Please try again in a moment, or reach out to customer care."
        onRetry={refresh}
      />
    );
  }
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
