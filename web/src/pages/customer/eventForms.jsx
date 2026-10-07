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

const CITY_COORDINATES = {
  gopeshwar: { city: 'Gopeshwar', state: 'Uttarakhand', lat: 30.4042, lng: 79.3242, pincode: '246401' },
  kapkote: { city: 'Kapkote', state: 'Uttarakhand', lat: 29.9458, lng: 79.9042, pincode: '263632' },
  bageshwar: { city: 'Bageshwar', state: 'Uttarakhand', lat: 29.8398, lng: 79.7712, pincode: '263642' },
  dehradun: { city: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322, pincode: '248001' },
  nainital: { city: 'Nainital', state: 'Uttarakhand', lat: 29.3919, lng: 79.4542, pincode: '263001' },
  delhi: { city: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090, pincode: '110001' },
  kolkata: { city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, pincode: '700001' },
  mumbai: { city: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777, pincode: '400001' },
};

function LocationMapModal({ currentLocation, onConfirm, onClose }) {
  const initialCityKey = (currentLocation?.city || 'gopeshwar').toLowerCase();
  const preset = CITY_COORDINATES[initialCityKey] || CITY_COORDINATES.gopeshwar;

  const [searchQuery, setSearchQuery] = useState(currentLocation?.city || 'Gopeshwar');
  const [selectedCoords, setSelectedCoords] = useState(
    currentLocation?.coordinates || { lat: preset.lat, lng: preset.lng }
  );
  const [selectedCity, setSelectedCity] = useState(currentLocation?.city || preset.city);
  const [selectedState, setSelectedState] = useState(currentLocation?.state || preset.state);
  const [selectedArea, setSelectedArea] = useState(currentLocation?.area || 'NH107A');
  const [selectedPincode, setSelectedPincode] = useState(currentLocation?.pincode || preset.pincode);

  function handleSelectPreset(key) {
    const p = CITY_COORDINATES[key];
    if (!p) return;
    setSelectedCity(p.city);
    setSelectedState(p.state);
    setSelectedCoords({ lat: p.lat, lng: p.lng });
    setSelectedPincode(p.pincode);
    setSearchQuery(p.city);
  }

  function handleConfirm() {
    onConfirm({
      city: selectedCity,
      state: selectedState,
      area: selectedArea,
      pincode: selectedPincode,
      coordinates: selectedCoords,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#161926] rounded-3xl shadow-2xl max-w-xl w-full p-5 space-y-4 border border-gray-100 dark:border-gray-800 animate-[pop_.18s_ease-out]">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center">
              <Icon name="mapPin" size={16} />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-navy dark:text-white">Pin Event Location on Map</h3>
              <p className="text-[11px] text-muted dark:text-slate-400">Select city, locality & pin exact venue coordinates</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-muted hover:text-navy dark:hover:text-white cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted dark:text-slate-400 mb-1.5">Quick Location Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(CITY_COORDINATES).map((key) => {
              const item = CITY_COORDINATES[key];
              const isSelected = selectedCity.toLowerCase() === item.city.toLowerCase();
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleSelectPreset(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-gray-800 text-navy dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  📍 {item.city}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative h-44 w-full rounded-2xl bg-slate-900 overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col justify-between p-3">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[10px] font-mono font-extrabold px-2 py-1 rounded-md bg-black/60 text-emerald-400 backdrop-blur-xs border border-emerald-500/30">
              GPS: {selectedCoords.lat.toFixed(4)}° N, {selectedCoords.lng.toFixed(4)}° E
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-black/60 text-white backdrop-blur-xs">
              📍 {selectedCity}, {selectedState}
            </span>
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="animate-bounce text-primary flex flex-col items-center">
              <Icon name="mapPin" size={32} className="drop-shadow-lg text-rose-500" />
              <span className="bg-navy/90 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-md">
                {selectedArea || selectedCity} Venue
              </span>
            </div>
          </div>

          <div className="relative z-10 text-[10px] text-slate-400 text-center bg-black/40 py-1 rounded-lg backdrop-blur-xs">
            Coordinates locked for distance math & search wave calculation
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[10px] font-semibold text-muted dark:text-slate-400">City</label>
            <input
              type="text"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f2336] px-3 py-1.5 font-bold text-navy dark:text-white outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted dark:text-slate-400">Area / Locality</label>
            <input
              type="text"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f2336] px-3 py-1.5 font-bold text-navy dark:text-white outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-muted hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-xs cursor-pointer"
          >
            Confirm Location from Map
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full event location: country, state, city, area, venue, address, pincode, landmark, notes. */
export function LocationFields({ value, onChange, requireCity = true }) {
  const [showMapModal, setShowMapModal] = useState(false);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between bg-primary-soft/40 dark:bg-primary/15 border border-primary/20 p-2.5 rounded-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-navy dark:text-white truncate">
          <Icon name="mapPin" size={16} className="text-primary shrink-0" />
          <span className="truncate">
            {value.city ? `Pinned Location: ${value.city}${value.area ? `, ${value.area}` : ''}` : 'Pin exact location on interactive map'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowMapModal(true)}
          className="rounded-lg bg-primary text-white text-[11px] font-bold px-3 py-1.5 hover:bg-primary-dark transition cursor-pointer flex items-center gap-1 shrink-0"
        >
          <Icon name="mapPin" size={12} />
          <span>Map Selector</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Venue name"><input className={inputCls} value={value.venueName} onChange={set('venueName')} placeholder="e.g. Kisan Palace" /></Field>
        <Field label="Area / locality"><input className={inputCls} value={value.area} onChange={set('area')} placeholder="e.g. NH107A" /></Field>
        <Field label={`City${requireCity ? ' *' : ''}`}><input className={inputCls} value={value.city} onChange={set('city')} placeholder="e.g. Gopeshwar" /></Field>
        <Field label="State"><input className={inputCls} value={value.state} onChange={set('state')} placeholder="e.g. Uttarakhand" /></Field>
        <Field label="Country"><input className={inputCls} value={value.country} onChange={set('country')} placeholder="e.g. India" /></Field>
        <Field label="Pincode"><input className={inputCls} value={value.pincode} onChange={set('pincode')} inputMode="numeric" placeholder="e.g. 246401" /></Field>
        <Field label="Full address" className="col-span-2"><input className={inputCls} value={value.address} onChange={set('address')} placeholder="Building, street" /></Field>
        <Field label="Landmark"><input className={inputCls} value={value.landmark} onChange={set('landmark')} placeholder="Near…" /></Field>
        <Field label="Location notes"><input className={inputCls} value={value.notes} onChange={set('notes')} placeholder="e.g. Entry from gate 2" /></Field>
      </div>

      {showMapModal && (
        <LocationMapModal
          currentLocation={value}
          onConfirm={(updated) => onChange({ ...value, ...updated })}
          onClose={() => setShowMapModal(false)}
        />
      )}
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
