import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';
import { ProposalDiscussion } from '../ProposalCollaboration.jsx';
import { PageSkeleton, useLoad } from './customerUi.jsx';
import { errorText } from './customerApi.js';
import { formatINR } from './format.js';
import { proposalLink } from './transactionState.js';

export default function CustomerProposals() {
  const [params] = useSearchParams();
  const eventId = params.get('event') || '';
  return <ProposalLibrary key={eventId} eventId={eventId} selected={params.get('proposal')} />;
}
function ProposalLibrary({ eventId, selected }) {
  const { data, error, loading, reload } = useLoad(() => externalApi.call(`/customer/proposals${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`), [eventId]);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  async function act(work, refresh = true) {
    if (busy) return;
    setBusy(true); setActionError('');
    try { await work(); if (refresh) reload(); } catch (err) { setActionError(errorText(err)); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (data && selected) document.getElementById(`proposal-${selected}`)?.focus(); }, [data, selected]);
  if (loading && !data) return <PageSkeleton title="My proposals" count={2} type="cards" />;
  const rows = (data?.proposals || []).filter(row => !eventId || String(row.event) === eventId);
  return <div className="customer-transactions max-w-3xl mx-auto space-y-4">
    {eventId && <Link className="customer-secondary-action" to={`/customer/events/${eventId}/quotes`}>Back to event offers</Link>}
    <h1 className="text-xl font-extrabold">{eventId ? 'Proposals for this event' : 'My proposals'}</h1>
    <p className="text-sm">Review the exact version before responding. Approval does not confirm a booking or charge a payment.</p>
    {error && <div role="alert" className="customer-home-panel">Proposals could not be refreshed. {errorText(error)} <button className="customer-secondary-action" onClick={reload}>Try again</button></div>}
    {actionError && <p role="alert" className="text-red-600">{actionError}</p>}
    {!error && !rows.length && <p>No approved proposals have been sent{eventId ? ' for this event' : ''} yet.</p>}
    {!error && selected && !rows.some(row => row._id === selected) && <p role="status">This proposal version is unavailable here. Open an available version below or ask for a revised proposal.</p>}
    {rows.map(p => <ProposalVersion key={`${p._id}-${p.pdfHash}-${p.snapshotHash}`} proposal={p} latest={Math.max(...rows.filter(row => String(row.event) === String(p.event)).map(row => row.version))} busy={busy || loading || Boolean(error)} act={act} />)}
  </div>;
}
function ProposalVersion({ proposal: p, latest, busy, act }) {
  const [message, setMessage] = useState(''), [reviewed, setReviewed] = useState(false);
  const superseded = p.version < latest;
  async function download() {
    const response = await externalApi.raw(`/customer/proposals/${p._id}/pdf`), blob = await response.blob(), url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `STARVNT-v${p.version}.pdf`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <article id={`proposal-${p._id}`} tabIndex={-1} className="customer-home-panel space-y-3 scroll-mt-4">
    <h2 className="text-lg font-bold">{p.manifest?.title} · Version {p.version}</h2>
    <p>{p.manifest?.eventDate} · {p.manifest?.city} · {formatINR(p.totalAmount)}</p>
    <p className="text-xs break-all">Proposal reference: {p._id} · {p.pdfHash ? 'PDF available for this version' : 'PDF unavailable'}</p>
    <Link className="customer-secondary-action" to={`/customer/events/${p.event}`}>Open linked event</Link>
    {superseded && <p role="status">A newer sent version exists. Review version {latest} before deciding.</p>}
    {(p.lines || []).map((line, index) => <p key={index}>{line.name} · {line.quantity} × {formatINR(line.customerUnitPrice)}<br />{line.description}</p>)}
    {(p.sections || []).map((section, index) => <div key={index}><h3 className="font-bold">{section.title}</h3><p className="whitespace-pre-wrap">{section.body}</p></div>)}
    <p className="whitespace-pre-wrap">{p.terms}</p><p>Exclusions: {p.exclusions || 'None specified'}</p>
    {(p.excludedRequirements || []).map((item, index) => <p key={index}>Excluded: {p.manifest?.requirements?.find(row => row._id === item.requirement)?.category} · {item.reason}</p>)}
    {(p.payments || []).map((row, index) => <p key={index}>{row.label}: {formatINR(row.amount)} due {row.due}</p>)}
    <button className="customer-secondary-action" disabled={busy || !p.pdfHash} onClick={() => act(download, false)}>Download this version's PDF</button>
    {p.response?.decision ? <p>Your response: {p.response.decision} · {p.response.message}</p> : superseded ? <Link className="customer-secondary-action" to={proposalLink(p.event)}>Open current event proposals</Link> : <>
      <label className="block text-sm">Questions / requested changes / reason<textarea className="block w-full rounded-lg border p-3 mt-1" maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} /></label>
      <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed this version's PDF, scope, exclusions and payment terms.</label>
      <div className="flex flex-wrap gap-3">{[['APPROVED', 'Approve this version'], ['CHANGES_REQUESTED', 'Request changes / ask a question'], ['DECLINED', 'Decline']].map(([decision, label]) => <button key={decision} className="customer-secondary-action" disabled={busy || !p.pdfHash || !p.snapshotHash || (decision === 'APPROVED' ? !reviewed : !message.trim())} onClick={() => act(() => externalApi.call(`/customer/proposals/${p._id}/response`, { method: 'POST', body: { decision, message, snapshotHash: p.snapshotHash, pdfHash: p.pdfHash } }))}>{label}</button>)}</div>
    </>}
    <ProposalDiscussion key={p._id} proposal={p} mode="CUSTOMER" />
  </article>;
}
