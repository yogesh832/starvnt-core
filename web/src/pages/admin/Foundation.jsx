import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { AdminPageHeader } from './adminUi.jsx';

export default function Foundation() {
  const { can } = useAdminAuth();
  const [requests, setRequests] = useState([]), [links, setLinks] = useState([]), [due, setDue] = useState([]);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''), [until, setUntil] = useState(''), [selected, setSelected] = useState('');
  async function load() {
    const [privacy, identity, retention] = await Promise.all([
      can('privacy.read') ? adminApi.call('/foundation/privacy/requests') : { requests: [] },
      can('identity.read') ? adminApi.call('/foundation/identity/link-requests') : { requests: [] },
      can('privacy.read') ? adminApi.call('/foundation/privacy/retention-due') : { requests: [] },
    ]);
    setRequests(privacy.requests); setLinks(identity.requests); setDue(retention.requests);
  }
  useEffect(() => { load().catch(err => setError(err.data?.message || err.message)); }, []);
  async function act(fn) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await load(); } catch (err) { setError(err.data?.message || err.message); }
    finally { setBusy(false); }
  }
  if (!can('privacy.read') && !can('identity.read') && !can('bookings.reconcile')) return <p>Permission required.</p>;
  return <div className="space-y-4">
    <AdminPageHeader title="Data & identity controls" description="Review customer deletion, retention and account links. Account links preserve record ownership." action={<button className="border rounded-xl px-4 py-2" disabled={busy} onClick={() => act(load)}>Refresh</button>} />
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    {can('privacy.read') && <section className="bg-white border rounded-2xl p-5 space-y-3">
      <h2 className="font-bold">Deletion requests</h2>
      {!requests.length && <p className="text-sm text-muted">No requests.</p>}
      {requests.map(row => <div key={row._id} className="border rounded-xl p-3 space-y-2 text-sm">
        <p className="break-all">Customer: {row.customer}</p>
        <p>Status: {row.status.toLowerCase()}{row.legalHold ? ' · Retention hold' : ''}</p>
        {row.retentionReason && <p>Retained records: {row.retentionReason} · Review by {new Date(row.retainedUntil).toLocaleDateString()}</p>}
        {row.status !== 'COMPLETED' && can('privacy.manage') && <button className="border rounded-lg px-3 min-h-11" disabled={busy} onClick={() => { setSelected(row._id); setReason(''); setUntil(''); }}>Review request</button>}
        {selected === row._id && can('privacy.manage') && <form className="grid gap-3 max-w-lg" onSubmit={e => { e.preventDefault(); act(async () => {
          await adminApi.call(`/foundation/privacy/requests/${row._id}/process`, { method: 'POST', body: { retentionReason: reason, retainedUntil: new Date(`${until}T23:59:59Z`).toISOString() } });
          setSelected(''); setMessage('Account anonymized. Recorded business retention remains in force.');
        }); }}>
          <label>Retention decision / reason<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="block w-full border rounded-lg p-2" /></label>
          <label>Retained records review date<input required type="date" value={until} onChange={e => setUntil(e.target.value)} className="block border rounded-lg p-2" /></label>
          <p className="text-xs text-muted">Processing disables login and removes profile, session and AI memory data. Active bookings and recorded holds block processing.</p>
          <button disabled={busy || row.legalHold || !reason.trim() || !until} className="bg-primary text-white rounded-lg px-3 min-h-11 disabled:opacity-50">Process deletion</button>
          <button type="button" disabled={busy || !reason.trim() || row.status === 'PROCESSING'} className="border rounded-lg px-3 min-h-11 disabled:opacity-50" onClick={() => act(async () => {
            await adminApi.call(`/foundation/privacy/requests/${row._id}/hold`, { method: 'POST', body: { hold: !row.legalHold, reason } }); setSelected('');
          })}>{row.legalHold ? 'Release retention hold' : 'Place retention hold'}</button>
        </form>}
      </div>)}
    </section>}
    {can('privacy.read') && <section className="bg-white border rounded-2xl p-5 space-y-3"><h2 className="font-bold">Retention reviews due ({due.length})</h2>
      {!due.length && <p className="text-sm text-muted">No retention reviews due.</p>}
      {due.map(row => <form key={row._id} className="border rounded-xl p-3 grid gap-2 max-w-lg" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); act(async () => {
        await adminApi.call(`/foundation/privacy/requests/${row._id}/retention-review`, { method: 'POST', body: { reason: values.get('reason'), retainedUntil: new Date(`${values.get('until')}T23:59:59Z`).toISOString() } }); setMessage('Retention review recorded.');
      }); }}><p className="text-sm break-all">Customer: {row.customer}</p><label>Reason<input name="reason" required maxLength={500} className="block border rounded-lg p-2 w-full" /></label><label>Next review date<input name="until" required type="date" className="block border rounded-lg p-2" /></label>{can('privacy.manage') && <button disabled={busy} className="border rounded-lg px-3 min-h-11">Record retention review</button>}</form>)}
    </section>}
    {can('identity.read') && <section className="bg-white border rounded-2xl p-5 space-y-3"><h2 className="font-bold">Identity link reviews</h2>
      {!links.length && <p className="text-sm text-muted">No link requests.</p>}
      {links.map(row => <form key={row._id} className="border rounded-xl p-3 grid gap-2 max-w-lg" onSubmit={e => e.preventDefault()}>
        <p className="text-sm break-all">{row.customer} ↔ {row.otherCustomer}</p><p className="text-sm">Status: {row.status.toLowerCase()}</p>
        {can('identity.link') && ['REQUESTED', 'LINKED'].includes(row.status) && <><label>Decision reason<input name="reason" required maxLength={500} className="block border rounded-lg p-2 w-full" /></label><div className="flex flex-wrap gap-2">{(row.status === 'REQUESTED' ? ['LINKED', 'REJECTED'] : ['REVOKED']).map(status => <button key={status} disabled={busy} className="border rounded-lg px-3 min-h-11" onClick={e => {
          const form = e.currentTarget.form; if (!form.reportValidity()) return;
          act(async () => { await adminApi.call(`/foundation/identity/link-requests/${row._id}/decision`, { method: 'POST', body: { status, reason: new FormData(form).get('reason') } }); setMessage('Identity decision recorded.'); });
        }}>{status === 'LINKED' ? 'Approve link' : status === 'REJECTED' ? 'Reject' : 'Revoke link'}</button>)}</div></>}
      </form>)}
    </section>}
    {can('bookings.reconcile') && <section className="bg-white border rounded-2xl p-5 space-y-3"><h2 className="font-bold">Booking recovery</h2><button disabled={busy} className="border rounded-xl px-4 min-h-11" onClick={() => act(async () => { const result = await adminApi.call('/foundation/bookings/reconcile', { method: 'POST' }); setMessage(`Checked ${result.results.length} bookings; ${result.results.filter(r => !r.ok).length} require further review.`); })}>Reconcile pending bookings</button></section>}
  </div>;
}
