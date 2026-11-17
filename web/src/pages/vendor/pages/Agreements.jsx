import { useEffect, useState } from 'react';
import { externalApi } from '../../../lib/api.js';
import { Page, Card } from './shared.jsx';

export default function Agreements() {
  const [rows, setRows] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [name, setName] = useState(''), [authority, setAuthority] = useState(false), [message, setMessage] = useState('');
  const [lastSuccess, setLastSuccess] = useState(null), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(false);
  async function load() {
    setError(''); setLoading(true);
    try { const result = await externalApi.call('/vendor/agreements'); setRows(result.agreements); setHasMore(result.hasMore); setLastSuccess(new Date()); }
    catch { setError('Agreements are unavailable. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function open(id) {
    setBusy(true); setSelected(null); setError(''); setMessage(''); setAuthority(false); setName('');
    try { const result = await externalApi.call(`/vendor/agreements/${id}`); setSelected(result.agreement); }
    catch { setError('This agreement could not be opened. Please retry.'); }
    finally { setBusy(false); }
  }
  async function accept(event) {
    event.preventDefault(); if (!selected || !authority || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const key = `vendor-accept:${selected._id}:${selected.revision}`;
      const result = await externalApi.call(`/vendor/agreements/${selected._id}/accept`, { method: 'POST', body: {
        signatoryFullName: name.trim(), authorityConfirmed: authority, idempotencyKey: key,
        expectedHash: selected.snapshot.contentHash, expectedScopeHash: selected.scopeHash, expectedVersionId: selected.versionId, expectedRevision: selected.revision,
      } });
      setSelected(result.agreement); setMessage('Acceptance recorded for this exact document and scope. Verification and commercial activation remain separate.'); await load();
    } catch (error) { setError(error.data?.message || error.message || 'Acceptance could not be recorded. Refresh and review the document.'); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await externalApi.raw(`/vendor/agreements/${selected._id}/document`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `agreement-${selected._id}-v${selected.snapshot.version}.txt`; link.click(); URL.revokeObjectURL(url);
    } catch { setError('Document download is unavailable. Please retry.'); }
    finally { setBusy(false); }
  }
  return <Page title="Business & Legal · Agreements" sub="Your assigned documents, review status and immutable accepted copies.">
    <div className="space-y-4">
      <Card><p className="text-sm">Agreement acceptance, identity verification and matching eligibility are separate. Only documents approved and assigned through STARVNT appear here.</p></Card>
      {error && <div role="alert" className="text-red-700">{error} <button onClick={load} disabled={busy} className="underline min-h-11">Retry</button></div>}
      {message && <p role="status">{message}</p>}
      {loading && rows !== null && <p role="status">Refreshing agreements…</p>}
      {lastSuccess && <p className="text-xs text-muted">Last successful sync: {lastSuccess.toLocaleString()}{error ? ' · Saved list may be stale.' : ''}</p>}
      {hasMore && <p className="text-xs">Latest 100 agreements shown. Contact support for older documents.</p>}
      {rows === null && !error && <Card>Loading your agreements…</Card>}
      {rows?.length === 0 && <Card>No agreements have been assigned. No legal acceptance is implied by this empty state.</Card>}
      {rows?.map(row => <Card key={row._id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{row.snapshot.title}</h2><p className="text-sm">{row.relationshipType} · Version {row.snapshot.version} · {row.state}</p><p className="text-xs text-muted">Effective {new Date(row.snapshot.effectiveFrom).toLocaleDateString()}</p></div><button onClick={() => open(row._id)} disabled={busy} className="border rounded-xl px-4 min-h-11">Review document</button></div></Card>)}
      {selected && <Card><div className="space-y-4"><h2 className="font-bold text-lg">{selected.snapshot.title} · v{selected.snapshot.version}</h2>
        <p className="text-xs break-all">Document hash: {selected.snapshot.contentHash}</p>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm max-h-[55vh] overflow-auto border rounded-xl p-3">{selected.snapshot.body}</pre>
        <div className="text-sm"><p>Relationship: {selected.relationshipType}</p>{selected.scope.bookingId && <><p>Booking: {selected.scope.bookingId}</p><p>Agreed amount: {selected.scope.currency} {(selected.scope.amountMinor / 100).toFixed(2)}</p><pre className="whitespace-pre-wrap">{JSON.stringify(selected.scope.disclosedScope, null, 2)}</pre></>}</div>
        <button onClick={download} disabled={busy} className="border rounded-xl px-4 min-h-11">Download exact copy</button>
        {selected.state === 'ACCEPTED' ? <p role="status">Accepted {new Date(selected.acceptance.acceptedAt).toLocaleString()}. This historical copy cannot be edited.</p> : selected.state === 'ASSIGNED' && <form onSubmit={accept} className="space-y-3">
          <label className="block text-sm">Authorized signatory full name<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="block w-full border rounded-xl p-3 mt-1" /></label>
          <label className="flex items-start gap-3 text-sm"><input required type="checkbox" checked={authority} onChange={e => setAuthority(e.target.checked)} className="mt-1" />I am authorized to bind this vendor and accept this exact document and displayed scope.</label>
          <button disabled={busy || !authority || !name.trim()} className="bg-primary text-white rounded-xl px-4 min-h-11 disabled:opacity-50">{busy ? 'Recording…' : 'Accept reviewed version'}</button>
        </form>}
      </div></Card>}
    </div>
  </Page>;
}
