import ProductFeedback from '../../components/ProductFeedback.jsx';
import { externalApi } from '../../lib/api.js';
import NotificationPreferences from '../../components/NotificationPreferences.jsx';
import FinancialOverview from '../../components/FinancialOverview.jsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  PriceText,
  RatingText,
  useLoad,
} from './customerUi.jsx';
import { attentionLink, budgetText, formatDate, formatINR, planStatus } from './format.js';
import { useCurrentEvent } from './currentEvent.jsx';
import { milestones } from './EventHistoryPage.jsx';
import AuraChat from './AuraChat.jsx';
import SelectOptionButton from './SelectOptionButton.jsx';
import CustomerHero from './CustomerHero.jsx';
import EventSummary from './CustomerEventSummary.jsx';

const TONE = { amber: 'text-amber-600 dark:text-amber-400', emerald: 'text-emerald-600 dark:text-emerald-400', primary: 'text-primary dark:text-[#a5b4fc]', muted: 'text-muted dark:text-slate-400' };
const card = 'bg-white dark:bg-[#151827] rounded-3xl shadow-sm border border-gray-100/70 dark:border-white/10';

function SkeletonLine({ className = '' }) {
  return <div className={`animate-pulse rounded-full bg-gray-200/80 dark:bg-gray-700/60 ${className}`} />;
}

function CustomerDashboardSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-5 w-full">
      {/* Row 1: hero + event summary */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-7 flex flex-col justify-center gap-3 min-h-[220px]">
          <SkeletonLine className="h-4 w-32" />
          <SkeletonLine className="h-8 w-64 max-w-full" />
          <SkeletonLine className="h-4 w-48 max-w-full" />
          <div className="mt-4">
            <SkeletonLine className="h-12 w-full max-w-lg rounded-2xl" />
          </div>
        </section>
        <div className="lg:col-span-5 bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5 space-y-4">
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
          <div className="bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 h-[560px] p-5 flex flex-col gap-4">
            <div className="flex-1 space-y-4">
              <SkeletonLine className="h-16 w-3/4 rounded-2xl" />
              <SkeletonLine className="h-16 w-2/3 rounded-2xl self-end ml-auto" />
              <SkeletonLine className="h-16 w-3/4 rounded-2xl" />
            </div>
            <SkeletonLine className="h-12 w-full rounded-2xl" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
               <div key={i} className="bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-2 flex flex-col items-center gap-2">
                  <SkeletonLine className="w-8 h-8 rounded-xl" />
                  <SkeletonLine className="h-2 w-10" />
               </div>
            ))}
          </div>
        </div>
        
        <div className="lg:col-span-4 bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5">
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
           <div className="bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5">
              <div className="flex justify-between items-center mb-4">
                <SkeletonLine className="h-4 w-28" />
              </div>
              <div className="space-y-2">
                 <SkeletonLine className="h-12 rounded-xl w-full" />
                 <SkeletonLine className="h-12 rounded-xl w-full" />
              </div>
           </div>
           <div className="bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5">
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
        <div className="lg:col-span-8 bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-3 w-12" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
             {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-2.5">
                   <SkeletonLine className="h-16 w-full rounded-xl" />
                   <SkeletonLine className="h-3 w-20 mt-3" />
                   <SkeletonLine className="h-2 w-16 mt-2" />
                </div>
             ))}
          </div>
        </div>
        <div className="lg:col-span-4 bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5">
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
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-sm sm:text-base font-extrabold text-navy dark:text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ShopComingSoonCard() {
  return (
    <section className={`${card} p-5 overflow-hidden`}>
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 grid place-items-center shrink-0">
          <Icon name="services" size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Coming soon</div>
          <h2 className="text-sm font-extrabold text-navy dark:text-white mt-0.5">StarVnt Shop</h2>
          <p className="text-[11px] text-muted dark:text-slate-400 mt-1 leading-relaxed">
            Curated event essentials and gifting will appear here after the shop catalog is live. Checkout is not enabled yet.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── No event yet ─────────────────────────────────────────────────────── */
function Welcome({ firstName, onEventChanged }) {
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <CustomerHero firstName={firstName} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className={`${card} h-[520px] overflow-hidden flex flex-col`}>
          <AuraChat firstName={firstName} embedded onEventChanged={onEventChanged} />
        </div>
        <div className="space-y-3">
          <Link to="/customer/events/new" className={`${card} p-5 block hover:shadow-md transition`}>
            <div className="text-2xl">📝</div>
            <div className="text-sm font-extrabold text-navy dark:text-white mt-1">Fill details manually</div>
            <div className="text-[11px] text-muted dark:text-slate-400 mt-0.5">Event, full location, budget and services in one form.</div>
          </Link>
          <Link to="/customer/aura?new=1" className={`${card} p-5 block hover:shadow-md transition`}>
            <Icon name="aura" size={30} />
            <div className="text-sm font-extrabold text-navy dark:text-white mt-1">Plan with Aura+</div>
            <div className="text-[11px] text-muted dark:text-slate-400 mt-0.5">Describe it in your own words; Aura+ asks only what's missing.</div>
          </Link>
          <ShopComingSoonCard />
        </div>
      </div>
    </div>
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
    return <p className="text-xs text-muted dark:text-slate-400">Confirm your event details to see options.</p>;
  }
  if (!cats.length) return <p className="text-xs text-muted dark:text-slate-400">Every essential service is handled.</p>;
  const options = (data?.options || []).slice(0, 2);
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button
            key={c.category}
            onClick={() => setActive(c.category)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${
              c.category === current
                ? 'bg-primary text-white shadow-xs'
                : 'bg-lavender dark:bg-white/10 text-navy dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-white/15'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {loading && (
         <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
           {Array.from({ length: 2 }).map((_, i) => (
             <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-2.5 flex flex-col">
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
      {error && <div className="text-xs text-red-500 dark:text-red-400 mt-3">{errorText(error)}</div>}
      {!loading && !error && options.length === 0 && <p className="text-xs text-muted dark:text-slate-400 mt-3">No vendor options available yet for this service.</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        {options.map((o) => (
          <div key={o.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#161926] p-2.5 flex flex-col shadow-xs">
            <div className="relative">
              <ArtTile option={o} className="h-20 rounded-xl" />
              <div className="absolute top-1.5 left-1.5 flex gap-1">
                {o.id === data.bestValueId && <span className="text-[9px] font-bold uppercase rounded-full px-2 py-0.5 bg-primary text-white shadow-xs">Best value</span>}
                {o.isDemo && <DemoBadge />}
              </div>
            </div>
            <div className="text-xs font-extrabold text-navy dark:text-white mt-2 truncate">{o.vendorName}</div>
            <RatingText rating={o.rating} reviewCount={o.reviewCount} />
            <div className="mt-1"><PriceText option={o} /></div>
            <div className="mt-1"><AvailabilityPill value={o.availability} /></div>
            <ul className="mt-1.5 space-y-0.5 flex-1">
              {o.includes.slice(0, 3).map((x) => (
                <li key={x} className="text-[10px] text-ink/75 dark:text-slate-300 flex gap-1"><Icon name="check" size={10} className="text-emerald-500 mt-0.5 shrink-0" /> {x}</li>
              ))}
            </ul>
            <div className="mt-2 flex items-start gap-1.5">
              <Link to={`/customer/events/${event.id}/services/${o.id}`} className="flex-1 text-center rounded-xl border border-gray-200 dark:border-gray-700 text-[11px] font-bold py-1.5 text-navy dark:text-slate-200 hover:bg-lavender dark:hover:bg-white/10 transition">Details</Link>
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
              <div className="text-[9px] text-muted dark:text-slate-400">Total estimated</div>
              <div className="text-sm font-extrabold text-navy dark:text-white">{formatINR(total)}</div>
            </div>
          }
        />
        <ul className="flex-1 min-w-0 space-y-1">
          {rows.length === 0 && <li className="text-[11px] text-muted dark:text-slate-400">No prices yet — estimates appear as options are listed.</li>}
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="truncate text-ink/80 dark:text-slate-300">{r.label}{r.booked ? ' (booked)' : ''}</span>
              <span className="ml-auto font-semibold text-navy dark:text-white">{formatINR(r.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`mt-3 rounded-2xl px-3 py-2 text-[11px] ${
        b.target == null
          ? 'bg-lavender dark:bg-white/5 text-muted dark:text-slate-400'
          : b.remaining >= 0
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40'
          : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200/50 dark:border-red-800/40'
      }`}>
        {b.target == null
          ? 'Set a budget to track how the plan fits.'
          : b.remaining >= 0
            ? `You're on track — ${formatINR(b.remaining)} left${b.isRange ? ` within ${b.rangeLabel}` : ''}.`
            : `${formatINR(-b.remaining)} over ${b.isRange ? `the top of ${b.rangeLabel}` : 'your budget'}.`}
      </div>
      {b.estimateUsesDemoData && <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5">Some estimates use demo listings.</p>}
      <Link to={`/customer/events/${event.id}/budget`} className="inline-flex mt-2 text-[11px] font-bold text-primary dark:text-[#a5b4fc] hover:underline">View details →</Link>
    </div>
  );
}

function ActionRail({ event }) {
  const actions = [
    ['search', 'Find vendors', 'Browse services', `/customer/events/${event.id}/services`],
    ['services', 'Compare', 'Shortlist options', `/customer/events/${event.id}/compare`],
    ['wallet', 'Quotes', 'Review prices', `/customer/events/${event.id}/quotes`],
    ['payments', 'Payments', 'Advance & bookings', `/customer/events/${event.id}/payments`],
    ['calendar', 'Timeline', 'Track progress', `/customer/events/${event.id}/history`],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {actions.map(([icon, label, desc, to]) => (
        <Link key={label} to={to} className={`${card} p-3 hover:shadow-md hover:border-primary/30 transition group`}>
          <span className="w-9 h-9 rounded-2xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center group-hover:scale-105 transition">
            <Icon name={icon} size={15} />
          </span>
          <div className="text-xs font-extrabold text-navy dark:text-white mt-2 leading-tight">{label}</div>
          <div className="text-[10px] text-muted dark:text-slate-400 mt-0.5 leading-tight">{desc}</div>
        </Link>
      ))}
    </div>
  );
}

function AuraShortcut({ firstName, event, chips }) {
  return (
    <section className={`${card} p-4 sm:p-5 overflow-hidden`}>
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0 shadow-lg shadow-primary/25">
          <Icon name="aura" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-navy dark:text-white truncate">{event.title}</h2>
              <p className="text-xs text-muted dark:text-slate-400 mt-0.5">Ask Aura+ to explain missing items, budget, vendors, or booking state.</p>
            </div>
            <Link to={`/customer/aura?event=${event.id}`} className="shrink-0 rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-[11px] font-bold text-navy dark:text-white hover:bg-lavender dark:hover:bg-white/10 transition">
              Open chat
            </Link>
          </div>
          <div className="mt-3">
            <AskBox eventId={event.id} placeholder={`Ask for help, ${firstName}...`} chips={chips.slice(0, 3)} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Workspace for the current event ──────────────────────────────────── */
function Workspace({ firstName, event }) {
  const [tick, setTick] = useState(0);
  const [proposalError, setProposalError] = useState('');
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const dash = useLoad(() => customerApi.dashboard(event.id), [event.id, tick]);
  const hist = useLoad(() => customerApi.history(event.id), [event.id, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') reload(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [reload]);
  const ms = useMemo(() => milestones(hist.data?.history || []), [hist.data]);

  if (dash.loading && !dash.data) return <CustomerDashboardSkeleton />;
  if (dash.error) return <div className="text-sm text-red-500 dark:text-red-400">{errorText(dash.error)}</div>;
  const { summary, steps, attention, payments = [], financialTruth, experience, bookings = [] } = dash.data;
  const ev = dash.data.event;
  const firstOpen = summary.items.find((i) => i.status === 'pending' || (i.status === 'missing' && i.tier === 'essential'));
  const chips = ['What is still missing?', 'Can I reduce the budget?', firstOpen && `Show me ${firstOpen.label.toLowerCase()} options`].filter(Boolean);
  const planTiles = summary.items.filter((i) => i.tier === 'essential' || i.status !== 'missing');

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <CustomerHero firstName={firstName} eventId={ev.id} />
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl p-4 border text-sm"><span><b>{experience?.lifecycle || 'Planning'}</b>{experience?.daysUntilEvent != null ? ` · ${experience.daysUntilEvent === 0 ? 'Event day' : experience.daysUntilEvent > 0 ? `${experience.daysUntilEvent} days to go` : `${Math.abs(experience.daysUntilEvent)} days since the event date`}` : ' · Date not set'}</span><span>{experience?.decisionsPending ?? 0} requirement{experience?.decisionsPending === 1 ? '' : 's'} awaiting a decision</span><button className="text-primary underline" onClick={reload}>Refresh</button></div>
      {!!experience?.proposedRequirements?.length && <Section title="Confirm Aura suggestions"><p className="text-sm mb-3">These suggestions have not been confirmed by you and do not count as completed requirements.</p>{experience.proposedRequirements.map(r => <div key={r.category} className="border rounded-xl p-3 mb-2 text-sm"><p>{r.category} · {r.status.replaceAll('_', ' ')} {r.value || ''}</p><button className="underline text-primary" onClick={async () => { try { await externalApi.call(`/customer/events/${ev.id}/requirements/${r.category}/confirm`, { method: 'POST' }); setProposalError(''); reload(); } catch (err) { setProposalError(err.message); } }}>Confirm this requirement</button></div>)}{proposalError && <p role="alert">{proposalError}</p>}</Section>}
      {!!experience?.risks?.length && <Section title="Changes to review">{experience.risks.map((risk, i) => <Link key={i} to={risk.actionUrl} className="block p-3 rounded-xl bg-amber-50 mb-2 text-sm"><b>{risk.title}</b><p>{risk.detail}</p></Link>)}</Section>}
      {!!bookings.filter(b => b.status === 'confirmed').length && <Section title="Confirmed bookings"><ul className="grid sm:grid-cols-2 gap-3">{bookings.filter(b => b.status === 'confirmed').map(b => <li key={b.id}><Link className="block border rounded-xl p-3 text-sm" to={`/customer/events/${ev.id}/bookings#${b.id}`}><b>{b.vendorName}</b><p>{b.packageName} · {b.executionStatus || 'Confirmed'}</p></Link></li>)}</ul></Section>}
      <div className="customer-overview-grid">
        <EventSummary event={ev} summary={summary} steps={steps} payments={payments} />
        <section className="customer-budget-panel"><h2>Budget overview</h2><FinancialOverview truth={financialTruth} /></section>
      </div>

      {/* Row 2: event plan + budget */}
      <div>
        <Section title="Your event plan" className="lg:col-span-8" action={<Link to={`/customer/events/${ev.id}/requirements`} className="text-[11px] font-bold text-primary dark:text-[#a5b4fc]">View all</Link>}>
          {planTiles.length === 0 ? (
            <p className="text-xs text-muted dark:text-slate-400">{ev.status === 'draft' ? 'Your plan is built when you confirm the event details.' : 'No services in the plan yet.'}</p>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {planTiles.map((i) => {
                const s = planStatus(i);
                const open = ['missing', 'pending'].includes(i.status);
                return (
                  <div key={i.category} className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#101321] p-3 flex flex-col shadow-xs min-h-[150px]">
                    <ArtTile option={{ category: i.category }} className="h-16 rounded-xl" />
                    <div className="text-sm font-extrabold text-navy dark:text-white mt-2 truncate">{i.label}</div>
                    <div className={`text-[11px] truncate font-semibold ${TONE[s.tone]}`}>{s.text}</div>
                    {i.selectedOption?.vendorName && <div className="text-[10px] text-muted dark:text-slate-400 truncate mt-0.5">{i.selectedOption.vendorName}</div>}
                    <Link
                      to={open ? `/customer/events/${ev.id}/services?category=${i.category}` : `/customer/events/${ev.id}/requirements`}
                      className="inline-flex mt-2 text-[11px] font-bold text-primary dark:text-[#a5b4fc] hover:underline"
                    >
                      {open ? 'Review now →' : 'View →'}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <NotificationPreferences eventId={ev.id} />
      <div className="bg-white border rounded-2xl p-4"><ProductFeedback kind="EVENT" reference={ev.id} /></div>
      {/* Row 3: recommendations + next actions */}
      <div className="grid xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-5">
          <AuraShortcut firstName={firstName} event={ev} chips={chips} />
          <Section title="Recommended for you" action={<Link to={`/customer/events/${ev.id}/services`} className="text-[11px] font-bold text-primary dark:text-[#a5b4fc]">See all</Link>}>
            <Recommended event={ev} items={summary.items} />
          </Section>
          <ActionRail event={ev} />
        </div>
        <div className="xl:col-span-4 space-y-5">
          <ShopComingSoonCard />
          <Section title="Upcoming actions">
            {attention.length > 0 ? (
              <ul className="space-y-2">
                {attention.map((a, i) => (
                  <li key={i}>
                    <Link to={attentionLink(a)} className="block rounded-xl bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/80 dark:hover:bg-amber-950/40 p-2.5 text-xs transition border border-amber-200/60 dark:border-amber-900/40">
                      <b className="text-amber-900 dark:text-amber-200">{a.title}</b>
                      <div className="text-amber-700/80 dark:text-amber-300/80 text-[11px] mt-0.5">{a.detail}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (() => {
              const unbookedItems = (summary?.items || []).filter((i) => (i.tier === 'essential' || i.status === 'pending') && ['missing', 'pending'].includes(i.status) && !i.selectedOption?.vendorName);
              if (unbookedItems.length > 0) {
                return (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 p-3">
                      <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                        {ev?.title || 'Event'} status
                      </div>
                      <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5 leading-relaxed">
                        No urgent alerts. {unbookedItems.length} service category{unbookedItems.length > 1 ? 's' : ''} remaining for vendor selection.
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {unbookedItems.slice(0, 3).map((item) => (
                        <li key={item.category}>
                          <Link
                            to={`/customer/events/${ev.id}/services?category=${item.category}`}
                            className="block rounded-xl bg-lavender/60 dark:bg-white/5 hover:bg-primary-soft dark:hover:bg-primary/20 p-2.5 text-xs transition border border-transparent"
                          >
                            <div className="flex items-center justify-between">
                              <b className="text-navy dark:text-white">Choose {item.label}</b>
                              <span className="text-[10px] font-bold text-primary dark:text-[#a5b4fc]">Select →</span>
                            </div>
                            <div className="text-muted dark:text-slate-400 text-[11px] mt-0.5">
                              {item.optionCount ? `${item.optionCount} verified options available` : 'Explore recommendations for your event'}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 p-3.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    You're all caught up for {ev?.title || 'your event'} 🎉
                  </div>
                  <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1 leading-relaxed">
                    No pending customer action was found in the current records. You can review your plan and bookings at any time.
                  </p>
                </div>
              );
            })()}
          </Section>
          <Section title="Event timeline" action={<Link to={`/customer/events/${ev.id}/history`} className="text-[11px] font-bold text-primary dark:text-[#a5b4fc]">View full</Link>}>
            <ol className="space-y-2.5">
              {ms.map(([label, done]) => (
                <li key={label} className="flex items-start gap-2 text-[11px]">
                  <span className={`mt-0.5 w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-muted dark:text-slate-500'}`}>{done ? '✓' : ''}</span>
                  <div>
                    <div className={done ? 'font-semibold text-navy dark:text-white' : 'text-muted dark:text-slate-400'}>{label}</div>
                    <div className="text-[10px] text-muted dark:text-slate-500">{done ? new Date(done.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Pending'}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
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
