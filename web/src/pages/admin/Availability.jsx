import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
export default function Availability() {
  const { can } = useAdminAuth();
  const [filters, setFilters] = useState({ vendor: '', from: '', to: '', recordType: '', scope: '', status: '', conflict: '', resource: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page }); setData(await adminApi.call(`/availability?${query}`)); setError(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [filters, page]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  async function cancel(row) {
    const reason = window.prompt('Reason for cancelling this reported record:');
    if (!reason?.trim()) return;
    try { await adminApi.call(`/availability/${row._id}/cancel`, { method: 'POST', body: { reason } }); await load(); } catch (err) { setError(err.message); }
  }
  const set = (key, value) => { setFilters({ ...filters, [key]: value }); setPage(0); };
  const select = (key, label, options) => <label className="grid gap-1 text-xs">{label}<select className="border rounded-lg p-2" value={filters[key]} onChange={e => set(key, e.target.value)}><option value="">All</option>{options.map(o => <option key={o} value={o}>{o.replaceAll('_', ' ')}</option>)}</select></label>;
  return <div className="space-y-4"><div className="flex justify-between gap-3"><h1 className="text-xl font-extrabold">Availability & External Commitments</h1><button className="border px-3 rounded-lg" onClick={load} disabled={busy}>Refresh</button></div>
    <p className="text-sm text-muted">These are vendor-reported operational records. They do not verify an external booking or override a confirmed STARVNT booking.</p>
    <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-white rounded-2xl p-4">
      <label className="grid gap-1 text-xs">Vendor ID<input className="border rounded-lg p-2" value={filters.vendor} onChange={e => set('vendor', e.target.value)} /></label>
      {['from', 'to'].map(key => <label key={key} className="grid gap-1 text-xs">{key === 'from' ? 'From' : 'To'}<input className="border rounded-lg p-2" type="date" value={filters[key]} onChange={e => set(key, e.target.value)} /></label>)}
      <label className="grid gap-1 text-xs">Resource ID<input className="border rounded-lg p-2" value={filters.resource} onChange={e => set('resource', e.target.value)} /></label>
      {select('recordType' , 'Record type', ['VENDOR_BLOCK', 'EXTERNAL_COMMITMENT'])}{select('scope', 'Scope', ['BUSINESS', 'SERVICE', 'RESOURCE'])}{select('status', 'Status', ['ACTIVE', 'CONFLICT_REVIEW', 'CANCELLED'])}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.conflict === 'true'} onChange={e => set('conflict', e.target.checked ? 'true' : '')} />Conflicts only</label>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && busy && <p>Loading records…</p>}
    {data && !data.records.length && <p>No records match these filters.</p>}
    {data?.records.map(row => <section key={row._id} className="bg-white rounded-2xl border p-4 space-y-2 text-sm">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">{row.vendorName || 'Vendor'} · {row.recordType || 'VENDOR_BLOCK'}</h2><span>{row.status || 'ACTIVE'} · {row.verificationStatus || 'REPORTED'}</span></div>
      <p className="text-xs text-muted">Vendor {row.vendor} · Record {row._id}</p>
      <p>{row.date} to {row.endDate || row.date} · {row.allDay ? 'Full day' : `${row.startTime}–${row.endTime}`} · {row.timezone || 'Asia/Kolkata'}</p>
      <p>Scope: {row.scope || 'BUSINESS'}{row.vendorService ? ` · Service ${row.vendorService}` : ''}{row.resourceIds?.length ? ` · Resources ${row.resourceIds.join(', ')}` : ''} · {row.reason}</p>
      {row.external && <div className="bg-slate-50 p-3 rounded-xl"><p>{row.external.eventType} · {row.external.location}</p>{data.personalDataVisible ? <><p>{row.external.customerName} · {row.external.customerPhone}</p><p>{row.external.notes} {row.external.reference}</p></> : <p className="text-xs">Customer contact details require additional permission.</p>}</div>}
      {!!row.conflicts?.length && <div role="status" className="bg-amber-50 p-3 rounded-xl"><b>Conflict review required</b>{row.conflicts.map((c, i) => <p key={i}>{c.detail} {c.recordId}</p>)}</div>}
      <p className="text-xs">Created: {new Date(row.createdAt).toLocaleString()} · Updated: {new Date(row.updatedAt).toLocaleString()}</p>
      <details><summary>Audit history</summary><ul className="space-y-2 mt-2">{row.history?.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} · {h.role} {h.actor} · {h.action} · {h.reason}<pre className="text-xs overflow-auto">{JSON.stringify({ before: h.before, after: h.after }, null, 2)}</pre></li>)}</ul></details>
      {row.status !== 'CANCELLED' && can('vendors.update') && <button className="border rounded-lg px-3 py-2" onClick={() => cancel(row)}>Cancel reported record</button>}
    </section>)}
    <div className="flex gap-3"><button disabled={!page || busy} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={!data?.hasMore || busy} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
