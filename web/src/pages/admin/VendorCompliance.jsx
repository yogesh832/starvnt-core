import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { AdminPageHeader } from './adminUi.jsx';

const control = 'block w-full border rounded-xl p-3 mt-1 bg-transparent';
const button = 'border rounded-xl px-4 min-h-11 disabled:opacity-50';
const empty = { rows: null, loading: false, error: '', lastSuccess: null };
export default function VendorCompliance() {
  const { can } = useAdminAuth();
  const [versions, setVersions] = useState(empty), [assignments, setAssignments] = useState(empty), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ family: '', title: '', body: '', effectiveFrom: '', relationshipType: 'LISTING' });
  const [assignment, setAssignment] = useState({ vendorId: '', versionId: '', relationshipType: 'LISTING', bookingId: '' });
  const [review, setReview] = useState({}), [publication, setPublication] = useState({});
  const [filter, setFilter] = useState({ vendorId: '', state: '' });
  const draftRequest = useRef(null);
  async function load(kind, filters = filter) {
    const setter = kind === 'versions' ? setVersions : setAssignments;
    setter(old => ({ ...old, loading: true, error: '' }));
    try {
      const query = kind === 'assignments' ? `?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))}` : '';
      const result = await adminApi.call(`/vendor-compliance/${kind}${query}`);
      setter({ rows: result[kind === 'versions' ? 'versions' : 'agreements'], loading: false, error: '', lastSuccess: new Date(), hasMore: result.hasMore });
    } catch (error) { setter(old => ({ ...old, loading: false, error: error.data?.message || error.message || 'Source unavailable.' })); }
  }
  useEffect(() => { if (can('vendorCompliance.read')) { load('versions'); load('assignments'); } }, []);
  async function act(work) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); setMessage('Change recorded with version and audit evidence.'); await Promise.all([load('versions'), load('assignments')]); }
    catch (error) { setError(error.data?.message || error.message || 'The action could not be completed.'); }
    finally { setBusy(false); }
  }
  async function change(row, action, extra = {}) { await adminApi.call(`/vendor-compliance/versions/${row._id}/${action}`, { method: 'POST', body: { expectedRevision: row.revision, ...extra } }); }
  async function exportEvidence(row) {
    const response = await adminApi.raw(`/vendor-compliance/assignments/${row._id}/evidence`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = `agreement-evidence-${row._id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function sourceState(source, kind) {
    return <div className="text-xs space-y-1">
      {source.loading && <p role="status">Loading {kind}…</p>}
      {source.error && <p role="alert">{source.error} {source.rows && 'Showing the last successful result; it may be stale.'} <button className="underline min-h-11" onClick={() => load(kind)}>Retry</button></p>}
      {source.lastSuccess && <p>Last successful sync: {source.lastSuccess.toLocaleString()}</p>}
      {source.hasMore && <p>Latest 100 records shown. Use the vendor and state filters to narrow assignments.</p>}
    </div>;
  }
  if (!can('vendorCompliance.read')) return <p role="alert">Vendor compliance read permission is required.</p>;
  return <div className="space-y-5">
    <AdminPageHeader title="Vendor Compliance Center" description="Versioned documents, independent legal review and vendor-specific acceptance evidence." />
    <p className="text-sm">Published templates require recorded authorized legal review. Agreement acceptance does not verify identity or activate payments or matching.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}
    {can('vendorCompliance.edit') && <form className="bg-white dark:bg-gray-900 border rounded-2xl p-5 space-y-3" onSubmit={event => { event.preventDefault(); act(async () => {
      const content = JSON.stringify(draft);
      if (draftRequest.current?.content !== content) draftRequest.current = { content, key: crypto.randomUUID() };
      await adminApi.call('/vendor-compliance/versions', { method: 'POST', body: { family: draft.family, title: draft.title, body: draft.body, effectiveFrom: new Date(draft.effectiveFrom).toISOString(), relationshipTypes: [draft.relationshipType], idempotencyKey: draftRequest.current.key } });
      setDraft({ family: '', title: '', body: '', effectiveFrom: '', relationshipType: 'LISTING' });
    }); }}>
      <h2 className="font-bold">Create a draft document version</h2><p className="text-xs">Enter supplied document text. Saving a draft does not approve or publish legal terms.</p>
      <label className="block text-sm">Document family<input required value={draft.family} maxLength={80} onChange={e => setDraft({ ...draft, family: e.target.value })} className={control} /></label>
      <label className="block text-sm">Title<input required value={draft.title} maxLength={160} onChange={e => setDraft({ ...draft, title: e.target.value })} className={control} /></label>
      <label className="block text-sm">Relationship<select value={draft.relationshipType} onChange={e => setDraft({ ...draft, relationshipType: e.target.value })} className={control}>{['LISTING', 'LEAD', 'MANAGED', 'STRATEGIC'].map(type => <option key={type}>{type}</option>)}</select></label>
      <label className="block text-sm">Effective from (local time)<input required type="datetime-local" value={draft.effectiveFrom} onChange={e => setDraft({ ...draft, effectiveFrom: e.target.value })} className={control} /></label>
      <label className="block text-sm">Exact document text<textarea required rows={8} maxLength={200000} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} className={control} /></label>
      <button disabled={busy} className={button}>Save new draft version</button>
    </form>}
    <section className="bg-white dark:bg-gray-900 border rounded-2xl p-5 space-y-3"><h2 className="font-bold">Template versions</h2>{sourceState(versions, 'versions')}
      {versions.rows?.length === 0 && !versions.error && <p>No document versions have been created.</p>}
      {versions.rows?.map(row => <article key={row._id} className="border rounded-xl p-4 space-y-3 text-sm">
        <h3 className="font-bold">{row.title} · {row.family} v{row.version}</h3><p>{row.state} · {row.relationshipTypes.join(', ')} · Effective {new Date(row.effectiveFrom).toLocaleString()}</p>
        <details><summary className="cursor-pointer min-h-11">Review exact document and history</summary><pre className="whitespace-pre-wrap font-sans text-sm border rounded-lg p-3 max-h-80 overflow-auto">{row.body}</pre><ul>{row.history.map((entry, index) => <li key={index}>{entry.action} · {new Date(entry.at).toLocaleString()} · actor {entry.actor}</li>)}</ul></details>
        {row.state === 'DRAFT' && can('vendorCompliance.edit') && <button disabled={busy} onClick={() => act(() => change(row, 'submit-review'))} className={button}>Submit for independent review</button>}
        {row.state === 'REVIEW' && can('vendorCompliance.review') && <div className="space-y-2"><label>Authorized legal review evidence reference<input value={review[row._id] || ''} onChange={e => setReview({ ...review, [row._id]: e.target.value })} className={control} /></label><button disabled={busy || !review[row._id]?.trim()} onClick={() => act(() => change(row, 'approve', { legalReviewReference: review[row._id], legalReviewConfirmed: true }))} className={button}>Record legal approval</button><p className="text-xs">A different authorized reviewer must approve the version. The reference must identify the actual professional review.</p></div>}
        {row.state === 'APPROVED' && can('vendorCompliance.publish') && <div className="space-y-2"><label className="flex gap-2"><input type="checkbox" checked={!!publication[row._id]} onChange={e => setPublication({ ...publication, [row._id]: e.target.checked })} />I confirm publication of this approved version.</label><button disabled={busy || !publication[row._id]} onClick={() => act(() => change(row, 'publish', { confirmPublication: true }))} className={button}>Publish reviewed version</button></div>}
        {row.state === 'PUBLISHED' && can('vendorCompliance.publish') && <button disabled={busy} onClick={() => act(() => change(row, 'archive'))} className={button}>Stop new assignments and acceptance</button>}
      </article>)}
    </section>
    {can('vendorCompliance.assign') && <form className="bg-white dark:bg-gray-900 border rounded-2xl p-5 space-y-3" onSubmit={event => { event.preventDefault(); act(() => adminApi.call('/vendor-compliance/assignments', { method: 'POST', body: assignment })); }}>
      <h2 className="font-bold">Assign an applicable published version</h2>
      <label className="block text-sm">Vendor ID<input required value={assignment.vendorId} onChange={e => setAssignment({ ...assignment, vendorId: e.target.value })} className={control} /></label>
      <label className="block text-sm">Published version<select required value={assignment.versionId} onChange={e => setAssignment({ ...assignment, versionId: e.target.value })} className={control}><option value="">Choose a version</option>{versions.rows?.filter(row => row.state === 'PUBLISHED').map(row => <option key={row._id} value={row._id}>{row.title} v{row.version}</option>)}</select></label>
      <label className="block text-sm">Relationship<select value={assignment.relationshipType} onChange={e => setAssignment({ ...assignment, relationshipType: e.target.value })} className={control}>{['LISTING', 'LEAD', 'MANAGED', 'STRATEGIC'].map(type => <option key={type}>{type}</option>)}</select></label>
      {assignment.relationshipType === 'MANAGED' && <label className="block text-sm">Vendor-owned managed booking ID<input required value={assignment.bookingId} onChange={e => setAssignment({ ...assignment, bookingId: e.target.value })} className={control} /><span className="text-xs">Commercial terms and the vendor amount must already be approved.</span></label>}
      <button disabled={busy} className={button}>Assign for vendor review</button>
    </form>}
    <section className="bg-white dark:bg-gray-900 border rounded-2xl p-5 space-y-3"><h2 className="font-bold">Vendor acceptance evidence</h2>
      <form className="flex flex-wrap gap-3 items-end" onSubmit={event => { event.preventDefault(); load('assignments', filter); }}><label className="text-sm">Vendor ID<input value={filter.vendorId} onChange={e => setFilter({ ...filter, vendorId: e.target.value })} className={control} /></label><label className="text-sm">State<select value={filter.state} onChange={e => setFilter({ ...filter, state: e.target.value })} className={control}><option value="">All</option>{['ASSIGNED', 'ACCEPTED', 'WITHDRAWN'].map(state => <option key={state}>{state}</option>)}</select></label><button className={button}>Apply filters</button></form>
      {sourceState(assignments, 'assignments')}
      {assignments.rows?.length === 0 && !assignments.error && <p>No matching vendor assignments.</p>}
      {assignments.rows?.map(row => <article key={row._id} className="border rounded-xl p-3 text-sm space-y-1"><h3 className="font-semibold">{row.snapshot.title} v{row.snapshot.version}</h3><p className="break-all">Vendor {row.vendor} · {row.relationshipType} · {row.state}</p>{row.acceptance?.acceptedAt && <p>Accepted {new Date(row.acceptance.acceptedAt).toLocaleString()} · actor {row.acceptance.actor}</p>}<p className="text-xs break-all">Document {row.snapshot.contentHash} · Scope {row.scopeHash}</p>{can('vendorCompliance.export') && <button disabled={busy} className={button} onClick={() => act(() => exportEvidence(row))}>Export redacted evidence</button>}</article>)}
    </section>
  </div>;
}
