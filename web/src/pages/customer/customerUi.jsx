import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { EVENT_STATUS_LABEL, budgetText, formatDate } from './format.js';

// Categorical palette for charts (purple family + distinct accents).
export const CHART_COLORS = ['#5a4bd1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#9b6dff', '#ef4444', '#84cc16'];

/** Donut chart from [{ label, value }]; zero/empty values are skipped. */
export function Donut({ data, size = 140, center }) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eceaf7" strokeWidth="12" />
        {total > 0 &&
          rows.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <circle key={d.label} cx="50" cy="50" r={r} fill="none" stroke={d.color || CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="12" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center px-3">{center}</div>}
    </div>
  );
}

const STATUS_TONE = {
  draft: 'bg-amber-50 text-amber-600',
  planning: 'bg-primary-soft text-primary',
  booked: 'bg-emerald-50 text-emerald-600',
  in_progress: 'bg-violet-50 text-violet-600',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-muted',
};

export function EventStatusPill({ status }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_TONE[status] || STATUS_TONE.planning}`}>
      {EVENT_STATUS_LABEL[status] || status}
    </span>
  );
}

export function ProgressBar({ percent }) {
  return (
    <div className="h-1.5 rounded-full bg-lavender overflow-hidden">
      <div className="h-full bg-gradient-to-r from-primary to-[#9b6dff] rounded-full" style={{ width: `${percent || 0}%` }} />
    </div>
  );
}

/** Facts line: only what is actually known. */
export function EventMeta({ event }) {
  const parts = [
    event.eventDate && ['calendar', formatDate(event.eventDate)],
    (event.locationLabel || event.city) && ['vendors', event.locationLabel || event.city],
    event.guestCount && ['customers', `${event.guestCount} guests`],
    budgetText(event) && ['wallet', budgetText(event)],
  ].filter(Boolean);
  if (!parts.length) return <div className="text-[11px] text-muted">Details not added yet</div>;
  return (
    <div className="text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-0.5">
      {parts.map(([icon, text]) => (
        <span key={icon} className="inline-flex items-center gap-1"><Icon name={icon} size={11} /> {text}</span>
      ))}
    </div>
  );
}

export function EventCard({ event }) {
  return (
    <Link to={`/customer/events/${event.id}`} className="block bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-navy truncate">{event.title || event.eventTypeLabel || 'Event'}</div>
        <EventStatusPill status={event.status} />
      </div>
      <div className="mt-1"><EventMeta event={event} /></div>
      {event.status !== 'draft' && (
        <>
          <div className="mt-3"><ProgressBar percent={event.progressPercent} /></div>
          <div className="text-[10px] text-muted mt-1.5">
            {event.essentialsHandled} of {event.essentialsTotal} essentials handled
          </div>
        </>
      )}
    </Link>
  );
}

/** Ask box: typing here opens Aura+ with the text. */
export function AskBox({ placeholder = 'Tell us what you want to arrange…', chips = [], eventId }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const go = (t) => {
    const q = t.trim();
    if (!q) return;
    const p = new URLSearchParams({ ask: q });
    if (eventId) p.set('event', eventId);
    navigate(`/customer/aura?${p.toString()}`);
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className="flex items-center gap-2 bg-white rounded-2xl shadow-sm px-4 py-2.5 border border-gray-100"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="flex-1 outline-none text-sm bg-transparent placeholder:text-muted/60" />
        <button className="w-9 h-9 grid place-items-center rounded-full bg-primary text-white hover:bg-primary-dark transition" aria-label="Ask Aura+">
          <Icon name="send" size={14} />
        </button>
      </form>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {chips.map((c) => (
            <button key={c} onClick={() => go(c)} className="text-xs bg-white hover:bg-primary-soft hover:text-primary border border-gray-100 rounded-full px-3.5 py-1.5 transition font-medium">
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
      <div className="w-11 h-11 mx-auto rounded-2xl bg-primary-soft text-primary grid place-items-center"><Icon name="events" size={18} /></div>
      <div className="mt-3 font-extrabold text-navy">{title}</div>
      {children && <p className="text-xs text-muted mt-1 leading-relaxed">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CATEGORY_ICON = {
  venue: 'vendors', catering: 'services', photography: 'camera', decor: 'star', makeup: 'profile', sound: 'play',
  ceremony: 'events', transport: 'truck', accommodation: 'vendors', hospitality: 'customers', invitation: 'documents',
  anchor: 'mic', entertainment: 'play', photo_booth: 'camera', special_effects: 'bolt', live_streaming: 'video', cake: 'star',
};
export const categoryIcon = (c) => CATEGORY_ICON[c] || 'services';

export function ProgressRing({ percent = 0, size = 88, label = 'Planning complete' }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="custRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5a4bd1" />
            <stop offset="100%" stopColor="#9b6dff" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#eceaf7" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="url(#custRingGrad)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, percent) / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-lg font-extrabold text-navy leading-none">{percent}%</div>
          <div className="text-[8px] text-muted leading-tight mt-0.5 px-2">{label}</div>
        </div>
      </div>
    </div>
  );
}

/** Planning → Vendors → Booking → Payment → Execution → Completed. */
export function StepTracker({ steps = [] }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.key} className="flex-1 flex flex-col items-center text-center relative min-w-0">
          {i > 0 && <span className={`absolute top-3 right-1/2 w-full h-0.5 ${s.state === 'upcoming' ? 'bg-gray-200' : 'bg-primary'}`} />}
          <span
            className={`relative z-10 w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold ${
              s.state === 'done' ? 'bg-primary text-white' : s.state === 'current' ? 'bg-white border-2 border-primary text-primary' : 'bg-gray-100 text-muted'
            }`}
          >
            {s.state === 'done' ? <Icon name="check" size={11} /> : i + 1}
          </span>
          <span className={`text-[9px] sm:text-[10px] mt-1 font-semibold truncate max-w-full ${s.state === 'upcoming' ? 'text-muted' : 'text-navy'}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-xs overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${value === t.key ? 'bg-primary text-white' : 'text-muted hover:text-navy'}`}
        >
          {t.label}
          {t.count != null && <span className={`ml-1.5 ${value === t.key ? 'text-white/80' : 'text-muted/70'}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function BackLink({ to, children }) {
  return <Link to={to} className="text-xs font-bold text-muted hover:text-primary">← {children}</Link>;
}

const AVAIL = {
  unconfirmed: ['Calendar clear - send enquiry', 'bg-emerald-50 text-emerald-600'],
  blocked: ['Not available on your date', 'bg-red-50 text-red-500'],
  booked: ['Already booked on your date', 'bg-red-50 text-red-500'],
  available: ['Available on your date', 'bg-emerald-50 text-emerald-600'],
  no_event_date: ['Add a date to check availability', 'bg-amber-50 text-amber-600'],
};
export function AvailabilityPill({ value }) {
  const [text, cls] = AVAIL[value] || AVAIL.unconfirmed;
  return <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>{text}</span>;
}

export function DemoBadge() {
  return <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 whitespace-nowrap">Demo listing</span>;
}

export function RatingText({ rating, reviewCount }) {
  if (rating == null) return <span className="text-[11px] text-muted">No ratings yet</span>;
  return <span className="text-[11px] font-semibold text-navy">★ {rating.toFixed(1)} <span className="text-muted font-normal">({reviewCount} reviews)</span></span>;
}

/** Price as a validated total, or the honest reason there isn't one. */
export function PriceText({ option, large = false }) {
  const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
  if (option.price != null) {
    return (
      <div>
        <div className={`${large ? 'text-2xl' : 'text-base'} font-extrabold text-navy`}>{inr(option.price)}</div>
        <div className="text-[10px] text-muted">validated total{option.pricingType === 'PER_PERSON' ? ` · ${inr(option.basePrice)} per ${option.unit || 'guest'}` : ''}</div>
      </div>
    );
  }
  if (option.basePrice != null) {
    return (
      <div>
        <div className={`${large ? 'text-xl' : 'text-sm'} font-extrabold text-navy`}>{inr(option.basePrice)} <span className="text-xs font-semibold text-muted">/ {option.unit || 'unit'}</span></div>
        <div className="text-[10px] text-muted">{option.pricingType === 'PER_PERSON' ? 'Add a guest count for a total' : 'No fixed total listed'}</div>
      </div>
    );
  }
  return <div className="text-xs text-muted">No price listed yet</div>;
}

/** Art tile: the vendor's own image if any, else a category-icon gradient (no stock photos). */
export function ArtTile({ option, className = 'h-28' }) {
  if (option.images?.[0]) return <img src={option.images[0]} alt="" className={`w-full object-cover rounded-xl ${className}`} />;
  return (
    <div className={`w-full rounded-xl bg-gradient-to-br from-primary-soft to-[#e6dcff] grid place-items-center text-primary ${className}`}>
      <Icon name={categoryIcon(option.category)} size={28} />
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60 ${className}`} />;
}

export function SkeletonLine({ className = 'w-full h-3.5' }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/80 dark:bg-slate-800/70 ${className}`} />;
}

export function CardSkeleton({ count = 3 }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-200/70 animate-pulse shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-3/4 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded-full bg-slate-200/50 animate-pulse" />
            </div>
          </div>
          <div className="h-14 rounded-xl bg-slate-100/80 animate-pulse" />
          <div className="flex justify-between items-center pt-2 border-t border-gray-50">
            <div className="h-3 w-16 rounded-full bg-slate-200/60 animate-pulse" />
            <div className="h-7 w-20 rounded-xl bg-slate-200/70 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ title = 'Loading…', count = 3, type = 'cards' }) {
  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fadeIn">
      {/* Top Header Skeleton */}
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-xl bg-slate-200/80 animate-pulse" />
          <div className="h-3 w-64 rounded-full bg-slate-200/60 animate-pulse" />
        </div>
        <div className="h-9 w-24 rounded-xl bg-slate-200/60 animate-pulse" />
      </div>

      {/* Hero / Overview Card Skeleton */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary-soft animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-1/3 rounded-full bg-slate-200/80 animate-pulse" />
            <div className="h-3 w-1/2 rounded-full bg-slate-200/50 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-50">
          <div className="h-16 rounded-2xl bg-slate-100/70 animate-pulse" />
          <div className="h-16 rounded-2xl bg-slate-100/70 animate-pulse" />
          <div className="h-16 rounded-2xl bg-slate-100/70 animate-pulse" />
          <div className="h-16 rounded-2xl bg-slate-100/70 animate-pulse" />
        </div>
      </div>

      {/* Content Skeleton */}
      {type === 'cards' && <CardSkeleton count={count} />}
      {type === 'list' && (
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl bg-slate-200/70 animate-pulse shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-1/3 rounded-full bg-slate-200/80 animate-pulse" />
                  <div className="h-2.5 w-1/4 rounded-full bg-slate-200/50 animate-pulse" />
                </div>
              </div>
              <div className="h-8 w-24 rounded-xl bg-slate-200/60 animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fadeIn">
      <div className="h-4 w-28 rounded-full bg-slate-200/70 animate-pulse" />
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-48 sm:h-64 bg-slate-200/70 animate-pulse" />
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-2">
            <div className="h-6 w-1/2 rounded-xl bg-slate-200/80 animate-pulse" />
            <div className="h-3.5 w-1/3 rounded-full bg-slate-200/60 animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 space-y-3">
          <div className="h-4 w-1/3 rounded-full bg-slate-200/80 animate-pulse" />
          <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100 space-y-3">
          <div className="h-4 w-1/3 rounded-full bg-slate-200/80 animate-pulse" />
          <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function CustomerLoadingScreen({ title = 'Loading your workspace', detail = 'Getting the latest STARVNT details...' }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-4 animate-fadeIn">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-sm border border-gray-100 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-primary-soft text-primary grid place-items-center shrink-0">
            <Icon name="bolt" size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-navy">{title}</div>
            <div className="text-xs text-muted mt-0.5">{detail}</div>
          </div>
        </div>
        <div className="mt-5 grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-3">
            <div className="h-24 rounded-2xl bg-lavender/80 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-10 rounded-2xl bg-gray-100 animate-pulse" />
            <div className="h-10 rounded-2xl bg-gray-100 animate-pulse" />
            <div className="h-10 rounded-2xl bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomerErrorScreen({ title = 'Could not load this screen', message = 'Please try again.', onRetry, action }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-red-100 p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 text-red-500 grid place-items-center">
          <Icon name="help" size={20} />
        </div>
        <div className="mt-3 text-base font-extrabold text-navy">{title}</div>
        <p className="text-xs text-muted mt-1 leading-relaxed">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">
              Try again
            </button>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}

/** Tiny fetch hook: { data, error, loading, reload, setData }. */
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}
