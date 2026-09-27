import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, categoryIcon } from './customerUi.jsx';
import { useCurrentEvent } from './currentEvent.jsx';
import {
  EMPTY_LOCATION,
  EMPTY_SERVICE_LOCATION,
  LocationFields,
  ServiceEditor,
  detailsPayload,
  inputCls,
  locationPayload,
  serviceLocationPayload,
  usePlanOptions,
} from './eventForms.jsx';

const TYPES = [
  ['wedding', 'Wedding'],
  ['birthday', 'Birthday'],
  ['corporate', 'Corporate event'],
  ['puja', 'Puja / religious'],
  ['anniversary', 'Anniversary'],
  ['other', 'Something else'],
];

function Step({ n, title, children }) {
  return (
    <section className="bg-white rounded-3xl shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold grid place-items-center">{n}</span>
        <h2 className="text-sm font-extrabold text-navy">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * New Event (manual). Collects the same data Aura+ collects, through the same
 * API, so both paths converge on one event: facts, full location, budget,
 * services with their own details and locations, and notes.
 */
export default function ManualPlanPage() {
  const navigate = useNavigate();
  const { setCurrent, refresh } = useCurrentEvent();
  const [eventType, setEventType] = useState('');
  const [form, setForm] = useState({ title: '', customType: '', eventDate: '', guestCount: '', specialRequirements: '', notes: '' });
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [budgetMode, setBudgetMode] = useState('range');
  const [budgetRange, setBudgetRange] = useState('');
  const [budget, setBudget] = useState('');
  const [services, setServices] = useState({}); // category → { status, providedValue, details, serviceLocation, specialRequirements }
  const [open, setOpen] = useState(null);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = usePlanOptions(eventType || undefined);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const labels = useMemo(() => Object.fromEntries((options?.categories || []).map((c) => [c.value, c.label])), [options]);
  const template = options?.template;
  const shownCats = template ? [...new Set([...template.essential, ...template.recommended, ...Object.keys(services)])] : Object.keys(services);
  const ranges = Array.isArray(options?.budgetRanges) ? options.budgetRanges : [];
  const locLabel = [location.venueName, location.area, location.city].filter((x) => x?.trim()).join(', ');

  const setSvc = (c, patch) => setServices((s) => ({ ...s, [c]: { serviceLocation: EMPTY_SERVICE_LOCATION, ...(s[c] || {}), ...patch } }));
  const clearSvc = (c) => {
    setServices(({ [c]: _drop, ...rest }) => rest);
    if (open === c) setOpen(null);
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      eventType,
      eventDate: form.eventDate,
      location: locationPayload(location),
      ...(eventType === 'other' && form.customType.trim() ? { customType: form.customType.trim() } : {}),
      ...(form.title.trim() ? { title: form.title.trim() } : {}),
      ...(form.guestCount ? { guestCount: Number(form.guestCount) } : {}),
      ...(budgetMode === 'range' && budgetRange ? { budgetRange } : {}),
      ...(budgetMode === 'exact' && budget ? { budget: Number(budget) } : {}),
      ...(form.specialRequirements.trim() ? { specialRequirements: form.specialRequirements.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      services: Object.entries(services)
        .filter(([, v]) => v.status)
        .map(([category, v]) => ({
          category,
          status: v.status,
          providedValue: v.providedValue?.trim() || undefined,
          details: detailsPayload(v.details),
          serviceLocation: serviceLocationPayload(v.serviceLocation),
          specialRequirements: v.specialRequirements?.trim() || undefined,
        })),
    };
    try {
      const r = await customerApi.createEvent(body);
      setCurrent(r.event.id);
      await refresh();
      navigate(`/customer/events/${r.event.id}`);
    } catch (err) {
      const f = err?.data?.fields;
      setError(f ? Object.values(f).join(' · ') : errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-4 pb-24">
      <BackLink to="/customer/events">My events</BackLink>
      <div>
        <h1 className="text-xl font-extrabold text-navy">New event</h1>
        <p className="text-xs text-muted mt-0.5">Fill in what you know — everything else can be added later or with Aura+.</p>
      </div>

      <Step n="1" title="Event details">
        <div className="flex flex-wrap gap-2">
          {TYPES.map(([v, l]) => (
            <button
              type="button"
              key={v}
              onClick={() => {
                setEventType(v);
                setBudgetRange('');
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold border ${eventType === v ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {eventType === 'other' && (
            <label className="text-[10px] font-semibold text-muted">What kind of event?<input value={form.customType} onChange={set('customType')} placeholder="e.g. Housewarming" className={inputCls} /></label>
          )}
          <label className="text-[10px] font-semibold text-muted">Event name<input value={form.title} onChange={set('title')} placeholder="e.g. My Daughter's Wedding" className={inputCls} /></label>
          <label className="text-[10px] font-semibold text-muted">Date *<input type="date" value={form.eventDate} onChange={set('eventDate')} className={inputCls} /></label>
          <label className="text-[10px] font-semibold text-muted">Expected guests<input type="number" min="1" value={form.guestCount} onChange={set('guestCount')} className={inputCls} /></label>
        </div>
      </Step>

      <Step n="2" title="Event location">
        <LocationFields value={location} onChange={setLocation} />
        <p className="text-[10px] text-muted">A venue name here also marks the venue as arranged by you.</p>
      </Step>

      <Step n="3" title="Budget">
        <div className="flex gap-1 text-[11px] font-bold">
          {[['range', 'Range'], ['exact', 'Exact amount']].map(([v, l]) => (
            <button type="button" key={v} onClick={() => setBudgetMode(v)} className={`rounded-lg px-2.5 py-1 ${budgetMode === v ? 'bg-primary-soft text-primary' : 'text-muted'}`}>{l}</button>
          ))}
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
          <input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="₹ amount" className={inputCls} />
        )}
      </Step>

      <Step n="4" title="Services">
        {!eventType && <p className="text-xs text-muted">Choose an event type to see the usual services.</p>}
        <div className="space-y-2">
          {shownCats.map((c) => {
            const s = services[c] || {};
            const expanded = open === c && s.status;
            return (
              <div key={c} className="border border-gray-100 rounded-2xl p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(c)} size={13} /></span>
                  <span className="text-xs font-bold text-navy flex-1 min-w-[100px]">
                    {labels[c] || c}
                    {template?.essential.includes(c) && <span className="ml-1.5 text-[9px] text-primary font-bold uppercase">Essential</span>}
                  </span>
                  <button type="button" onClick={() => (s.status === 'pending' ? clearSvc(c) : setSvc(c, { status: 'pending' }))} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${s.status === 'pending' ? 'bg-primary text-white' : 'bg-lavender text-navy'}`}>Need help</button>
                  <button type="button" onClick={() => (s.status === 'customer_provided' ? clearSvc(c) : setSvc(c, { status: 'customer_provided' }))} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${s.status === 'customer_provided' ? 'bg-emerald-600 text-white' : 'bg-lavender text-navy'}`}>Already arranged</button>
                  {s.status && (
                    <button type="button" onClick={() => setOpen(expanded ? null : c)} className="text-[11px] font-bold text-primary px-1">
                      {expanded ? 'Hide details' : 'Details & location'}
                    </button>
                  )}
                </div>
                {s.status === 'customer_provided' && (
                  <input value={s.providedValue || ''} onChange={(e) => setSvc(c, { providedValue: e.target.value })} placeholder="Who / what? (optional)" className={`${inputCls} mt-2`} />
                )}
                {expanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <ServiceEditor
                      category={c}
                      fields={options?.serviceFields?.[c] || []}
                      isRoute={(options?.routeCategories || []).includes(c)}
                      value={s}
                      eventLocationLabel={locLabel}
                      onChange={(v) => setSvc(c, v)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {eventType && (
          <div className="flex gap-2">
            <select value={extra} onChange={(e) => setExtra(e.target.value)} className={inputCls}>
              <option value="">Add another service…</option>
              {(options?.categories || []).filter((c) => !shownCats.includes(c.value)).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button
              type="button"
              disabled={!extra}
              onClick={() => {
                setSvc(extra, { status: 'pending' });
                setOpen(extra);
                setExtra('');
              }}
              className="rounded-xl bg-primary text-white text-xs font-bold px-4 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </Step>

      <Step n="5" title="Preferences & notes">
        <label className="block text-[10px] font-semibold text-muted">Special requirements<textarea rows={2} value={form.specialRequirements} onChange={set('specialRequirements')} className={inputCls} placeholder="e.g. Wheelchair access for grandparents" /></label>
        <label className="block text-[10px] font-semibold text-muted">Notes<textarea rows={2} value={form.notes} onChange={set('notes')} className={inputCls} /></label>
      </Step>

      {error && <div className="text-sm text-red-500">{error}</div>}
      <div className="sticky bottom-20 md:bottom-4 z-20">
        <button disabled={busy || !eventType} className="w-full rounded-2xl bg-primary text-white text-sm font-extrabold py-3.5 shadow-lg shadow-primary/30 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create my event plan'}
        </button>
      </div>
    </form>
  );
}
