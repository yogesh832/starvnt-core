import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { customerApi } from './customerApi.js';
import MapLocationPicker from '../../components/MapLocationPicker.jsx';

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
    coordinates: l.coordinates || null,
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

function LocationMapModal({ currentLocation, onConfirm, onClose }) {
  const hasSavedPoint = Number.isFinite(Number(currentLocation?.coordinates?.lat)) && Number.isFinite(Number(currentLocation?.coordinates?.lng)) && (Number(currentLocation.coordinates.lat) !== 0 || Number(currentLocation.coordinates.lng) !== 0);
  const [selectedLocation, setSelectedLocation] = useState(hasSavedPoint ? {
    ...currentLocation.coordinates,
    city: currentLocation.city,
    state: currentLocation.state,
    locality: currentLocation.area,
    address: currentLocation.address,
    postalCode: currentLocation.pincode,
  } : null);
  const searchPlaces = (query) => customerApi.searchLocations(query).then((result) => result.places || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#161926] rounded-3xl shadow-2xl max-w-2xl w-full p-4 sm:p-5 space-y-3 border border-gray-100 dark:border-gray-800 animate-[pop_.18s_ease-out] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center">
              <Icon name="mapPin" size={16} />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-navy dark:text-white">Find the event location</h3>
              <p className="text-[11px] text-muted dark:text-slate-400">Search a place or address, then adjust the pin if needed.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-muted hover:text-navy dark:hover:text-white cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <MapLocationPicker
          height="420px"
          autoLocate={false}
          initialZoom={hasSavedPoint ? 14 : 5}
          value={hasSavedPoint ? currentLocation.coordinates : undefined}
          onChange={setSelectedLocation}
          searchPlaces={searchPlaces}
          guidance="Search for the event venue, town, or area, then drag the pin to the exact spot"
        />
        {selectedLocation?.city && (
          <div className="rounded-xl bg-primary-soft/50 dark:bg-primary/10 px-3 py-2 text-xs text-navy dark:text-white">
            <b>{selectedLocation.city}{selectedLocation.state ? `, ${selectedLocation.state}` : ''}</b>
            {selectedLocation.address && <div className="mt-0.5 text-[10px] text-muted dark:text-slate-400">{selectedLocation.address}</div>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-muted hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedLocation?.city) return;
              onConfirm({
                city: selectedLocation.city,
                state: selectedLocation.state || '',
                country: selectedLocation.country || 'India',
                area: selectedLocation.locality || currentLocation.area || '',
                pincode: selectedLocation.postalCode || currentLocation.pincode || '',
                address: selectedLocation.address || currentLocation.address || '',
                coordinates: { lat: Number(selectedLocation.lat), lng: Number(selectedLocation.lng) },
              });
              onClose();
            }}
            disabled={!selectedLocation?.city}
            className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-xs cursor-pointer"
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full event location: country, state, city, area, venue, address, pincode, landmark, notes. */
export function LocationFields({ value, onChange, requireCity = true }) {
  const [showMapModal, setShowMapModal] = useState(false);
  const hasCoordinates = Number.isFinite(Number(value.coordinates?.lat)) && Number.isFinite(Number(value.coordinates?.lng)) && (Number(value.coordinates?.lat) !== 0 || Number(value.coordinates?.lng) !== 0);
  const initialPlaceQuery = [value.city, value.state].filter(Boolean).join(', ');
  const [placeQuery, setPlaceQuery] = useState(initialPlaceQuery);
  const selectedPlaceQuery = useRef(hasCoordinates ? initialPlaceQuery : '');
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showPlaces, setShowPlaces] = useState(false);
  const [searchError, setSearchError] = useState('');
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  useEffect(() => {
    if (value.city && hasCoordinates) setPlaceQuery([value.city, value.state].filter(Boolean).join(', '));
  }, [value.city, value.state, value.coordinates?.lat, value.coordinates?.lng]);

  useEffect(() => {
    const query = placeQuery.trim();
    if (query.length < 2) {
      setPlaces([]);
      setSearchError('');
      setSearching(false);
      return undefined;
    }
    if (selectedPlaceQuery.current && selectedPlaceQuery.current === query) {
      selectedPlaceQuery.current = '';
      setPlaces([]);
      setShowPlaces(false);
      return undefined;
    }
    let current = true;
    const timeout = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const result = await customerApi.searchLocations(query);
        if (current) {
          setPlaces(result.places || []);
          setShowPlaces(true);
          if (!(result.places || []).length) setSearchError('No places found. Try a nearby town, district, or a shorter spelling.');
        }
      } catch {
        if (current) setSearchError('Location search is unavailable. Try again or use the map search.');
      } finally {
        if (current) setSearching(false);
      }
    }, 350);
    return () => { current = false; clearTimeout(timeout); };
  }, [placeQuery]);

  function selectPlace(place) {
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !place.city) return;
    const selected = {
      ...value,
      city: place.city,
      state: place.state || '',
      country: place.country || 'India',
      area: place.locality || '',
      address: place.address || '',
      pincode: place.pincode || '',
      coordinates: { lat, lng },
    };
    onChange(selected);
    const selectedQuery = [place.city, place.state].filter(Boolean).join(', ');
    selectedPlaceQuery.current = selectedQuery;
    setPlaceQuery(selectedQuery);
    setPlaces([]);
    setShowPlaces(false);
    setSearchError('');
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between bg-primary-soft/40 dark:bg-primary/15 border border-primary/20 p-2.5 rounded-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-navy dark:text-white truncate">
          <Icon name="mapPin" size={16} className="text-primary shrink-0" />
          <span className="truncate">
            {hasCoordinates ? `Location selected: ${value.city}${value.area ? `, ${value.area}` : ''}` : 'Search and select the event location'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowMapModal(true)}
          className="rounded-lg bg-primary text-white text-[11px] font-bold px-3 py-1.5 hover:bg-primary-dark transition cursor-pointer flex items-center gap-1 shrink-0"
        >
          <Icon name="mapPin" size={12} />
          <span>Search on map</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Venue name"><input className={inputCls} value={value.venueName} onChange={set('venueName')} placeholder="e.g. Kisan Palace" /></Field>
        <Field label="Area / locality"><input className={inputCls} value={value.area} onChange={set('area')} placeholder="e.g. NH107A" /></Field>
        <div className="col-span-2 relative">
          <label className="block">
            <span className="text-[10px] font-semibold text-muted">Search city, area, or venue{requireCity ? ' *' : ''}</span>
            <input
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showPlaces && places.length > 0}
              aria-controls="customer-location-suggestions"
              value={placeQuery}
              onChange={(event) => {
                setPlaceQuery(event.target.value);
                setShowPlaces(true);
                setSearchError('');
                if (hasCoordinates || value.city) onChange({ ...value, city: '', state: '', country: '', area: '', address: '', pincode: '', coordinates: null });
              }}
              onFocus={() => places.length && setShowPlaces(true)}
              onBlur={() => setTimeout(() => setShowPlaces(false), 150)}
              className={inputCls}
              placeholder="Type a place; select a suggestion to verify it"
              autoComplete="off"
            />
          </label>
          {searching && <span className="absolute right-3 top-7 text-[10px] text-muted">Searching places…</span>}
          {showPlaces && places.length > 0 && (
            <div id="customer-location-suggestions" role="listbox" className="absolute z-40 top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl">
              {places.map((place) => (
                <button key={place.id || `${place.name}-${place.lat}-${place.lng}`} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => selectPlace(place)} className="w-full border-b last:border-0 border-gray-100 px-3 py-2.5 text-left hover:bg-primary-soft/40">
                  <span className="block text-xs font-bold text-navy">{place.name || place.city}</span>
                  <span className="block text-[10px] text-muted truncate">{place.address}{place.state ? ` · ${place.state}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {searchError && <p role="status" className="mt-1 text-[10px] text-amber-700">{searchError}</p>}
          {!searchError && !hasCoordinates && <p className="mt-1 text-[10px] text-muted">Choose a result so the city spelling and map point are saved for vendor matching.</p>}
        </div>
        <Field label="Verified city"><input className={`${inputCls} bg-gray-50 text-muted`} value={value.city} readOnly placeholder="Selected from location search" /></Field>
        <Field label="State"><input className={`${inputCls} bg-gray-50 text-muted`} value={value.state} readOnly placeholder="From selected place" /></Field>
        <Field label="Country"><input className={`${inputCls} bg-gray-50 text-muted`} value={value.country} readOnly placeholder="From selected place" /></Field>
        <Field label="Pincode"><input className={inputCls} value={value.pincode} onChange={set('pincode')} inputMode="numeric" placeholder="e.g. 246401" /></Field>
        <Field label="Full address" className="col-span-2"><input className={inputCls} value={value.address} onChange={set('address')} placeholder="Building, street" /></Field>
        <Field label="Landmark"><input className={inputCls} value={value.landmark} onChange={set('landmark')} placeholder="Near…" /></Field>
        <Field label="Location notes"><input className={inputCls} value={value.notes} onChange={set('notes')} placeholder="e.g. Entry from gate 2" /></Field>
      </div>

      {showMapModal && (
        <LocationMapModal
          currentLocation={value}
          onConfirm={(updated) => {
            onChange({ ...value, ...updated });
            const selectedQuery = [updated.city, updated.state].filter(Boolean).join(', ');
            selectedPlaceQuery.current = selectedQuery;
            setPlaceQuery(selectedQuery);
          }}
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
