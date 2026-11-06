import { useEffect, useState } from 'react';
import { adminApi, externalApi } from '../lib/api.js';
import { useAdminAuth } from '../auth/AdminAuthContext.jsx';
import { ProposalDiscussion, ProposalOperationsHandover, AssignedProposalHandovers } from './ProposalCollaboration.jsx';

const button = 'rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40';
const input = 'block w-full rounded-lg border p-2 text-sm text-slate-900 bg-white';
const currency = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const key = () => crypto.randomUUID();
async function download(api, path, name) { const r = await api.raw(path), blob = await r.blob(), url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
function Field({ label, children }) { return <label className="block text-sm space-y-1"><span>{label}</span>{children}</label>; }
function VisualUpload({ p, busy, act }) {
  const [file, setFile] = useState(null), [title, setTitle] = useState(''), [source, setSource] = useState('VENDOR_PORTFOLIO'), [attribution, setAttribution] = useState(''), [rights, setRights] = useState(false);
  return <section className="border rounded-xl p-4 space-y-3"><h3 className="font-bold">Authorized moodboard / references</h3><p>Private proposal images. AI concepts must be identified; references do not change the agreed service scope.</p>{p.visuals.map(v => <div key={v.asset} className="flex gap-3 items-center"><p>{v.title} · {v.source} · {v.attribution}</p><button className={button} disabled={busy} onClick={() => act(() => adminApi.call(`/proposals/${p._id}/visuals/${v.asset}`, { method: 'DELETE', body: { revision: p.revision } }))}>Remove visual</button></div>)}
    <Field label="Visual title"><input className={input} value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></Field><Field label="Source"><select className={input} value={source} onChange={e => setSource(e.target.value)}>{['VENDOR_PORTFOLIO', 'CUSTOMER_REFERENCE', 'AI_CONCEPT', 'LICENSED'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="Owner / attribution / authorization reference"><input className={input} value={attribution} maxLength={500} onChange={e => setAttribution(e.target.value)} /></Field><Field label="Image (JPEG, PNG, WebP; maximum 5 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></Field><label className="block"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} /> I have permission to include this visual in this customer's proposal.</label><button className={button} disabled={busy || !file || !title.trim() || !attribution.trim() || !rights} onClick={() => act(async () => { const body = new FormData(); body.append('file', file); body.append('revision', p.revision); body.append('title', title); body.append('source', source); body.append('attribution', attribution); body.append('rightsConfirmed', 'true'); const result = await adminApi.call(`/proposals/${p._id}/visuals`, { method: 'POST', body }); setFile(null); setTitle(''); setRights(false); return result; })}>Add private visual</button>
  </section>;
}

function Editor({ proposal: p, services, save, busy }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft({ lines: p.lines.map(l => ({ ...l, service: l.service || '', requirement: l.requirement || '' })), excludedRequirements: p.excludedRequirements || [], taxAmount: p.taxAmount || 0, totalAmount: p.totalAmount || 0, terms: p.terms || '', exclusions: p.exclusions || '', payments: p.payments || [], sections: p.sections || [] }); }, [p._id, p.revision]);
  if (!draft) return null;
  const update = (field, value) => setDraft(d => ({ ...d, [field]: value }));
  const row = (field, i, name, value) => update(field, draft[field].map((r, j) => j === i ? { ...r, [name]: value } : r));
  const remove = (field, i) => update(field, draft[field].filter((_, j) => j !== i));
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); save({ ...draft, revision: p.revision, idempotencyKey: key() }); }}>
    <h3 className="font-bold">Service scope & internal procurement</h3>
    {draft.lines.map((l, i) => <fieldset key={i} className="border rounded-xl p-3 grid gap-3 sm:grid-cols-2"><legend>Scope {i + 1}</legend>
      <Field label="Service name"><input className={input} required maxLength={160} value={l.name} onChange={e => row('lines', i, 'name', e.target.value)} /></Field>
      <Field label="Confirmed requirement"><select className={input} value={l.requirement} onChange={e => row('lines', i, 'requirement', e.target.value)}><option value="">Additional agreed scope</option>{(p.manifest.requirements || []).map(r => <option value={r._id} key={r._id}>{r.category} · {r.providedValue}</option>)}</select></Field>
      <Field label="Fulfilment"><select className={input} value={l.fulfilment} onChange={e => row('lines', i, 'fulfilment', e.target.value)}><option value="INTERNAL">STARVNT internal</option><option value="VENDOR">Vendor agreement required</option></select></Field>
      {l.fulfilment === 'VENDOR' && <Field label="Saved vendor service"><select required className={input} value={l.service} onChange={e => row('lines', i, 'service', e.target.value)}><option value="">Choose service</option>{services.map(s => <option value={s._id} key={s._id}>{s.name} · {s.vendor}</option>)}</select></Field>}
      <Field label="Description / deliverables"><textarea className={input} value={l.description || ''} onChange={e => row('lines', i, 'description', e.target.value)} /></Field>
      {[['quantity', 'Quantity', 1], ['customerUnitPrice', 'Customer unit price (INR)', 0.01], ['vendorUnitCost', 'Internal unit cost (INR)', 0.01]].map(([name, label, step]) => <Field label={label} key={name}><input className={input} required type="number" min={name === 'quantity' ? 1 : 0} step={step} value={l[name] ?? 0} onChange={e => row('lines', i, name, Number(e.target.value))} /></Field>)}
      <p className="text-sm">Vendor agreement: {l.agreement?.status || 'PENDING'}. Saving resets scope approvals.</p><button type="button" className={button} onClick={() => remove('lines', i)}>Remove scope</button>
    </fieldset>)}
    <button type="button" className={button} onClick={() => update('lines', [...draft.lines, { name: '', description: '', fulfilment: 'VENDOR', service: '', quantity: 1, customerUnitPrice: 0, vendorUnitCost: 0 }])}>Add service scope</button>
    <div className="grid sm:grid-cols-2 gap-3">{[['taxAmount', 'Tax / additional charges'], ['totalAmount', 'Customer total']].map(([name, label]) => <Field key={name} label={`${label} (INR)`}><input required className={input} type="number" min="0" step="0.01" value={draft[name]} onChange={e => update(name, Number(e.target.value))} /></Field>)}</div>
    <p className="text-sm">Calculated scope + tax: {currency(draft.lines.reduce((s, l) => s + Math.round(l.customerUnitPrice * 100) * l.quantity, Math.round(draft.taxAmount * 100)) / 100)}</p>
    <h3 className="font-bold">Payment schedule</h3>{draft.payments.map((r, i) => <div key={i} className="grid sm:grid-cols-4 gap-2"><Field label="Milestone"><input className={input} required value={r.label} onChange={e => row('payments', i, 'label', e.target.value)} /></Field><Field label="Amount (INR)"><input required className={input} type="number" min="0" step="0.01" value={r.amount} onChange={e => row('payments', i, 'amount', Number(e.target.value))} /></Field><Field label="Due date"><input required className={input} type="date" value={r.due} onChange={e => row('payments', i, 'due', e.target.value)} /></Field><button type="button" className={button} onClick={() => remove('payments', i)}>Remove payment</button></div>)}
    <button type="button" className={button} onClick={() => update('payments', [...draft.payments, { label: '', amount: 0, due: '' }])}>Add payment milestone</button>
    <Field label="Commercial terms"><textarea className={input} rows={4} value={draft.terms} onChange={e => update('terms', e.target.value)} /></Field>
    <Field label="Exclusions"><textarea className={input} value={draft.exclusions} onChange={e => update('exclusions', e.target.value)} /></Field>
    {(p.manifest.requirements || []).map(r => { const excluded = draft.excludedRequirements.find(x => x.requirement === r._id); return <div key={r._id} className="border rounded-xl p-3 space-y-2"><p>Confirmed requirement: {r.category} · {r.providedValue} · {r.specialRequirements}</p><label><input type="checkbox" checked={!!excluded} onChange={e => update('excludedRequirements', e.target.checked ? [...draft.excludedRequirements, { requirement: r._id, reason: '' }] : draft.excludedRequirements.filter(x => x.requirement !== r._id))} /> Explicitly exclude this requirement</label>{excluded && <Field label={`Exclusion reason for ${r.category}`}><input className={input} required value={excluded.reason} onChange={e => update('excludedRequirements', draft.excludedRequirements.map(x => x.requirement === r._id ? { ...x, reason: e.target.value } : x))} /></Field>}</div>; })}
    <h3 className="font-bold">Event-specific sections</h3>{draft.sections.map((s, i) => <div key={i} className="space-y-2 border rounded-xl p-3"><Field label="Section title"><input required className={input} value={s.title} onChange={e => row('sections', i, 'title', e.target.value)} /></Field><Field label="Approved content"><textarea required rows={4} className={input} value={s.body} onChange={e => row('sections', i, 'body', e.target.value)} /></Field><button type="button" className={button} onClick={() => remove('sections', i)}>Remove section</button></div>)}
    <button type="button" className={button} onClick={() => update('sections', [...draft.sections, { title: '', body: '' }])}>Add event section</button>
    <button disabled={busy} className={`${button} bg-purple-700 text-white`}>Save scope & reset approvals</button>
  </form>;
}

export function ProposalStudio() {
  const { can } = useAdminAuth(); const [rows, setRows] = useState([]), [options, setOptions] = useState({ events: [], services: [] }), [event, setEvent] = useState(''), [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState(''), [reviewed, setReviewed] = useState(false);
  async function load() { const [a, b] = await Promise.all([adminApi.call('/proposals'), adminApi.call('/proposals/options')]); const older = selected && !a.proposals.some(r => r._id === selected) ? await adminApi.call(`/proposals/${selected}`) : null; setRows(older ? [...a.proposals, older.proposal] : a.proposals); setOptions(b); }
  useEffect(() => { if (can('proposals.read')) load().catch(e => setError(e.message)); }, []);
  const p = rows.find(r => r._id === selected);
  useEffect(() => setReviewed(false), [selected, p?.pdfHash]);
  async function act(work, refresh = true) { if (busy) return; setBusy(true); setError(''); try { const r = await work(); if (r?.proposal) setSelected(r.proposal._id); if (refresh) await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  const post = action => adminApi.call(`/proposals/${p._id}/${action}`, { method: 'POST', body: { revision: p.revision, idempotencyKey: key(), reason, pdfHash: p.pdfHash } });
  if (!can('proposals.read')) return <p>Proposal access is required.</p>;
  return <div className="space-y-5 p-4"><h1 className="text-2xl font-bold">Proposal Studio</h1><p>Build from saved event truth, secure vendor agreements, approve commercial terms, then review and send an exact PDF version.</p>{error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-3"><select aria-label="Saved event" className={input + ' max-w-sm'} value={event} onChange={e => setEvent(e.target.value)}><option value="">Choose saved event</option>{options.events.map(e => <option key={e._id} value={e._id}>{e.title || e._id} · {e.eventDate} · {e.city}</option>)}</select>{can('proposals.manage') && <button className={button} disabled={busy || !event} onClick={() => act(() => adminApi.call('/proposals', { method: 'POST', body: { event, idempotencyKey: key() } }))}>Create proposal</button>}<button className={button} disabled={busy} onClick={() => act(load)}>Refresh</button></div>
    <select aria-label="Proposal version" className={input} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose proposal version</option>{rows.map(r => <option key={r._id} value={r._id}>{r.manifest.title} · v{r.version} · {r.state}</option>)}</select>
    {can('proposals.handover') && <AssignedProposalHandovers onSelect={id => act(async () => { const result = await adminApi.call(`/proposals/${id}`); setRows(old => [...old.filter(r => r._id !== id), result.proposal]); setSelected(id); }, false)} />}
    {p && <section className="bg-white text-slate-900 rounded-2xl border p-5 space-y-4"><h2 className="text-xl font-bold">{p.manifest.title} · v{p.version} · {p.state}</h2><p>{p.manifest.eventDate} · {p.manifest.city} · {p.manifest.guestCount} guests</p>
      {p.readiness.missing.map(m => <p key={m} className="text-amber-800">Required: {m}</p>)}
      {p.state === 'DRAFT' && can('proposals.manage') ? <Editor proposal={p} services={options.services} busy={busy} save={body => act(() => adminApi.call(`/proposals/${p._id}`, { method: 'PATCH', body }))} /> : <><p>Total {currency(p.totalAmount)}</p>{p.lines.map(l => <p key={l._id}>{l.name} · {l.quantity} units · {l.agreement?.status}</p>)}</>}
      {p.state === 'DRAFT' && can('proposals.manage') && <VisualUpload p={p} busy={busy} act={act} />}
      <Field label="Approval / send note"><input className={input} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => act(() => download(adminApi, `/proposals/${p._id}/preview`, 'STARVNT-preliminary.pdf'))}>Download preliminary preview</button>
        {p.state === 'DRAFT' && can('proposals.approve') && <button className={button} disabled={busy || !reason || !p.readiness.ready} onClick={() => act(() => post('freeze'))}>Approve commercial terms & freeze</button>}
        {p.state === 'FROZEN' && can('proposals.manage') && !p.pdfHash && <button className={button} disabled={busy} onClick={() => act(() => post('pdf'))}>Generate frozen PDF</button>}
        {p.pdfHash && <button className={button} disabled={busy} onClick={() => act(() => download(adminApi, `/proposals/${p._id}/pdf`, `STARVNT-v${p.version}.pdf`))}>Download exact PDF for review</button>}
        {p.pdfHash && p.state === 'FROZEN' && can('proposals.approve') && <><label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> I reviewed this exact PDF</label><button className={button} disabled={busy || !reviewed || !reason} onClick={() => act(() => post('quality'))}>Approve PDF quality</button></>}
        {p.state === 'APPROVED' && can('proposals.send') && <button className={button} disabled={busy || !reason} onClick={() => act(() => post('send'))}>Send to customer portal</button>}
        {p.state !== 'DRAFT' && can('proposals.manage') && <button className={button} disabled={busy} onClick={() => act(() => adminApi.call('/proposals', { method: 'POST', body: { event: p.event, from: p._id, idempotencyKey: key() } }))}>Create revised version</button>}
      </div>{p.response?.decision && <p>Customer response: {p.response.decision} · {p.response.message}</p>}
      <details><summary>Version history</summary>{p.history.map((h, i) => <p className="text-sm" key={i}>{h.at} · {h.action} · {h.actor} · {h.reason}</p>)}</details>
      {can('proposals.discuss') && <ProposalDiscussion key={`discussion-${p._id}`} proposal={p} mode="ADMIN" />}
      {can('proposals.handover') && <ProposalOperationsHandover key={`handover-${p._id}`} proposal={p} />}
    </section>}
  </div>;
}

export { default as CustomerProposals } from './customer/CustomerProposals.jsx';

export function VendorProposalAgreements() {
  const [rows, setRows] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState(''), [until, setUntil] = useState('');
  const load = () => externalApi.call('/vendor/proposals').then(r => setRows(r.proposals));
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function agree(p, line, decision) { setBusy(true); setError(''); try { await externalApi.call(`/vendor/proposals/${p._id}/agreement`, { method: 'POST', body: { revision: p.revision, lineId: line._id, decision, reason, validUntil: until, idempotencyKey: key() } }); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <div className="p-5 space-y-5"><h1 className="text-2xl font-bold">Proposal agreements</h1><p>Review your deliverables and procurement price. Approval applies only to this scope and version.</p>{error && <p role="alert">{error}</p>}<Field label="Agreement validity until"><input className={input} type="date" value={until} onChange={e => setUntil(e.target.value)} /></Field><Field label="Decision note"><textarea className={input} value={reason} onChange={e => setReason(e.target.value)} /></Field>{!rows.length && <p>No proposal agreements assigned yet.</p>}{rows.map(p => <article key={p._id} className="border rounded-2xl p-5 space-y-3"><h2 className="font-bold">{p.event.eventType} · {p.event.eventDate} · {p.event.city} · v{p.version}</h2>{p.lines.map(l => <div className="border-t pt-3" key={l._id}><p>{l.name} · {l.quantity} units · {currency(l.vendorUnitCost)} / unit</p><p>{l.description}</p><p>{l.agreement.status} {l.agreement.validUntil && `until ${l.agreement.validUntil.slice(0, 10)}`}</p>{p.state === 'DRAFT' && <div className="flex gap-2"><button className={button} disabled={busy || !until || !reason.trim()} onClick={() => agree(p, l, 'APPROVED')}>Approve scope & price</button><button className={button} disabled={busy || !reason.trim()} onClick={() => agree(p, l, 'DECLINED')}>Decline</button></div>}</div>)}<ProposalDiscussion key={p._id} proposal={p} mode="VENDOR" /></article>)}</div>;
}
