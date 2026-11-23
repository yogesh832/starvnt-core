import { openPrivateMedia } from './privateMedia';
import { financeWorkflowActions } from '../../server/src/common/financeWorkflowActions';
import * as Crypto from 'expo-crypto';
import { EventCollaboration } from './EventCollaboration';
import React, { useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { internal, external } from './api/runtime';
import type { Data } from './api/client';
import { Button, Card, Choice, ErrorNotice, Field, MultiChoice, Txt, human, useAction, useResource } from './ui';
import { useSession } from './auth/Session';

export function BookingWorkflow({ bookingId, admin = false }: { bookingId: string; admin?: boolean }) {
  const api = admin ? internal : external;
  const base = admin ? '/workflow' : '/vendor/workflow';
  const media = admin ? '/collaboration' : '/vendor/collaboration';
  const resource = useResource(api, `${base}/bookings/${bookingId}`);
  const a = useAction();
  const session = useSession();
  const [notes, setNotes] = useState('');
  const [milestone, setMilestone] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [files, setFiles] = useState<Data[]>([]);
  const [uploadPermissions, setUploadPermissions] = useState<string[]>([]);
  const [purpose, setPurpose] = useState(admin && !session.can('operations.manage') ? 'FINANCE_EVIDENCE' : 'COMPLETION_EVIDENCE');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [decision, setDecision] = useState('SERVICE_ACCEPTED');
  const [kind, setKind] = useState('SETTLEMENT');
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const execution: Data = resource.data.execution || {};
  const eventId = resource.data.eventId || resource.data.booking?.customerEvent;
  const requirements = execution.completionPolicy?.completionRequirements;
  const forPurpose = (target: string) => files.filter(file => file.purpose === target).map(file => ({ assetId: file.assetId, note: file.note }));
  const key = () => Crypto.randomUUID();
  async function mutate(path: string, input: Data) {
    const body = { ...input, notes, expectedVersion: execution.version };
    const fingerprint = JSON.stringify({ path, body });
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: key() };
    await api.call(`${base}/bookings/${bookingId}${path}`, 'POST', { ...body, idempotencyKey: intent.current.key });
    intent.current = null;
    setFiles([]);
    await resource.refresh();
  }
  const act = (path: string, body: Data) => { void a.run(() => mutate(path, body)); };
  async function upload() {
    if (!uploadPermissions.includes('I am authorized to share this private evidence')) throw new Error('Confirm your permission to share this evidence first.');
    if (!eventId) throw new Error('Core must link this booking to its event before private uploads are available.');
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/mp4', 'application/pdf'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    const file = picked.assets[0];
    const form = new FormData();
    form.append('file', Platform.OS === 'web' && file.file ? file.file : new File(file.uri));
    form.append('purpose', purpose); form.append('bookingId', bookingId); form.append('rightsConfirmed', 'true'); form.append('idempotencyKey', key());
    const result = await api.call(`${media}/events/${eventId}/media`, 'POST', form);
    setFiles(current => [...current, { assetId: result.asset.id, note: file.name, purpose }]);
  }
  async function openEvidence(file: Data) {
    if (!file.assetId) throw new Error('This legacy file needs private evidence migration.');
    await openPrivateMedia(api, `${media}/media/${file.assetId}/file`, file.assetId);
  }
  const cases: Data[] = resource.data.cases?.cases || [];
  return <>
    <ErrorNotice message={resource.error || a.error} />
    <Card><Txt bold size={20}>Service execution</Txt><Txt>{human(execution.executionStatus)}</Txt>
      <Field label="Action or review notes" value={notes} onChangeText={setNotes} multiline />
      {!admin && <>
        <Button title="Check in" secondary busy={a.busy} onPress={() => act('/execution', { action: 'CHECK_IN' })} />
        <Button title="Start service" busy={a.busy} onPress={() => act('/execution', { action: 'START' })} />
        <Field label="Milestone identifier" value={milestone} onChangeText={setMilestone} />
        <Button title="Record milestone" secondary busy={a.busy} disabled={!milestone} onPress={() => act('/execution', { action: 'MILESTONE', milestone: { key: milestone, detail: notes } })} />
        <Button title="Correct recorded milestone" secondary busy={a.busy} disabled={!milestone || !notes} onPress={() => act('/execution', { action: 'CORRECT_MILESTONE', milestone: { key: milestone, detail: notes }, reason: notes })} />
        <MultiChoice label="Completed policy checklist" values={requirements?.requiredChecklist || []} selected={checked} onChange={setChecked} />
        <Button title="Submit completion evidence" busy={a.busy} onPress={() => act('/execution', { action: 'SUBMIT_COMPLETION', files: forPurpose('COMPLETION_EVIDENCE'), checklist: checked.map(item => ({ item, checked: true })) })} />
        <Button title="Report inability to fulfil service" secondary busy={a.busy} disabled={!notes} onPress={() => act('/failure', { reason: notes })} />
      </>}
      {!requirements && <Txt muted>Core must attach an approved category completion policy before validation.</Txt>}
      {admin && session.can('operations.manage') && <>
        <Button title="Attach approved completion policy" secondary busy={a.busy} onPress={() => act('/completion-policy', { reason: notes })} />
        <Button title="Verify completion after review" busy={a.busy} disabled={!notes} onPress={() => act('/validate', { approved: true })} />
        <Button title="Record vendor failure for replacement review" secondary busy={a.busy} disabled={!notes} onPress={() => act('/failure', { reason: notes })} />
        <Button title="Request further evidence" secondary busy={a.busy} disabled={!notes} onPress={() => act('/validate', { approved: false })} />
      </>}
      {(execution.execution?.milestones || []).map((item: Data) => <Txt key={item.key}>{item.key} · {item.detail}</Txt>)}
      {(execution.completionEvidence || []).map((entry: Data, i: number) => <Card key={i}><Txt>{entry.notes}</Txt>{(entry.files || []).map((file: Data, j: number) => <Button key={j} title={`Open private evidence ${j + 1}`} secondary onPress={() => void a.run(() => openEvidence(file))} />)}</Card>)}
    </Card>
    <Card><Txt bold>Private evidence upload</Txt>
      <Choice label="Evidence purpose" value={purpose} values={admin ? ['COMPLETION_EVIDENCE', 'CASE_EVIDENCE', 'FINANCE_EVIDENCE'] : ['COMPLETION_EVIDENCE', 'CASE_EVIDENCE']} onChange={setPurpose} />
      <Txt muted>Upload only files you are authorized to share with the appropriate booking reviewers.</Txt>
      <MultiChoice label="Evidence permissions" values={['I am authorized to share this private evidence']} selected={uploadPermissions} onChange={setUploadPermissions} />
      <Button title="Choose private photo, video or document" secondary busy={a.busy} disabled={!uploadPermissions.length} onPress={() => void a.run(upload)} />
      {files.map(file => <Txt key={file.assetId}>{file.note} · ready to attach</Txt>)}
    </Card>
    <Card><Txt bold>Protection cases</Txt>
      <Button title="Report an issue" busy={a.busy} disabled={!notes} onPress={() => act('/cases', { description: notes, evidence: forPurpose('CASE_EVIDENCE') })} />
      {cases.map(item => <Card key={item.id}><Txt>{item.description} · {human(item.status)}</Txt>
        {(item.evidence || []).flatMap((entry: Data) => entry.files || []).map((file: Data, index: number) => <Button key={index} title={`Open case evidence ${index + 1}`} secondary onPress={() => void a.run(() => openEvidence(file))} />)}
        {item.response?.notes && <Txt>Vendor response · {item.response.notes}</Txt>}
        <Button title={admin ? 'Add review evidence' : 'Respond to case'} secondary busy={a.busy} disabled={!notes} onPress={() => act(`/cases/${item.id}`, { action: admin ? 'EVIDENCE' : 'RESPOND', evidence: forPurpose('CASE_EVIDENCE') })} />
        {admin && session.can('operations.manage') && <>
          <Button title="Assign review to me" secondary busy={a.busy} onPress={() => act(`/cases/${item.id}`, { action: 'ASSIGN', assignedTo: session.admin?.id })} />
          <Choice label="Proposed outcome" value={decision} values={['SERVICE_ACCEPTED','VENDOR_SETTLEMENT','PARTIAL_SETTLEMENT','REFUND','PARTIAL_REFUND','REPLACEMENT','OTHER_REMEDY']} onChange={setDecision} />
          <Field label="Proposed financial amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          {['PROPOSE','RESOLVE','REQUEST_INFORMATION','ESCALATE','REOPEN'].map(action => <Button key={action} title={human(action)} secondary busy={a.busy} disabled={!notes} onPress={() => act(`/cases/${item.id}`, { action, decision, refundAmount: decision.includes('REFUND') ? Number(amount || 0) : 0, settlementAmount: decision.includes('SETTLEMENT') ? Number(amount || 0) : 0 })} />)}
        </>}
      </Card>)}
    </Card>
    {admin && resource.data.finance && <Card><Txt bold>Finance processing and reconciliation</Txt>
      <Txt>Verified funds remaining ₹{resource.data.finance.availableVerifiedFunds}</Txt>
      <Choice label="Finance operation" value={kind} values={['SETTLEMENT','REFUND']} onChange={setKind} />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Field label="Bank reference" value={reference} onChangeText={setReference} />
      <Button title="Request manual finance review" busy={a.busy} onPress={() => act('/finance', { kind, method: 'MANUAL', amount: Number(amount), reason: notes })} />
      {(resource.data.finance.operations || []).map((op: Data) => <Card key={op.operationId}><Txt>{op.kind} ₹{op.amount} · {human(op.status)}</Txt>
        {(op.evidence || []).map((file: Data, index: number) => <Button key={index} title={`Open finance evidence ${index + 1}`} secondary onPress={() => void a.run(() => openEvidence(file))} />)}
        {financeWorkflowActions(op).map((action: string) => <Button key={action} title={human(action)} secondary busy={a.busy} onPress={() => act(`/finance/${op.operationId}`, { action, reference, reason: notes, evidence: forPurpose('FINANCE_EVIDENCE') })} />)}
      </Card>)}
    </Card>}
    {eventId && (!admin || session.can('operations.read')) && <EventCollaboration eventId={String(eventId)} bookingId={bookingId} admin={admin} />}
  </>;
}
