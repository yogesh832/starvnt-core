import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import {
  ArtTile,
  AvailabilityPill,
  BackLink,
  CustomerPageSkeleton,
  DemoBadge,
  Empty,
  PriceText,
  RatingText,
  Tabs,
  categoryIcon,
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
  if (loading) return <CustomerPageSkeleton cards={3} />;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, categories } = data;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${eventId}`}>{event.title}</BackLink>
      <div>
        <h1 className="text-xl font-extrabold text-navy">Find options</h1>
        <p className="text-xs text-muted mt-0.5">Services still open in your plan. You decide — nothing is booked without you.</p>
      </div>
      {categories.length === 0 ? (
        <Empty title="Everything is handled">No open services in your plan right now.</Empty>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {categories.map((c) => (
            <Link key={c.category} to={`?category=${c.category}`} className="bg-white rounded-2xl border border-gray-100 p-3.5 flex items-center gap-3 hover:shadow-sm transition">
              <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(c.category)} size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-navy truncate">{c.label}</div>
                <div className="text-[11px] text-muted truncate">{planStatus(c).text}</div>
                <div className="text-[10px] text-muted truncate">
                  {c.optionCount > 0 ? `${c.optionCount} option${c.optionCount > 1 ? 's' : ''}${c.lowestPrice != null ? ` · from ${formatINR(c.lowestPrice)}` : ''}${c.lowestIsDemo ? ' (demo)' : ''}` : 'No options listed yet'}
                </div>
              </div>
              <span className="text-muted">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionCard({ eventId, eventStatus, option, best, selected, onSelected, checked, onToggle, canCompare }) {
  return (
    <div className={`bg-white rounded-2xl border p-3 flex flex-col ${best ? 'border-primary/40 shadow-sm shadow-primary/10' : 'border-gray-100'}`}>
      <div className="relative">
        <ArtTile option={option} />
        <div className="absolute top-2 left-2 flex gap-1">
          {best && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-primary text-white">Best value</span>}
          {option.isDemo && <DemoBadge />}
        </div>
      </div>
      <div className="mt-2.5 flex-1">
        <div className="text-sm font-extrabold text-navy truncate">{option.vendorName}</div>
        <div className="text-[11px] text-muted truncate">{option.packageName}</div>
        <div className="mt-1"><RatingText rating={option.rating} reviewCount={option.reviewCount} /></div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <PriceText option={option} />
          <AvailabilityPill value={option.availability} />
        </div>
        {option.includes.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {option.includes.slice(0, 3).map((i) => (
              <li key={i} className="text-[11px] text-ink/80 flex gap-1.5"><Icon name="check" size={11} className="text-emerald-500 mt-0.5 shrink-0" /> {i}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex items-start gap-2">
        <SelectOptionButton eventId={eventId} eventStatus={eventStatus} option={option} selected={selected} onChanged={onSelected} compact />
        <Link to={`/customer/events/${eventId}/services/${option.id}`} className="flex-1 text-center rounded-xl border border-gray-200 text-[11px] font-bold py-1.5 text-navy hover:bg-lavender">Details</Link>
        <label className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${canCompare || checked ? 'text-navy cursor-pointer' : 'text-muted'}`}>
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

  const sorted = useMemo(() => {
    const list = [...(data?.options || [])];
    if (sort === 'budget') list.sort(byPrice(1));
    if (sort === 'premium') list.sort(byPrice(-1));
    return list; // 'recommended' keeps the server order: bookable first, then price
  }, [data, sort]);

  if (loading) return <CustomerPageSkeleton cards={6} />;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, label, options, bestValueId, selectedOptionId } = data;
  const chosen = options.find((o) => o.id === selectedOptionId);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const meta = [event.city, event.eventDate && formatDate(event.eventDate)].filter(Boolean).join(' · ');

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-20">
      <BackLink to={`/customer/events/${eventId}/services`}>All services</BackLink>
      <div>
        <h1 className="text-xl font-extrabold text-navy">{label} options</h1>
        {meta && <p className="text-xs text-muted mt-0.5">{meta}</p>}
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
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs">
              <span className="text-emerald-800">You selected <b>{chosen.vendorName}</b>{chosen.isDemo ? ' (demo listing)' : ''}. Nothing is reserved yet.</span>
              <Link to={`/customer/events/${eventId}/quotes`} className="ml-auto rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5">Get a quote →</Link>
            </div>
          )}
          {options.some((o) => o.isDemo) && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Some options are demo listings for development — not real vendors.</p>
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
              />
            ))}
          </div>
        </>
      )}

      <div className="rounded-2xl p-4 bg-white shadow-sm flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0"><Icon name="bolt" size={14} /></span>
        <div className="flex-1 min-w-0 text-xs"><b className="text-navy">Not sure which to pick?</b> <span className="text-muted">Aura+ can explain the differences.</span></div>
        <Link
          to={`/customer/aura?event=${eventId}&ask=${encodeURIComponent(`Which ${label.toLowerCase()} option should I pick?`)}`}
          className="rounded-xl bg-primary text-white text-xs font-bold px-3 py-2 shrink-0"
        >
          Ask Aura+
        </Link>
      </div>

      {picked.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 inset-x-3 md:left-auto md:right-6 md:w-96 z-30 bg-navy text-white rounded-2xl shadow-xl p-3 flex items-center gap-3">
          <div className="flex-1 text-xs">{picked.length} selected to compare {picked.length < 2 && <span className="text-white/60">(pick at least 2)</span>}</div>
          <button onClick={() => setPicked([])} className="text-[11px] text-white/70 hover:text-white">Clear</button>
          <button
            disabled={picked.length < 2}
            onClick={() => navigate(`/customer/events/${eventId}/compare?ids=${picked.join(',')}`)}
            className="rounded-xl bg-white text-navy text-xs font-bold px-3 py-2 disabled:opacity-50"
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
