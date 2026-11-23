import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { EventDateField } from '../EventFields';
import { ExternalMutation } from '../externalMutation';
import { VendorExternalBookingWizard } from './VendorExternalBookingWizard';
import { externalAcquisitionChannels, externalLifecycleTransitions } from '../../../shared/externalBookingLifecycle.js';
import { externalDocumentKinds } from '../../../shared/externalDocuments.js';
import { Button, Card, Choice, Empty, ErrorNotice, Field, Page, Txt, date, human, money, useAction, useResource } from '../ui';

const localDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const localTime = () => new Date().toTimeString().slice(0, 5);
export function VendorExternalBookings({ navigation, route }: any) {
  const [stage, setStage] = useState(''), [source, setSource] = useState(''), [cursor, setCursor] = useState(''), [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (route?.params?.create) setCreating(true); }, [route?.params?.create]);
  const query = new URLSearchParams(Object.fromEntries(Object.entries({ lifecycle: stage, source, after: cursor }).filter(([, value]) => value)));
  const resource = useResource(external, `/vendor/external-bookings?${query}`);
  if (creating) return <VendorExternalBookingWizard initialDate={route?.params?.date} onCancel={() => { setCreating(false); navigation.setParams({ create: false }); }} onSaved={row => { setCreating(false); navigation.setParams({ create: false }); setSelected(row._id); void resource.refresh(); }} />;
  return <Page {...resource} title="External bookings" subtitle="Your reported work stays separate from STARVNT booking and payment verification.">
    <Button title="Add External Booking" onPress={() => setCreating(true)} />
    <Button title="Add or reschedule in calendar" secondary onPress={() => navigation.navigate('VendorCalendar')} />
    <Choice label="Stage" value={stage} values={['', ...Object.keys(externalLifecycleTransitions)]} labels={{ '': 'All stages' }} onChange={value => { setStage(value); setCursor(''); setSelected(''); }} />
    <Choice label="Source" value={source} values={['', ...externalAcquisitionChannels]} labels={{ '': 'All sources' }} onChange={value => { setSource(value); setCursor(''); setSelected(''); }} />
    {!resource.loading && !resource.error && resource.data.bookings?.length === 0 && <Empty title="No matching external bookings" />}
    {(resource.data.bookings || []).map((row: Data) => <Card key={row._id}>
      <Txt bold>{row.externalBooking.eventName || row.external?.eventType || 'External event'} · {date(row.date)}</Txt>
      <Txt>{human(row.externalBooking.lifecycle)} · {human(row.externalBooking.acquisitionChannel)} · Vendor reported</Txt>
      <Txt>Contract {money(row.financials.totalAmount)} · Outstanding {money(row.financials.outstandingAmount)}</Txt>
      <Button title="Review booking and evidence" secondary onPress={() => setSelected(row._id)} />
    </Card>)}
    {!!resource.data.nextCursor && <Button title="Next page" secondary onPress={() => { setCursor(resource.data.nextCursor); setSelected(''); }} />}
    {!!cursor && <Button title="Return to first page" secondary onPress={() => { setCursor(''); setSelected(''); }} />}
    {!!selected && <ExternalBookingDetail key={selected} bookingId={selected} changed={resource.refresh} />}
  </Page>;
}

function ExternalBookingDetail({ bookingId, changed }: { bookingId: string; changed: () => Promise<void> }) {
  const path = `/vendor/external-bookings/${bookingId}`;
  const resource = useResource(external, path), action = useAction();
  const booking = resource.data.booking;
  const [stage, setStage] = useState(''), [reason, setReason] = useState(''), [notice, setNotice] = useState('');
  const [holdDate, setHoldDate] = useState(localDate()), [holdTime, setHoldTime] = useState('18:00');
  const [entry, setEntry] = useState({ kind: 'receipts', amount: '', method: 'BANK', date: localDate(), time: localTime(), reference: '', reason: '', attachmentId: '' });
  const [kind, setKind] = useState('INVOICE');
  const [upload, setUpload] = useState<{ asset: DocumentPicker.DocumentPickerAsset; key: string; kind: string } | null>(null);
  const mutation = useRef(new ExternalMutation(() => Crypto.randomUUID())).current;
  useEffect(() => {
    if (booking?.status === 'CANCELLED') setEntry(current => ({ ...current, kind: 'refunds' }));
  }, [booking?.status]);
  function timestamp(day: string, time: string) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a date and a valid 24-hour time.');
    const value = new Date(`${day}T${time}:00`);
    if (!Number.isFinite(+value) || localDate(value) !== day || value.toTimeString().slice(0, 5) !== time) throw new Error('Choose a valid local date and time.');
    return value.toISOString();
  }
  async function save(route: string, input: Data) {
    await mutation.submit(route, input, booking.revision, (target, body) => external.call(`${path}/${target}`, 'POST', body));
    await Promise.all([resource.refresh(), changed()]); setNotice('Vendor-reported record saved with history.');
  }
  return <Card>
    <Txt bold size={22}>Booking details</Txt>
    <ErrorNotice message={resource.error} retry={resource.refresh} /><ErrorNotice message={action.error} />
    {mutation.unresolved && <><Txt>The last action's result is uncertain. Retry it before recording a different change.</Txt><Button title="Retry previous action" busy={action.busy} onPress={() => void action.run(async () => {
      await mutation.retry((target, body) => external.call(`${path}/${target}`, 'POST', body));
      await Promise.all([resource.refresh(), changed()]); setEntry(current => ({ ...current, amount: '', reference: '', reason: '' })); setStage(''); setReason(''); setNotice('Previous action reconciled with its original request.');
    })} /></>}
    {!!notice && <Txt>{notice}</Txt>}
    {resource.loading && <Txt>Loading booking evidence…</Txt>}
    {booking && <>
      <Txt bold>{human(booking.externalBooking.lifecycle)} · Vendor reported</Txt>
      <Txt>Reported receipts {money(booking.financials.receivedAmount)} · Refunds {money(booking.financials.refundedAmount)} · Outstanding {money(booking.financials.outstandingAmount)}</Txt>
      <Txt muted>Reported money is not verified by STARVNT or its payment provider.</Txt>
      {(externalLifecycleTransitions[booking.externalBooking.lifecycle] || []).length > 0 && <>
        <Choice label="Next stage" values={externalLifecycleTransitions[booking.externalBooking.lifecycle]} value={stage} onChange={setStage} />
        <Field label="Reason for stage change" value={reason} onChangeText={setReason} maxLength={500} editable={!action.busy} />
        {stage === 'ON_HOLD' && <><EventDateField label="Hold expiry date" value={holdDate} onChange={setHoldDate} /><Field label="Hold expiry time (24-hour HH:MM)" value={holdTime} onChangeText={setHoldTime} /></>}
        <Button title="Save stage with history" busy={action.busy} disabled={!stage || !reason.trim() || resource.loading || !!resource.error} onPress={() => void action.run(async () => {
          await save('lifecycle', { lifecycle: stage, reason: reason.trim(), ...(stage === 'ON_HOLD' ? { holdExpiresAt: timestamp(holdDate, holdTime) } : {}) }); setStage(''); setReason('');
        })} />
      </>}
      {(booking.status !== 'CANCELLED' || booking.financials.netReceivedAmount > 0) ? <>
      <Txt bold>Report a receipt or refund</Txt>
      <Choice label="Entry type" values={booking.status === 'CANCELLED' ? ['refunds'] : ['receipts', 'refunds']} value={entry.kind} onChange={kind => setEntry({ ...entry, kind })} />
      <Field label="Amount (INR)" value={entry.amount} onChangeText={amount => setEntry({ ...entry, amount })} keyboardType="decimal-pad" editable={!action.busy} />
      <Choice label="Payment method" values={['BANK', 'UPI', 'CASH', 'OTHER']} value={entry.method} onChange={method => setEntry({ ...entry, method })} />
      <EventDateField label="Receipt or refund date" value={entry.date} onChange={date => setEntry({ ...entry, date })} />
      <Field label="Transaction time (24-hour HH:MM)" value={entry.time} onChangeText={time => setEntry({ ...entry, time })} />
      <Field label="Reference (optional)" value={entry.reference} onChangeText={reference => setEntry({ ...entry, reference })} maxLength={160} />
      <Field label={entry.kind === 'refunds' ? 'Refund reason (required)' : 'Receipt note (optional)'} value={entry.reason} onChangeText={reason => setEntry({ ...entry, reason })} maxLength={500} />
      <Choice label="Linked document (optional)" value={entry.attachmentId} values={['', ...(booking.externalBooking.attachments || []).map((file: Data) => file._id)]} labels={{ '': 'No linked document', ...Object.fromEntries((booking.externalBooking.attachments || []).map((file: Data) => [file._id, `${human(file.kind)} · ${file.name}`])) }} onChange={attachmentId => setEntry({ ...entry, attachmentId })} />
      <Button title="Save reported money entry" busy={action.busy} disabled={resource.loading || !!resource.error || (booking.status === 'CANCELLED' && entry.kind === 'receipts')} onPress={() => void action.run(async () => {
        const amount = Number(entry.amount); if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a positive amount.');
        await save(entry.kind, { amount, method: entry.method, reference: entry.reference, reason: entry.reason, receivedAt: timestamp(entry.date, entry.time), attachmentId: entry.attachmentId || null });
        setEntry({ ...entry, amount: '', reference: '', reason: '' });
      })} />
      </> : <Txt>This closed record has no refundable reported balance.</Txt>}
      <Txt bold>Private documents</Txt>
      <Choice label="Document purpose" value={kind} values={externalDocumentKinds} onChange={setKind} />
      <Button title="Choose a private document" secondary busy={action.busy} onPress={() => void action.run(async () => {
        const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
        if (picked.canceled) return;
        const asset = picked.assets[0]; if (asset.size && asset.size > 10 * 1024 * 1024) throw new Error('Choose a document up to 10 MB.');
        setUpload({ asset, key: Crypto.randomUUID(), kind });
      })} />
      {upload && <><Txt>Selected: {upload.asset.name} · {human(upload.kind)}</Txt><Button title="Attach selected private document" busy={action.busy} onPress={() => void action.run(async () => {
        const body = new FormData(); body.append('file', Platform.OS === 'web' && upload.asset.file ? upload.asset.file : new File(upload.asset.uri));
        body.append('kind', upload.kind); body.append('idempotencyKey', upload.key);
        await external.call(`${path}/attachments`, 'POST', body); setUpload(null); await resource.refresh(); setNotice('Private document attached.');
      })} /></>}
      {(booking.externalBooking.attachments || []).map((file: Data) => <Button key={file._id} title={`${human(file.kind)} · ${file.name} · ${date(file.at)}`} secondary busy={action.busy} onPress={() => void action.run(async () => {
        const grant = await external.call(`${path}/attachments/${file._id}/download`);
        if (typeof grant.url !== 'string' || !grant.url.startsWith('https://')) throw new Error('Secure document access is unavailable.');
        await Linking.openURL(grant.url);
      })} />)}
      <Txt bold>Reported payment history</Txt>
      {['receipts', 'refunds'].flatMap(kind => (booking.externalBooking[kind] || []).map((row: Data) => <Txt key={`${kind}:${row.key}`}>{human(kind)} · {money(row.amount)} · {date(row.receivedAt)} · {row.method}</Txt>))}
      <Txt bold>Booking history</Txt>
      {(booking.history || []).map((row: Data, index: number) => <Txt key={index} muted>{human(row.action)} · {date(row.at)} · {row.reason || 'Recorded change'}</Txt>)}
    </>}
  </Card>;
}
