import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';
import { errorText } from './customerApi.js';
import { formatINR } from './format.js';
import { BackLink, useLoad } from './customerUi.jsx';
import useCustomerRefresh from './useCustomerRefresh.js';
import ConfirmActionButton from '../../components/ConfirmActionButton.jsx';

const button = 'min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
const field = 'block w-full min-h-11 rounded-xl border bg-white p-3';
const human = value => String(value || 'Awaiting update').replaceAll('_', ' ').toLowerCase();

export function PrivateEvidenceLink({ assetId, label = 'Evidence file' }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div>
    {url ? <a className="inline-flex min-h-11 items-center text-primary underline" href={url} target="_blank" rel="noreferrer">Open {label}</a> : <button className="min-h-11 text-primary underline" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { const response = await externalApi.raw(`/customer/event-media/${assetId}/file`); setUrl(URL.createObjectURL(await response.blob())); }
      catch (err) { setError(errorText(err)); }
      finally { setBusy(false); }
    }}>{busy ? 'Loading…' : `Load ${label}`}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function IssueForm({ booking, caseId = null, onSaved }) {
  const [description, setDescription] = useState(''), [issueType, setIssueType] = useState('SERVICE_QUALITY'), [file, setFile] = useState(null);
  const [rights, setRights] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [intentKey, setIntentKey] = useState(() => crypto.randomUUID()), [assetId, setAssetId] = useState('');
  const changed = () => { setIntentKey(crypto.randomUUID()); setAssetId(''); };
  return <form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      let evidenceId = assetId;
      if (file && !evidenceId) {
        const form = new FormData();
        form.append('file', file); form.append('purpose', 'CASE_EVIDENCE'); form.append('bookingId', booking.id);
        form.append('rightsConfirmed', String(rights)); form.append('idempotencyKey', `${intentKey}-file`);
        const response = await externalApi.call(`/customer/events/${booking.eventId}/media`, { method: 'POST', body: form });
        evidenceId = response.asset.id; setAssetId(evidenceId);
      }
      const body = { eventId: booking.eventId, expectedVersion: booking.version, idempotencyKey: intentKey, evidence: evidenceId ? [{ assetId: evidenceId, note: description }] : [] };
      await externalApi.call(`/customer/bookings/${booking.id}/issues${caseId ? `/${caseId}/evidence` : ''}`, {
        method: 'POST', body: caseId ? { ...body, notes: description } : { ...body, issueType, description },
      });
      setDescription(''); setFile(null); setAssetId(''); setRights(false); changed(); onSaved();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-bold">{caseId ? 'Send more information' : 'Report an issue'}</h2>
    {!caseId && <label className="block">What happened?<select className={field} disabled={busy} value={issueType} onChange={e => { setIssueType(e.target.value); changed(); }}>{[['SERVICE_QUALITY', 'Service quality'], ['SERVICE_DELAY', 'Delay or arrival'], ['SERVICE_FAILURE', 'Service unavailable'], ['BILLING', 'Billing or payment'], ['OTHER', 'Something else']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    <label className="block">{caseId ? 'Your response' : 'Describe the issue'}<textarea className={field} required maxLength={4000} value={description} disabled={busy} onChange={e => { setDescription(e.target.value); changed(); }} /></label>
    <label className="block">Supporting file (optional)<input className="block min-h-11 w-full py-2" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); changed(); }} /></label>
    <p className="text-xs text-muted">Photo, MP4 video or PDF, up to 20 MB. Evidence is private to the authorized service review.</p>
    {file && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />I have permission to provide this file for review</label>}
    <p className="text-sm text-muted">STARVNT will review your report and any supporting information.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button className={button} disabled={busy || !description.trim() || (file && (!rights || file.size > 20 * 1024 * 1024))}>{busy ? 'Sending…' : caseId ? 'Send information' : 'Submit issue for review'}</button>
  </form>;
}

function ReplacementOptions({ booking, onChanged }) {
  const source = useLoad(() => externalApi.call(`/customer/bookings/${booking.id}/replacements?eventId=${booking.eventId}`), [booking.id]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  return <section className="space-y-3 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-bold">Review replacement options</h2>
    {source.loading && !source.data && <p role="status">Checking your saved service requirements…</p>}
    {source.error && <p role="alert">{errorText(source.error)} <button onClick={source.reload}>Retry</button></p>}
    {source.data?.matchSummary?.missing?.length > 0 && <p>STARVNT needs these saved service details before matching alternatives · {source.data.matchSummary.missing.map(human).join(', ')}. <Link className="text-primary underline" to={`/customer/events/${booking.eventId}/circle?booking=${booking.id}`}>Contact your event team</Link></p>}
    {notice && <p role="status">{notice} <Link className="text-primary underline" to={`/customer/events/${booking.eventId}/quotes`}>Review quotes</Link></p>}
    {error && <p role="alert">{error}</p>}
    {(source.data?.alternativeCandidates || []).map(option => <article key={option.serviceId} className="space-y-2 rounded-xl border p-4"><h3 className="font-bold">{option.businessName}</h3><p>{option.serviceName}</p><p className="text-sm">Calculated estimate · {formatINR(option.validatedTotalCost)}</p><p className="text-xs text-muted">Travel · {formatINR(option.cost?.travelCost)}. The vendor will confirm the full price and any logistics charges in a quote.</p><ConfirmActionButton className={button} disabled={Boolean(busy)} confirmation="Request a confirmed quote for this replacement using your saved service requirements?" onConfirm={async () => {
      setBusy(option.serviceId); setError('');
      try { await externalApi.call(`/customer/bookings/${booking.id}/replacements/select`, { method: 'POST', body: { eventId: booking.eventId, vendorServiceId: option.serviceId, idempotencyKey: crypto.randomUUID(), expectedVersion: booking.version } }); setNotice('Your replacement quote request is saved. Review the confirmed quote before booking.'); onChanged(); }
      catch (err) { setError(errorText(err)); }
      finally { setBusy(''); }
    }}>Request confirmed quote</ConfirmActionButton></article>)}
    {source.data && !source.loading && !source.data.matchSummary?.missing?.length && !source.data.alternativeCandidates?.length && <p>No eligible alternatives are confirmed for the saved requirements yet.</p>}
  </section>;
}

export default function BookingWorkflowPage() {
  const { id: eventId, bookingId } = useParams();
  const source = useLoad(() => externalApi.call(`/customer/bookings/${bookingId}/workflow?eventId=${eventId}`), [eventId, bookingId]);
  useCustomerRefresh(source.reload, bookingId);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [ackKey] = useState(() => crypto.randomUUID());
  if (!source.data || [401, 403, 404].includes(source.error?.status)) return <div role={source.error ? 'alert' : 'status'}>{source.error ? errorText(source.error) : 'Loading your booked service…'}{source.error && <button onClick={source.reload}>Retry</button>}</div>;
  const { booking } = source.data;
  return <div className="mx-auto max-w-3xl space-y-4">
    <BackLink to={`/customer/events/${eventId}/bookings`}>Bookings & payments</BackLink>
    <h1 className="text-2xl font-extrabold">{booking.serviceName}</h1><p>{booking.vendorName}</p>
    {source.error && <p role="alert">Updates are unavailable. <button onClick={source.reload}>Refresh booking</button></p>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    <dl className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2">{[['Booking', human(booking.bookingStatus)], ['Payment', human(booking.paymentStatus)], ['Service progress', human(booking.executionStatus)], ['Customer acknowledgement', booking.execution.customerAcknowledgement?.at ? 'Received' : 'Awaiting acknowledgement'], ['Completion review', booking.executionStatus === 'COMPLETION_VERIFIED' ? 'Verified by STARVNT' : 'Awaiting STARVNT review'], ['Protection', human(booking.protectionStatus)]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
    <section className="space-y-2 rounded-2xl border bg-white p-5"><h2 className="font-bold">Booked price & payments</h2><p>Final booked amount · {formatINR(booking.pricing.finalPayable)}</p><p>Verified payment · {formatINR(booking.payment.verifiedAmount)}</p><p>Recorded balance · {booking.payment.balanceAmount == null ? 'Awaiting confirmation' : formatINR(booking.payment.balanceAmount)}</p><p className="text-sm text-muted">Base · {formatINR(booking.pricing.base)} · Travel · {formatINR(booking.pricing.travel)} · Equipment · {formatINR(booking.pricing.equipment)} · Setup · {formatINR(booking.pricing.setup)} · Other · {formatINR(booking.pricing.additional)}</p></section>
    <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">Execution & completion evidence</h2>
      <p>Check-in · {booking.execution.checkedInAt ? new Date(booking.execution.checkedInAt).toLocaleString() : 'No recorded check-in'}</p><p>Started · {booking.execution.startedAt ? new Date(booking.execution.startedAt).toLocaleString() : 'No recorded start'}</p>
      {booking.execution.milestones.map(m => <p key={m.key} className="text-sm">{human(m.key)} · {m.detail} · {new Date(m.at).toLocaleString()}</p>)}
      {booking.completionEvidence.map((e, index) => <div key={index} className="space-y-2 border-t pt-3"><p>{e.notes}</p>{e.files.map((file, i) => file.assetId ? <PrivateEvidenceLink key={i} assetId={file.assetId} label={file.note || `Evidence ${i + 1}`} /> : file.url ? <a key={i} className="block text-primary underline" href={file.url} target="_blank" rel="noreferrer">Existing evidence file</a> : null)}<ul>{e.checklist.map((item, i) => <li key={i}>{item.checked ? '✓' : '○'} {item.item}</li>)}</ul></div>)}
      {booking.execution.reviewNotes && <p className="text-sm">Review update · {booking.execution.reviewNotes}</p>}
      {!booking.completionPolicyAvailable && <p className="text-sm">STARVNT is reviewing the service completion requirements.</p>}
      {booking.allowedActions.acknowledge && <ConfirmActionButton className={button} disabled={busy} confirmation="Record that you have reviewed the evidence and received this service. STARVNT will separately review completion under the service policy." onConfirm={async () => {
        setBusy(true); setError('');
        try { await externalApi.call(`/customer/bookings/${booking.id}/acknowledge-completion`, { method: 'POST', body: { eventId, idempotencyKey: ackKey, expectedVersion: booking.version } }); setNotice('Your acknowledgement has been recorded.'); source.reload(); }
        catch (err) { setError(errorText(err)); }
        finally { setBusy(false); }
      }}>Acknowledge received service</ConfirmActionButton>}
    </section>
    <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">Refund progress</h2><p>Confirmed refunded · {formatINR(booking.refund.confirmedAmount)}</p><p>Remaining paid amount · {formatINR(booking.refund.remainingPaidAmount)}</p>{booking.refund.decisions.map(d => <p key={d.caseId}>Resolution decision · {human(d.decision)} · {formatINR(d.amount)}</p>)}{booking.refund.operations.map(op => <p key={op.id}>{human(op.status)} · {formatINR(op.amount)}{op.failureReason ? ` · ${op.failureReason}` : ''}</p>)}{!booking.refund.operations.length && <p className="text-sm text-muted">No refund transfer is recorded.</p>}</section>
    {booking.protection.cases.map(c => <section key={c.id} className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">Your issue · {human(c.status)}</h2><p>{c.description}</p>{c.requests.map((item, index) => <p key={index} className="rounded-xl bg-amber-50 p-3">More information requested · {item.message}</p>)}{c.response && <p>Vendor response · {c.response.notes}</p>}{c.proposal && <p>Proposed resolution · {human(c.proposal.decision)} · {c.proposal.notes}</p>}{c.resolution && <p>Confirmed resolution · {human(c.resolution.decision)} · {c.resolution.notes}</p>}{c.evidence.flatMap(e => e.files).map((file, index) => file.assetId && <PrivateEvidenceLink key={index} assetId={file.assetId} />)}{c.status !== 'RESOLVED' && <IssueForm booking={booking} caseId={c.id} onSaved={source.reload} />}</section>)}
    <IssueForm booking={booking} onSaved={source.reload} />
    {booking.allowedActions.reviewReplacement && <ReplacementOptions booking={booking} onChanged={source.reload} />}
    <Link className="customer-secondary-action" to={`/customer/aura?event=${eventId}&message=${encodeURIComponent(`Help me report an issue with ${booking.serviceName}`)}`}>Ask Aura+ about this service</Link>
  </div>;
}
