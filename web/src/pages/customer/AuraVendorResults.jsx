import { useState } from 'react';
import { Link } from 'react-router-dom';

const money = value => `₹${Number(value).toLocaleString('en-IN')}`;
const availability = { no_event_date: 'Date needed to check availability', unconfirmed: 'Not confirmed by vendor', blocked: 'Blocked on this date', booked: 'Booked on this date', requires_vendor_confirmation: 'Extended coverage · vendor confirmation needed' };
const initials = value => String(value || 'Vendor').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export default function AuraVendorResults({ rows, search, eventId }) {
  const [all, setAll] = useState(false);
  if (!rows?.length) return null;
  const visibleRows = all ? rows : rows.slice(0, 8);
  return <section aria-label="Matching vendor services" className="space-y-2 aura-card-reveal">
    <h3 className="text-sm font-bold text-navy dark:text-slate-100">{rows.length} matching services</h3>
    {eventId && search?.scopeMatchesEvent === false && <p className="text-[11px] text-muted dark:text-slate-400">These results use your search details. Update your event before requesting a quote.</p>}
    <p className="text-[11px] text-muted dark:text-slate-400">From the current vendor catalogue{search?.city ? ` · ${search.city}` : ' · choose a city to check coverage'}</p>
    <div role="list" aria-label="Scrollable vendor gallery" className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3">
      {visibleRows.map(row => {
        const samples = (row.portfolioSamples || []).filter(sample => sample.imageUrl || sample.url);
        const sampleImages = samples.length ? samples : (row.portfolioImages || []).map(imageUrl => ({ imageUrl, url: imageUrl, title: 'Project sample' }));
        const cover = sampleImages[0];
        return <article role="listitem" key={row.id} className="w-[min(84vw,340px)] shrink-0 snap-start overflow-hidden rounded-2xl border border-primary/20 bg-white dark:bg-[#1e2235] shadow-sm">
          <div className="relative h-36 overflow-hidden bg-gradient-to-br from-indigo-200 via-violet-100 to-amber-100 dark:from-indigo-950 dark:via-slate-800 dark:to-violet-950">
            {cover?.imageUrl && <img src={cover.imageUrl} alt={cover.title || `${row.vendor} project sample`} loading="lazy" className="h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white">{row.service}</span>
            {cover && <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white">Project sample</span>}
          </div>
          <div className="p-4 pt-0">
            <div className="-mt-7 mb-2 flex items-end gap-2.5">
              {row.profilePicUrl
                ? <img src={row.profilePicUrl} alt={`${row.vendor} profile`} loading="lazy" className="h-14 w-14 rounded-2xl border-[3px] border-white bg-white object-cover shadow-md dark:border-[#1e2235]" />
                : <div aria-label={`${row.vendor} profile placeholder`} className="grid h-14 w-14 place-items-center rounded-2xl border-[3px] border-white bg-primary text-sm font-bold text-white shadow-md dark:border-[#1e2235]">{initials(row.vendor)}</div>}
              <div className="min-w-0 flex-1 pb-1">
                <h4 className="truncate text-sm font-bold text-navy dark:text-slate-100">{row.vendor}</h4>
                {row.rating != null && <p className="text-[10px] text-muted dark:text-slate-400">★ {row.rating} rating · {row.reviewCount} reviews</p>}
              </div>
            </div>
            {row.recommendation?.auraScore != null && <div className="mb-2 rounded-xl bg-primary/5 px-3 py-2 dark:bg-primary/10">
              <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-primary dark:text-[#a5b4fc]">Aura match · {row.recommendation.auraScore}/100</span><span className="text-[10px] text-muted dark:text-slate-400">{row.recommendation.matchLevel}</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary" style={{ width: `${row.recommendation.auraScore}%` }} /></div>
              {!!row.recommendation.whyBest?.[0] && <p className="mt-1.5 text-[10px] text-muted dark:text-slate-400">{row.recommendation.whyBest[0]}</p>}
            </div>}
            <p className="line-clamp-2 min-h-9 text-xs font-semibold text-navy dark:text-slate-100">{row.package}</p>
            <p className="mt-1 text-sm font-bold text-primary dark:text-[#a5b4fc]">{row.requiresVendorConfirmation ? 'Final price needs vendor confirmation' : row.price != null ? `${money(row.price)} listed total` : row.basePrice != null ? `${money(row.basePrice)} / ${row.unit || 'unit'} · total not confirmed` : 'No price listed'}</p>
            <p className={`mt-1 text-[11px] ${['booked', 'blocked'].includes(row.availability) ? 'text-rose-500' : 'text-muted dark:text-slate-400'}`}>{availability[row.availability] || 'Availability not confirmed'}</p>
            {row.location && <p className="mt-1 text-[10px] text-muted dark:text-slate-400">{row.location}</p>}
            {sampleImages.length > 1 && <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-semibold text-muted dark:text-slate-400">More project samples</p>
              <div aria-label={`${row.vendor} project samples`} className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
                {sampleImages.slice(1).map((sample, index) => <div key={`${sample.imageUrl || sample.url}-${index}`} className="w-28 shrink-0 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
                  <img src={sample.imageUrl || sample.url} alt={sample.title || 'Project sample'} loading="lazy" className="h-16 w-full object-cover" />
                  <p className="truncate px-2 py-1 text-[9px] text-muted dark:text-slate-400">{sample.title || 'Project sample'}</p>
                </div>)}
              </div>
            </div>}
            {(row.conditionalCharges || []).map((charge, index) => <p key={index} className="mt-1 text-[10px] text-muted dark:text-slate-400">{charge.name}: {money(charge.amount)}{charge.condition ? ` · ${charge.condition}` : ''}</p>)}
            {eventId && search?.scopeMatchesEvent !== false && <Link className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary dark:text-[#a5b4fc]" to={`/customer/events/${eventId}/services/${encodeURIComponent(row.id)}`}>View service details →</Link>}
          </div>
        </article>;
      })}
    </div>
    {rows.length > 8 && <button type="button" aria-expanded={all} onClick={() => setAll(value => !value)} className="min-h-11 text-xs font-semibold text-primary dark:text-[#a5b4fc]">{all ? 'Show fewer services' : `Show all ${rows.length} services`}</button>}
  </section>;
}
