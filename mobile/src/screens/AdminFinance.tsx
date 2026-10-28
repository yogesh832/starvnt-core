import React, { useEffect, useMemo, useState } from 'react';
import { internal } from '../api/runtime';
import { useSession } from '../auth/Session';
import { Button, Card, Choice, Empty, ErrorNotice, Field, Page, Pill, Stats, Txt, human, id, money, useAction, useResource } from '../ui';

const template = { minimumReservationPercent: 20, vendorCancellationPenaltyPercent: 0, customerCancellationRefunds: { 30: 100, 14: 50, 0: 25 }, settlementCondition: 'EVENT_DATE_PASSED', settlementDelayDays: 3 };
const ledgerTypes = ['INVOICE_ACCRUAL', 'SETTLEMENT_RELEASE', 'REFUND', 'ADJUSTMENT', 'DISPUTE_HOLD', 'DISPUTE_RELEASE'];

export function AdminFinance() {
  const { can } = useSession();
  const [view, setView] = useState('policy');
  const canPolicy = can('financePolicies.read') || can('settings.read');
  const canRevenue = can('revenue.read') || can('reports.read');
  const canLedger = can('payments.read') || can('settlements.read');
  const views = [ ...(canPolicy ? ['policy'] : []), ...(canRevenue ? ['revenue'] : []), ...(canLedger ? ['ledger'] : []) ];
  useEffect(() => { if (!views.includes(view)) setView(views[0] || 'policy'); }, [views.join(','), view]);
  return <Page title="Finance workspace" subtitle="Policy governance, platform revenue, and the posted finance ledger.">
    {!!views.length && <Choice label="Finance section" value={view} values={views} onChange={setView} />}
    {view === 'policy' && canPolicy && <Policy />}
    {view === 'revenue' && canRevenue && <Revenue />}
    {view === 'ledger' && canLedger && <Ledger />}
  </Page>;
}

function Policy() {
  const { can } = useSession();
  const source = useResource(internal, '/policy');
  const action = useAction();
  const revisions = source.data.revisions || [];
  const categories = useMemo(() => ['Global', ...revisions.map((r: any) => r.category).filter((c: string) => c?.toLowerCase() !== 'global')].filter((x, i, a) => a.findIndex(v => v.toLowerCase() === x.toLowerCase()) === i), [revisions]);
  const [category, setCategory] = useState('Global');
  const [newCategory, setNewCategory] = useState('');
  const [revisionId, setRevisionId] = useState('');
  const [draft, setDraft] = useState<any>({ ...template, refundSchedule: '30:100, 14:50, 0:25' });
  const [reason, setReason] = useState('');
  const rows = revisions.filter((r: any) => r.category?.toLowerCase() === category.toLowerCase()).sort((a: any, b: any) => b.version - a.version);
  const selected = revisions.find((r: any) => id(r) === revisionId);
  const active = rows.find((r: any) => ['APPROVED', 'SCHEDULED'].includes(r.status) && new Date(r.effectiveFrom) <= new Date());
  useEffect(() => {
    if (selected) {
      const v = selected.values || {};
      setDraft({ ...template, ...v, refundSchedule: Object.entries(v.customerCancellationRefunds || template.customerCancellationRefunds).map(([d, p]) => `${d}:${p}`).join(', ') });
    } else setDraft({ ...template, refundSchedule: '30:100, 14:50, 0:25' });
  }, [revisionId, category]);
  const set = (key: string, value: any) => setDraft((d: any) => ({ ...d, [key]: value }));
  const editable = can('financePolicies.update');
  const canApprove = can('financePolicies.approve');
  async function save() {
    const refunds = Object.fromEntries(String(draft.refundSchedule).split(',').map((p: string) => p.trim()).filter(Boolean).map((p: string) => p.split(':').map((v: string) => Number(v.trim()))));
    if (!reason.trim() || !Object.keys(refunds).length || Object.entries(refunds).some(([d, p]) => !Number.isInteger(Number(d)) || !Number.isFinite(Number(p)) || Number(p) < 0 || Number(p) > 100)) throw new Error('Add a change reason and valid refund tiers, such as 30:100, 14:50, 0:25.');
    const payload = { minimumReservationPercent: Number(draft.minimumReservationPercent), vendorCancellationPenaltyPercent: Number(draft.vendorCancellationPenaltyPercent), customerCancellationRefunds: refunds, settlementCondition: draft.settlementCondition, settlementDelayDays: Number(draft.settlementDelayDays), expectedActiveVersion: active?.version || 0, reason };
    await internal.call(revisionId && selected?.status === 'DRAFT' ? `/policy/revisions/${revisionId}` : `/policy/${encodeURIComponent(category)}/drafts`, revisionId && selected?.status === 'DRAFT' ? 'PUT' : 'POST', payload);
    setRevisionId(''); setReason(''); await source.refresh();
  }
  async function transition(name: string) {
    if (name === 'reject' && !reason.trim()) throw new Error('A rejection reason is required.');
    await internal.call(`/policy/revisions/${revisionId}/${name}`, 'POST', name === 'reject' ? { reason } : {});
    setRevisionId(''); setReason(''); await source.refresh();
  }
  return <>
    <ErrorNotice message={action.error || source.error} />
    <Card><Txt bold size={20}>Payment policy governance</Txt><Txt muted>Changes are versioned and require approval from a different authorized admin.</Txt><Pill>{active ? `ACTIVE · v${active.version}` : 'NO APPROVED POLICY'}</Pill><Txt>Handbook proposal template: 20% advance, refund tiers 30:100 / 14:50 / 0:25, and 3 day payout review. These are draft values, not approved production terms.</Txt></Card>
    <Choice label="Policy category" value={category} values={categories} onChange={v => { setCategory(v); setRevisionId(''); }} />
    {editable && <Card><Field label="New policy category" value={newCategory} onChangeText={setNewCategory} /><Button title="Use this category" secondary disabled={!newCategory.trim()} onPress={() => { setCategory(newCategory.trim()); setRevisionId(''); setNewCategory(''); }} /></Card>}
    <Choice label="Revision" value={revisionId} values={['', ...rows.map((r: any) => id(r))]} labels={{ '': 'New handbook template draft', ...Object.fromEntries(rows.map((r: any) => [id(r), `v${r.version} · ${r.status}`])) }} onChange={setRevisionId} />
    {editable && selected?.status !== 'PENDING_APPROVAL' && <Card>
      <Field label="Customer advance (%)" keyboardType="decimal-pad" value={String(draft.minimumReservationPercent)} onChangeText={v => set('minimumReservationPercent', v)} />
      <Field label="Vendor cancellation penalty (%)" keyboardType="decimal-pad" value={String(draft.vendorCancellationPenaltyPercent)} onChangeText={v => set('vendorCancellationPenaltyPercent', v)} />
      <Field label="Refund tiers · days:percent" value={draft.refundSchedule} onChangeText={v => set('refundSchedule', v)} />
      <Choice label="Settlement condition" value={draft.settlementCondition} values={['EVENT_DATE_PASSED', 'DELIVERABLES_UPLOADED', 'MANUAL_APPROVAL_REQUIRED']} onChange={v => set('settlementCondition', v)} />
      <Field label="Settlement review delay (days)" keyboardType="number-pad" value={String(draft.settlementDelayDays)} onChangeText={v => set('settlementDelayDays', v)} />
      <Field label="Reason for change" value={reason} onChangeText={setReason} />
      <Button title={selected?.status === 'DRAFT' ? 'Save draft' : 'Create draft'} busy={action.busy} onPress={() => void action.run(save)} />
      {selected?.status === 'DRAFT' && <Button title="Submit for approval" secondary busy={action.busy} onPress={() => void action.run(() => transition('submit'))} />}
    </Card>}
    {selected?.status === 'PENDING_APPROVAL' && canApprove && <Card><Field label="Decision / rejection reason" value={reason} onChangeText={setReason} /><Button title="Approve policy" busy={action.busy} onPress={() => void action.run(() => transition('approve'))} /><Button title="Reject policy" danger busy={action.busy} onPress={() => void action.run(() => transition('reject'))} /></Card>}
    {!!rows.length && <Card><Txt bold>Revision history</Txt>{rows.map((r: any) => <Txt key={id(r)} muted>v{r.version} · {r.status} · {r.reason} · prepared by {r.createdByEmail || 'admin'}{r.approvedByEmail ? ` · approved by ${r.approvedByEmail}` : ''}</Txt>)}</Card>}
  </>;
}

function Revenue() {
  const r = useResource(internal, '/reports/financial-summary');
  return <><ErrorNotice message={r.error} />{r.loading ? <Txt>Loading revenue…</Txt> : <>
    <Txt muted>Platform fees from posted vendor settlement releases, separate from booking GMV and customer collections.</Txt>
    <Stats items={[["Platform fees · last 30 days", money(r.data.current?.platformFees)], ["Settlement releases", r.data.current?.count || 0], ["Vendor payable", money(r.data.current?.vendorPayable)], ["GST recorded", money(r.data.current?.tax)], ["Lifetime platform fees", money(r.data.lifetime?.platformFees)], ["Lifetime releases", r.data.lifetime?.count || 0]]} />
  </>}</>;
}

function Ledger() {
  const [type, setType] = useState('All');
  const r = useResource(internal, `/operations/finance-ledger?limit=100&type=${encodeURIComponent(type)}`);
  return <><Choice label="Ledger entry type" value={type} values={['All', ...ledgerTypes]} onChange={setType} /><ErrorNotice message={r.error} />{(r.data.entries || []).map((e: any) => <Card key={id(e)}><Pill>{human(e.type)}</Pill><Txt bold>{money(e.amount)}</Txt><Txt>{e.description}</Txt><Txt muted>{new Date(e.postedAt || e.createdAt).toLocaleString()} · Booking {e.booking || '—'}</Txt><Txt muted>Reference {e.reference || e.idempotencyKey || '—'}</Txt></Card>)}{!r.loading && !r.data.entries?.length && <Empty title="No ledger entries for this filter" />}</>;
}
