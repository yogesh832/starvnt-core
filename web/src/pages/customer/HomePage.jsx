import { Link } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { AskBox, Empty, EventCard, useLoad } from './customerUi.jsx';
import { attentionLink } from './format.js';

const START_CHIPS = ["My daughter's wedding", 'Plan my birthday', 'Corporate event for 300 people', 'Arrange a Puja', 'Plan an anniversary'];

export default function HomePage({ firstName }) {
  const { data, error, loading } = useLoad(() => customerApi.home(), []);
  const active = data?.activeEvents || [];
  const attention = data?.attention || [];
  const focus = active[0];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <section className="rounded-3xl p-5 sm:p-7 bg-gradient-to-br from-primary to-[#9b6dff] text-white shadow-lg shadow-primary/20 grid md:grid-cols-[1fr_220px] gap-5 items-center">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold">Welcome back, {firstName} 👋</h1>
          <p className="text-sm text-white/85 mt-1">
            {focus ? `Your ${focus.eventTypeLabel?.toLowerCase() || 'event'} is taking shape!` : "Tell us what you're planning. We'll handle the rest."}
          </p>
          <div className="mt-4 text-ink">
            <AskBox chips={focus ? [] : START_CHIPS} eventId={focus?.id} />
          </div>
        </div>
        <Link to="/customer/events/new" className="bg-white rounded-2xl p-4 text-navy shadow-md hover:shadow-lg transition block">
          <div className="text-2xl">📝</div>
          <div className="text-sm font-extrabold mt-1">Fill details manually</div>
          <div className="text-[11px] text-muted mt-0.5">Prefer a form? Enter your event and services yourself.</div>
        </Link>
      </section>

      {loading && <div className="text-xs text-muted">Loading…</div>}
      {error && <div className="text-xs text-red-500">{errorText(error, "Couldn't load your events.")}</div>}

      {!loading && !error && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-extrabold text-navy">Your events</h2>
              <Link to="/customer/events" className="text-xs font-bold text-primary">See all</Link>
            </div>
            {active.length === 0 ? (
              <Empty
                title="No events yet"
                action={<Link to="/customer/aura?new=1" className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">Plan with Aura+</Link>}
              >
                Tell Aura+ what you're planning — a wedding, a birthday, a puja — and it will start your plan.
              </Empty>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {active.map((e) => <EventCard key={e.id} event={e} />)}
              </div>
            )}
          </section>

          <aside className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-navy mb-2">Upcoming actions</div>
            {attention.length === 0 ? (
              <p className="text-xs text-muted">You're all caught up.</p>
            ) : (
              <ul className="space-y-2">
                {attention.map((a, i) => (
                  <li key={i}>
                    <Link to={attentionLink(a)} className="block rounded-xl bg-lavender/60 hover:bg-primary-soft p-2.5 text-xs">
                      <b className="text-navy">{a.title}</b>
                      <div className="text-muted text-[11px]">{a.detail}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
