import { useState } from 'react';
import { Link } from 'react-router-dom';

const money = value => `₹${Number(value).toLocaleString('en-IN')}`;
const availability = { no_event_date: 'Date needed to check availability', unconfirmed: 'Not confirmed by vendor', blocked: 'Blocked on this date', booked: 'Booked on this date', requires_vendor_confirmation: 'Extended coverage · vendor confirmation needed' };
export default function AuraVendorResults({ rows, search, eventId }) {
  const [all, setAll] = useState(false);
  if (!rows?.length) return null;
  return <section aria-label="Matching vendor services" className="space-y-2 aura-card-reveal">
    <h3 className="text-sm font-bold text-navy dark:text-slate-100">{rows.length} matching services</h3>
    {eventId && search?.scopeMatchesEvent === false && <p className="text-[11px] text-muted dark:text-slate-400">These results use your search details. Update your event before requesting a quote.</p>}
    <p className="text-[11px] text-muted dark:text-slate-400">From the current vendor catalogue{search?.city ? ` · ${search.city}` : ' · choose a city to check coverage'}</p>
    {(all ? rows : rows.slice(0, 3)).map(row => <article key={row.id} className="rounded-2xl border border-primary/20 bg-white dark:bg-[#1e2235] p-4 space-y-2">
      <h4 className="font-bold text-sm text-navy dark:text-slate-100">{row.vendor}</h4>
      <p className="text-xs text-muted dark:text-slate-400">{row.package} · {row.service}</p>
      <p className="text-xs font-semibold text-primary dark:text-[#a5b4fc]">{row.requiresVendorConfirmation ? 'Final price needs vendor confirmation' : row.price != null ? `${money(row.price)} listed total` : row.basePrice != null ? `${money(row.basePrice)} / ${row.unit || 'unit'} · total not confirmed` : 'No price listed'}</p>
      <p className={`text-[11px] ${['booked', 'blocked'].includes(row.availability) ? 'text-rose-500' : 'text-muted dark:text-slate-400'}`}>{availability[row.availability] || 'Availability not confirmed'}</p>
      {row.location && <p className="text-[11px] text-muted dark:text-slate-400">{row.location}</p>}
      {row.rating != null && <p className="text-[11px] text-muted dark:text-slate-400">{row.rating} rating · {row.reviewCount} reviews</p>}
      {(row.conditionalCharges || []).map((charge, index) => <p key={index} className="text-[11px] text-muted dark:text-slate-400">{charge.name}: {money(charge.amount)}{charge.condition ? ` · ${charge.condition}` : ''}</p>)}
      {eventId && search?.scopeMatchesEvent !== false && <Link className="inline-flex min-h-11 items-center text-xs font-semibold text-primary dark:text-[#a5b4fc]" to={`/customer/events/${eventId}/services/${encodeURIComponent(row.id)}`}>View service details →</Link>}
    </article>)}
    {rows.length > 3 && <button type="button" aria-expanded={all} onClick={() => setAll(value => !value)} className="min-h-11 text-xs font-semibold text-primary dark:text-[#a5b4fc]">{all ? 'Show fewer services' : `Show all ${rows.length} services`}</button>}
  </section>;
}
