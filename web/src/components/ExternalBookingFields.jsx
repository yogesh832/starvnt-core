export const EXTERNAL_SOURCES = ['DIRECT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'JUSTDIAL', 'REFERRAL', 'REPEAT', 'OTHER', 'LEGACY_UNKNOWN'];
export const EXTERNAL_STAGES = { ENQUIRY: ['NEGOTIATION', 'QUOTE_SENT', 'ON_HOLD', 'CONFIRMED', 'CANCELLED'], NEGOTIATION: ['QUOTE_SENT', 'ON_HOLD', 'CONFIRMED', 'CANCELLED'], QUOTE_SENT: ['NEGOTIATION', 'ON_HOLD', 'CONFIRMED', 'CANCELLED'], ON_HOLD: ['CONFIRMED', 'ENQUIRY', 'NEGOTIATION', 'CANCELLED'], CONFIRMED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] };
export const human = value => String(value || '').replaceAll('_', ' ').toLowerCase();
export const localDateTime = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
export default function ExternalBookingFields({ value = {}, onChange, services = [], resources = [], editing = false }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  const line = (i, patch) => set('lineItems', value.lineItems.map((l, j) => j === i ? { ...l, ...patch } : l));
  return <fieldset className="border rounded-xl p-3 space-y-3"><legend className="font-bold">External commercial & operational details</legend>
    <p className="text-xs text-muted">Your reported business records remain separate from STARVNT payments.</p>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="grid gap-1 text-sm">Event name<input className="border rounded-lg p-2" maxLength={160} value={value.eventName || ''} onChange={e => set('eventName', e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Guest count (optional)<input type="number" min={1} max={1000000} step={1} className="border rounded-lg p-2" value={value.guestCount ?? ''} onChange={e => set('guestCount', e.target.value === '' ? null : Number(e.target.value))} /></label>
      <label className="grid gap-1 text-sm">Original booking source<select disabled={editing} className="border rounded-lg p-2" value={value.acquisitionChannel || (editing ? 'LEGACY_UNKNOWN' : 'DIRECT')} onChange={e => set('acquisitionChannel', e.target.value)}>{EXTERNAL_SOURCES.map(source => <option key={source} value={source}>{human(source)}</option>)}</select></label>
      {!editing && <label className="grid gap-1 text-sm">Initial stage<select className="border rounded-lg p-2" value={value.lifecycle || 'ENQUIRY'} onChange={e => set('lifecycle', e.target.value)}>{['ENQUIRY', 'NEGOTIATION', 'QUOTE_SENT', 'ON_HOLD', 'CONFIRMED'].map(stage => <option key={stage} value={stage}>{human(stage)}</option>)}</select></label>}
      {value.lifecycle === 'ON_HOLD' && <label className="grid gap-1 text-sm">Tentative hold expires<input required type="datetime-local" className="border rounded-lg p-2" value={localDateTime(value.holdExpiresAt)} onChange={e => set('holdExpiresAt', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>}
      <label className="grid gap-1 text-sm">Booking value (₹)<input required type="number" min={0} max={1e10} step="0.01" className="border rounded-lg p-2" value={value.totalAmount ?? 0} onChange={e => set('totalAmount', Number(e.target.value))} /></label>
      <label className="grid gap-1 text-sm">Next payment due (optional)<input type="datetime-local" className="border rounded-lg p-2" value={localDateTime(value.nextPaymentDueAt)} onChange={e => set('nextPaymentDueAt', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
    </div>
    <fieldset className="space-y-3"><legend className="text-sm font-bold">Services & quantities</legend>
      {(value.lineItems || []).map((item, i) => <div key={i} className="border rounded-lg p-2 grid sm:grid-cols-2 gap-2">
        <label className="text-xs">Catalogue service (optional)<select className="border rounded-lg p-2 block w-full" value={item.service || ''} onChange={e => line(i, { service: e.target.value || null, name: services.find(s => s._id === e.target.value)?.name || item.name })}><option value="">Custom external service</option>{services.filter(s => s.status !== 'ARCHIVED').map(s => <option value={s._id} key={s._id}>{s.name}</option>)}</select></label>
        <label className="text-xs">Service name<input required className="border rounded-lg p-2 block w-full" maxLength={120} value={item.name || ''} onChange={e => line(i, { name: e.target.value })} /></label>
        <label className="text-xs">Quantity<input required type="number" min={1} max={100000} step={1} className="border rounded-lg p-2 block w-full" value={item.quantity} onChange={e => line(i, { quantity: Number(e.target.value) })} /></label>
        <label className="text-xs">Unit price (₹)<input required type="number" min={0} step="0.01" className="border rounded-lg p-2 block w-full" value={item.unitPrice} onChange={e => line(i, { unitPrice: Number(e.target.value) })} /></label>
        <button type="button" className="text-red-700 underline min-h-11" onClick={() => set('lineItems', value.lineItems.filter((_, j) => j !== i))}>Remove service line</button>
      </div>)}
      <button type="button" className="border rounded-lg px-3 min-h-11 text-sm" onClick={() => set('lineItems', [...(value.lineItems || []), { name: '', service: null, quantity: 1, unitPrice: 0 }])}>Add service line</button>
    </fieldset>
    <fieldset className="space-y-2"><legend className="text-sm font-bold">Team, equipment & vehicle quantities</legend>
      <p className="text-xs text-muted">Use 0 for unused resources. Catalogue dependencies are also reserved.</p>
      {resources.filter(r => !['RETIRED', 'MAINTENANCE'].includes(r.status)).map(r => <label key={r._id} className="flex items-center justify-between gap-3 text-sm"><span>{r.name} · {human(r.type)} (capacity {r.capacityUnits || 1})</span><input aria-label={`${r.name} units`} type="number" min={0} max={r.capacityUnits || 1} step={1} className="border rounded-lg p-2 w-20" value={value.allocations?.find(a => String(a.resource) === String(r._id))?.units || 0} onChange={e => set('allocations', [...(value.allocations || []).filter(a => String(a.resource) !== String(r._id)), ...(Number(e.target.value) > 0 ? [{ resource: r._id, units: Number(e.target.value) }] : [])])} /></label>)}
      {!resources.length && <p className="text-xs text-muted">Add resources in Calendar to allocate team or equipment.</p>}
    </fieldset>
    <div className="grid sm:grid-cols-2 gap-3">{[['setupMinutes', 'Setup buffer'], ['teardownMinutes', 'Teardown buffer'], ['travelBeforeMinutes', 'Travel before'], ['travelAfterMinutes', 'Travel after']].map(([key, label]) => <label key={key} className="text-sm">{label} (minutes)<input type="number" min={0} max={1440} step={1} className="border rounded-lg p-2 block w-full" value={value.buffers?.[key] || 0} onChange={e => set('buffers', { ...value.buffers, [key]: Number(e.target.value) })} /></label>)}</div>
  </fieldset>;
}
