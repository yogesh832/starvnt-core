import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, externalApi } from '../lib/api.js';
import { useAdminAuth } from '../auth/AdminAuthContext.jsx';
import EventCollaboration from './EventCollaboration.jsx';
import { financeWorkflowActions } from '../../../server/src/common/financeWorkflowActions.js';

const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-40';
const field = 'w-full rounded-lg border p-2 text-sm';
const label = value => String(value || '').replaceAll('_', ' ');

export default function BookingWorkflow({ admin = false }) {
  const api = admin ? adminApi : externalApi;
  const base = admin ? '/workflow' : '/vendor/workflow';
  const media = admin ? '/collaboration' : '/vendor/collaboration';
  const auth = useAdminAuth();
  const can = permission => admin && auth?.can(permission);
  const [params, setParams] = useSearchParams();
  const selected = params.get('booking') || '';
  const [bookings, setBookings] = useState([]);
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState('');
  const [milestone, setMilestone] = useState('');
  const [checked, setChecked] = useState([]);
  const [files, setFiles] = useState([]);
  const [purpose, setPurpose] = useState(admin && !can('operations.manage') ? 'FINANCE_EVIDENCE' : 'COMPLETION_EVIDENCE');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [kind, setKind] = useState('SETTLEMENT');
  const [decision, setDecision] = useState('SERVICE_ACCEPTED');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadRights, setUploadRights] = useState(false);
  const intent = useRef(null);
  const load = useCallback(async () => {
    const result = await api.call(`${base}/bookings`);
    setBookings(result.bookings || []);
    if (selected) setData(await api.call(`${base}/bookings/${selected}`));
    else setData(null);
  }, [api, base, selected]);
  useEffect(() => { setFiles([]); setChecked([]); load().catch(err => setError(err.message)); }, [load]);
  const execution = data?.execution;
  const booking = data?.booking;
  const eventId = data?.eventId || booking?.customerEvent;
  const cases = data?.cases?.cases || [];
  const policy = execution?.completionPolicy?.completionRequirements;
  async function act(path, input = {}) {
    setBusy(true); setError('');
    const body = { ...input, notes, expectedVersion: execution?.version };
    const fingerprint = JSON.stringify({ path, body });
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await api.call(`${base}/bookings/${selected}${path}`, { method: 'POST', body: { ...body, idempotencyKey: intent.current.key } });
      intent.current = null;
      setFiles([]);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function upload(file) {
    if (!file || !eventId) return;
    if (!uploadRights) { setError('Confirm your permission to share this private evidence.'); return; }
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file); body.append('purpose', purpose); body.append('bookingId', selected);
      body.append('rightsConfirmed', 'true'); body.append('idempotencyKey', crypto.randomUUID());
      const result = await api.call(`${media}/events/${eventId}/media`, { method: 'POST', body });
      setFiles(current => [...current, { assetId: result.asset.id, note: file.name, purpose }]);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function openEvidence(file) {
    if (!file.assetId) { setError('This legacy evidence link requires a private-media migration.'); return; }
    try {
      const response = await api.raw(`${media}/media/${file.assetId}/file`);
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(err.message); }
  }
  const evidenceFor = target => files.filter(file => file.purpose === target).map(({ assetId, note }) => ({ assetId, note }));
  return <section className="space-y-4">
    <h1 className="text-xl font-bold">{admin ? 'Service execution and review' : selected ? 'Booking operations' : 'Execution workspace'}</h1>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {!admin && !selected && <div className="lg:hidden rounded-2xl border bg-white p-5"><h2 className="font-bold">Start with your confirmed booking</h2><p className="text-sm text-muted mt-2">Open its booking card to manage event-day progress, evidence and delivery.</p><Link to="/vendor/bookings" className="inline-flex min-h-11 items-center text-primary font-bold">View bookings →</Link></div>}
    <label className={`${admin ? 'block' : 'hidden lg:block'} text-sm`}>Booking<select className={field} value={selected} onChange={event => setParams({ booking: event.target.value })}>
      <option value="">Choose a booking</option>{bookings.map(row => <option key={row._id} value={row._id}>{row.bookingReference} · {row.serviceName} · {row.eventDate}</option>)}
    </select></label>
    {execution && <>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <p className="font-bold">{label(execution.executionStatus)} · {label(execution.protectionStatus)}</p>
        {execution.execution?.checkedInAt && <p className="text-sm">Checked in {new Date(execution.execution.checkedInAt).toLocaleString()}</p>}
        {execution.execution?.milestones?.map(item => <p className="text-sm" key={item.key}>{item.key} · {item.detail} · {new Date(item.at).toLocaleString()}</p>)}
        <label className="block text-sm">Action or review notes<textarea className={field} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        {!admin && <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || !['NOT_STARTED', 'SERVICE_SCHEDULED'].includes(execution.executionStatus)} onClick={() => act('/execution', { action: 'CHECK_IN' })}>Check in</button>
          <button className={button} disabled={busy || !['NOT_STARTED', 'SERVICE_SCHEDULED', 'CHECKED_IN'].includes(execution.executionStatus)} onClick={() => act('/execution', { action: 'START' })}>Start service</button>
        </div>}
        {policy ? <p className="text-sm">Required milestones {(policy.requiredMilestones || []).join(', ') || 'None specified'}. {policy.evidenceRequired && 'Supporting evidence required.'} {policy.customerAcknowledgementRequired && 'Customer acknowledgement required.'}</p>
          : <p className="text-sm text-amber-800">Core must attach an approved completion policy before this service can be verified.</p>}
        {!admin && <>
          <label className="block text-sm">Milestone identifier<input className={field} value={milestone} onChange={event => setMilestone(event.target.value)} /></label>
          <button className={button} disabled={busy || !milestone} onClick={() => act('/execution', { action: 'MILESTONE', milestone: { key: milestone, detail: notes } })}>Record milestone</button>
          {policy?.allowMilestoneCorrection && <button className={button} disabled={busy || !milestone || !notes} onClick={() => act('/execution', { action: 'CORRECT_MILESTONE', milestone: { key: milestone, detail: notes }, reason: notes })}>Correct milestone with review reason</button>}
          {(policy?.requiredChecklist || []).map(item => <label className="flex gap-2 text-sm" key={item}><input type="checkbox" checked={checked.includes(item)} onChange={event => setChecked(current => event.target.checked ? [...current, item] : current.filter(value => value !== item))} />{item}</label>)}
          <button className={button} disabled={busy || !['SERVICE_STARTED', 'COMPLETION_SUBMITTED'].includes(execution.executionStatus)} onClick={() => act('/execution', { action: 'SUBMIT_COMPLETION', files: evidenceFor('COMPLETION_EVIDENCE'), checklist: checked.map(item => ({ item, checked: true })) })}>Submit completion evidence</button>
          <button className={button} disabled={busy || !notes} onClick={() => act('/failure', { reason: notes })}>Report inability to fulfil service</button>
        </>}
        {admin && can('operations.manage') && <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy} onClick={() => act('/completion-policy', { reason: notes })}>Attach approved category policy</button>
          <button className={button} disabled={busy || !notes} onClick={() => act('/validate', { approved: true })}>Verify completion</button>
          <button className={button} disabled={busy || !notes} onClick={() => act('/failure', { reason: notes })}>Record vendor failure for replacement review</button>
          <button className={button} disabled={busy || !notes} onClick={() => act('/validate', { approved: false })}>Request further evidence</button>
        </div>}
        {execution.completionEvidence?.map((entry, index) => <div className="border-t pt-2 text-sm" key={index}><p>{entry.notes}</p>{entry.files?.map((file, fileIndex) => <button className="block underline" key={fileIndex} onClick={() => openEvidence(file)}>Open private evidence {fileIndex + 1}</button>)}</div>)}
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-bold">Private evidence</h2>
        <select aria-label="Evidence purpose" className={field} value={purpose} onChange={event => setPurpose(event.target.value)}>
          <option value="COMPLETION_EVIDENCE">Completion evidence</option><option value="CASE_EVIDENCE">Case evidence</option>{admin && <option value="FINANCE_EVIDENCE">Finance reconciliation evidence</option>}
        </select>
        <label className="flex items-start gap-2 text-sm min-h-11"><input type="checkbox" checked={uploadRights} onChange={event => setUploadRights(event.target.checked)} disabled={busy} />I am authorized to share this private evidence with the booking reviewers.</label>
        <label className="block text-sm">Upload a file you are authorized to share with the booking reviewers<input className="block mt-2" type="file" accept="image/*,video/mp4,application/pdf" disabled={busy || !eventId || !uploadRights} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        {files.map(file => <p className="text-sm" key={file.assetId}>{file.note} · ready to attach</p>)}
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-bold">Protection cases</h2>
        <button className={button} disabled={busy || !notes} onClick={() => act('/cases', { description: notes, evidence: evidenceFor('CASE_EVIDENCE') })}>Report an issue</button>
        {cases.map(item => <article className="rounded-lg border p-3 space-y-2" key={item.id}>
          <p className="font-bold">{label(item.status)}</p><p className="text-sm">{item.description}</p>
          {(item.evidence || []).flatMap(entry => entry.files || []).map((file, index) => <button className={button} key={index} onClick={() => openEvidence(file)}>Open case evidence {index + 1}</button>)}
          {item.response && <p className="text-sm">Vendor response · {item.response.notes}</p>}
          {item.proposal && <p className="text-sm">Proposed outcome · {label(item.proposal.decision)} · {item.proposal.notes}</p>}
          <button className={button} disabled={busy || !notes} onClick={() => act(`/cases/${item.id}`, { action: admin ? 'EVIDENCE' : 'RESPOND', evidence: evidenceFor('CASE_EVIDENCE') })}>Add {admin ? 'review evidence' : 'vendor response'}</button>
          {admin && can('operations.manage') && <>
            <button className={button} disabled={busy || !notes} onClick={() => act(`/cases/${item.id}`, { action: 'ASSIGN', assignedTo: auth.admin.id || auth.admin._id })}>Assign review to me</button>
            <select className={field} value={decision} onChange={event => setDecision(event.target.value)}>{['SERVICE_ACCEPTED', 'VENDOR_SETTLEMENT', 'PARTIAL_SETTLEMENT', 'REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'OTHER_REMEDY'].map(value => <option key={value}>{value}</option>)}</select>
            <input className={field} type="number" min="0" step="0.01" placeholder="Proposed refund or settlement amount" value={amount} onChange={event => setAmount(event.target.value)} />
            {['PROPOSE', 'RESOLVE', 'REQUEST_INFORMATION', 'ESCALATE', 'REOPEN'].map(action => <button className={button} key={action} disabled={busy || !notes} onClick={() => act(`/cases/${item.id}`, { action, decision, refundAmount: decision.includes('REFUND') ? Number(amount || 0) : 0, settlementAmount: decision.includes('SETTLEMENT') ? Number(amount || 0) : 0 })}>{label(action)}</button>)}
          </>}
        </article>)}
      </div>
      {admin && data.finance && <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-bold">Finance processing</h2><p className="text-sm">Verified collections ₹{data.finance.verifiedCollections} · Confirmed refunds ₹{data.finance.confirmedRefunds} · Confirmed releases ₹{data.finance.confirmedSettlements} · Remaining verified funds ₹{data.finance.availableVerifiedFunds}</p>
        <select className={field} value={kind} onChange={event => setKind(event.target.value)}><option>SETTLEMENT</option><option>REFUND</option></select>
        <input className={field} placeholder="Requested amount" type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} />
        <input className={field} placeholder="Bank or provider reference" value={reference} onChange={event => setReference(event.target.value)} />
        <button className={button} disabled={busy || !notes || !amount} onClick={() => act('/finance', { kind, amount: Number(amount), method: 'MANUAL', reason: notes })}>Request manual finance review</button>
        {kind === 'REFUND' && <button className={button} disabled={busy || !notes || !amount} onClick={() => act('/finance', { kind, amount: Number(amount), method: 'RAZORPAY', reason: notes })}>Request provider refund</button>}
        {data.finance.operations.map(op => <article className="rounded-lg border p-3 space-y-2" key={op.operationId}><p>{op.kind} ₹{op.amount} · {label(op.status)} · {op.method}</p>
          {(op.evidence || []).map((file, index) => <button className={button} key={index} onClick={() => openEvidence(file)}>Open finance evidence {index + 1}</button>)}
          {financeWorkflowActions(op).map(action => <button className={button} key={action} disabled={busy} onClick={() => act(`/finance/${op.operationId}`, { action, reference, evidence: evidenceFor('FINANCE_EVIDENCE'), reason: notes })}>{label(action)}</button>)}
        </article>)}
      </div>}
      {eventId && (!admin || can('operations.read')) && <EventCollaboration admin={admin} eventId={eventId} bookingId={selected} />}
    </>}
  </section>;
}
