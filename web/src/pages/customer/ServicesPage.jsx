import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import {
  ArtTile,
  AvailabilityPill,
  BackLink,
  DemoBadge,
  Empty,
  PriceText,
  RatingText,
  Tabs,
  categoryIcon,
  PageSkeleton,
  useLoad,
} from './customerUi.jsx';
import { formatDate, formatINR, planStatus } from './format.js';
import SelectOptionButton from './SelectOptionButton.jsx';

// Sort by price; options without a listed total always go last.
const byPrice = (dir) => (a, b) => {
  if (a.price == null || b.price == null) return (a.price == null) - (b.price == null);
  return (a.price - b.price) * dir;
};

/** Open plan items, each leading to its options. */
function CategoryList({ eventId }) {
  const { data, error, loading } = useLoad(() => customerApi.services(eventId), [eventId]);
  if (loading) return <PageSkeleton title="Services" count={4} type="cards" />;
  if (error) return <div className="text-sm text-red-500 dark:text-red-400">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, categories } = data;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${eventId}`}>{event.title}</BackLink>
      <div>
        <h1 className="text-xl font-extrabold text-navy dark:text-white">Find options</h1>
        <p className="text-xs text-muted dark:text-slate-400 mt-0.5">Services still open in your plan. You decide — nothing is booked without you.</p>
      </div>
      {categories.length === 0 ? (
        <Empty title="Everything is handled">No open services in your plan right now.</Empty>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {categories.map((c) => (
            <Link key={c.category} to={`?category=${c.category}`} className="bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 p-3.5 flex items-center gap-3 hover:shadow-sm transition">
              <span className="w-9 h-9 rounded-xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center shrink-0"><Icon name={categoryIcon(c.category)} size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-navy dark:text-white truncate">{c.label}</div>
                <div className="text-[11px] text-muted dark:text-slate-400 truncate">{planStatus(c).text}</div>
                <div className="text-[10px] text-muted dark:text-slate-400 truncate">
                  {c.optionCount > 0 ? `${c.optionCount} option${c.optionCount > 1 ? 's' : ''}${c.lowestPrice != null ? ` · from ${formatINR(c.lowestPrice)}` : ''}${c.lowestIsDemo ? ' (demo)' : ''}` : 'No options listed yet'}
                </div>
              </div>
              <span className="text-muted dark:text-slate-500">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionCard({ eventId, eventStatus, option, best, selected, onSelected, checked, onToggle, canCompare, requirementId }) {
  const [messageState, setMessageState] = useState('');
  const rec = option.recommendation || {};
  const askVendor = async (question) => {
    if (!requirementId) return;
    setMessageState('sending');
    try {
      await customerApi.postMessage(eventId, {
        requirementId,
        optionId: option.id,
        body: `${option.vendorName} - ${option.packageName}: ${question}`,
      });
      setMessageState('sent');
      setTimeout(() => setMessageState(''), 2500);
    } catch {
      setMessageState('error');
    }
  };
  return (
    <div className={`bg-white dark:bg-[#161926] rounded-2xl border p-3 flex flex-col ${best ? 'border-primary/40 dark:border-primary/60 shadow-sm shadow-primary/10' : 'border-gray-100 dark:border-gray-800'}`}>
      <div className="relative">
        <ArtTile option={option} />
        <div className="absolute top-2 left-2 flex gap-1">
          {best && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-primary text-white">Best value</span>}
          {option.isDemo && <DemoBadge />}
        </div>
      </div>
      <div className="mt-2.5 flex-1">
        <div className="text-sm font-extrabold text-navy dark:text-white truncate">{option.vendorName}</div>
        <div className="text-[11px] text-muted dark:text-slate-400 flex items-center justify-between gap-1 mt-0.5">
          <span className="truncate">{option.packageName}</span>
          {option.vendorLocation && (
            <span className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200/60 dark:border-amber-800/40 shrink-0">
              📍 {option.vendorLocation}
            </span>
          )}
        </div>
        <div className="mt-1"><RatingText rating={option.rating} reviewCount={option.reviewCount} /></div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <PriceText option={option} />
          <AvailabilityPill value={option.availability} />
        </div>
        {rec.auraScore && (
          <div className="mt-2 rounded-2xl border border-primary/10 dark:border-primary/30 bg-primary-soft/50 dark:bg-primary/15 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-extrabold text-primary dark:text-[#a5b4fc]">AuraScore {rec.auraScore}/100</div>
              <div className="text-[10px] font-bold text-navy dark:text-slate-200">{rec.matchLevel}</div>
            </div>
            {rec.distance?.distanceText && (
              <div className="mt-1 text-[10px] text-muted dark:text-slate-400">
                {rec.distance.distanceText}{rec.distance.durationText ? ` · ${rec.distance.durationText}` : ''} from pinned location
                {rec.distance.source === 'estimate' ? ' · estimate' : ''}
              </div>
            )}
            {rec.whyBest?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {rec.whyBest.slice(0, 2).map((i) => (
                  <li key={i} className="text-[10px] text-ink/80 dark:text-slate-300 flex gap-1.5"><Icon name="check" size={10} className="text-emerald-500 mt-0.5 shrink-0" /> {i}</li>
                ))}
              </ul>
            )}
            {rec.whyNot?.length > 0 && (
              <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-transparent dark:border-amber-800/40 rounded-xl px-2 py-1.5">
                Check: {rec.whyNot.slice(0, 2).join(' · ')}
              </div>
            )}
          </div>
        )}
        {option.includes.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {option.includes.slice(0, 3).map((i) => (
              <li key={i} className="text-[11px] text-ink/80 dark:text-slate-300 flex gap-1.5"><Icon name="check" size={11} className="text-emerald-500 mt-0.5 shrink-0" /> {i}</li>
            ))}
          </ul>
        )}
        {rec.negotiable?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {rec.negotiable.slice(0, 3).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => askVendor(`Can we discuss ${n}?`)}
                className="rounded-full bg-lavender dark:bg-primary/20 text-primary dark:text-[#a5b4fc] text-[10px] font-bold px-2 py-1 hover:bg-primary dark:hover:bg-primary hover:text-white transition cursor-pointer"
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-[#1a1e2e] p-2">
        <div className="text-[10px] font-bold text-muted dark:text-slate-400 uppercase tracking-wide">Ask before choosing</div>
        <div className="mt-1 grid gap-1">
          {(rec.suggestedQuestions || ['Can this fit my theme and budget?']).slice(0, 2).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => askVendor(q)}
              disabled={!requirementId || messageState === 'sending'}
              className="text-left text-[11px] font-semibold text-navy dark:text-white bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-700/80 rounded-xl px-2.5 py-1.5 hover:border-primary/30 dark:hover:border-primary/50 disabled:opacity-50 transition cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
        {messageState === 'sent' && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Message added to this service thread.</span>
            <Link to={`/customer/events/${eventId}/circle?service=${requirementId}`} className="text-[10px] font-bold text-primary dark:text-[#a5b4fc]">View thread</Link>
          </div>
        )}
        {messageState === 'error' && <div className="mt-1 text-[10px] font-bold text-red-500 dark:text-red-400">Could not send message.</div>}
      </div>
      <div className="mt-3 flex items-start gap-2">
        <SelectOptionButton eventId={eventId} eventStatus={eventStatus} option={option} selected={selected} onChanged={onSelected} compact />
        <Link to={`/customer/events/${eventId}/services/${option.id}`} className="flex-1 text-center rounded-xl border border-gray-200 dark:border-gray-700 text-[11px] font-bold py-1.5 text-navy dark:text-slate-200 hover:bg-lavender dark:hover:bg-white/10 transition">Details</Link>
        <label className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${canCompare || checked ? 'text-navy dark:text-slate-200 cursor-pointer' : 'text-muted dark:text-slate-500'}`}>
          <input type="checkbox" checked={checked} disabled={!canCompare && !checked} onChange={onToggle} className="accent-primary" /> Compare
        </label>
      </div>
    </div>
  );
}

function CategoryOptions({ eventId, category }) {
  const navigate = useNavigate();
  const { data, error, loading, setData } = useLoad(() => customerApi.services(eventId, category), [eventId, category]);
  const [sort, setSort] = useState('recommended');
  const [picked, setPicked] = useState([]);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState('');

  const sorted = useMemo(() => {
    const list = [...(data?.options || [])];
    if (sort === 'budget') list.sort(byPrice(1));
    if (sort === 'premium') list.sort(byPrice(-1));
    return list; // 'recommended' keeps the server order: bookable first, then price
  }, [data, sort]);

  if (loading) return <PageSkeleton title="Vendor Options" count={4} type="cards" />;
  if (error) return <div className="text-sm text-red-500 dark:text-red-400">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, label, options, bestValueId, selectedOptionId, requirement } = data;
  const chosen = options.find((o) => o.id === selectedOptionId);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const meta = [event.city, event.eventDate && formatDate(event.eventDate)].filter(Boolean).join(' · ');

  async function requestSelectedQuote() {
    if (!chosen) return;
    if (chosen.isDemo) {
      navigate(`/customer/events/${eventId}/quotes`);
      return;
    }
    setRequestBusy(true);
    setRequestError('');
    try {
      await customerApi.requestVendorQuotes(eventId);
      navigate(`/customer/events/${eventId}/quotes`);
    } catch (err) {
      setRequestError(errorText(err, 'Could not send quote request to vendor.'));
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-20">
      <BackLink to={`/customer/events/${eventId}/services`}>All services</BackLink>
      <div>
        <h1 className="text-xl font-extrabold text-navy dark:text-white">{label} options</h1>
        {meta && <p className="text-xs text-muted dark:text-slate-400 mt-0.5">{meta}</p>}
      </div>

      {options.length === 0 ? (
        <Empty title={`No ${label.toLowerCase()} options listed yet`}>
          We don't have verified options for this yet. Ask Aura+ or check back soon.
        </Empty>
      ) : (
        <>
          <Tabs
            value={sort}
            onChange={setSort}
            tabs={[
              { key: 'recommended', label: 'Recommended' },
              { key: 'budget', label: 'Budget' },
              { key: 'premium', label: 'Premium' },
            ]}
          />
          {chosen && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40 px-4 py-3 text-xs">
              <span className="text-emerald-800 dark:text-emerald-300">You selected <b>{chosen.vendorName}</b>{chosen.isDemo ? ' (demo listing)' : ''}. Nothing is reserved yet.</span>
              <button
                type="button"
                onClick={requestSelectedQuote}
                disabled={requestBusy}
                className="ml-auto rounded-xl bg-emerald-600 dark:bg-emerald-500 text-white font-bold px-3 py-1.5 hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
              >
                {requestBusy ? 'Sending...' : chosen.isDemo ? 'Continue to quote →' : 'Request vendor quote →'}
              </button>
              {requestError && <span className="basis-full text-[11px] font-bold text-red-500 dark:text-red-400">{requestError}</span>}
            </div>
          )}
          {options.some((o) => o.isRegionalMatch) && (
            <div className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3.5 shadow-xs">
              <Icon name="info" size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold">No direct vendors in {event.city || 'your immediate location'}.</span>{" "}
                Showing top verified regional options available in nearby areas that cover your event:
              </div>
            </div>
          )}
          {options.some((o) => o.isDemo) && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 rounded-xl px-3 py-2">Some options are demo listings for development — not real vendors.</p>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((o) => (
              <OptionCard
                key={o.id}
                eventId={eventId}
                eventStatus={event.status}
                option={o}
                best={o.id === bestValueId}
                selected={o.id === selectedOptionId}
                onSelected={(optionId) => setData({ ...data, selectedOptionId: optionId })}
                checked={picked.includes(o.id)}
                canCompare={picked.length < 4}
                onToggle={() => toggle(o.id)}
                requirementId={requirement?.id}
              />
            ))}
          </div>
        </>
      )}

      <div className="rounded-2xl p-4 bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0"><Icon name="bolt" size={14} /></span>
        <div className="flex-1 min-w-0 text-xs"><b className="text-navy dark:text-white">Not sure which to pick?</b> <span className="text-muted dark:text-slate-400">Aura+ can explain the differences.</span></div>
        <Link
          to={`/customer/aura?event=${eventId}&ask=${encodeURIComponent(`Which ${label.toLowerCase()} option should I pick?`)}`}
          className="rounded-xl bg-primary text-white text-xs font-bold px-3 py-2 shrink-0 hover:bg-primary-dark transition"
        >
          Ask Aura+
        </Link>
      </div>

      {picked.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 inset-x-3 md:left-auto md:right-6 md:w-96 z-30 bg-navy dark:bg-[#1a1d2e] border border-gray-800 text-white rounded-2xl shadow-xl p-3 flex items-center gap-3">
          <div className="flex-1 text-xs">{picked.length} selected to compare {picked.length < 2 && <span className="text-white/60">(pick at least 2)</span>}</div>
          <button onClick={() => setPicked([])} className="text-[11px] text-white/70 hover:text-white cursor-pointer">Clear</button>
          <button
            disabled={picked.length < 2}
            onClick={() => navigate(`/customer/events/${eventId}/compare?ids=${picked.join(',')}`)}
            className="rounded-xl bg-white text-navy text-xs font-bold px-3 py-2 disabled:opacity-50 cursor-pointer hover:bg-gray-100 transition"
          >
            Compare
          </button>
        </div>
      )}
    </div>
  );
}

export default function ServicesPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const category = params.get('category');
  return category ? <CategoryOptions eventId={id} category={category} /> : <CategoryList eventId={id} />;
}
