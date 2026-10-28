import React, { useState } from 'react';
import { internal } from '../api/runtime';
import type { Data } from '../api/client';
import { useSession } from '../auth/Session';
import { Button, Card, Choice, ErrorNotice, Field, Page, Pill, Txt, confirm, date, human, id, useAction, useResource } from '../ui';
export function AdminAvailability() {
  const { can } = useSession();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [vendor, setVendor] = useState('');
  const [scope, setScope] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [conflicts, setConflicts] = useState(false);
  const [resource, setResource] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(0);
  const query = new URLSearchParams({ page: String(page), ...(type ? { recordType: type } : {}), ...(status ? { status } : {}), ...(vendor ? { vendor } : {}), ...(scope ? { scope } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(resource ? { resource } : {}), ...(conflicts ? { conflict: 'true' } : {}) });
  const source = useResource(internal, `/availability?${query}`, 30000);
  const action = useAction();
  return <Page {...source} title="Availability & External Commitments">
    <Txt muted>Vendor-reported records. These do not verify an external booking or override a STARVNT booking.</Txt>
    <Field label="Vendor ID filter" value={vendor} onChangeText={value => { setVendor(value); setPage(0); }} />
    <Field label="Resource ID filter" value={resource} onChangeText={value => { setResource(value); setPage(0); }} />
    <Field label="From date (YYYY-MM-DD)" value={from} placeholder="2026-10-01" onChangeText={value => { setFrom(value); setPage(0); }} />
    <Field label="To date (YYYY-MM-DD)" value={to} placeholder="2026-10-31" onChangeText={value => { setTo(value); setPage(0); }} />
    <Choice label="Record type" value={type} values={['', 'VENDOR_BLOCK', 'EXTERNAL_COMMITMENT']} labels={{ '': 'All' }} onChange={value => { setType(value); setPage(0); }} />
    <Choice label="Status" value={status} values={['', 'ACTIVE', 'CONFLICT_REVIEW', 'CANCELLED']} labels={{ '': 'All' }} onChange={value => { setStatus(value); setPage(0); }} />
    <Choice label="Scope" value={scope} values={['', 'BUSINESS', 'SERVICE', 'RESOURCE']} labels={{ '': 'All' }} onChange={value => { setScope(value); setPage(0); }} />
    <Choice label="Conflict filter" value={conflicts ? 'true' : ''} values={['', 'true']} labels={{ '': 'All records', true: 'Conflicts only' }} onChange={value => { setConflicts(value === 'true'); setPage(0); }} />
    <ErrorNotice message={action.error} />
    {(source.data.records || []).map((row: Data) => <Card key={id(row)}>
      <Txt bold>{row.vendorName || 'Vendor'}</Txt><Txt muted>Vendor {String(row.vendor)}</Txt>
      <Pill>{human(row.recordType || 'VENDOR_BLOCK')} · {human(row.status || 'ACTIVE')}</Pill>
      <Txt>{date(row.date)} — {date(row.endDate || row.date)} · {row.allDay ? 'Full day' : `${row.startTime}–${row.endTime}`}</Txt>
      <Txt>{human(row.scope || 'BUSINESS')} · {row.reason} · Reported</Txt>
      {row.external && <><Txt>{row.external.eventType} · {row.external.location}</Txt>{source.data.personalDataVisible ? <Txt>{row.external.customerName} · {row.external.customerPhone}</Txt> : <Txt muted>Customer contact details require additional permission.</Txt>}</>}
      {(row.conflicts || []).map((conflict: Data, index: number) => <Txt key={index}>Conflict: {conflict.detail} {conflict.recordId}</Txt>)}
      {(row.history || []).map((history: Data, index: number) => <Txt key={index} muted>{date(history.at)} · {history.role} · {history.action} · {history.reason}</Txt>)}
      {can('vendors.update') && row.status !== 'CANCELLED' && <Button secondary title="Cancel reported record" busy={action.busy} onPress={() => confirm('Cancel this record?', 'Existing STARVNT bookings remain unchanged.', () => { void action.run(async () => { if (!reason.trim()) throw new Error('Enter an administrative reason below.'); await internal.call(`/availability/${id(row)}/cancel`, 'POST', { reason }); source.refresh(); }); })} />}
    </Card>)}
    {can('vendors.update') && <Field label="Administrative cancellation reason" value={reason} onChangeText={setReason} />}
    <Button secondary title="Previous page" disabled={!page} onPress={() => setPage(page - 1)} /><Button secondary title="Next page" disabled={!source.data.hasMore} onPress={() => setPage(page + 1)} />
  </Page>;
}
