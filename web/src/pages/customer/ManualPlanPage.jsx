import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, categoryIcon } from './customerUi.jsx';
import { useCurrentEvent } from './currentEvent.jsx';
import { serviceChanges, eventDateChange } from './planningDraftState.js';
import {
  EMPTY_LOCATION,
  EMPTY_SERVICE_LOCATION,
  LocationFields,
  ServiceEditor,
  inputCls,
  locationPayload,
  locationFromEvent,
  usePlanOptions,
} from './eventForms.jsx';

const TYPES = [
  ['wedding', 'Wedding'],
  ['birthday', 'Birthday'],
  ['corporate', 'Corporate event'],
  ['conference', 'Conference / MICE'],
  ['club', 'Club / community event'],
  ['cultural', 'Cultural event'],
  ['institutional', 'Institutional event'],
  ['puja', 'Puja / religious'],
  ['anniversary', 'Anniversary'],
  ['social', 'Social gathering'],
  ['other', 'Something else'],
];

function Step({ n, title, active, children }) {
  if (!active) return null;
  return (
    <section className="bg-white rounded-3xl shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold grid place-items-center">{n}</span>
        <h2 id="planning-step-title" tabIndex={-1} className="text-sm font-extrabold text-navy">{title}</h2>
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
  const [params, setParams] = useSearchParams();
  const draftId = params.get('draft');
  const category = params.get('inspiration');
  const style = params.get('style');
  const typeMap = { Wedding: 'wedding', Birthday: 'birthday', Corporate: 'corporate', Celebration: 'social', Other: 'other' };
  const inspirationType = Object.hasOwn(typeMap, category) ? typeMap[category] : '';
  const allowedStyle = ['Traditional', 'Modern', 'Candid', 'Minimal', 'Classic', 'Other'].includes(style) ? style : '';
  const { current: selectedEvent, setCurrent, refresh } = useCurrentEvent();
  const [eventType, setEventType] = useState(inspirationType);
  const [form, setForm] = useState({ title: '', customType: '', eventDate: '', guestCount: '', specialRequirements: '', notes: inspirationType && allowedStyle ? `Inspired by a ${allowedStyle.toLowerCase()} ${category.toLowerCase()} project.` : '' });
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [budgetMode, setBudgetMode] = useState('unknown');
  const [savedRange, setSavedRange] = useState(null);
  const [budgetRange, setBudgetRange] = useState('');
  const [budget, setBudget] = useState('');
  const [services, setServices] = useState({}); // category → { status, providedValue, details, serviceLocation, specialRequirements }
  const [open, setOpen] = useState(null);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [conflict, setConflict] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const detailRef = useRef(null), inFlight = useRef(null), retryCommand = useRef(null);
  const createCommand = useRef(null), mounted = useRef(true), scope = useRef(0);
  const valuesRef = useRef(null);

  const options = usePlanOptions(eventType || undefined);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const labels = useMemo(() => Object.fromEntries((options?.categories || []).map((c) => [c.value, c.label])), [options]);
  const template = options?.template;
  const shownCats = template ? [...new Set([...template.essential, ...template.recommended, ...Object.keys(services)])] : Object.keys(services);
  const ranges = Array.isArray(options?.budgetRanges) ? options.budgetRanges : [];
  const locLabel = [location.venueName, location.area, location.city].filter((x) => x?.trim()).join(', ');

  const setSvc = (c, patch) => { setDirty(true); setServices((s) => ({ ...s, [c]: { serviceLocation: EMPTY_SERVICE_LOCATION, ...(s[c] || {}), ...patch, ...(Object.hasOwn(patch, 'status') ? { source: 'customer' } : {}) } })); };
  const clearSvc = (c) => {
    setDirty(true);
    setServices(values => ({ ...values, [c]: { status: 'missing', source: 'customer', serviceLocation: EMPTY_SERVICE_LOCATION } }));
    if (open === c) setOpen(null);
  };

  const [reloadTick, setReloadTick] = useState(0);
  valuesRef.current = { eventType, form, location, budgetMode, budgetRange, budget, savedRange, services };
  const fingerprint = JSON.stringify(valuesRef.current);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!draftId) {
      if (detailRef.current) {
        scope.current++; inFlight.current = null; setBusy(false);
        detailRef.current = null; retryCommand.current = null; createCommand.current = null;
        setEventType(inspirationType); setForm({ title: '', customType: '', eventDate: '', guestCount: '', specialRequirements: '', notes: '' });
        setLocation(EMPTY_LOCATION); setServices({}); setBudgetMode('unknown'); setBudget(''); setBudgetRange(''); setSavedRange(null); setStep(0); setDirty(false); setSavedAt(null); setConflict(false); setError('');
      }
      setLoadingDraft(false);
      return;
    }
    if (detailRef.current?.event.id === draftId && !reloadTick) return;
    scope.current++; inFlight.current = null; setBusy(false);
    detailRef.current = null;
    setLoadingDraft(true); setError(''); setConflict(false);
    customerApi.planningDraft(draftId).then(detail => {
      if (!active) return;
      detailRef.current = detail;
      const event = detail.event;
      if (event.status !== 'draft') { setError('This event is no longer a draft. Continue in its event workspace.'); setConflict(true); }
      setEventType(event.eventType || '');
      setForm({ title: event.title || '', customType: event.customType || '', eventDate: event.eventDate || '', guestCount: event.guestCount ?? '', specialRequirements: event.specialRequirements || '', notes: event.notes || '' });
      setLocation({ ...locationFromEvent(event), ...(event.location?.coordinates ? { coordinates: event.location.coordinates } : {}) });
      setBudgetMode(event.budget != null ? 'exact' : event.budgetMin != null || event.budgetMax != null ? 'range' : 'unknown');
      setBudget(event.budget ?? ''); setBudgetRange('');
      setSavedRange(event.budgetMin != null || event.budgetMax != null ? { min: event.budgetMin, max: event.budgetMax, label: event.budgetRangeLabel } : null);
      setServices(Object.fromEntries(detail.requirements.map(row => [row.category, { status: row.status, source: row.source, providedValue: row.providedValue || '', details: row.preferences || {}, serviceLocation: row.serviceLocation || { mode: 'unspecified' }, specialRequirements: row.specialRequirements || '' }])));
      retryCommand.current = null; setDirty(false); setSavedAt(event.updatedAt || new Date().toISOString());
    }).catch(err => { if (active) { setError(errorText(err)); setConflict(true); } })
      .finally(() => { if (active) setLoadingDraft(false); });
    return () => { active = false; };
  }, [draftId, reloadTick]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    const confirmLeaving = event => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a[href]');
      const button = target?.closest('button');
      const switcher = event.type === 'change' && target?.matches('.customer-event-context select');
      const externalSubmit = event.type === 'submit' && !target?.closest('.customer-planner');
      const shellButton = button && !button.closest('.customer-planner') && button.closest('aside,header,nav') && !/navigation|menu|mode/i.test(button.getAttribute('aria-label') || '');
      if (!(switcher || externalSubmit || (event.type === 'click' && ((link && link.target !== '_blank') || shellButton)))) return;
      if (window.confirm('Leave this plan without saving the latest changes? Stay here to save them first.')) return;
      event.preventDefault(); event.stopPropagation();
      if (switcher) target.value = selectedEvent?.id || '';
    };
    window.addEventListener('beforeunload', warn);
    for (const type of ['click', 'change', 'submit']) document.addEventListener(type, confirmLeaving, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      for (const type of ['click', 'change', 'submit']) document.removeEventListener(type, confirmLeaving, true);
    };
  }, [dirty, busy, selectedEvent?.id]);

  function buildChanges(values, detail) {
    const original = { ...locationFromEvent(detail.event), ...(detail.event.location?.coordinates ? { coordinates: detail.event.location.coordinates } : {}) };
    const facts = {
      eventType: values.eventType,
      title: values.form.title.trim() || detail.event.title,
      customType: values.eventType === 'other' ? values.form.customType.trim() || null : null,
      ...eventDateChange(values.form.eventDate, detail.event),
      guestCount: values.form.guestCount === '' ? null : Number(values.form.guestCount),
      location: locationPayload(values.location, original),
      specialRequirements: values.form.specialRequirements.trim() || null,
      notes: values.form.notes.trim() || null,
      ...(values.budgetMode === 'exact' && values.budget ? { budget: Number(values.budget) }
        : values.budgetMode === 'range' && values.budgetRange ? { budgetRange: values.budgetRange }
        : values.budgetMode === 'range' && values.savedRange ? { budgetMin: values.savedRange.min, budgetMax: values.savedRange.max }
        : { budget: null, budgetRange: null, budgetMin: null, budgetMax: null }),
    };
    return { facts, services: serviceChanges(values.services, detail.requirements) };
  }

  function saveDraft() {
    if (inFlight.current) return inFlight.current;
    if (conflict || !valuesRef.current.eventType) return Promise.resolve(null);
    const epoch = scope.current;
    inFlight.current = (async () => {
      setBusy(true); setError('');
      try {
        if (!detailRef.current) {
          createCommand.current ||= { eventType: valuesRef.current.eventType, idempotencyKey: crypto.randomUUID() };
          const detail = await customerApi.createPlanningDraft(createCommand.current);
          if (scope.current !== epoch) return null;
          detailRef.current = detail;
          if (mounted.current) {
            const next = new URLSearchParams(params); next.set('draft', detail.event.id); setParams(next, { replace: true });
            setCurrent(detail.event.id); void refresh();
          }
        }
        if (retryCommand.current) {
          const retry = retryCommand.current;
          const retried = await customerApi.savePlanningDraft(detailRef.current.event.id, retry.body);
          if (scope.current !== epoch) return null;
          detailRef.current = retried;
          retryCommand.current = null;
          if (JSON.stringify(valuesRef.current) === retry.fingerprint) {
            if (mounted.current) { setDirty(false); setSavedAt(new Date().toISOString()); }
            return detailRef.current;
          }
        }
        const values = valuesRef.current;
        const sentFingerprint = JSON.stringify(values);
        const body = { ...buildChanges(values, detailRef.current), expectedVersion: detailRef.current.planningVersion, idempotencyKey: crypto.randomUUID() };
        retryCommand.current = { body, fingerprint: sentFingerprint };
        const detail = await customerApi.savePlanningDraft(detailRef.current.event.id, body);
        if (scope.current !== epoch) return null;
        detailRef.current = detail; retryCommand.current = null;
        if (mounted.current) { setDirty(JSON.stringify(valuesRef.current) !== sentFingerprint); setSavedAt(new Date().toISOString()); void refresh(); }
        return detail;
      } catch (err) {
        if (mounted.current && scope.current === epoch) {
          setError(errorText(err));
          if (['DRAFT_CHANGED', 'DRAFT_LOCKED'].includes(err?.data?.error)) { setConflict(true); retryCommand.current = null; }
          // Validation failures were not committed; corrected inputs need a new key.
          else if (err?.data?.error && !['INTERNAL_ERROR'].includes(err.data.error)) retryCommand.current = null;
        }
        return null;
      } finally { if (scope.current === epoch) { inFlight.current = null; if (mounted.current) setBusy(false); } }
    })();
    return inFlight.current;
  }

  useEffect(() => {
    if (!dirty || busy || loadingDraft || error || conflict || !eventType) return;
    const timer = setTimeout(() => { void saveDraft(); }, 900);
    return () => clearTimeout(timer);
  }, [fingerprint, dirty, busy, loadingDraft, error, conflict, eventType]);

  async function continueWithAura() {
    const detail = await saveDraft();
    if (detail && mounted.current) navigate('/customer/aura?event=' + encodeURIComponent(detail.event.id));
  }
  async function submit(event) {
    event.preventDefault();
    const detail = await saveDraft();
    if (!detail || !mounted.current) return;
    if (step < 5) { setStep(value => value + 1); return; }
    try {
      setBusy(true);
      const confirmed = await customerApi.confirmEvent(detail.event.id);
      const inspirationId = params.get('inspirationId');
      if (inspirationType && allowedStyle && /^[A-Za-z0-9_-]{32}$/.test(inspirationId || '')) await externalApi.call('/customer/discovery/conversions', { method: 'POST', body: { token: inspirationId, eventId: detail.event.id } }).catch(() => {});
      setCurrent(confirmed.event.id); void refresh();
      navigate('/customer/events/' + confirmed.event.id);
    } catch (err) { setError(errorText(err)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function saveAndLeave() {
    const detail = await saveDraft();
    if (detail && mounted.current) navigate('/customer/events');
  }
  function reloadSaved() {
    if (dirty && !window.confirm('Discard local edits and reload the saved draft?')) return;
    setReloadTick(value => value + 1);
  }
  useEffect(() => { document.getElementById('planning-step-title')?.focus(); }, [step]);
  if (loadingDraft) return <div className="customer-home-panel" role="status">Loading your saved draft…</div>;
  if (draftId && !detailRef.current && error) return <div role="alert" className="customer-home-panel"><h1>We could not open this draft.</h1><p>{error}</p><button onClick={reloadSaved}>Try again</button> <Link to="/customer/events">My Events</Link></div>;


  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="customer-planner max-w-3xl mx-auto space-y-4 pb-24">
      <BackLink to="/customer/events">My events</BackLink>
      <div>
        <h1 className="text-xl font-extrabold text-navy">{draftId ? 'Your event plan' : 'New event'}</h1>
        <p className="text-sm text-muted mt-1">Step {step + 1} of 6 · Fill in what you know. Save the rest for later.</p>
        <p className="text-sm mt-2" role="status">{loadingDraft ? 'Loading your saved draft…' : busy ? 'Saving your draft…' : dirty ? 'Unsaved changes' : savedAt ? 'Draft saved to your account' : 'Choose an occasion to start'}</p>
        <button type="button" className="customer-secondary-action mt-2" disabled={busy || loadingDraft || !eventType || conflict} onClick={continueWithAura}>Continue with Aura+</button>
      </div>

      <fieldset disabled={busy || loadingDraft}>
      <Step active={step === 0} n="1" title="Event details">
        <div className="flex flex-wrap gap-2">
          {TYPES.map(([v, l]) => (
            <button
              type="button"
              key={v}
              onClick={() => {
                setDirty(true);
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
          <label className="text-[10px] font-semibold text-muted">Date (if known)<input type="date" value={form.eventDate} onChange={set('eventDate')} className={inputCls} /></label>
          {detailRef.current?.understanding?.facts?.date?.state === 'INFERRED' && <p className="text-sm text-amber-700">Aura suggested this date or year. Please review it before confirming the plan.</p>}
          <label className="text-[10px] font-semibold text-muted">Expected guests<input type="number" min="1" value={form.guestCount} onChange={set('guestCount')} className={inputCls} /></label>
        </div>
      </Step>

      <Step active={step === 1} n="2" title="Event location">
        <LocationFields value={location} requireCity={false} onChange={value => { setDirty(true); setLocation(value); }} />
        <p className="text-[10px] text-muted">A venue name is only a location detail. Tell us explicitly below if you have arranged it.</p>
        <div className="mt-3"><p className="text-sm font-semibold">Have you already arranged your venue?</p><div className="flex flex-wrap gap-2 mt-2">{[['missing', 'Not decided yet'], ['pending', 'Selected / need help'], ['customer_provided', 'Yes, arranged by me']].map(([status, label]) => <button type="button" key={status} aria-pressed={(services.venue?.status || 'missing') === status} onClick={() => setSvc('venue', { status, providedValue: status === 'customer_provided' ? location.venueName : '' })} className={inputCls + ' !w-auto'}>{label}</button>)}</div><p className="text-sm text-muted mt-2">Arranged by you is separate from a STARVNT-confirmed booking.</p></div>
      </Step>

      <Step active={step === 2} n="3" title="Budget">
        <div className="flex gap-1 text-[11px] font-bold">
          {[['unknown', 'Not decided'], ['range', 'Range'], ['exact', 'Exact amount']].map(([v, l]) => (
            <button type="button" key={v} onClick={() => { setDirty(true); setBudgetMode(v); }} className={`rounded-lg px-2.5 py-1 ${budgetMode === v ? 'bg-primary-soft text-primary' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        {budgetMode === 'unknown' ? <p className="text-sm text-muted">You can decide later. No budget estimate is assumed.</p> : budgetMode === 'range' ? (
          eventType ? (
            <div className="flex flex-wrap gap-2">
              {savedRange && <p className="text-sm">Saved range: {savedRange.label || `${savedRange.min} – ${savedRange.max ?? 'no ceiling'}`} (kept unless you choose another range)</p>}
              {ranges.map((r) => (
                <button type="button" key={r.id} onClick={() => { setDirty(true); setSavedRange(null); setBudgetRange(budgetRange === r.id ? '' : r.id); }} className={`rounded-full px-3.5 py-1.5 text-xs font-bold border ${budgetRange === r.id ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'}`}>
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

      <Step active={step === 3} n="4" title="Services">
        {!eventType && <p className="text-xs text-muted">Choose an event type to see the usual services.</p>}
        <div className="space-y-2">
          {shownCats.map((c) => {
            const s = services[c] || {};
            const locked = ['confirmed', 'booked', 'completed'].includes(s.status);
            const expanded = open === c && s.status;
            return (
              <div key={c} className="border border-gray-100 rounded-2xl p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(c)} size={13} /></span>
                  <span className="text-xs font-bold text-navy flex-1 min-w-[100px]">
                    {labels[c] || c}
                    {s.source === 'aura_inferred' && <span className="block text-sm text-amber-700">Aura suggestion · review before confirming</span>}
                    {locked && <span className="block text-sm">{s.status} · managed in the event workspace</span>}
                    {template?.essential.includes(c) && <span className="ml-1.5 text-[9px] text-primary font-bold uppercase">Essential</span>}
                  </span>
                  <button type="button" disabled={locked} onClick={() => (s.status === 'pending' ? clearSvc(c) : setSvc(c, { status: 'pending' }))} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${s.status === 'pending' ? 'bg-primary text-white' : 'bg-lavender text-navy'}`}>Need help</button>
                  <button type="button" disabled={locked} onClick={() => (s.status === 'customer_provided' && s.source !== 'aura_inferred' ? clearSvc(c) : setSvc(c, { status: 'customer_provided' }))} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${s.status === 'customer_provided' ? 'bg-emerald-600 text-white' : 'bg-lavender text-navy'}`}>Already arranged</button>
                  {s.status && !locked && (
                    <button type="button" onClick={() => setOpen(expanded ? null : c)} className="text-[11px] font-bold text-primary px-1">
                      {expanded ? 'Hide details' : 'Details & location'}
                    </button>
                  )}
                </div>
                {s.status === 'customer_provided' && !locked && (
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

      <Step active={step === 4} n="5" title="Preferences & notes">
        <label className="block text-[10px] font-semibold text-muted">Special requirements<textarea rows={2} value={form.specialRequirements} onChange={set('specialRequirements')} className={inputCls} placeholder="e.g. Wheelchair access for grandparents" /></label>
        <label className="block text-[10px] font-semibold text-muted">Notes<textarea rows={2} value={form.notes} onChange={set('notes')} className={inputCls} /></label>
      </Step>

      {step === 5 && <section className="customer-home-panel">
        <h2 id="planning-step-title" tabIndex={-1}>Review your plan</h2>
        <dl className="grid gap-3 text-sm">
          <div><dt>Event</dt><dd>{form.title || eventType}</dd></div>
          <div><dt>Date</dt><dd>{form.eventDate || 'Not decided yet'}</dd></div>
          <div><dt>Location</dt><dd>{locLabel || 'Not decided yet'}</dd></div>
          <div><dt>Guests</dt><dd>{form.guestCount || 'Not provided'}</dd></div>
          <div><dt>Budget</dt><dd>{budgetMode === 'unknown' ? 'Not decided yet' : budgetMode === 'exact' ? budget || 'Not provided' : savedRange?.label || ranges.find(range => range.id === budgetRange)?.label || 'Not provided'}</dd></div>
        </dl>
        <h3 className="text-sm font-semibold mt-5">Service declarations to review</h3>
        <ul className="space-y-2 mt-2 text-sm">{Object.entries(services).filter(([, service]) => service.status && service.status !== 'missing').map(([category, service]) => <li key={category}><b>{labels[category] || category}</b> · {service.status === 'customer_provided' ? 'Arranged by you' : service.status === 'pending' ? 'Need help' : service.status}{service.providedValue ? ` · ${service.providedValue}` : ''}{service.source === 'aura_inferred' && <strong className="block text-amber-700">Aura suggestion — review before confirming</strong>}{service.specialRequirements && <p>{service.specialRequirements}</p>}</li>)}</ul>
        {form.specialRequirements && <p className="text-sm mt-3">Special requirements: {form.specialRequirements}</p>}
        {form.notes && <p className="text-sm mt-3">Notes: {form.notes}</p>}
        <p className="text-sm mt-4">Confirming accepts the details and service declarations shown here and builds your plan. Use Back to change them. It does not send an enquiry, book a vendor or authorise payment.</p>
        {(!form.eventDate || !location.city?.trim()) && <p role="status" className="text-sm mt-3">You can keep this draft. A date and city are needed before confirming the event plan.</p>}
      </section>}
      </fieldset>
      {error && <div role="alert" className="customer-home-panel mt-3"><p>{error}</p>{conflict && draftId && <><button type="button" className="customer-secondary-action" onClick={reloadSaved}>Discard local edits & reload saved draft</button> <Link to={'/customer/events/' + draftId}>Open event workspace</Link></>}</div>}

      <div className="customer-planner-actions rounded-2xl border bg-white dark:bg-[#19211c] p-3 mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="customer-secondary-action" disabled={busy || step === 0} onClick={() => setStep(value => value - 1)}>Back</button>
        <button type="submit" className="customer-primary-action" disabled={busy || loadingDraft || conflict || !eventType || (step === 5 && (!form.eventDate || !location.city?.trim()))}>{busy ? 'Saving…' : step === 5 ? 'Confirm event plan' : 'Save & continue →'}</button>
        <button type="button" className="customer-secondary-action" disabled={busy || loadingDraft || conflict || !eventType} onClick={saveAndLeave}>Save & continue later</button>
        <Link to="/customer/updates" className="customer-secondary-action">Help & conversations</Link>
      </div>

    </form>
  );
}
