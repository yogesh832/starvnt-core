import { Link } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { CustomerPageSkeleton, Empty, EventCard, useLoad } from './customerUi.jsx';

export default function EventsPage() {
  const { data, error, loading } = useLoad(() => customerApi.events(), []);
  const events = data?.events || [];
  const current = events.filter((e) => !['completed', 'cancelled'].includes(e.status));
  const past = events.filter((e) => ['completed', 'cancelled'].includes(e.status));

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Events</h1>
          <p className="text-xs text-muted mt-0.5">Each event has its own plan.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Link to="/customer/events/new" className="rounded-xl border border-primary/40 text-primary text-xs font-bold px-4 py-2.5 hover:bg-primary-soft transition">Fill details manually</Link>
          <Link to="/customer/aura?new=1" className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 hover:bg-primary-dark transition">+ Create new event</Link>
        </div>
      </div>

      {loading && <CustomerPageSkeleton cards={4} />}
      {error && <div className="text-xs text-red-500">{errorText(error, "Couldn't load your events.")}</div>}
      {!loading && !error && events.length === 0 && (
        <Empty title="No events yet">Start a conversation with Aura+ and your first event will appear here.</Empty>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {current.map((e) => <EventCard key={e.id} event={e} />)}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="text-sm font-extrabold text-navy pt-2">Past events</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {past.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </>
      )}
    </div>
  );
}
