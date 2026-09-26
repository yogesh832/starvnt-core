import { Link, useParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, CustomerPageSkeleton, ProgressBar, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';

function lineFor(i) {
  if (i.bookedCost != null) return { text: `Booked · ${formatINR(i.bookedCost)}`, sub: i.vendorName, tone: 'text-emerald-600' };
  if (i.status === 'customer_provided') return { text: 'Arranged by you', sub: i.providedValue, tone: 'text-emerald-600' };
  if (i.estimatedCost != null) return { text: `est. ${formatINR(i.estimatedCost)}`, sub: `lowest listed option${i.estimateIsDemo ? ' (demo)' : ''}`, tone: 'text-navy' };
  return { text: 'Not selected', sub: i.optionCount ? `${i.optionCount} option(s), no fixed price` : 'No options listed yet', tone: 'text-muted' };
}

export default function BudgetPage() {
  const { id } = useParams();
  const { data, error, loading } = useLoad(() => customerApi.dashboard(id), [id]);
  if (loading) return <CustomerPageSkeleton cards={3} />;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, summary } = data;
  const b = summary.budget;
  const total = b.committedCost + b.estimatedCost;
  const pct = b.target ? Math.min(100, Math.round((total / b.target) * 100)) : 0;
  const rows = summary.items.filter((i) => i.tier === 'essential' || i.status !== 'missing');

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Budget</h1>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">Total estimated</div>
            <div className="text-2xl font-extrabold text-navy">{formatINR(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted">Your budget</div>
            <div className="text-sm font-bold text-navy">
              {b.target == null ? 'Not set' : b.isRange ? `${b.rangeLabel}` : formatINR(b.target)}
            </div>
          </div>
        </div>
        {b.target != null && (
          <>
            <div className="mt-3"><ProgressBar percent={pct} /></div>
            <div className={`text-xs font-bold mt-2 ${b.remaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {b.remaining < 0 ? `${formatINR(-b.remaining)} over budget` : `${formatINR(b.remaining)} remaining`}
              {b.isRange && <span className="text-muted font-normal"> (compared with the top of your range)</span>}
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
          <div className="bg-lavender/60 rounded-xl p-2.5"><div className="text-muted">Booked</div><div className="font-bold text-navy">{formatINR(b.committedCost)}</div></div>
          <div className="bg-lavender/60 rounded-xl p-2.5"><div className="text-muted">Est. still to arrange</div><div className="font-bold text-navy">{formatINR(b.estimatedCost)}</div></div>
        </div>
        {b.estimateUsesDemoData && <p className="text-[10px] text-amber-700 mt-2">Some estimates use demo listings, not real vendor prices.</p>}
        {b.servicesWithoutEstimate.length > 0 && <p className="text-[10px] text-muted mt-1">No price listed yet for: {b.servicesWithoutEstimate.join(', ')}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
        {rows.map((i) => {
          const l = lineFor(i);
          return (
            <div key={i.category} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-navy">{i.label}</div>
                {l.sub && <div className="text-[10px] text-muted truncate">{l.sub}</div>}
              </div>
              <div className={`font-semibold shrink-0 ${l.tone}`}>{l.text}</div>
            </div>
          );
        })}
      </div>

      <Link to={`/customer/aura?event=${id}&ask=${encodeURIComponent('How can I save on my budget?')}`} className="inline-flex rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">
        Find ways to save → Ask Aura+
      </Link>
    </div>
  );
}
