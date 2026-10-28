import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import ModuleTable from './ModuleTable.jsx';

const handbookDraftTemplate = {
  category: 'Global', minimumReservationPercent: 20, vendorCancellationPenaltyPercent: 0,
  customerCancellationRefunds: { 30: 100, 14: 50, 0: 25 }, settlementCondition: 'EVENT_DATE_PASSED', settlementDelayDays: 3,
};
const views = [
  ['transactions', 'Payments & settlements', 'payments'], ['revenue', 'Revenue', 'trend'], ['policy', 'Payment policy', 'settings'],
  ['ledger', 'Finance ledger', 'bookings'], ['coupons', 'Coupons', 'payments'],
];
const card = 'rounded-2xl border border-gray-100 bg-white shadow-sm';

function PolicyManager() {
  const { can } = useAdminAuth();
  const [revisions, setRevisions] = useState([]);
  const [category, setCategory] = useState('Global');
  const [draft, setDraft] = useState({ ...handbookDraftTemplate });
  const [revisionId, setRevisionId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const editable = can('financePolicies.update');
  const canApprove = can('financePolicies.approve');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await adminApi.call('/policy');
      setRevisions(result.revisions || []);
    } catch (err) { setError(err.data?.error || err.message || 'Could not load finance policies.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const categoryRevisions = revisions.filter((item) => item.category.toLowerCase() === category.toLowerCase()).sort((a, b) => b.version - a.version);
  const active = categoryRevisions.find((item) => ['APPROVED', 'SCHEDULED'].includes(item.status) && new Date(item.effectiveFrom) <= new Date());
  const selectedRevision = revisions.find((item) => String(item._id) === revisionId);
  useEffect(() => {
    if (selectedRevision) {
      const values = selectedRevision.values || {};
      setDraft({ ...handbookDraftTemplate, ...values, category: selectedRevision.category, customerCancellationRefunds: values.customerCancellationRefunds || handbookDraftTemplate.customerCancellationRefunds });
    } else setDraft({ ...handbookDraftTemplate, category });
  }, [selectedRevision, category]);
  async function save(e) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const refunds = Object.fromEntries(String(draft.refundSchedule || '').split(',').map((pair) => pair.trim()).filter(Boolean).map((pair) => pair.split(':').map((value) => Number(value.trim()))));
      if (!Object.keys(refunds).length || Object.entries(refunds).some(([days, percent]) => !Number.isInteger(Number(days)) || !Number.isFinite(percent) || percent < 0 || percent > 100)) throw new Error('Enter refund tiers as days:percent, for example 30:100, 14:50, 0:25.');
      const payload = {
        minimumReservationPercent: Number(draft.minimumReservationPercent),
        vendorCancellationPenaltyPercent: Number(draft.vendorCancellationPenaltyPercent),
        customerCancellationRefunds: refunds,
        settlementCondition: draft.settlementCondition,
        settlementDelayDays: Number(draft.settlementDelayDays),
        expectedActiveVersion: active?.version || 0,
        reason,
      };
      let response;
      if (revisionId && selectedRevision?.status === 'DRAFT') response = await adminApi.call(`/policy/revisions/${revisionId}`, { method: 'PUT', body: payload });
      else response = await adminApi.call(`/policy/${encodeURIComponent(category)}/drafts`, { method: 'POST', body: payload });
      setRevisionId(response.revision?._id || ''); setReason(''); setNotice('Draft saved. It is not effective until a different authorized admin approves it.'); await load();
    } catch (err) { setError(err.data?.error || err.message || 'Could not save policy draft.'); }
    finally { setSaving(false); }
  }
  async function transition(action) {
    if (!selectedRevision) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const body = action === 'reject' ? { reason: reason.trim() } : {};
      const result = await adminApi.call(`/policy/revisions/${revisionId}/${action}`, { method: 'POST', body });
      const actionLabel = { submit: 'submitted', approve: 'approved', reject: 'rejected' }[action] || action;
      setNotice(result.message || `Policy ${actionLabel}.`); setRevisionId(''); setReason(''); await load();
    } catch (err) { setError(err.data?.error || err.message || `Could not ${action} policy.`); }
    finally { setSaving(false); }
  }
  const refundSchedule = draft.refundSchedule ?? Object.entries(draft.customerCancellationRefunds || {}).map(([days, percent]) => `${days}:${percent}`).join(', ');
  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  return <section className={`${card} p-5 sm:p-7`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-extrabold text-navy">Payment policy governance</h2><p className="mt-1 text-sm text-muted">Every change is versioned, audited, and requires approval from a different admin.</p></div>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{active ? `Active · v${active.version}` : 'No approved policy'}</span>
    </div>
    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Handbook proposal template only: 20% advance, refund tiers 30:100 / 14:50 / 0:25, and 3 day payout review delay. These draft values are not approved for production.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
    <div className="mt-5 flex flex-wrap gap-2">
      {['Global', ...revisions.map((p) => p.category).filter((name) => name.toLowerCase() !== 'global')].filter((item, index, all) => all.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index).map((item) => <button key={item} onClick={() => { setCategory(item); setRevisionId(''); }} className={`rounded-full px-4 py-2 text-sm font-bold ${category === item ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{item}</button>)}
      {editable && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = new FormData(e.currentTarget).get('category')?.trim(); if (name) setCategory(name); }}><input name="category" placeholder="New category" className="w-36 rounded-xl border border-gray-200 px-3 text-sm" /><button className="rounded-xl border border-gray-200 px-3 text-sm font-bold text-navy">Add</button></form>}
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-2"><label className="text-xs font-bold text-muted">Revision<select value={revisionId} onChange={(e) => setRevisionId(e.target.value)} className="ml-2 rounded-xl border border-gray-200 px-3 py-2 text-sm"> <option value="">New handbook template draft</option>{categoryRevisions.map((r) => <option key={r._id} value={r._id}>v{r.version} · {r.status} · {r.createdByEmail || 'admin'}</option>)}</select></label></div>
    {loading ? <p className="py-10 text-sm text-muted">Loading policies…</p> : <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-bold text-muted">Customer advance (%)<input type="number" min="1" max="100" step="0.1" value={draft.minimumReservationPercent} onChange={(e) => set('minimumReservationPercent', e.target.value)} disabled={!editable} className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-navy disabled:bg-gray-50" /></label>
      <label className="text-xs font-bold text-muted">Vendor cancellation penalty (%)<input type="number" min="0" max="100" step="0.1" value={draft.vendorCancellationPenaltyPercent} onChange={(e) => set('vendorCancellationPenaltyPercent', e.target.value)} disabled={!editable} className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-navy disabled:bg-gray-50" /></label>
      <label className="text-xs font-bold text-muted sm:col-span-2">Customer cancellation refunds · days before event : refund percent<input value={refundSchedule} onChange={(e) => set('refundSchedule', e.target.value)} disabled={!editable} placeholder="30:100, 14:50, 7:0" className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-navy disabled:bg-gray-50" /></label>
      <label className="text-xs font-bold text-muted">Settlement condition<select value={draft.settlementCondition} onChange={(e) => set('settlementCondition', e.target.value)} disabled={!editable} className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-navy disabled:bg-gray-50"><option value="EVENT_DATE_PASSED">After event date</option><option value="DELIVERABLES_UPLOADED">Deliverables uploaded</option><option value="MANUAL_APPROVAL_REQUIRED">Manual approval required</option></select></label>
      <label className="text-xs font-bold text-muted">Settlement delay (days)<input type="number" min="0" max="365" value={draft.settlementDelayDays} onChange={(e) => set('settlementDelayDays', e.target.value)} disabled={!editable} className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-navy disabled:bg-gray-50" /></label>
      {editable && selectedRevision?.status !== 'PENDING_APPROVAL' && <><label className="text-xs font-bold text-muted sm:col-span-2">Reason for change<textarea value={reason || selectedRevision?.reason || ''} onChange={(e) => setReason(e.target.value)} required className="mt-1.5 block min-h-20 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-navy" placeholder="Required for the audit trail" /></label><div className="sm:col-span-2 flex flex-wrap justify-end gap-2"><button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{saving ? 'Saving…' : selectedRevision?.status === 'DRAFT' ? 'Save draft' : 'Create draft'}</button>{selectedRevision?.status === 'DRAFT' && <button type="button" disabled={saving} onClick={() => transition('submit')} className="rounded-xl border border-primary px-5 py-2.5 text-sm font-extrabold text-primary">Submit for approval</button>}</div></>}
    </form>}
    {selectedRevision?.status === 'PENDING_APPROVAL' && canApprove && <div className="mt-5 flex flex-wrap items-end justify-end gap-2 border-t border-gray-100 pt-4"><label className="mr-auto min-w-56 flex-1 text-xs font-bold text-muted">Decision reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Required when rejecting" /></label><button type="button" disabled={saving} onClick={() => transition('reject')} className="rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-bold text-rose-700">Reject</button><button type="button" disabled={saving} onClick={() => transition('approve')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Approve</button></div>}
    {categoryRevisions.length > 0 && <div className="mt-8 border-t border-gray-100 pt-5"><h3 className="text-sm font-extrabold text-navy">Immutable revision history</h3><div className="mt-3 space-y-2">{categoryRevisions.map((entry) => <div key={entry._id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs"><span className="font-bold text-navy">v{entry.version} · {entry.status} · {entry.reason}</span><span className="text-muted">Prepared by {entry.createdByEmail || 'admin'}{entry.approvedByEmail ? ` · approved by ${entry.approvedByEmail}` : ''}</span></div>)}</div></div>}
  </section>;
}

function Ledger() {
  const [type, setType] = useState('All'); const [entries, setEntries] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let active = true; setLoading(true); adminApi.call(`/operations/finance-ledger?limit=100&type=${encodeURIComponent(type)}`).then((r) => { if (active) setEntries(r.entries || []); }).catch((e) => { if (active) setError(e.data?.error || e.message || 'Could not load ledger.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [type]);
  return <section className={`${card} overflow-hidden`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5"><div><h2 className="text-xl font-extrabold text-navy">Finance ledger</h2><p className="mt-1 text-sm text-muted">Posted accruals, releases, refunds, adjustments, and dispute movements.</p></div><select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option>All</option>{['INVOICE_ACCRUAL','SETTLEMENT_RELEASE','REFUND','ADJUSTMENT','DISPUTE_HOLD','DISPUTE_RELEASE'].map((value) => <option key={value}>{value}</option>)}</select></div>{error && <p role="alert" className="p-5 text-sm text-rose-600">{error}</p>}{loading ? <p className="p-8 text-sm text-muted">Loading ledger…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-muted"><tr>{['Date','Type','Reference','Booking','Amount','Description'].map((x) => <th key={x} className="px-4 py-3 font-bold">{x}</th>)}</tr></thead><tbody>{entries.map((row) => <tr key={row._id} className="border-t border-gray-100"><td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(row.postedAt || row.createdAt).toLocaleString()}</td><td className="px-4 py-3 font-bold text-navy">{row.type}</td><td className="px-4 py-3 font-mono text-xs">{row.reference || row.idempotencyKey}</td><td className="px-4 py-3 font-mono text-xs">{row.booking}</td><td className="whitespace-nowrap px-4 py-3 font-bold">{row.currency || 'INR'} {Number(row.amount || 0).toLocaleString('en-IN')}</td><td className="px-4 py-3 text-muted">{row.description}</td></tr>)}</tbody></table>{!entries.length && <p className="p-8 text-center text-sm text-muted">No ledger entries for this filter.</p>}</div>}</section>;
}

function Revenue() {
  const [summary, setSummary] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let active = true; adminApi.call('/reports/financial-summary').then((result) => { if (active) setSummary(result); }).catch((err) => { if (active) setError(err.data?.error || err.message || 'Could not load revenue summary.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const amount = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  return <section className={`${card} p-5 sm:p-7`}><div><h2 className="text-xl font-extrabold text-navy">Platform revenue</h2><p className="mt-1 text-sm text-muted">Platform fees from posted vendor settlement releases, kept separate from booking GMV and customer collections.</p></div>{error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}{loading ? <p className="py-10 text-sm text-muted">Loading revenue…</p> : summary && <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-primary-soft p-5"><div className="text-xs font-bold uppercase tracking-wide text-primary">Last 30 days</div><div className="mt-2 text-3xl font-black text-navy">{amount(summary.current?.platformFees)}</div><div className="mt-1 text-xs text-muted">{summary.current?.count || 0} settlement releases · platform fees</div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-primary/10 pt-3 text-xs"><span className="text-muted">Vendor payable</span><b className="text-navy">{amount(summary.current?.vendorPayable)}</b><span className="text-muted">GST recorded</span><b className="text-navy">{amount(summary.current?.tax)}</b></div></div><div className="rounded-2xl bg-gray-50 p-5"><div className="text-xs font-bold uppercase tracking-wide text-muted">Lifetime posted</div><div className="mt-2 text-3xl font-black text-navy">{amount(summary.lifetime?.platformFees)}</div><div className="mt-1 text-xs text-muted">{summary.lifetime?.count || 0} settlement releases · platform fees</div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-3 text-xs"><span className="text-muted">Vendor payable</span><b className="text-navy">{amount(summary.lifetime?.vendorPayable)}</b><span className="text-muted">GST recorded</span><b className="text-navy">{amount(summary.lifetime?.tax)}</b></div></div></div>}</section>;
}

export default function Finance() {
  const { admin, can } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get('view') || 'transactions';
  const allowedViews = useMemo(() => views.filter(([id]) => id === 'transactions' || id === 'ledger' ? can('payments.read') || can('settlements.read') : id === 'revenue' ? can('revenue.read') || can('reports.read') : id === 'policy' ? can('financePolicies.read') || can('settings.read') : can('financeCoupons.read') || can('settings.read')), [can]);
  const active = allowedViews.some(([id]) => id === selected) ? selected : allowedViews[0]?.[0] || 'transactions';
  const roleLabel = admin?.role === 'SUPER_ADMIN' ? 'Super Admin' : (admin?.roleKey || 'Admin').replace(/_ADMIN$/, ' Admin').replaceAll('_', ' ');
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-extrabold uppercase tracking-widest text-primary">{roleLabel}</div><h1 className="mt-1 text-3xl font-black text-navy">Finance</h1><p className="mt-1 text-sm text-muted">Payments, vendor settlements, refunds, policy, ledger, and coupons.</p></div></header>
    <div className="flex gap-2 overflow-x-auto border-b border-gray-200">{allowedViews.map(([id, label, icon]) => <button key={id} onClick={() => setParams((p) => { p.set('view', id); p.delete('tab'); return p; })} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${active === id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-navy'}`}><Icon name={icon} size={16} />{label}</button>)}</div>
    {active === 'transactions' && <ModuleTable kind="payments" embedded />}
    {active === 'policy' && <PolicyManager />}
    {active === 'revenue' && <Revenue />}
    {active === 'ledger' && <Ledger />}
    {active === 'coupons' && <ModuleTable kind="coupons" embedded />}
  </div>;
}
