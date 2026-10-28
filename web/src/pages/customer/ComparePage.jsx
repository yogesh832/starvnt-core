import { Link, useParams, useSearchParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { AvailabilityPill, BackLink, DemoBadge, PageSkeleton, PriceText, RatingText, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';
import SelectOptionButton from './SelectOptionButton.jsx';

const travel = (o) => (!o.costBreakdown || o.costBreakdown.travel == null ? 'Not specified' : o.costBreakdown.travel === 0 ? 'Included' : formatINR(o.costBreakdown.travel));

export default function ComparePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const { data, error, loading, setData } = useLoad(() => customerApi.compare(id, ids), [id, params.get('ids')]);

  if (loading) return <PageSkeleton title="Compare Options" count={2} type="cards" />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to={`/customer/events/${id}/services`}>Options</BackLink>
        <div className="mt-3 text-sm text-red-500">{errorText(error)}</div>
      </div>
    );
  }
  const { options, label, category } = data;
  const rows = [
    ['Package', (o) => o.packageName],
    ['Price', (o) => <PriceText option={o} />],
    ['Availability', (o) => <AvailabilityPill value={o.availability} />],
    ['Coverage', (o) => o.requiresVendorConfirmation ? (o.extendedService?.label || 'Extended service - confirmation required') : 'Within configured coverage'],
    ['Travel', travel],
    ['Includes', (o) => (o.includes.length ? o.includes.join(', ') : 'Not specified')],
    ['Rating', (o) => <RatingText rating={o.rating} reviewCount={o.reviewCount} />],
    ['Summary', (o) => <b className={o.summary === 'Best value' ? 'text-primary dark:text-[#a5b4fc]' : o.summary === 'Not available' ? 'text-red-500 dark:text-red-400' : 'text-navy dark:text-white'}>{o.summary}</b>],
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}/services?category=${category}`}>{label} options</BackLink>
      <h1 className="text-xl font-extrabold text-navy dark:text-white">Compare {label.toLowerCase()} options</h1>

      <div className="bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="text-left p-3 w-28" />
              {options.map((o) => (
                <th key={o.id} className="text-left p-3 align-top">
                  <div className="font-extrabold text-navy dark:text-white text-sm">{o.vendorName}</div>
                  {o.isDemo && <div className="mt-1"><DemoBadge /></div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, render]) => (
              <tr key={name} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                <td className="p-3 text-muted dark:text-slate-400 font-semibold align-top">{name}</td>
                {options.map((o) => <td key={o.id} className="p-3 align-top text-ink/80 dark:text-slate-200">{render(o)}</td>)}
              </tr>
            ))}
            <tr>
              <td className="p-3" />
              {options.map((o) => (
                <td key={o.id} className="p-3 space-y-2">
                  <SelectOptionButton
                    eventId={id}
                    eventStatus={data.event.status}
                    option={o}
                    selected={data.selectedOptionId === o.id}
                    onChanged={(optionId) => setData({ ...data, selectedOptionId: optionId })}
                    compact
                  />
                  <Link to={`/customer/events/${id}/services/${o.id}`} className="block text-xs font-bold text-primary dark:text-[#a5b4fc]">View details →</Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <Link
        to={`/customer/aura?event=${id}&ask=${encodeURIComponent(`Why pick one ${label.toLowerCase()} option over the other: ${options.map((o) => o.vendorName).join(' vs ')}?`)}`}
        className="inline-flex rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5"
      >
        Why pick one over the other? Ask Aura+
      </Link>
    </div>
  );
}
