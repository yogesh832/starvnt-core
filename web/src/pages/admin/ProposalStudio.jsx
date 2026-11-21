import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { AdminEmptyState, AdminErrorState, AdminPageHeader, AdminTableSkeleton } from './adminUi.jsx';

const S = '/proposal-studio'; // adminApi already prefixes /api/admin
const READINESS = {
  REQUIREMENTS_INCOMPLETE: ['Requirements incomplete', 'bg-slate-100 text-slate-700'],
  VENDOR_APPROVAL_PENDING: ['Vendor approval pending', 'bg-amber-50 text-amber-700'],
  COMMERCIAL_APPROVAL_PENDING: ['Commercial approval pending', 'bg-amber-50 text-amber-700'],
  PRICING_MISMATCH: ['Pricing mismatch', 'bg-rose-50 text-rose-700'],
  SNAPSHOT_CHANGED: ['Approved data changed', 'bg-rose-50 text-rose-700'],
  READY_FOR_GENERATION: ['Ready for generation', 'bg-emerald-50 text-emerald-700'],
};
const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
const btn = 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-navy hover:bg-slate-50 disabled:opacity-40';
const primaryBtn = 'rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40';
const input = 'rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm';

function Readiness({ state }) {
  const [label, cls] = READINESS[state] || [state, 'bg-slate-100 text-slate-700'];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{label}</span>;
}

function Card({ title, step, children, action }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-navy"><span className="mr-2 text-primary">{step}</span>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { const r = await fn(); await onDone?.(); return r; } catch (err) { setError(err); return null; } finally { setBusy(false); }
  };
  return { busy, error, run, clear: () => setError(null) };
}

function ErrorLine({ error }) {
  if (!error) return null;
  const reasons = error.data?.reasons || error.data?.problems?.map((message) => ({ message })) || error.data?.errors || [];
  return (
    <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
      <strong>{error.data?.error || 'Error'}:</strong> {error.message}
      {reasons.length > 0 && <ul className="mt-1 list-disc pl-4">{reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>}
    </div>
  );
}

function CommercialForm({ eventId, agreements, onDone }) {
  const approved = agreements.filter((a) => a.status === 'APPROVED');
  const vendorTotal = approved.reduce((s, a) => s + (a.pricing?.total || 0), 0);
  const [costs, setCosts] = useState({ margin: 0, contingency: 0, logistics: 0, directCosts: 0, operational: 0 });
  const [rows, setRows] = useState(approved.map((a) => ({ category: a.category, label: a.category, scopeSummary: a.scope?.summary || '', amount: '' })));
  const [schedule, setSchedule] = useState([{ label: 'Booking confirmation', percent: 30, dueRule: 'On booking' }, { label: 'Balance before event', percent: 70, dueRule: 'Before event execution' }]);
  const [exclusions, setExclusions] = useState('');
  const { busy, error, run } = useAction(onDone);
  const internalTotal = vendorTotal + Object.values(costs).reduce((s, n) => s + (Number(n) || 0), 0);
  const allocated = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const scheduleRows = schedule.map((p, i) => ({ ...p, amount: i === schedule.length - 1 ? internalTotal - schedule.slice(0, -1).reduce((s, x) => s + Math.round(internalTotal * x.percent / 100), 0) : Math.round(internalTotal * p.percent / 100) }));

  const submit = () => run(() => adminApi.call(`${S}/events/${eventId}/commercial`, { method: 'POST', body: {
    costs,
    customerFacing: { packageTotal: internalTotal, allocations: rows.map((r) => ({ ...r, amount: Number(r.amount) || 0 })), paymentSchedule: scheduleRows, exclusions: exclusions.split('\n').map((x) => x.trim()).filter(Boolean) },
  } }));

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">Internal only. Vendor total from approved agreements: <strong>{inr(vendorTotal)}</strong>. Never shown to the customer.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.keys(costs).map((k) => <label key={k} className="text-[11px] font-bold uppercase text-muted">{k}<input type="number" className={`${input} mt-1 w-full`} value={costs[k]} onChange={(e) => setCosts({ ...costs, [k]: e.target.value })} /></label>)}
      </div>
      <div className="font-bold">Customer package total: {inr(internalTotal)}</div>
      <table className="w-full text-left text-xs">
        <thead><tr className="text-muted"><th>Customer-facing line</th><th>Scope</th><th className="w-32">Amount</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td><input className={`${input} w-full`} value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
            <td><input className={`${input} w-full`} value={r.scopeSummary} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, scopeSummary: e.target.value } : x)))} /></td>
            <td><input type="number" className={`${input} w-full`} value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></td>
          </tr>
        ))}</tbody>
      </table>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} onClick={() => setRows([...rows, { category: 'coordination', label: 'Logistics & coordination', scopeSummary: '', amount: '' }])}>Add line</button>
        <span className={`text-xs font-bold ${allocated === internalTotal ? 'text-emerald-600' : 'text-rose-600'}`}>Allocated {inr(allocated)} of {inr(internalTotal)}</span>
      </div>
      <div className="space-y-1">
        <div className="text-[11px] font-bold uppercase text-muted">Payment schedule</div>
        {schedule.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input className={`${input} flex-1`} value={p.label} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input type="number" className={`${input} w-20`} value={p.percent} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))} />
            <span className="w-28 self-center text-right text-xs">{inr(scheduleRows[i].amount)}</span>
          </div>
        ))}
        <button type="button" className={btn} onClick={() => setSchedule([...schedule, { label: 'Milestone', percent: 0, dueRule: '' }])}>Add milestone</button>
      </div>
      <label className="block text-[11px] font-bold uppercase text-muted">Exclusions (one per line)<textarea className={`${input} mt-1 w-full`} rows={2} value={exclusions} onChange={(e) => setExclusions(e.target.value)} /></label>
      <button type="button" className={primaryBtn} disabled={busy || allocated !== internalTotal} onClick={submit}>Prepare commercial record</button>
      <ErrorLine error={error} />
    </div>
  );
}

const SOURCE_OPTIONS = [
  ['APPROVED_PORTFOLIO', 'Vendor portfolio (actual past work)'],
  ['VENDOR_REFERENCE', 'Vendor-submitted reference'],
  ['STARVNT_PHOTO', 'STARVNT event photograph'],
  ['ILLUSTRATIVE', 'Illustrative / licensed stock'],
];
const ASSET_STATUS = { PENDING: 'bg-amber-50 text-amber-700', APPROVED: 'bg-emerald-50 text-emerald-700', REJECTED: 'bg-slate-100 text-slate-500' };

function AdminImage({ id, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null, cancelled = false;
    adminApi.raw(`${S}/assets/${id}/file`).then((r) => r.blob()).then((b) => { if (!cancelled) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt="" className={className} /> : <div className={`${className} animate-pulse bg-slate-100`} />;
}

/** Vendor photos, STARVNT photos, AI concepts and customer references. Only approved images reach a proposal. */
function AssetsPanel({ eventId, manifest, agreements, can }) {
  const [assets, setAssets] = useState(null);
  const [form, setForm] = useState({ sourceType: 'APPROVED_PORTFOLIO', category: 'cover', vendorId: '', licence: '', caption: '' });
  const [file, setFile] = useState(null);
  const [ai, setAi] = useState({ category: 'cover', prompt: '' });
  const load = useCallback(() => adminApi.call(`${S}/assets?eventId=${eventId}`).then((r) => setAssets(r.assets)).catch(() => setAssets([])), [eventId]);
  useEffect(() => { load(); }, [load]);
  const { busy, error, run } = useAction(load);
  const sections = [['cover', 'Cover / hero'], ...(manifest?.requirements || []).filter((r) => r.status === 'included').map((r) => [r.category, r.label])];
  const vendors = [...new Map(agreements.map((a) => [String(a.vendor), a.category])).entries()];

  const upload = () => run(async () => {
    const body = new FormData();
    body.append('file', file);
    for (const [k, v] of Object.entries({ ...form, eventId })) if (v) body.append(k, v);
    await adminApi.call(`${S}/assets`, { method: 'POST', body });
    setFile(null);
  });
  const reject = (id) => { const reason = window.prompt('Why is this image not suitable?'); if (reason) run(() => adminApi.call(`${S}/assets/${id}/decision`, { method: 'POST', body: { decision: 'REJECT', reason } })); };

  return (
    <Card step="5" title="Visual assets" action={<span className="text-[11px] text-muted">Every image keeps its source label. Pending images never reach a proposal.</span>}>
      {!assets ? <p className="text-xs text-muted">Loading…</p> : assets.length === 0 ? <p className="text-xs text-muted">No images yet. Upload vendor or STARVNT photos, or generate an AI concept.</p> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {assets.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-100 p-2 text-[11px]">
              <AdminImage id={a.id} className="h-28 w-full rounded-lg object-cover" />
              <div className="mt-1 flex items-center justify-between gap-1"><span className="font-bold">{a.category}</span><span className={`rounded px-1.5 py-0.5 font-bold ${ASSET_STATUS[a.status]}`}>{a.status}</span></div>
              <div className="text-muted">{a.label}</div>
              {a.caption && <div className="truncate">{a.caption}</div>}
              {a.licence && <div className="truncate text-muted" title={a.licence}>© {a.licence}</div>}
              {a.aiPrompt && <details><summary className="cursor-pointer text-muted">AI prompt</summary><p>{a.aiPrompt}</p></details>}
              {a.decisionReason && a.status === 'REJECTED' && <div className="text-rose-600">{a.decisionReason}</div>}
              {a.status === 'PENDING' && can('assets.manage') && (
                <div className="mt-1 flex gap-1">
                  <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/assets/${a.id}/decision`, { method: 'POST', body: { decision: 'APPROVE' } }))}>Approve</button>
                  <button type="button" className={btn} disabled={busy} onClick={() => reject(a.id)}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {can('assets.manage') && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div className="font-bold text-navy">Upload a photo</div>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="flex flex-wrap gap-2">
              <select className={input} value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>{SOURCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{sections.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {form.sourceType !== 'STARVNT_PHOTO' && form.sourceType !== 'ILLUSTRATIVE' && (
                <select className={input} value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                  <option value="">Vendor…</option>
                  {vendors.map(([id, cat]) => <option key={id} value={id}>{cat} vendor</option>)}
                </select>
              )}
            </div>
            <input className={`${input} w-full`} placeholder="Licence / owner (required), e.g. “Golden Petal Décor — own work, permission given”" value={form.licence} onChange={(e) => setForm({ ...form, licence: e.target.value })} />
            <input className={`${input} w-full`} placeholder="Caption (optional)" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
            <button type="button" className={primaryBtn} disabled={busy || !file || !form.licence.trim()} onClick={upload}>Upload for review</button>
          </div>
          <div className="space-y-2 rounded-xl bg-violet-50 p-3 text-xs">
            <div className="font-bold text-navy">Generate an AI concept</div>
            <p className="text-muted">Built from the frozen manifest (event type, theme, palette, guests, preferences). Always labelled “AI-generated concept — illustrative only”.</p>
            <select className={input} value={ai.category} onChange={(e) => setAi({ ...ai, category: e.target.value })}>{sections.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className={`${input} w-full`} placeholder="Extra direction (optional), e.g. “floral arch with warm fairy lights”" value={ai.prompt} onChange={(e) => setAi({ ...ai, prompt: e.target.value })} />
            <button type="button" className={primaryBtn} disabled={busy || !manifest} onClick={() => run(() => adminApi.call(`${S}/assets/generate`, { method: 'POST', body: { eventId, ...ai } }))}>{busy ? 'Working…' : 'Generate concept'}</button>
          </div>
        </div>
      )}
      <ErrorLine error={error} />
      <p className="mt-2 text-[11px] text-muted">Approved images appear in the next preliminary or final version you generate. Published versions keep the images they were generated with.</p>
    </Card>
  );
}

function EventWorkspace({ eventId, can }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [quoteForm, setQuoteForm] = useState({ quoteId: '', category: '', validUntil: '' });
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    try {
      const [readiness, manifests, agreements, commercial, proposals] = await Promise.all([
        adminApi.call(`${S}/events/${eventId}/readiness`),
        adminApi.call(`${S}/events/${eventId}/manifests`),
        can('agreements.read') ? adminApi.call(`${S}/events/${eventId}/agreements`) : { agreements: [] },
        can('commercial.read') ? adminApi.call(`${S}/events/${eventId}/commercial`) : { records: [] },
        adminApi.call(`${S}/proposals`),
      ]);
      const proposal = proposals.proposals.find((p) => String(p.eventId) === String(eventId));
      const versions = proposal ? (await adminApi.call(`${S}/proposals/${proposal.proposalId}`)).versions : [];
      setData({ readiness, manifests: manifests.manifests, agreements: agreements.agreements, commercial: commercial.records, proposal, versions });
      setLoadError(null);
    } catch (err) { setLoadError(err); }
    // `can` is recreated on every render; permissions do not change while this screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  useEffect(() => { load(); }, [load]);
  const { busy, error, run } = useAction(load);

  if (loadError) return <AdminErrorState message={loadError.message} onRetry={load} />;
  if (!data) return <AdminTableSkeleton columns={4} rows={4} />;
  const { readiness, manifests, agreements, commercial, versions } = data;
  const latestManifest = manifests[0];
  const current = agreements.filter((a) => a.status !== 'SUPERSEDED');

  const openPdf = async (versionId) => {
    const blob = await adminApi.raw(`${S}/versions/${versionId}/pdf`).then((r) => r.blob());
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  };
  const openPreview = async (versionId) => {
    const html = await adminApi.raw(`${S}/versions/${versionId}/preview`).then((r) => r.text());
    setPreview(html);
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
        <span className="text-sm font-extrabold text-navy">Readiness</span>
        <Readiness state={readiness.state} />
        <span className="text-xs text-muted">Validated by STARVNT Core, not by this screen.</span>
        {readiness.reasons.length > 0 && <ul className="w-full list-disc pl-5 text-xs text-muted">{readiness.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>}
      </section>
      <ErrorLine error={error} />

      <Card step="1" title="Event manifest" action={can('proposals.compose') && <button type="button" className={btn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/events/${eventId}/manifest`, { method: 'POST' }))}>Rebuild from event</button>}>
        {!latestManifest ? <p className="text-xs text-muted">No manifest yet. Build it from the customer’s event data.</p> : (
          <div className="text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <strong>v{latestManifest.version}</strong>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-bold">{latestManifest.status}</span>
              <span className={latestManifest.validation.status === 'VALID' ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>{latestManifest.validation.status}</span>
              {latestManifest.status === 'DRAFT' && latestManifest.validation.status === 'VALID' && can('proposals.compose') && <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/manifests/${latestManifest._id}/freeze`, { method: 'POST' }))}>Freeze</button>}
            </div>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">{latestManifest.requirements.map((r) => <li key={r.category}>{r.mandatory ? '★ ' : ''}{r.label} <span className="text-muted">· {r.status}</span></li>)}</ul>
            {[...latestManifest.validation.errors, ...latestManifest.validation.warnings].map((v, i) => <p key={i} className={latestManifest.validation.errors.includes(v) ? 'text-rose-600' : 'text-amber-600'}>{v.message}</p>)}
          </div>
        )}
      </Card>

      <Card step="2–3" title="Vendor commitments & agreements">
        <table className="w-full text-left text-xs">
          <thead><tr className="text-muted"><th>Service</th><th>Version</th><th>Status</th><th>Vendor price (internal)</th><th>Valid until</th><th /></tr></thead>
          <tbody>{current.map((a) => (
            <tr key={a._id} className="border-t">
              <td className="py-1.5 font-bold">{a.category}{a.mandatory ? ' ★' : ''}</td><td>v{a.version}</td><td>{a.status}</td><td>{inr(a.pricing?.total)}</td>
              <td>{a.terms?.validUntil ? new Date(a.terms.validUntil).toLocaleDateString('en-IN') : '—'}</td>
              <td className="space-x-1 text-right">
                {can('agreements.manage') && ['DRAFT', 'REVISION_REQUESTED'].includes(a.status) && <button type="button" className={btn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/agreements/${a._id}/send`, { method: 'POST' }))}>Send to vendor</button>}
                {can('agreements.manage') && ['SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVISION_REQUESTED'].includes(a.status) && <button type="button" className={btn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/agreements/${a._id}/revise`, { method: 'POST', body: { reason: 'Revision from Proposal Studio' } }))}>Revise</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {can('agreements.manage') && latestManifest?.status === 'FROZEN' && (
          <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
            <input className={input} placeholder="Vendor quote ID" value={quoteForm.quoteId} onChange={(e) => setQuoteForm({ ...quoteForm, quoteId: e.target.value })} />
            <select className={input} value={quoteForm.category} onChange={(e) => setQuoteForm({ ...quoteForm, category: e.target.value })}>
              <option value="">Service…</option>
              {latestManifest.requirements.filter((r) => r.status !== 'customer_provided').map((r) => <option key={r.category} value={r.category}>{r.label}</option>)}
            </select>
            <input type="date" className={input} value={quoteForm.validUntil} onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })} />
            <button type="button" className={primaryBtn} disabled={busy || !quoteForm.quoteId || !quoteForm.category} onClick={() => run(() => adminApi.call(`${S}/agreements`, { method: 'POST', body: { quoteId: quoteForm.quoteId, manifestId: latestManifest._id, category: quoteForm.category, terms: quoteForm.validUntil ? { validUntil: quoteForm.validUntil } : undefined } }))}>Draft agreement from quote</button>
          </div>
        )}
      </Card>

      <Card step="4" title="Commercial review (maker → checker)">
        {commercial.map((c) => (
          <div key={c._id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
            <strong>{inr(c.customerFacing.packageTotal)}</strong>
            <span>margin {inr(c.costs.margin)}</span>
            <span className="rounded bg-white px-2 py-0.5 font-bold">{c.status}</span>
            <span className="text-muted">by {c.createdByEmail}</span>
            {c.status === 'DRAFT' && can('commercial.prepare') && <button type="button" className={btn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/commercial/${c._id}/submit`, { method: 'POST' }))}>Submit for approval</button>}
            {c.status === 'PENDING_APPROVAL' && can('commercial.approve') && <>
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/commercial/${c._id}/decision`, { method: 'POST', body: { decision: 'APPROVE' } }))}>Approve</button>
              <button type="button" className={btn} disabled={busy} onClick={() => { const reason = window.prompt('Reason for rejection'); if (reason) run(() => adminApi.call(`${S}/commercial/${c._id}/decision`, { method: 'POST', body: { decision: 'REJECT', reason } })); }}>Reject</button>
            </>}
          </div>
        ))}
        {can('commercial.prepare') && current.some((a) => a.status === 'APPROVED') && !commercial.some((c) => ['DRAFT', 'PENDING_APPROVAL'].includes(c.status)) && <CommercialForm eventId={eventId} agreements={current} onDone={load} />}
      </Card>

      {can('assets.read') && <AssetsPanel eventId={eventId} manifest={latestManifest} agreements={current} can={can} />}

      <Card step="6–8" title="Proposal builder, quality control & publishing" action={can('proposals.compose') && (
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={busy || !latestManifest} onClick={() => run(() => adminApi.call(`${S}/events/${eventId}/preliminary`, { method: 'POST', body: {} }))}>Preliminary preview</button>
          <button type="button" className={primaryBtn} disabled={busy || !readiness.ready} onClick={() => run(() => adminApi.raw(`${S}/events/${eventId}/generate`, { method: 'POST', body: {}, headers: { 'Idempotency-Key': crypto.randomUUID() } }))}>Generate final proposal</button>
        </div>
      )}>
        {versions.length === 0 ? <p className="text-xs text-muted">No versions yet.</p> : (
          <table className="w-full text-left text-xs">
            <thead><tr className="text-muted"><th>Version</th><th>Kind</th><th>Status</th><th>QA</th><th /></tr></thead>
            <tbody>{versions.map((v) => (
              <tr key={v._id} className="border-t align-top">
                <td className="py-1.5 font-bold">v{v.version}</td><td>{v.kind}</td><td>{v.status}</td>
                <td>{v.qa?.passed == null ? '—' : v.qa.passed ? <span className="font-bold text-emerald-600">Passed</span> : <details><summary className="cursor-pointer font-bold text-rose-600">Failed</summary><ul>{v.qa.checks.filter((c) => !c.passed).map((c) => <li key={c.key}>{c.key}: {c.detail}</li>)}</ul></details>}</td>
                <td className="space-x-1 text-right">
                  <button type="button" className={btn} onClick={() => openPreview(v._id)}>Preview</button>
                  {['APPROVED_FOR_GENERATION', 'PRELIMINARY_PREVIEW', 'FAILED'].includes(v.status) && can('proposals.compose') && <button type="button" className={btn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/versions/${v._id}/render`, { method: 'POST' }))}>Render PDF</button>}
                  {v.pdf?.storageKey && <button type="button" className={btn} onClick={() => openPdf(v._id)}>PDF</button>}
                  {v.status === 'GENERATED' && can('proposals.publish') && <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => adminApi.call(`${S}/versions/${v._id}/publish`, { method: 'POST' }))}>Send to customer</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center justify-between border-b p-3"><strong className="text-sm">Live preview (same template as the PDF)</strong><button type="button" className={btn} onClick={() => setPreview(null)}>Close</button></div>
            <iframe title="Proposal preview" sandbox="" srcDoc={preview} className="flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProposalStudio() {
  const { can } = useAdminAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [eventId, setEventId] = useState('');
  const [openEvent, setOpenEvent] = useState(null);

  const load = useCallback(() => adminApi.call(`${S}/proposals`).then((r) => { setList(r.proposals); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader eyebrow="Powered by Aura+" title="Proposal Studio" description="From validated event plan to an approved, premium customer proposal. Final generation is blocked until Core confirms every approval."
        action={<div className="flex gap-2"><input className={input} placeholder="Open event by ID" value={eventId} onChange={(e) => setEventId(e.target.value.trim())} /><button type="button" className={primaryBtn} disabled={!eventId} onClick={() => setOpenEvent(eventId)}>Open</button></div>} />

      {openEvent ? (
        <>
          <button type="button" className={btn} onClick={() => { setOpenEvent(null); load(); }}>← All proposals</button>
          <EventWorkspace eventId={openEvent} can={can} />
        </>
      ) : error ? <AdminErrorState message={error.message} onRetry={load} /> : !list ? <AdminTableSkeleton columns={8} /> : list.length === 0 ? (
        <AdminEmptyState title="No proposals yet" message="Open a customer event by its ID to build the manifest and start a proposal." />
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted"><tr><th className="p-3">Proposal</th><th>Customer</th><th>Event</th><th>Date</th><th>Location</th><th>Guests</th><th>Version</th><th>Readiness</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.proposalId} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => setOpenEvent(p.eventId)}>
                <td className="p-3 font-bold">{p.proposalNumber}</td><td>{p.customer}</td><td>{p.eventTitle || p.eventType}</td><td>{p.eventDate || '—'}</td><td>{p.city || '—'}</td><td>{p.guestCount || '—'}</td>
                <td>v{p.latestVersion} <span className="text-xs text-muted">{p.latestStatus}</span></td><td><Readiness state={p.readiness} /></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
