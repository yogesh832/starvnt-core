import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { formatDate, formatINR } from './format.js';
import { LocationFields, inputCls, locationFromEvent, locationPayload } from './eventForms.jsx';

const EVENT_TYPES = [
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

function FactTile({ icon, label, fact, display, className = '' }) {
  const missing = fact.state === 'MISSING';
  const assumed = fact.state === 'INFERRED';
  return (
    <div className={`bg-lavender/60 p-2.5 rounded-2xl border border-gray-100/60 min-w-0 ${className}`}>
      <div className="text-[10px] text-muted flex items-center gap-1.5">
        <Icon name={icon} size={11} className="shrink-0" />
        <span className="truncate">{label}</span>
        {!missing && !assumed && <Icon name="check" size={10} className="ml-auto text-emerald-600 shrink-0" />}
      </div>
      <div className={`font-bold mt-1 text-xs ${missing ? 'text-muted italic font-medium' : 'text-navy'}`}>{missing ? 'Not specified' : display}</div>
      {assumed && <div className="text-[9px] font-bold text-amber-600 mt-0.5">{fact.note || 'year assumed'} – please check</div>}
    </div>
  );
}

/**
 * Edit event details: facts + full location + notes. Same API as the manual
 * form and Aura+, so every path updates the same event.
 */
export function EditForm({ event, onCancel, onSaved }) {
  const original = locationFromEvent(event);
  const [form, setForm] = useState({
    eventType: event.eventType || '',
    customType: event.customType || '',
    title: event.title || '',
    eventDate: event.eventDate || '',
    guestCount: event.guestCount ?? '',
    budget: event.budget ?? '',
    specialRequirements: event.specialRequirements || '',
    notes: event.notes || '',
  });
  const [location, setLocation] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      title: form.title.trim(),
      eventDate: form.eventDate || null,
      guestCount: form.guestCount === '' ? null : Number(form.guestCount),
      specialRequirements: form.specialRequirements.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (form.eventType && form.eventType !== event.eventType) body.eventType = form.eventType;
    if ((form.eventType || event.eventType) === 'other') body.customType = form.customType.trim() || null;
    // Only send an exact budget when the customer typed one; an untouched range stays.
    if (String(form.budget) !== String(event.budget ?? '')) body.budget = form.budget === '' ? null : Number(form.budget);
    const loc = locationPayload(location, original);
    if (Object.keys(loc).length) body.location = loc;
    try {
      const detail = await customerApi.patchEvent(event.id, body);
      onSaved(detail);
    } catch (err) {
      const fields = err?.data?.fields;
      setError(fields ? Object.values(fields).join(' · ') : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-2.5">
        <label className="col-span-2 sm:col-span-1">
          <span className="text-[10px] font-semibold text-muted">Event type</span>
          <select value={form.eventType} onChange={set('eventType')} className={inputCls} disabled={event.status !== 'draft'}>
            {EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {form.eventType === 'other' && (
          <label className="col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold text-muted">What kind of event?</span>
            <input value={form.customType} onChange={set('customType')} className={inputCls} placeholder="e.g. Housewarming" />
          </label>
        )}
        <label className="col-span-2 sm:col-span-1">
          <span className="text-[10px] font-semibold text-muted">Event name</span>
          <input value={form.title} onChange={set('title')} className={inputCls} />
        </label>
        <label>
          <span className="text-[10px] font-semibold text-muted">Date</span>
          <input type="date" value={form.eventDate} onChange={set('eventDate')} className={inputCls} />
        </label>
        <label>
          <span className="text-[10px] font-semibold text-muted">Guests</span>
          <input type="number" min="1" value={form.guestCount} onChange={set('guestCount')} className={inputCls} />
        </label>
        <label className="col-span-2">
          <span className="text-[10px] font-semibold text-muted">Exact budget (₹){event.budgetRangeLabel ? ` · current range ${event.budgetRangeLabel}` : ''}</span>
          <input type="number" min="1" value={form.budget} onChange={set('budget')} className={inputCls} placeholder="Leave empty to keep the range" />
        </label>
      </div>
      <div>
        <div className="text-[11px] font-bold text-navy mb-1.5">Event location</div>
        <LocationFields value={location} onChange={setLocation} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label>
          <span className="text-[10px] font-semibold text-muted">Special requirements</span>
          <input value={form.specialRequirements} onChange={set('specialRequirements')} className={inputCls} />
        </label>
        <label>
          <span className="text-[10px] font-semibold text-muted">Notes</span>
          <input value={form.notes} onChange={set('notes')} className={inputCls} />
        </label>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 font-bold text-muted hover:text-navy">Cancel</button>
        <button disabled={busy} className="rounded-xl bg-primary text-white font-bold px-4 py-2 disabled:opacity-60">{busy ? 'Saving…' : 'Save details'}</button>
      </div>
    </form>
  );
}

/**
 * "Here's what I understood" (Blueprint §8). Shows only saved state:
 * ✓ known · amber "assumed – please check" · "Not specified", plus what is
 * still missing and what Aura+ only suggests.
 */
export default function UnderstandingCard({ understanding, event, onChanged, onAsk }) {
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!understanding || !event) return null;

  if (understanding.confirmed) {
    return (
      <div className="bg-white border border-emerald-100 rounded-3xl p-4 shadow-sm w-full max-w-xl flex items-center gap-3">
        <span className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0"><Icon name="check" size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-navy">Your event plan is ready</div>
          <div className="text-[11px] text-muted truncate">{event.title}</div>
        </div>
        <Link to={`/customer/events/${event.id}`} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 shrink-0">Open event →</Link>
      </div>
    );
  }

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} className="text-[11px] font-bold text-primary bg-white border border-primary/20 rounded-full px-3 py-1.5 shadow-xs">
        Show what I understood
      </button>
    );
  }

  const f = understanding.facts;
  const budgetDisplay = f.budget.value != null ? formatINR(f.budget.value) : f.budget.rangeLabel;
  const { needed, provided, suggested = [] } = understanding.services;
  const missingInfo = understanding.missingInfo || [];
  const inferred = understanding.inferred || [];

  async function build() {
    setBusy(true);
    setError('');
    try {
      const detail = await customerApi.confirmEvent(event.id);
      onChanged?.(detail);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm w-full max-w-xl">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
        <Icon name="check" size={13} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-bold text-navy">Here's what I understood</span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-50 text-amber-600">Not confirmed yet</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
        <FactTile icon="events" label="Event" fact={f.eventType} display={f.eventType.label} />
        <FactTile icon="calendar" label="Date" fact={f.date} display={formatDate(f.date.value)} />
        <FactTile icon="customers" label="Guests" fact={f.guestCount} display={f.guestCount.value} />
        <FactTile icon="vendors" label="Location" fact={f.location || f.city} display={f.location?.value || f.city.value} className="col-span-2 sm:col-span-2" />
        <FactTile icon="wallet" label="Budget" fact={f.budget} display={budgetDisplay} />
      </div>

      <div className="mt-2.5 bg-lavender/60 p-2.5 rounded-2xl border border-gray-100/60">
        <div className="text-[10px] text-muted flex items-center gap-1.5"><Icon name="services" size={11} /> Services</div>
        {needed.length === 0 && provided.length === 0 ? (
          <div className="text-xs text-muted italic mt-1">Not specified</div>
        ) : (
          <ul className="text-[11px] mt-1 space-y-0.5">
            {needed.map((s) => (
              <li key={s.category} className="text-navy">
                <b>{s.label}</b> — need help{s.location ? ` · ${s.location}` : ''}
              </li>
            ))}
            {provided.map((s) => (
              <li key={s.category} className="text-emerald-700">
                ✓ <b>{s.label}</b> — arranged by you{s.value ? `: ${s.value}` : ''}{s.location ? ` · ${s.location}` : ''}
              </li>
            ))}
          </ul>
        )}
        {suggested.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] text-muted">May be useful (you decide):</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {suggested.map((s) =>
                onAsk ? (
                  <button key={s.category} onClick={() => onAsk(`I need ${s.label.toLowerCase()}`)} className="rounded-full border border-dashed border-primary/40 text-primary text-[10px] font-bold px-2 py-0.5 hover:bg-primary-soft">
                    + {s.label}
                  </button>
                ) : (
                  <span key={s.category} className="rounded-full border border-dashed border-gray-300 text-muted text-[10px] font-semibold px-2 py-0.5">{s.label}</span>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {(missingInfo.length > 0 || inferred.length > 0) && (
        <div className="mt-2.5 grid sm:grid-cols-2 gap-2.5 text-[11px]">
          {missingInfo.length > 0 && (
            <div className="rounded-2xl border border-gray-100 p-2.5">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wide">Missing</div>
              <ul className="mt-1 space-y-0.5 text-navy">{missingInfo.map((m) => <li key={m.field}>• {m.label}</li>)}</ul>
            </div>
          )}
          {inferred.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-2.5">
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Assumed — please check</div>
              <ul className="mt-1 space-y-0.5 text-amber-800">{inferred.map((m) => <li key={m.field}>• {m.label}: {m.note}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {editing ? (
        <EditForm
          event={event}
          onCancel={() => setEditing(false)}
          onSaved={(detail) => {
            setEditing(false);
            onChanged?.(detail);
          }}
        />
      ) : (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
          {!understanding.canConfirm && (
            <p className="text-[10px] text-muted">To build your plan I still need: <b className="text-navy">{understanding.missingForConfirm.map((m) => m.label).join(', ')}</b></p>
          )}
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={build}
              disabled={!understanding.canConfirm || busy}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-extrabold px-4 py-2 transition shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Building…' : 'Build My Event Plan ✨'}
            </button>
            <button onClick={() => setEditing(true)} className="rounded-xl border border-gray-200 text-xs font-bold px-3 py-2 text-navy hover:bg-lavender">Edit details</button>
            <button onClick={() => setCollapsed(true)} className="text-xs font-bold text-muted hover:text-navy px-2 py-2">Ask me later</button>
          </div>
        </div>
      )}
    </div>
  );
}
