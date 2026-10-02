import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import {
  ArtTile,
  AskBox,
  AvailabilityPill,
  CHART_COLORS,
  DemoBadge,
  Donut,
  EventStatusPill,
  PriceText,
  ProgressRing,
  RatingText,
  StepTracker,
  categoryIcon,
  useLoad,
} from './customerUi.jsx';
import { attentionLink, budgetText, formatDate, formatINR, planStatus } from './format.js';
import { useCurrentEvent } from './currentEvent.jsx';
import { milestones } from './EventHistoryPage.jsx';
import AuraChat from './AuraChat.jsx';
import SelectOptionButton from './SelectOptionButton.jsx';

const TONE = { amber: 'text-amber-600', emerald: 'text-emerald-600', primary: 'text-primary', muted: 'text-muted' };
const card = 'bg-white rounded-3xl shadow-sm border border-gray-100/70';

function SkeletonLine({ className = '' }) {
  return <div className={`animate-pulse rounded-full bg-gray-200/80 ${className}`} />;
}

function CustomerDashboardSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-5 w-full">
      {/* Row 1: hero + event summary */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-7 flex flex-col justify-center gap-3 min-h-[220px]">
          <SkeletonLine className="h-4 w-32" />
          <SkeletonLine className="h-8 w-64 max-w-full" />
          <SkeletonLine className="h-4 w-48 max-w-full" />
          <div className="mt-4">
            <SkeletonLine className="h-12 w-full max-w-lg rounded-2xl" />
          </div>
        </section>
        <div className="lg:col-span-5 bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2 flex-1">
              <SkeletonLine className="h-6 w-48 max-w-full" />
              <SkeletonLine className="h-3 w-32" />
            </div>
            <SkeletonLine className="h-7 w-16 rounded-lg shrink-0" />
          </div>
          <div className="space-y-2 mt-4">
            <div className="flex gap-2">
              <SkeletonLine className="h-3 flex-1" />
              <SkeletonLine className="h-3 flex-1" />
              <SkeletonLine className="h-3 flex-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonLine key={i} className="h-12 rounded-2xl w-full" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonLine key={i} className="h-16 rounded-2xl w-full" />
            ))}
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 h-[560px] p-5 flex flex-col gap-4">
            <div className="flex-1 space-y-4">
              <SkeletonLine className="h-16 w-3/4 rounded-2xl" />
              <SkeletonLine className="h-16 w-2/3 rounded-2xl self-end ml-auto" />
              <SkeletonLine className="h-16 w-3/4 rounded-2xl" />
            </div>
            <SkeletonLine className="h-12 w-full rounded-2xl" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
               <div key={i} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-2 flex flex-col items-center gap-2">
                  <SkeletonLine className="w-8 h-8 rounded-xl" />
                  <SkeletonLine className="h-2 w-10" />
               </div>
            ))}
          </div>
        </div>
        
        <div className="lg:col-span-4 bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5">
           <div className="flex justify-between items-center mb-4">
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="h-3 w-10" />
           </div>
           <div className="flex gap-2 mb-4">
              <SkeletonLine className="h-6 w-16" />
              <SkeletonLine className="h-6 w-20" />
           </div>
           <div className="grid gap-3">
              <SkeletonLine className="h-48 rounded-2xl w-full" />
              <SkeletonLine className="h-48 rounded-2xl w-full" />
           </div>
        </div>

        <div className="lg:col-span-3 space-y-5">
           <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <div className="flex justify-between items-center mb-4">
                <SkeletonLine className="h-4 w-28" />
              </div>
              <div className="space-y-2">
                 <SkeletonLine className="h-12 rounded-xl w-full" />
                 <SkeletonLine className="h-12 rounded-xl w-full" />
              </div>
           </div>
           <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <div className="flex justify-between items-center mb-4">
                 <SkeletonLine className="h-4 w-24" />
                 <SkeletonLine className="h-3 w-10" />
              </div>
              <div className="space-y-4">
                 <SkeletonLine className="h-6 w-3/4" />
                 <SkeletonLine className="h-6 w-2/3" />
                 <SkeletonLine className="h-6 w-full" />
              </div>
           </div>
        </div>
      </div>
      
      {/* Row 3 */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-3 w-12" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
             {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 p-2.5">
                   <SkeletonLine className="h-16 w-full rounded-xl" />
                   <SkeletonLine className="h-3 w-20 mt-3" />
                   <SkeletonLine className="h-2 w-16 mt-2" />
                </div>
             ))}
          </div>
        </div>
        <div className="lg:col-span-4 bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5">
          <SkeletonLine className="h-4 w-32 mb-4" />
          <div className="flex items-center gap-4">
            <SkeletonLine className="h-32 w-32 rounded-full shrink-0" />
            <div className="space-y-3 flex-1">
              <SkeletonLine className="h-3 w-full" />
              <SkeletonLine className="h-3 w-5/6" />
              <SkeletonLine className="h-3 w-4/6" />
            </div>
          </div>
          <SkeletonLine className="h-8 w-full rounded-2xl mt-4" />
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children, className = '' }) {
  return (
    <section className={`${card} p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-extrabold text-navy">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── No event yet ─────────────────────────────────────────────────────── */
function Welcome({ firstName, onEventChanged }) {
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <section className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-primary via-[#7b5cf0] to-[#b18cff] text-white shadow-lg shadow-primary/20">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute right-24 -bottom-20 w-48 h-48 rounded-full bg-white/10" />
        <div className="relative max-w-2xl">
          <div className="text-sm text-white/85">Welcome, {firstName} 👋</div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">Tell us what you're planning.</h1>
          <p className="text-sm text-white/85 mt-1">We'll handle the rest — you stay in charge of every decision.</p>
          <div className="mt-5 text-ink">
            <AskBox chips={["My daughter's wedding", 'Plan my birthday', 'Corporate event for 300 people', 'Arrange a Puja']} />
          </div>
        </div>
      </section>
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className={`${card} h-[520px] overflow-hidden flex flex-col`}>
          <AuraChat firstName={firstName} embedded onEventChanged={onEventChanged} />
        </div>
        <div className="space-y-3">
          <Link to="/customer/events/new" className={`${card} p-5 block hover:shadow-md transition`}>
            <div className="text-2xl">📝</div>
            <div className="text-sm font-extrabold text-navy mt-1">Fill details manually</div>
            <div className="text-[11px] text-muted mt-0.5">Event, full location, budget and services in one form.</div>
          </Link>
          <Link to="/customer/aura?new=1" className={`${card} p-5 block hover:shadow-md transition`}>
            <div className="text-2xl">✨</div>
            <div className="text-sm font-extrabold text-navy mt-1">Plan with Aura+</div>
            <div className="text-[11px] text-muted mt-0.5">Describe it in your own words; Aura+ asks only what's missing.</div>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Event summary card (top right) ───────────────────────────────────── */
function EventSummary({ event, summary, steps, payments }) {
  const paid = payments.filter((p) => p.status === 'verified').reduce((s, p) => s + p.amount, 0);
  const tiles = summary.items.filter((i) => i.tier === 'essential').slice(0, 4);
  const meta = [event.eventDate && formatDate(event.eventDate), event.locationLabel, event.guestCount && `${event.guestCount} guests`, budgetText(event)].filter(Boolean);
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-extrabold text-navy truncate">{event.title}</h2>
            <EventStatusPill status={event.status} />
          </div>
          <div className="text-[11px] text-muted mt-1">{meta.length ? meta.join(' · ') : 'Details not added yet'}</div>
        </div>
        <Link to={`/customer/events/${event.id}`} className="text-[11px] font-bold rounded-lg border border-gray-200 px-2.5 py-1 text-navy hover:bg-lavender shrink-0 inline-flex items-center gap-1">
          <Icon name="edit" size={11} /> Edit
        </Link>
      </div>
      <div className="mt-4"><StepTracker steps={steps} /></div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        {tiles.map((i) => {
          const s = planStatus(i);
          return (
            <Link
              key={i.category}
              to={['missing', 'pending'].includes(i.status) ? `/customer/events/${event.id}/services?category=${i.category}` : `/customer/events/${event.id}/requirements`}
              className="rounded-2xl bg-lavender/60 p-2.5 flex items-center gap-2 hover:bg-primary-soft transition min-w-0"
            >
              <span className="w-8 h-8 rounded-xl bg-white text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(i.category)} size={14} /></span>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-navy truncate">{i.label}</div>
                <div className={`text-[10px] truncate ${TONE[s.tone]}`}>{['missing', 'pending'].includes(i.status) && !i.selectedOption ? (i.optionCount ? `${i.optionCount} option${i.optionCount > 1 ? 's' : ''}` : 'No options yet') : s.text}</div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Link to={`/customer/events/${event.id}/bookings`} className="rounded-2xl bg-lavender/60 p-2.5 hover:bg-primary-soft transition">
          <div className="text-[10px] text-muted">Payment</div>
          <div className="text-xs font-extrabold text-navy mt-0.5">{paid ? `${formatINR(paid)} paid` : 'Nothing paid yet'}</div>
        </Link>
        <div className="rounded-2xl bg-lavender/60 p-2 flex items-center gap-2">
          <ProgressRing percent={summary.progressPercent} size={46} label="" />
          <div className="text-[10px] text-muted leading-tight">Event readiness</div>
        </div>
        <Link to={`/customer/aura?event=${event.id}`} className="rounded-2xl bg-gradient-to-br from-primary-soft to-white p-2.5 hover:shadow-sm transition">
          <div className="text-[10px] font-bold text-primary">Your Event Assistant</div>
          <div className="text-[10px] text-muted leading-tight mt-0.5">Aura+ is with you throughout</div>
        </Link>
      </div>
    </section>
  );
}

/* ── Recommended for you (real options only) ──────────────────────────── */
function Recommended({ event, items }) {
  const cats = items.filter((i) => i.status === 'pending' || (i.status === 'missing' && i.tier === 'essential')).slice(0, 4);
  const [active, setActive] = useState(cats[0]?.category || null);
  const current = cats.find((c) => c.category === active) ? active : cats[0]?.category || null;
  const { data, error, loading, setData } = useLoad(
    () => (current && event.status !== 'draft' ? customerApi.services(event.id, current) : Promise.resolve(null)),
    [event.id, current, event.status]
  );

  if (event.status === 'draft') {
    return <p className="text-xs text-muted">Confirm your event details to see options.</p>;
  }
  if (!cats.length) return <p className="text-xs text-muted">Every essential service is handled.</p>;
  const options = (data?.options || []).slice(0, 2);
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button
            key={c.category}
            onClick={() => setActive(c.category)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${c.category === current ? 'bg-primary text-white' : 'bg-lavender text-navy'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {loading && (
         <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
           {Array.from({ length: 2 }).map((_, i) => (
             <div key={i} className="rounded-2xl border border-gray-100 p-2.5 flex flex-col">
               <SkeletonLine className="h-20 w-full rounded-xl" />
               <SkeletonLine className="h-4 w-3/4 mt-3" />
               <SkeletonLine className="h-3 w-1/2 mt-2" />
               <SkeletonLine className="h-6 w-1/3 mt-2" />
               <div className="mt-3 space-y-2">
                 <SkeletonLine className="h-3 w-full" />
                 <SkeletonLine className="h-3 w-5/6" />
               </div>
               <div className="mt-3 flex gap-2">
                 <SkeletonLine className="h-8 flex-1 rounded-xl" />
                 <SkeletonLine className="h-8 flex-1 rounded-xl" />
               </div>
             </div>
           ))}
         </div>
      )}
      {error && <div className="text-xs text-red-500 mt-3">{errorText(error)}</div>}
      {!loading && !error && options.length === 0 && <p className="text-xs text-muted mt-3">No vendor options available yet for this service.</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        {options.map((o) => (
          <div key={o.id} className="rounded-2xl border border-gray-100 p-2.5 flex flex-col">
            <div className="relative">
              <ArtTile option={o} className="h-20" />
              <div className="absolute top-1.5 left-1.5 flex gap-1">
                {o.id === data.bestValueId && <span className="text-[9px] font-bold uppercase rounded-full px-2 py-0.5 bg-primary text-white">Best value</span>}
                {o.isDemo && <DemoBadge />}
              </div>
            </div>
            <div className="text-xs font-extrabold text-navy mt-2 truncate">{o.vendorName}</div>
            <RatingText rating={o.rating} reviewCount={o.reviewCount} />
            <div className="mt-1"><PriceText option={o} /></div>
            <div className="mt-1"><AvailabilityPill value={o.availability} /></div>
            <ul className="mt-1.5 space-y-0.5 flex-1">
              {o.includes.slice(0, 3).map((x) => (
                <li key={x} className="text-[10px] text-ink/75 flex gap-1"><Icon name="check" size={10} className="text-emerald-500 mt-0.5 shrink-0" /> {x}</li>
              ))}
            </ul>
            <div className="mt-2 flex items-start gap-1.5">
              <Link to={`/customer/events/${event.id}/services/${o.id}`} className="flex-1 text-center rounded-xl border border-gray-200 text-[11px] font-bold py-1.5 text-navy hover:bg-lavender">Details</Link>
              <SelectOptionButton
                eventId={event.id}
                eventStatus={event.status}
                option={o}
                selected={data.selectedOptionId === o.id}
                onChanged={(optionId) => setData({ ...data, selectedOptionId: optionId })}
                compact
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Budget overview donut ─────────────────────────────────────────────── */
function BudgetOverview({ event, summary }) {
  const b = summary.budget;
  const rows = summary.items
    .map((i) => ({ label: i.label, value: i.bookedCost ?? (i.tier === 'essential' || i.status === 'pending' ? i.estimatedCost : null) ?? 0, booked: i.bookedCost != null }))
    .filter((r) => r.value > 0)
    .map((r, idx) => ({ ...r, color: CHART_COLORS[idx % CHART_COLORS.length] }));
  const total = b.committedCost + b.estimatedCost;
  return (
    <div>
      <div className="flex items-center gap-4">
        <Donut
          data={rows}
          size={130}
          center={
            <div>
              <div className="text-[9px] text-muted">Total estimated</div>
              <div className="text-sm font-extrabold text-navy">{formatINR(total)}</div>
            </div>
          }
        />
        <ul className="flex-1 min-w-0 space-y-1">
          {rows.length === 0 && <li className="text-[11px] text-muted">No prices yet — estimates appear as options are listed.</li>}
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="truncate text-ink/80">{r.label}{r.booked ? ' (booked)' : ''}</span>
              <span className="ml-auto font-semibold text-navy">{formatINR(r.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`mt-3 rounded-2xl px-3 py-2 text-[11px] ${b.target == null ? 'bg-lavender text-muted' : b.remaining >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
        {b.target == null
          ? 'Set a budget to track how the plan fits.'
          : b.remaining >= 0
            ? `You're on track — ${formatINR(b.remaining)} left${b.isRange ? ` within ${b.rangeLabel}` : ''}.`
            : `${formatINR(-b.remaining)} over ${b.isRange ? `the top of ${b.rangeLabel}` : 'your budget'}.`}
      </div>
      {b.estimateUsesDemoData && <p className="text-[10px] text-amber-700 mt-1.5">Some estimates use demo listings.</p>}
      <Link to={`/customer/events/${event.id}/budget`} className="inline-flex mt-2 text-[11px] font-bold text-primary">View details →</Link>
    </div>
  );
}

/* ── Workspace for the current event ──────────────────────────────────── */
function Workspace({ firstName, event }) {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const dash = useLoad(() => customerApi.dashboard(event.id), [event.id, tick]);
  const hist = useLoad(() => customerApi.history(event.id), [event.id, tick]);
  const ms = useMemo(() => milestones(hist.data?.history || []), [hist.data]);

  if (dash.loading && !dash.data) return <CustomerDashboardSkeleton />;
  if (dash.error) return <div className="text-sm text-red-500">{errorText(dash.error)}</div>;
  const { summary, steps, attention, payments = [] } = dash.data;
  const ev = dash.data.event;
  const firstOpen = summary.items.find((i) => i.status === 'pending' || (i.status === 'missing' && i.tier === 'essential'));
  const chips = ['What is still missing?', 'Can I reduce the budget?', firstOpen && `Show me ${firstOpen.label.toLowerCase()} options`].filter(Boolean);
  const planTiles = summary.items.filter((i) => i.tier === 'essential' || i.status !== 'missing');

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Row 1: hero + event summary */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 relative overflow-hidden rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-primary via-[#7b5cf0] to-[#b18cff] text-white shadow-lg shadow-primary/20">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" />
          <div className="absolute right-28 -bottom-24 w-52 h-52 rounded-full bg-white/10" />
          <div className="relative">
            <div className="text-sm text-white/85">Welcome back, {firstName} 👋</div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 leading-tight">
              {ev.status === 'draft' ? `Let's finish ${ev.title}` : `${ev.title} is taking shape!`}
            </h1>
            <p className="text-sm text-white/85 mt-1">Relax. We're on it. Ask STARVNT anything or continue planning.</p>
            <div className="mt-5 text-ink">
              <AskBox eventId={ev.id} placeholder="Ask STARVNT anything about your event…" chips={chips} />
            </div>
          </div>
        </section>
        <div className="lg:col-span-5">
          <EventSummary event={ev} summary={summary} steps={steps} payments={payments} />
        </div>
      </div>

      {/* Row 2: Aura+ | recommended | actions + timeline */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-5 space-y-3">
          <div className={`${card} h-[560px] overflow-hidden flex flex-col`}>
            <AuraChat firstName={firstName} eventId={ev.id} embedded onEventChanged={reload} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              ['search', 'Find best vendors', `/customer/events/${ev.id}/services`],
              ['services', 'Compare options', `/customer/events/${ev.id}/services`],
              ['wallet', 'Get total cost', `/customer/events/${ev.id}/quotes`],
              ['payments', 'Book & pay', `/customer/events/${ev.id}/bookings`],
              ['calendar', 'Track everything', `/customer/events/${ev.id}/history`],
            ].map(([icon, label, to]) => (
              <Link key={label} to={to} className={`${card} p-2 text-center hover:shadow-md transition`}>
                <span className="w-8 h-8 mx-auto rounded-xl bg-primary-soft text-primary grid place-items-center"><Icon name={icon} size={14} /></span>
                <div className="text-[10px] font-bold text-navy mt-1 leading-tight">{label}</div>
              </Link>
            ))}
          </div>
        </div>
        <Section title="Recommended for you" className="lg:col-span-4" action={<Link to={`/customer/events/${ev.id}/services`} className="text-[11px] font-bold text-primary">See all</Link>}>
          <Recommended event={ev} items={summary.items} />
        </Section>
        <div className="lg:col-span-3 space-y-5">
          <Section title="Upcoming actions">
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
          </Section>
          <Section title="Event timeline" action={<Link to={`/customer/events/${ev.id}/history`} className="text-[11px] font-bold text-primary">View full</Link>}>
            <ol className="space-y-2.5">
              {ms.map(([label, done]) => (
                <li key={label} className="flex items-start gap-2 text-[11px]">
                  <span className={`mt-0.5 w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-muted'}`}>{done ? '✓' : ''}</span>
                  <div>
                    <div className={done ? 'font-semibold text-navy' : 'text-muted'}>{label}</div>
                    <div className="text-[10px] text-muted">{done ? new Date(done.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Pending'}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>

      {/* Row 3: event plan + budget */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <Section title="Your event plan" className="lg:col-span-8" action={<Link to={`/customer/events/${ev.id}/requirements`} className="text-[11px] font-bold text-primary">View all</Link>}>
          {planTiles.length === 0 ? (
            <p className="text-xs text-muted">{ev.status === 'draft' ? 'Your plan is built when you confirm the event details.' : 'No services in the plan yet.'}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {planTiles.map((i) => {
                const s = planStatus(i);
                const open = ['missing', 'pending'].includes(i.status);
                return (
                  <div key={i.category} className="rounded-2xl border border-gray-100 p-2.5">
                    <ArtTile option={{ category: i.category }} className="h-16" />
                    <div className="text-xs font-bold text-navy mt-2 truncate">{i.label}</div>
                    <div className={`text-[10px] truncate ${TONE[s.tone]}`}>{s.text}</div>
                    <Link
                      to={open ? `/customer/events/${ev.id}/services?category=${i.category}` : `/customer/events/${ev.id}/requirements`}
                      className="inline-flex mt-2 text-[11px] font-bold text-primary"
                    >
                      {open ? 'Review now →' : 'View →'}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
        <Section title="Budget overview" className="lg:col-span-4">
          <BudgetOverview event={ev} summary={summary} />
        </Section>
      </div>
    </div>
  );
}

export default function HomePage({ firstName }) {
  const { current, loading, refresh } = useCurrentEvent();
  if (loading) return <CustomerDashboardSkeleton />;
  return (
    <div className="space-y-5">
      {current ? <Workspace firstName={firstName} event={current} key={current.id} /> : <Welcome firstName={firstName} onEventChanged={() => refresh()} />}
    </div>
  );
}

