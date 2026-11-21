import { useCallback, useEffect, useState } from 'react';
import { externalApi } from '../../../lib/api.js';
import { Card, Page } from './shared.jsx';

const STATUS = {
  SENT: ['Awaiting your approval', 'bg-amber-50 text-amber-700'],
  APPROVED: ['Approved', 'bg-emerald-50 text-emerald-700'],
  REJECTED: ['Rejected', 'bg-rose-50 text-rose-700'],
  REVISION_REQUESTED: ['Revision requested', 'bg-slate-100 text-slate-700'],
  EXPIRED: ['Expired', 'bg-slate-100 text-slate-600'],
  SUPERSEDED: ['Replaced by a newer version', 'bg-slate-100 text-slate-600'],
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Vendor agreement approvals for Proposal Studio. A customer proposal cannot be finalised until these are approved. */
export default function AgreementsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => externalApi.call('/vendor/agreements').then((r) => setRows(r.agreements)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    const note = decision === 'APPROVE' ? '' : window.prompt(decision === 'REJECT' ? 'Why are you rejecting this agreement?' : 'What should be revised?') || '';
    if (decision !== 'APPROVE' && !note) return;
    setBusy(id); setError('');
    try { await externalApi.call(`/vendor/agreements/${id}/decision`, { method: 'POST', body: { decision, note } }); await load(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  return (
    <Page title="Agreements" sub="Approve the scope, price and terms STARVNT has prepared from your quote.">
      {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!rows ? <Card><p className="text-sm text-muted">Loading…</p></Card> : rows.length === 0 ? <Card><p className="text-sm text-muted">No agreements yet. They appear here when STARVNT prepares one from your accepted quote.</p></Card> : rows.map((a) => {
        const [label, cls] = STATUS[a.status] || [a.status, 'bg-slate-100'];
        return (
          <Card key={a.id} title={`${a.category} · version ${a.version}`} extra={<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{label}</span>}>
            {a.scope.summary && <p className="text-sm">{a.scope.summary}</p>}
            {a.scope.lineItems.length > 0 && (
              <table className="mt-3 w-full text-left text-sm">
                <thead><tr className="text-[11px] uppercase text-muted"><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit price</th></tr></thead>
                <tbody>{a.scope.lineItems.map((li) => <tr key={li.name} className="border-t"><td className="py-1.5">{li.name}</td><td className="text-right">{li.quantity}</td><td className="text-right">{inr(li.unitPrice)}</td></tr>)}</tbody>
              </table>
            )}
            {a.scope.deliverables.length > 0 && <p className="mt-2 text-sm"><strong>Deliverables:</strong> {a.scope.deliverables.join('; ')}</p>}
            {a.scope.exclusions.length > 0 && <p className="mt-1 text-sm text-muted"><strong>Excluded:</strong> {a.scope.exclusions.join('; ')}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span><strong>Agreement value:</strong> {inr(a.pricing.total)}</span>
              {a.terms.validUntil && <span className="text-muted">Valid until {new Date(a.terms.validUntil).toLocaleDateString('en-IN')}</span>}
            </div>
            {a.status === 'SENT' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy === a.id} onClick={() => decide(a.id, 'APPROVE')} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve agreement</button>
                <button type="button" disabled={busy === a.id} onClick={() => decide(a.id, 'REQUEST_REVISION')} className="rounded-xl border px-4 py-2 text-sm font-bold">Request revision</button>
                <button type="button" disabled={busy === a.id} onClick={() => decide(a.id, 'REJECT')} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Reject</button>
              </div>
            )}
            {a.vendorDecision?.note && <p className="mt-2 text-xs text-muted">Your note: {a.vendorDecision.note}</p>}
          </Card>
        );
      })}
    </Page>
  );
}
