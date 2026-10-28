import { useCallback, useState } from 'react';
import MapLocationPicker from './MapLocationPicker.jsx';
import { normalizeVendorLocation, vendorCopy } from '../../../server/src/common/vendorAuraUi.js';

export default function VendorAuraLocation({ language = 'en', disabled, onSelect }) {
  const [draft, setDraft] = useState(null);
  const choose = useCallback(point => setDraft({ ...point, coordinates: {lat:point.lat,lng:point.lng} }), []);
  const location = normalizeVendorLocation(draft);
  return <section aria-label={vendorCopy(language,'mapTitle')} className="min-w-0 rounded-2xl border border-primary/25 bg-white dark:bg-slate-900 p-3 shadow-sm space-y-3">
    <h3 className="text-sm font-bold text-navy dark:text-slate-100">{vendorCopy(language,'mapTitle')}</h3>
    <p className="text-xs text-muted dark:text-slate-300">{vendorCopy(language,'mapGuide')}</p>
    <MapLocationPicker value={draft ? {lat:draft.coordinates.lat,lng:draft.coordinates.lng} : {lat:20.5937,lng:78.9629}} autoLocate={false} initialZoom={5} compactControls onChange={choose} height="280px" guidance={vendorCopy(language,'pin')} />
    {draft && <div className="space-y-2">
      <label className="block text-xs font-semibold text-navy dark:text-slate-200">{vendorCopy(language,'address')}
        <input aria-label={vendorCopy(language,'address')} disabled={disabled} value={draft.address || ''} maxLength={200} onChange={e=>setDraft(current=>({...current,address:e.target.value}))} className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-transparent p-2.5 text-sm" />
      </label>
      <label className="block text-xs font-semibold text-navy dark:text-slate-200">{vendorCopy(language,'city')}
        <input aria-label={vendorCopy(language,'city')} disabled={disabled} value={draft.city || ''} maxLength={80} onChange={e=>setDraft(current=>({...current,city:e.target.value}))} className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-transparent p-2.5 text-sm" />
      </label>
    </div>}
    <button type="button" disabled={disabled || !location} onClick={()=>onSelect(location)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{vendorCopy(language,'useLocation')}</button>
  </section>;
}
