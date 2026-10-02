import { useEffect, useState } from 'react';
import { customerApi } from './customerApi.js';

/**
 * Shared Customer event form pieces: the manual form, "Edit details" and the
 * plan page all use these, so every path writes the same event fields.
 */

export const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs sm:text-sm outline-none focus:border-primary';

// plan-options per event type (service fields come from the Vendor OS taxonomy).
const planOptionsCache = new Map();
export function usePlanOptions(eventType) {
  const key = eventType || '';
  const [data, setData] = useState(planOptionsCache.get(key) || null);
  useEffect(() => {
    let live = true;
    if (planOptionsCache.has(key)) {
      setData(planOptionsCache.get(key));
      return undefined;
    }
    customerApi
      .planOptions(eventType || undefined)
      .then((d) => {
        planOptionsCache.set(key, d);
        if (live) setData(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, eventType]);
  return data;
}

export const EMPTY_LOCATION = { country: '', state: '', city: '', area: '', venueName: '', address: '', pincode: '', landmark: '', notes: '' };

export function locationFromEvent(event) {
  const l = event?.location || {};
  return {
    country: l.country || '',
    state: l.state || '',
    city: event?.city || l.city || '',
    area: l.locality || '',
    venueName: l.venueName || '',
    address: l.address || '',
    pincode: l.pincode || '',
    landmark: l.landmark || '',
    notes: l.notes || '',
  };
}

/** Only changed/filled keys, '' → null, for the API. */
export function locationPayload(loc, original) {
  const out = {};
  for (const [k, v] of Object.entries(loc)) {
    const val = typeof v === 'string' ? v.trim() : v;
    const before = original ? original[k] : '';
    if (original ? val !== before : val) out[k] = val || null;
  }
  return out;
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Full event location: country, state, city, area, venue, address, pincode, landmark, notes. */
export function LocationFields({ value, onChange, requireCity = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Field label="Venue name"><input className={inputCls} value={value.venueName} onChange={set('venueName')} placeholder="e.g. Kisan Palace" /></Field>
      <Field label="Area / locality"><input className={inputCls} value={value.area} onChange={set('area')} placeholder="e.g. New Town" /></Field>
      <Field label={`City${requireCity ? ' *' : ''}`}><input className={inputCls} value={value.city} onChange={set('city')} placeholder="e.g. Kolkata" /></Field>
      <Field label="State"><input className={inputCls} value={value.state} onChange={set('state')} placeholder="e.g. West Bengal" /></Field>
      <Field label="Country"><input className={inputCls} value={value.country} onChange={set('country')} placeholder="e.g. India" /></Field>
      <Field label="Pincode"><input className={inputCls} value={value.pincode} onChange={set('pincode')} inputMode="numeric" placeholder="e.g. 700156" /></Field>
      <Field label="Full address" className="col-span-2"><input className={inputCls} value={value.address} onChange={set('address')} placeholder="Building, street" /></Field>
      <Field label="Landmark"><input className={inputCls} value={value.landmark} onChange={set('landmark')} placeholder="Near…" /></Field>
      <Field label="Location notes"><input className={inputCls} value={value.notes} onChange={set('notes')} placeholder="e.g. Entry from gate 2" /></Field>
    </div>
  );
}

/** One dynamic requirement field (text | number | select | multiselect). */
function DetailField({ field, value, onChange }) {
  if (field.type === 'multiselect') {
    const list = Array.isArray(value) ? value : [];
    return (
      <Field label={field.label} className="col-span-2">
        <div className="flex flex-wrap gap-1.5 mt-1">
          {field.options.map((o) => {
            const on = list.includes(o);
            return (
              <button
                type="button"
                key={o}
                onClick={() => onChange(on ? list.filter((x) => x !== o) : [...list, o])}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${on ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Not specified</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    );
  }
  return (
    <Field label={field.label}>
      <input
        className={inputCls}
        type={field.type === 'number' ? 'number' : 'text'}
        min={field.min}
        max={field.max}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : field.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  );
}

export const EMPTY_SERVICE_LOCATION = { mode: 'unspecified', place: '', pickup: '', drop: '', dropIsEventLocation: false };

export function serviceLocationPayload(sl) {
  if (!sl || sl.mode !== 'custom') return { mode: sl?.mode || 'unspecified' };
  return {
    mode: 'custom',
    place: sl.place?.trim() || null,
    pickup: sl.pickup?.trim() || null,
    drop: sl.dropIsEventLocation ? null : sl.drop?.trim() || null,
    dropIsEventLocation: Boolean(sl.dropIsEventLocation),
  };
}

/**
 * Where this service happens: event location / a different location / not
 * specified yet. Transport gets pickup → drop.
 */
export function ServiceLocationFields({ category, value, onChange, eventLocationLabel, isRoute }) {
  const v = value || EMPTY_SERVICE_LOCATION;
  const set = (patch) => onChange({ ...v, ...patch });
  const modes = [
    ['event', isRoute ? 'Drop at event location' : 'Use event location'],
    ['custom', isRoute ? 'Set pickup / drop' : 'Different location'],
    ['unspecified', 'Not specified yet'],
  ];
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted">Where will this happen?</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {modes.map(([m, label]) => (
          <button
            type="button"
            key={m}
            onClick={() => set(isRoute && m === 'event' ? { mode: 'custom', dropIsEventLocation: true } : { mode: m })}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              (isRoute && m === 'event' ? v.mode === 'custom' && v.dropIsEventLocation && !v.pickup : v.mode === m) ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {v.mode === 'event' && <div className="text-[11px] text-muted mt-1.5">{eventLocationLabel ? `At ${eventLocationLabel}` : 'At the event location (add it above)'}</div>}
      {v.mode === 'custom' &&
        (isRoute ? (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input className={inputCls} value={v.pickup || ''} onChange={(e) => set({ pickup: e.target.value })} placeholder="Pickup (e.g. Salt Lake)" />
            <input className={inputCls} value={v.dropIsEventLocation ? '' : v.drop || ''} disabled={v.dropIsEventLocation} onChange={(e) => set({ drop: e.target.value })} placeholder={v.dropIsEventLocation ? 'Event location' : 'Drop'} />
            <label className="col-span-2 text-[11px] text-navy inline-flex items-center gap-1.5">
              <input type="checkbox" checked={Boolean(v.dropIsEventLocation)} onChange={(e) => set({ dropIsEventLocation: e.target.checked })} className="accent-primary" />
              Drop at the event location
            </label>
          </div>
        ) : (
          <input className={`${inputCls} mt-2`} value={v.place || ''} onChange={(e) => set({ place: e.target.value })} placeholder={category === 'makeup' ? "e.g. Bride's hotel" : 'Place / address'} />
        ))}
    </div>
  );
}

/**
 * Service details (dynamic fields for this Event Type + Service), where it
 * happens, and special requirements.
 */
export function ServiceEditor({ category, fields = [], isRoute, value, onChange, eventLocationLabel }) {
  const details = value.details || {};
  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {fields.map((f) => (
            <DetailField key={f.key} field={f} value={details[f.key]} onChange={(val) => onChange({ ...value, details: { ...details, [f.key]: val } })} />
          ))}
        </div>
      )}
      <ServiceLocationFields
        category={category}
        isRoute={isRoute}
        value={value.serviceLocation}
        eventLocationLabel={eventLocationLabel}
        onChange={(sl) => onChange({ ...value, serviceLocation: sl })}
      />
      <Field label="Special requirements">
        <input className={inputCls} value={value.specialRequirements || ''} onChange={(e) => onChange({ ...value, specialRequirements: e.target.value })} placeholder="Anything the vendor should know" />
      </Field>
    </div>
  );
}

/** Drop empty detail values before sending. */
export function detailsPayload(details = {}) {
  return Object.fromEntries(Object.entries(details).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0)));
}

/** A readable one-liner for a stored service location. */
export function serviceLocationText(sl, eventLocationLabel) {
  if (!sl || sl.mode === 'unspecified') return null;
  if (sl.mode === 'event') return eventLocationLabel ? `At ${eventLocationLabel}` : 'At the event location';
  if (sl.pickup || sl.drop || sl.dropIsEventLocation) {
    return [sl.pickup && `From ${sl.pickup}`, (sl.dropIsEventLocation ? 'event location' : sl.drop) && `to ${sl.dropIsEventLocation ? 'event location' : sl.drop}`].filter(Boolean).join(' ');
  }
  return [sl.place, sl.locality, sl.city].filter(Boolean).join(', ') || sl.address || null;
}
