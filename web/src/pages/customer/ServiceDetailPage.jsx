import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { ArtTile, AvailabilityPill, BackLink, DemoBadge, PriceText, RatingText, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';
import SelectOptionButton from './SelectOptionButton.jsx';

function Line({ label, value }) {
  return (
    <div className="flex justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-navy">{value}</span>
    </div>
  );
}

// 0 → "Included"; null → the vendor didn't specify it.
const money = (n) => (n == null ? 'Not specified' : n === 0 ? 'Included' : formatINR(n));

export default function ServiceDetailPage() {
  const { id, serviceId } = useParams();
  const { data, error, loading, setData } = useLoad(() => customerApi.serviceDetail(id, serviceId), [id, serviceId]);

  if (loading) return <div className="text-xs text-muted">Loading…</div>;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to={`/customer/events/${id}/services`}>Options</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'This option is not available.' : errorText(error)}</div>
      </div>
    );
  }
  const { option } = data;
  const cb = option.costBreakdown;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}/services?category=${option.category}`}>All options</BackLink>

      <div className="bg-white rounded-3xl shadow-sm p-4 sm:p-5 space-y-4">
        <ArtTile option={option} className="h-40" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-navy">{option.vendorName}</h1>
              {option.isDemo && <DemoBadge />}
            </div>
            {option.vendorLocation && <div className="text-[11px] text-muted mt-0.5">{option.vendorLocation}</div>}
            <div className="mt-1"><RatingText rating={option.rating} reviewCount={option.reviewCount} /></div>
          </div>
          <AvailabilityPill value={option.availability} />
        </div>
        {(option.description || option.vendorBio) && (
          <p className="text-xs text-ink/80 leading-relaxed">{option.description || option.vendorBio}</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Package</div>
          <div className="text-sm font-extrabold text-navy mt-0.5">{option.packageName}</div>
          <div className="mt-3">
            {cb ? (
              <>
                <Line label="Base" value={money(cb.base)} />
                <Line label="Travel" value={money(cb.travel)} />
                <Line label="Additional" value={money(cb.additional)} />
              </>
            ) : null}
          </div>
          <div className="mt-3"><PriceText option={option} large /></div>
          {option.mayApply.length > 0 && (
            <div className="mt-3 text-[11px] text-muted">
              <div className="font-bold text-navy">May apply</div>
              {option.mayApply.map((m) => (
                <div key={m.name}>{m.name}: {formatINR(m.amount)}{m.condition ? ` (${m.condition})` : ''}</div>
              ))}
            </div>
          )}
          {option.cancellationPolicy && <div className="mt-2 text-[11px] text-muted">Cancellation: {option.cancellationPolicy}</div>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted">What's included</div>
          {option.includes.length ? (
            <ul className="mt-2 space-y-1">
              {option.includes.map((i) => (
                <li key={i} className="text-xs text-ink/80 flex gap-1.5"><Icon name="check" size={12} className="text-emerald-500 mt-0.5 shrink-0" /> {i}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted mt-2">Not specified by the vendor.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <SelectOptionButton
          eventId={id}
          eventStatus={data.event.status}
          option={option}
          selected={data.selected}
          onChanged={(optionId) => setData({ ...data, selected: optionId === option.id })}
        />
        {data.selected && (
          <Link to={`/customer/events/${id}/quotes`} className="rounded-xl bg-emerald-600 text-white text-xs font-bold px-4 py-2">Get a quote →</Link>
        )}
        <Link
          to={`/customer/aura?event=${id}&ask=${encodeURIComponent(`Why pick ${option.vendorName} – ${option.packageName}?`)}`}
          className="rounded-xl border border-gray-200 text-navy text-xs font-bold px-4 py-2 hover:bg-lavender"
        >
          Ask Aura+ about this option
        </Link>
      </div>
    </div>
  );
}
