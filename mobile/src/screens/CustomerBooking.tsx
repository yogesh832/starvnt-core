import React, { useState } from 'react';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { eventRequestKey, pickPrivateEventMedia, openPrivateEventFile } from '../api/eventMedia';
import { Button, Card, Choice, confirm, Empty, ErrorNotice, Field, human, money, Page, Pill, Txt, useAction, useResource } from '../ui';

function CustomerIssueForm({ booking, caseId, refresh }: { booking: Data; caseId?: string; refresh: () => Promise<void> }) {
  const a = useAction();
  const [description, setDescription] = useState(''), [type, setType] = useState('SERVICE_QUALITY'), [assetId, setAssetId] = useState('');
  const [rights, setRights] = useState('no'), [requestKey, setRequestKey] = useState(eventRequestKey);
  return <Card>
    <Txt bold size={21}>{caseId ? 'Send more information' : 'Report an issue'}</Txt>
    {!caseId && <Choice label="Issue type" values={['SERVICE_QUALITY', 'SERVICE_DELAY', 'SERVICE_FAILURE', 'BILLING', 'OTHER']} value={type} onChange={value => { setType(value); setRequestKey(eventRequestKey()); }} />}
    <Field label={caseId ? 'Your response' : 'Describe the issue'} multiline maxLength={4000} editable={!a.busy} value={description} onChangeText={value => { setDescription(value); setRequestKey(eventRequestKey()); }} />
    <Choice label="I have permission to provide supporting files for review" values={['no', 'yes']} value={rights} onChange={setRights} />
    <Button title={assetId ? 'Private evidence attached' : 'Add private photo, video or PDF'} secondary disabled={rights !== 'yes'} busy={a.busy} onPress={() => a.run(async () => {
      const result = await pickPrivateEventMedia(booking.eventId, { purpose: 'CASE_EVIDENCE', bookingId: booking.id, rightsConfirmed: true, idempotencyKey: eventRequestKey() }, true);
      if (result) { setAssetId(result.asset.id); setRequestKey(eventRequestKey()); }
    })} />
    <Txt muted>STARVNT reviews your report and supporting information. Files stay within the authorized service review.</Txt>
    <ErrorNotice message={a.error} />
    <Button title={caseId ? 'Send information' : 'Submit issue for review'} disabled={!description.trim()} busy={a.busy} onPress={() => a.run(async () => {
      const body = { eventId: booking.eventId, expectedVersion: booking.version, idempotencyKey: requestKey, evidence: assetId ? [{ assetId, note: description }] : [] };
      await external.call(`/customer/bookings/${booking.id}/issues${caseId ? `/${caseId}/evidence` : ''}`, 'POST', caseId ? { ...body, notes: description } : { ...body, issueType: type, description });
      setDescription(''); setAssetId(''); setRequestKey(eventRequestKey()); await refresh();
    })} />
  </Card>;
}

export function CustomerBookingScreen({ route, navigation }: any) {
  return <CustomerBookingBody key={`${route.params.eventId}:${route.params.bookingId}`} route={route} navigation={navigation} />;
}
function CustomerBookingBody({ route, navigation }: any) {
  const { eventId, bookingId } = route.params;
  const r = useResource(external, `/customer/bookings/${encodeURIComponent(bookingId)}/workflow?eventId=${encodeURIComponent(eventId)}`, 20000);
  const a = useAction();
  const [ackKey] = useState(eventRequestKey);
  const booking = r.data.booking;
  if (r.error) return <Page {...r} title="Booked service"><Txt>Service access is unavailable. Pull to refresh and try again.</Txt></Page>;
  return <Page {...r} title={booking?.serviceName || 'Booked service'} subtitle={booking?.vendorName}>
    <ErrorNotice message={a.error} />
    {!booking && !r.loading && <Empty title="Service unavailable" description="Refresh to load your booked service." />}
    {booking && <>
      <Card>
        <Txt bold>Booking</Txt><Pill>{human(booking.bookingStatus)}</Pill>
        <Txt bold>Payment</Txt><Pill>{human(booking.paymentStatus)}</Pill>
        <Txt>Verified payment {money(booking.payment.verifiedAmount)} · Recorded balance {booking.payment.balanceAmount == null ? 'awaiting confirmation' : money(booking.payment.balanceAmount)}</Txt>
        <Txt>Booked final amount {money(booking.pricing.finalPayable)}</Txt>
        <Txt muted>Travel {money(booking.pricing.travel)} · Setup {money(booking.pricing.setup)} · Equipment {money(booking.pricing.equipment)} · Additional {money(booking.pricing.additional)}</Txt>
      </Card>
      <Card>
        <Txt bold size={22}>Service progress</Txt><Pill>{human(booking.executionStatus)}</Pill>
        <Txt>Check-in · {booking.execution.checkedInAt ? new Date(booking.execution.checkedInAt).toLocaleString() : 'No recorded check-in'}</Txt>
        <Txt>Started · {booking.execution.startedAt ? new Date(booking.execution.startedAt).toLocaleString() : 'No recorded start'}</Txt>
        {(booking.execution.milestones || []).map((m: Data) => <Txt key={m.key}>{m.detail || human(m.key)} · {new Date(m.at).toLocaleString()}</Txt>)}
        <Txt>Customer acknowledgement · {booking.execution.customerAcknowledgement?.at ? 'Received' : 'Awaiting acknowledgement'}</Txt>
        <Txt>Completion review · {booking.executionStatus === 'COMPLETION_VERIFIED' ? 'Verified by STARVNT' : 'Awaiting STARVNT review'}</Txt>
        {booking.execution.reviewNotes && <Txt>{booking.execution.reviewNotes}</Txt>}
        {(booking.completionEvidence || []).map((e: Data, index: number) => <Card key={index}>
          <Txt>{e.notes}</Txt>
          {(e.files || []).map((file: Data, i: number) => file.assetId && <Button key={i} title={file.note || 'Open private completion evidence'} secondary busy={a.busy} onPress={() => a.run(() => openPrivateEventFile(file.assetId))} />)}
          {(e.checklist || []).map((item: Data, i: number) => <Txt key={i}>{item.checked ? '✓' : '○'} {item.item}</Txt>)}
        </Card>)}
        {booking.allowedActions.acknowledge && <Button title="Acknowledge received service" busy={a.busy} onPress={() => confirm('Acknowledge received service?', 'Record that you reviewed the evidence and received this service. STARVNT separately reviews completion under the service policy.', () => a.run(async () => {
          await external.call(`/customer/bookings/${booking.id}/acknowledge-completion`, 'POST', { eventId, expectedVersion: booking.version, idempotencyKey: ackKey });
          await r.refresh();
        }))} />}
      </Card>
      <Card>
        <Txt bold size={22}>Refund progress</Txt>
        <Txt>Confirmed refunded {money(booking.refund.confirmedAmount)}</Txt><Txt>Remaining paid amount {money(booking.refund.remainingPaidAmount)}</Txt>
        {booking.refund.decisions.map((d: Data) => <Txt key={d.caseId}>Resolution decision · {human(d.decision)} · {money(d.amount)}</Txt>)}
        {booking.refund.operations.map((op: Data) => <Txt key={op.id}>{human(op.status)} · {money(op.amount)} {op.failureReason}</Txt>)}
        {!booking.refund.operations.length && <Txt muted>No refund transfer is recorded.</Txt>}
      </Card>
      {(booking.protection.cases || []).map((c: Data) => <Card key={c.id}>
        <Txt bold>Service issue · {human(c.status)}</Txt><Txt>{c.description}</Txt>
        {c.requests.map((item: Data, index: number) => <Txt key={index}>More information requested · {item.message}</Txt>)}
        {c.response && <Txt>Vendor response · {c.response.notes}</Txt>}
        {c.proposal && <Txt>Proposed resolution · {human(c.proposal.decision)} · {c.proposal.notes}</Txt>}
        {c.resolution && <Txt>Confirmed resolution · {human(c.resolution.decision)} · {c.resolution.notes}</Txt>}
        {c.evidence.flatMap((e: Data) => e.files).map((file: Data, index: number) => file.assetId && <Button key={index} title="Open private case evidence" secondary onPress={() => a.run(() => openPrivateEventFile(file.assetId))} />)}
        {c.status !== 'RESOLVED' && <CustomerIssueForm booking={booking} caseId={c.id} refresh={r.refresh} />}
      </Card>)}
      <CustomerIssueForm booking={booking} refresh={r.refresh} />
      {booking.allowedActions.reviewReplacement && <Button title="Review replacement options" onPress={() => navigation.navigate('CustomerReplacements', { eventId, bookingId: booking.id })} />}
      <Button title="Ask about this service" secondary onPress={() => navigation.navigate('Chat', { kind: 'circle', eventId, bookingId: booking.id })} />
    </>}
  </Page>;
}
