import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, useLoad } from './customerUi.jsx';

const TYPES = [
  ['wedding', 'Wedding'],
  ['birthday', 'Birthday'],
  ['corporate', 'Corporate event'],
  ['puja', 'Puja'],
  ['anniversary', 'Anniversary'],
  ['other', 'Something else'],
];
const input = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary';

/** Plan manually: facts, budget, and which services you need help with or already have. */
export default function ManualPlanPage() {
  const navigate = useNavigate();
  const [eventType, setEventType] = useState('');
  const [form, setForm] = useState({ eventDate: '', city: '', guestCount: '', title: '' });
  const [budgetMode, setBudgetMode] = useState('range');
  const [budgetRange, setBudgetRange] = useState('');
  const [budget, setBudget] = useState('');
  const [services, setServices] = useState({}); // category → { status, providedValue }
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = useLoad(() => customerApi.planOptions(eventType || undefined), [eventType]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const labels = useMemo(() => Object.fromEntries((options.data?.categories || []).map((c) => [c.value, c.label])), [options.data]);
  const template = options.data?.template;
  const shownCats = template ? [...new Set([...template.essential, ...template.recommended, ...Object.keys(services)])] : Object.keys(services);
  const ranges = Array.isArray(options.data?.budgetRanges) ? options.data.budgetRanges : [];

  const setSvc = (c, patch) => setServices((s) => ({ ...s, [c]: { ...(s[c] || {}), ...patch } }));
  const clearSvc = (c) => setServices(({ [c]: _drop, ...rest }) => rest);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      eventType,
      eventDate: form.eventDate,
      city: form.city,
      ...(form.title.trim() ? { title: form.title.trim() } : {}),
      ...(form.guestCount ? { guestCount: Number(form.guestCount) } : {}),
      ...(budgetMode === 'range' && budgetRange ? { budgetRange } : {}),
      ...(budgetMode === 'exact' && budget ? { budget: Number(budget) } : {}),
      services: Object.entries(services)
        .filter(([, v]) => v.status)
        .map(([category, v]) => ({ category, status: v.status, providedValue: v.providedValue })),
    };
    try {
      const r = await customerApi.createEvent(body);
      navigate(`/customer/events/${r.event.id}`);
    } catch (err) {
      const f = err?.data?.fields;
      setError(f ? Object.values(f).join(' · ') : errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-4 pb-24">
      <BackLink to="/customer/events">Events</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Plan manually</h1>

      <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="text-sm font-bold text-navy">1. Event</div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map(([v, l]) => (
            <button type="button" key={v} onClick={() => { setEventType(v); setBudgetRange(''); }} className={`rounded-full px-3.5 py-1.5 text-xs font-bold border ${eventType === v ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <label className="text-[11px] text-muted">Date<input type="date" value={form.eventDate} onChange={set('eventDate')} className={input} /></label>
          <label className="text-[11px] text-muted">Location (city)<input value={form.city} onChange={set('city')} placeholder="e.g. Kolkata" className={input} /></label>
          <label className="text-[11px] text-muted">Guests<input type="number" min="1" value={form.guestCount} onChange={set('guestCount')} className={input} /></label>
          <label className="text-[11px] text-muted">Name (optional)<input value={form.title} onChange={set('title')} placeholder="e.g. Riya's wedding" className={input} /></label>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-navy">2. Budget</div>
          <div className="flex gap-1 text-[11px] font-bold">
            {[['range', 'Range'], ['exact', 'Exact amount']].map(([v, l]) => (
              <button type="button" key={v} onClick={() => setBudgetMode(v)} className={`rounded-lg px-2.5 py-1 ${budgetMode === v ? 'bg-primary-soft text-primary' : 'text-muted'}`}>{l}</button>
            ))}
          </div>
        </div>
        {budgetMode === 'range' ? (
          eventType ? (
            <div className="flex flex-wrap gap-2">
              {ranges.map((r) => (
                <button type="button" key={r.id} onClick={() => setBudgetRange(budgetRange === r.id ? '' : r.id)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold border ${budgetRange === r.id ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Choose an event type to see ranges.</p>
          )
        ) : (
          <input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="₹ amount" className={input} />
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="text-sm font-bold text-navy">3. Services</div>
        {!eventType && <p className="text-xs text-muted">Choose an event type to see the usual services.</p>}
        {shownCats.map((c) => {
          const s = services[c] || {};
          return (
            <div key={c} className="border border-gray-100 rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-navy flex-1 min-w-[100px]">
                  {labels[c] || c}
                  {template?.essential.includes(c) && <span className="ml-1.5 text-[9px] text-primary font-bold uppercase">Essential</span>}
                </span>
                <button type="button" onClick={() => (s.status === 'pending' ? clearSvc(c) : setSvc(c, { status: 'pending' }))} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${s.status === 'pending' ? 'bg-primary text-white' : 'bg-lavender text-navy'}`}>Need help</button>
                <button type="button" onClick={() => (s.status === 'customer_provided' ? clearSvc(c) : setSvc(c, { status: 'customer_provided' }))} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${s.status === 'customer_provided' ? 'bg-emerald-600 text-white' : 'bg-lavender text-navy'}`}>Already arranged</button>
              </div>
              {s.status === 'customer_provided' && (
                <input value={s.providedValue || ''} onChange={(e) => setSvc(c, { providedValue: e.target.value })} placeholder="Who / what?" className={`${input} mt-2 text-xs`} />
              )}
            </div>
          );
        })}
        {eventType && (
          <div className="flex gap-2">
            <select value={extra} onChange={(e) => setExtra(e.target.value)} className={`${input} text-xs`}>
              <option value="">Add another service…</option>
              {(options.data?.categories || []).filter((c) => !shownCats.includes(c.value)).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button type="button" disabled={!extra} onClick={() => { setSvc(extra, { status: 'pending' }); setExtra(''); }} className="rounded-xl bg-primary text-white text-xs font-bold px-4 disabled:opacity-50">Add</button>
          </div>
        )}
      </section>

      {error && <div className="text-sm text-red-500">{error}</div>}
      <div className="sticky bottom-20 md:bottom-4 z-20">
        <button disabled={busy || !eventType} className="w-full rounded-2xl bg-primary text-white text-sm font-extrabold py-3.5 shadow-lg shadow-primary/30 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create my event plan'}
        </button>
      </div>
    </form>
  );
}
