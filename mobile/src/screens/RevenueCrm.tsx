import React, { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { internal } from '../api/runtime';
import type { Data } from '../api/client';
import { useSession } from '../auth/Session';
import { Button, Card, Choice, ErrorNotice, Field, Page, Txt, id, money, useAction, useResource } from '../ui';

export function RevenueCrm() {
  const source = useResource(internal, '/crm'), report = useResource(internal, '/crm/report?days=30');
  const action = useAction(), session = useSession();
  const [selected, setSelected] = useState(''), [notes, setNotes] = useState(''), [owner, setOwner] = useState('');
  const [stage, setStage] = useState('NEW'), [value, setValue] = useState(''), [lostReason, setLostReason] = useState('');
  const [title, setTitle] = useState(''), [due, setDue] = useState(''), [options, setOptions] = useState<Data[]>([]);
  const [detail, setDetail] = useState<Data>({});
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const leads: Data[] = source.data.leads || [], lead = leads.find(row => id(row) === selected);
  async function command(path: string, body: Data) {
    const fingerprint = JSON.stringify({ path, body });
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: Crypto.randomUUID() };
    await internal.call(path, 'POST', { ...body, idempotencyKey: intent.current.key });
    intent.current = null;
    await Promise.all([source.refresh(), report.refresh()]);
    setDetail(await internal.call(`/crm/${selected}`));
  }
  const canWrite = session.can('leads.update');
  return <Page title="Revenue CRM" {...source}>
    <ErrorNotice message={action.error || report.error} />
    {report.data.available && <Card><Txt bold>Last 30 days of demand</Txt>
      <Txt>{report.data.convertedLeads} verified conversions / {report.data.denominator} leads</Txt>
      <Txt>Reported {money(report.data.reportedLeadValue)} · Contracted {money(report.data.contractedValue)}</Txt>
      <Txt>Verified collections {money(report.data.verifiedCollections)} · Refunds {money(report.data.refunds)} · Payouts {money(report.data.settlementReleases)}</Txt>
      <Txt>Contracted platform fees {money(report.data.contractedPlatformFees)} · Recognized revenue: awaiting approved accounting policy</Txt>
      <Txt muted>{report.data.definitions}</Txt>
    </Card>}
    <Choice label="Assigned demand" value={selected} values={['', ...leads.map(id)]} labels={{ '': 'Choose a lead', ...Object.fromEntries(leads.map(row => [id(row), `${row.eventDetails?.title || row.eventDetails?.eventType} · ${row.category} · ${row.crm?.stage || 'NEW'}`])) }} onChange={v => {
      setSelected(v); const row = leads.find(item => id(item) === v); setOwner(row?.crm?.owner || ''); setStage(row?.crm?.stage || 'NEW'); setValue(String(row?.crm?.reportedValue || '')); setOptions([]); setDetail({});
      if (v) void action.run(async () => setDetail(await internal.call(`/crm/${v}`)));
    }} />
    {lead && <>
      <Card><Txt bold>{lead.category}</Txt>
        {session.can('leads.assign') && <Choice label="Assigned sales owner" value={owner} values={['', ...(source.data.owners || []).map(id)]} labels={{ '': 'Choose an owner', ...Object.fromEntries((source.data.owners || []).map((row: Data) => [id(row), row.fullName || row.email])) }} onChange={setOwner} />}
        <Choice label="Pipeline stage" value={stage} values={['NEW', 'QUALIFIED', 'SOURCING', 'QUOTED', 'CONVERTED', 'LOST']} onChange={setStage} />
        <Field label="Reported lead value" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
        <Field label="Activity notes and follow-up outcome" value={notes} onChangeText={setNotes} multiline />
        {stage === 'LOST' && <Field label="Lost or declined reason" value={lostReason} onChangeText={setLostReason} />}
        <Button title="Save pipeline activity" disabled={!canWrite} busy={action.busy} onPress={() => void action.run(() => command(`/crm/${selected}`, { owner, stage, reportedValue: Number(value || 0), lostReason, notes, expectedVersion: lead.__v }))} />
        <Txt>{detail.opportunities?.length || 0} vendor enquiries · {detail.quotes?.length || 0} quotes · {detail.bookings?.length || 0} Core bookings</Txt>
        {(lead.crm?.history || []).map((row: Data) => <Txt key={row.key}>{row.from} → {row.to} · {row.notes}</Txt>)}
      </Card>
      <Card><Field label="Next follow-up action" value={title} onChangeText={setTitle} /><Field label="Due date and time, including timezone (e.g. 2026-11-15T10:30+05:30)" value={due} onChangeText={setDue} />
        <Button title="Schedule follow-up" disabled={!canWrite} busy={action.busy} onPress={() => void action.run(() => command(`/crm/${selected}/followups`, { title, dueDate: due, notes }))} />
        {(lead.followUps || []).map((row: Data) => <Card key={id(row)}><Txt>{row.title} · {new Date(row.dueDate).toLocaleString()} · {row.status}</Txt><Button title="Record follow-up outcome" disabled={!canWrite || row.status === 'COMPLETED'} secondary onPress={() => void action.run(() => command(`/crm/followups/${id(row)}/complete`, { notes }))} /></Card>)}
      </Card>
      <Card><Txt bold>Vendor and service sourcing</Txt><Button title="Find eligible services" secondary busy={action.busy} onPress={() => void action.run(async () => setOptions((await internal.call(`/crm/${selected}/options`)).options || []))} />
        {options.map(option => <Card key={option.id}><Txt>{option.vendorName} · {option.packageName} · {option.price == null ? 'Price pending' : `${money(option.price)} estimate`}</Txt><Button title="Request vendor quote" disabled={!canWrite} secondary onPress={() => void action.run(() => command(`/crm/${selected}/source`, { optionId: option.id }))} /></Card>)}
        <Txt muted>The customer chooses the confirmed quote and pays through the normal booking flow.</Txt>
      </Card>
    </>}
  </Page>;
}
