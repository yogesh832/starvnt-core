import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, DemoBadge, Empty, categoryIcon, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';

const STATUS = {
  confirmed: ['✓ Booked', 'text-emerald-600'],
  pending: ['⏳ Under review', 'text-amber-600'],
  cancelled: ['Cancelled', 'text-muted'],
};

/** My Vendors: booked vendors, then options you chose but haven't booked. Real rows only. */
export default function VendorsPage() {
  const { id } = useParams();
  const bookings = useLoad(() => customerApi.bookings(id), [id]);
  const plan = useLoad(() => customerApi.requirements(id), [id]);

  if (bookings.loading || plan.loading) return <div className="text-xs text-muted">Loading…</div>;
  const error = bookings.error || plan.error;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;

  const booked = bookings.data.bookings;
  const chosen = plan.data.requirements.filter((r) => r.selectedOption && r.status === 'pending');

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{bookings.data.event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">My vendors</h1>

      {booked.length === 0 && chosen.length === 0 && (
        <Empty
          title="No vendors yet"
          action={<Link to={`/customer/events/${id}/services`} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">Find options</Link>}
        >
          Vendors appear here once you choose or book an option.
        </Empty>
      )}

      {booked.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm font-extrabold text-navy">Booked</div>
          {booked.map((b) => {
            const [label, cls] = STATUS[b.status];
            return (
              <div key={b.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(b.category)} size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-navy truncate">{b.vendorName} {b.isDemo && <DemoBadge />}</div>
                  <div className="text-[11px] text-muted">{b.label} · {b.packageName} · {formatINR(b.amount)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[11px] font-bold ${cls}`}>{label}</div>
                  <Link to={`/customer/events/${id}/circle?booking=${b.id}`} className="text-[11px] font-bold text-primary">Message</Link>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {chosen.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm font-extrabold text-navy">Chosen — not booked yet</div>
          {chosen.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-lavender text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(r.category)} size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-navy truncate">{r.selectedOption.vendorName} {r.selectedOption.isDemo && <DemoBadge />}</div>
                <div className="text-[11px] text-muted">{r.label} · {r.selectedOption.packageName} · {formatINR(r.selectedOption.price)}</div>
              </div>
              <Link to={`/customer/events/${id}/quotes`} className="text-[11px] font-bold text-primary shrink-0">Get a quote →</Link>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
