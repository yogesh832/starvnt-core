import { useState } from 'react';
import { externalApi } from '../lib/api.js';

export default function CommitmentForm({ initial, services = [], resources = [], onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ date: '', endDate: '', allDay: true, startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata', recordType: 'VENDOR_BLOCK', scope: 'BUSINESS', reason: 'Personal / Vacation', resourceIds: [], external: {}, ...initial, vendorService: initial?.vendorService?._id || initial?.vendorService || '', idempotencyKey: crypto.randomUUID() }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = (key, label, type = 'text', required = true) => <label className="grid gap-1 text-sm"><span>{label}</span><input className="rounded-lg border p-2 w-full" type={type} required={required} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>;
  const externalField = (key, label, required = true) => <label className="grid gap-1 text-sm"><span>{label}</span><input className="rounded-lg border p-2 w-full" required={required} value={form.external?.[key] || ''} onChange={e => setForm({ ...form, external: { ...form.external, [key]: e.target.value } })} /></label>;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await externalApi.call(`/vendor/availability/blockouts${initial?._id ? `/${initial._id}` : ''}`, { method: initial?._id ? 'PATCH' : 'POST', body: { ...form, serviceLocation: form.recordType === 'EXTERNAL_COMMITMENT' ? { ...form.serviceLocation, address: form.external.location } : null, endDate: form.endDate || form.date } });
      onSaved();
    } catch (err) { setError([err.data?.message || err.message, ...(err.data?.conflicts || []).map(c => `${c.detail || c.type}${c.recordId ? ` (${c.recordId})` : ''}`)].join(' · ')); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <h2 className="font-extrabold text-lg">{initial ? 'Edit availability record' : 'Block Availability / Add External Booking'}</h2>
    <label className="grid gap-1 text-sm">Record type<select className="border rounded-lg p-2" value={form.recordType} onChange={e => setForm({ ...form, recordType: e.target.value })}><option value="VENDOR_BLOCK">Operational / personal block</option><option value="EXTERNAL_COMMITMENT">External customer booking (reported)</option></select></label>
    <div className="grid sm:grid-cols-2 gap-3">{field('date', 'Start date', 'date')}{field('endDate', 'End date (optional)', 'date', false)}</div>
    <label className="flex gap-2"><input type="checkbox" checked={form.allDay} onChange={e => setForm({ ...form, allDay: e.target.checked })} />Full day</label>
    {!form.allDay && <div className="grid grid-cols-2 gap-3">{field('startTime', 'Start time', 'time')}{field('endTime', 'End time', 'time')}</div>}
    {field('timezone', 'Timezone')}
    <label className="grid gap-1 text-sm">Resource scope<select className="border rounded-lg p-2" value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}><option value="BUSINESS">Entire business</option><option value="SERVICE">Specific service</option><option value="RESOURCE">Team member / equipment / vehicle</option></select></label>
    {form.scope === 'SERVICE' && <label className="grid gap-1 text-sm">Service<select required className="border rounded-lg p-2" value={form.vendorService} onChange={e => setForm({ ...form, vendorService: e.target.value })}><option value="">Choose service</option>{services.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>}
    {form.scope === 'RESOURCE' && <fieldset><legend className="text-sm">Affected resources</legend>{resources.length ? resources.map(r => <label key={r._id} className="flex gap-2 p-1"><input type="checkbox" checked={form.resourceIds.map(String).includes(String(r._id))} onChange={e => setForm({ ...form, resourceIds: e.target.checked ? [...form.resourceIds, r._id] : form.resourceIds.filter(id => String(id) !== String(r._id)) })} />{r.name || r.label || r.type}</label>) : <p>Add operational resources before using this scope.</p>}</fieldset>}
    <label className="grid gap-1 text-sm">Reason<select className="border rounded-lg p-2" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>{['Personal / Vacation', 'External Customer Booking', 'Team Unavailable', 'Equipment Maintenance', 'Travel / Transit', 'Other', form.reason].filter((v, i, arr) => arr.indexOf(v) === i).map(r => <option key={r}>{r}</option>)}</select></label>
    {form.recordType === 'EXTERNAL_COMMITMENT' && <fieldset className="grid gap-3 border rounded-xl p-3"><legend>External booking details</legend><p className="text-xs">Vendor-reported commitment. This does not create or verify a STARVNT booking. Customer name and phone are optional. Add a location when travel or service conflicts need checking.</p>{externalField('customerName', 'Customer name (optional)', false)}{externalField('customerPhone', 'Phone with country code (optional)', false)}{externalField('eventType', 'Event type (optional)', false)}{externalField('location', 'Event location (when needed)', false)}<label className="grid gap-1 text-sm">Event city (optional for travel estimates)<input className="border rounded-lg p-2" value={form.serviceLocation?.city || ''} onChange={e => setForm({ ...form, serviceLocation: { ...form.serviceLocation, city: e.target.value } })} /></label><label className="grid gap-1 text-sm">Event locality (optional)<input className="border rounded-lg p-2" value={form.serviceLocation?.locality || ''} onChange={e => setForm({ ...form, serviceLocation: { ...form.serviceLocation, locality: e.target.value } })} /></label>{externalField('notes', 'Notes (optional)', false)}{externalField('reference', 'External reference (optional)', false)}</fieldset>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-3"><button disabled={busy} className="bg-primary text-white rounded-xl px-4 py-2">{busy ? 'Saving…' : 'Save record'}</button><button type="button" onClick={onCancel} className="border rounded-xl px-4 py-2">Cancel</button></div>
  </form>;
}
