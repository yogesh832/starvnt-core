import { useState } from 'react';
import { externalApi } from '../../../lib/api.js';
import { useLoad } from '../../customer/customerUi.jsx';
import '../../customer/proposal.css';
export default function ProposalAgreements() {
  const r = useLoad(() => externalApi.call('/vendor/proposal-agreements'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState({});
  async function decide(a, decision) {
    if (busy || !window.confirm(`${decision.replaceAll('_', ' ')} this agreement for ${a.serviceName}?`)) return;
    setBusy(true); setError('');
    try { await externalApi.call(`/vendor/proposal-agreements/${a.eventId}/decision`, { method: 'POST', body: { revision: a.revision, agreementId: a.id, decision, note: notes[a.id] || '' } }); r.reload(); } catch (e) { setError(e.message || 'Please refresh and try again.'); } finally { setBusy(false); }
  }
  return <div className="proposal-studio"><header className="proposal-hero"><p className="proposal-eyebrow">STARVNT PROPOSAL STUDIO</p><h1>Vendor agreements</h1><p>Review the commitments behind a customer’s event proposal.</p></header>{error && <p role="alert" className="proposal-alert">{error}</p>}{r.error && <p role="alert">Agreements could not be loaded. <button onClick={r.reload}>Retry</button></p>}{r.loading && <p role="status">Loading agreements…</p>}{!r.loading && !r.data?.agreements.length && <section className="proposal-panel"><h2>Your agreements will appear here</h2><p>STARVNT will send the event scope and commercial terms for your review.</p></section>}{r.data?.agreements.map(a => <section className="proposal-panel" key={a.id}><span className="proposal-status">{a.status}</span><h2>{a.serviceName}</h2><p className="proposal-preserve">{a.customerScope?.scope}\n{a.customerScope?.deliverables}</p><p className="proposal-preserve">{a.terms}</p><p>Vendor quotation: ₹{Number(a.vendorCost).toLocaleString('en-IN')} · Valid until {new Date(a.expiresAt).toLocaleDateString('en-IN')}</p>{a.status === 'SENT' && new Date(a.expiresAt) > new Date() && <><label>Response note<textarea value={notes[a.id] || ''} onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))} maxLength={1000} /></label><div className="proposal-actions"><button className="proposal-primary" disabled={busy} onClick={() => decide(a, 'APPROVED')}>Approve agreement</button><button disabled={busy} onClick={() => decide(a, 'REVISION_REQUESTED')}>Request revision</button><button disabled={busy} onClick={() => decide(a, 'REJECTED')}>Reject</button></div></>}</section>)}</div>;
}
