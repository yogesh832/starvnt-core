import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';
import { useLoad } from './customerUi.jsx';
import './proposal.css';

const labels = { portfolio: 'Actual Approved Portfolio', vendor: 'Vendor-Submitted Reference', customer: 'Customer-Provided Reference', ai: 'AI-Generated Concept', reference: 'Illustrative Reference' };
const human = value => String(value || '').replaceAll('_', ' ');
const money = amount => `₹${Number(amount).toLocaleString('en-IN')}`;

export function ProposalCard({ eventId }) {
  return <Link to={`/customer/events/${eventId}/proposal`} className="proposal-entry">
    <span className="proposal-eyebrow">POWERED BY AURA+ · PROPOSAL STUDIO</span>
    <span className="proposal-entry-title">My Event Proposal</span>
    <span>Your vision, the planned experience, and every detail to review.</span>
    <strong>Explore your proposal →</strong>
  </Link>;
}

export default function ProposalPage() {
  const { id } = useParams();
  return <ProposalContent key={id} eventId={id} />;
}

function ProposalContent({ eventId }) {
  const path = `/customer/events/${eventId}/proposal`;
  const r = useLoad(() => externalApi.call(path), [eventId]);
  const [selected, setSelected] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [change, setChange] = useState('');
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (r.loading && !r.data) return <div className="proposal-studio" role="status">Opening your event proposal…</div>;
  if (r.error) return <div className="proposal-studio"><p role="alert">Your proposal could not be loaded.</p><button onClick={r.reload}>Try again</button></div>;
  const data = r.data;
  const latest = data.versions[0];
  const version = data.versions.find(v => v.id === selected) || latest;
  const snapshot = version?.snapshot;
  const isLatest = version?.id === latest?.id;
  const canDecide = isLatest && version?.current && data.readiness.ready && version?.status === 'SENT_TO_CUSTOMER';
  async function run(fn) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message || 'Please try again.'); } finally { setBusy(false); }
  }
  async function decide(decision) {
    await externalApi.call(`${path}/decision`, { method: 'POST', body: { revision: data.revision, versionId: version.id, decision, message: change, categories } });
    setNotice(decision === 'CHANGE_REQUESTED' ? 'Your request is recorded. STARVNT will review the affected scope and approvals.' : 'Your decision is recorded against this exact proposal version.');
    r.reload();
  }
  async function download() {
    const response = await externalApi.raw(`${path}/versions/${version.id}/pdf`);
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = url; a.download = `STARVNT-proposal-v${version.number}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <article className="proposal-studio">
    <Link to={`/customer/events/${eventId}`} className="proposal-back">← Your event</Link>
    <header className="proposal-hero">
      <p className="proposal-eyebrow">STARVNT PROPOSAL STUDIO · POWERED BY AURA+</p>
      <h1>My Event Proposal</h1>
      <p className="proposal-tagline">From your vision to a beautifully planned celebration.</p>
      <div className="proposal-event-line">{data.event.title || data.event.eventType} <span>·</span> {data.event.eventDate || 'Date to be confirmed'} <span>·</span> {data.event.city || 'Location to be confirmed'}</div>
    </header>
    {error && <p role="alert" className="proposal-alert">{error}</p>}
    {notice && <p role="status" className="proposal-notice">{notice}</p>}
    {!data.readiness.ready && <section className="proposal-panel proposal-pending"><p className="proposal-eyebrow">BEFORE YOUR FINAL PROPOSAL</p><h2>A few details are still coming together</h2><ul>{data.readiness.blockers.map(b => <li key={b}>{b}</li>)}</ul><div className="proposal-actions"><Link to={`/customer/events/${eventId}/requirements`}>Review event requirements</Link><Link to={`/customer/aura?event=${eventId}`}>Continue with Aura+</Link><button disabled={r.loading} onClick={r.reload}>Refresh status</button></div></section>}
    {!version ? <>
      <section className="proposal-panel"><p className="proposal-status">{data.preview.label}</p><h2>{data.preview.theme}</h2><p>{data.preview.introduction || 'Your proposal will bring your confirmed event brief, approved services, visuals and customer pricing together here.'}</p>
        <div className="proposal-facts"><div><small>Guests</small><strong>{data.event.guestCount || 'To be confirmed'}</strong></div><div><small>Venue</small><strong>{data.event.location?.venueName || 'To be confirmed'}</strong></div><div><small>Agreements approved</small><strong>{data.readiness.approvedAgreements}</strong></div></div>
      </section>
      <section className="proposal-panel"><h2>Your event brief</h2><div className="proposal-services">{data.requirements.map(q => <div key={q.id}><h3>{q.category}</h3><p>{q.providedValue || q.specialRequirements || 'Details will follow your confirmed requirements.'}</p><small>{human(q.status)}</small></div>)}</div>{!data.requirements.length && <p>Tell Aura+ which services you need to begin your event brief.</p>}</section>
    </> : <>
      <section className="proposal-toolbar"><div><span className="proposal-status">VERSION {version.number} · {human(version.status)}</span><p>Issued {new Date(version.createdAt).toLocaleDateString('en-IN')} · Valid until {new Date(version.expiresAt).toLocaleDateString('en-IN')}</p></div><button disabled={busy} onClick={() => run(download)}>Download PDF ↓</button></section>
      {!isLatest && <p className="proposal-alert">You are viewing a previous version. Only the latest current version can receive a decision.</p>}
      <section className="proposal-panel"><p className="proposal-eyebrow">YOUR EVENT VISION</p><h2>{snapshot.theme}</h2><p>{snapshot.introduction}</p><div className="proposal-gallery">{snapshot.assets.map((a, i) => <figure key={i}><img src={a.url} alt={a.caption} loading="lazy" /><figcaption><span>{labels[a.source]}</span>{a.caption}</figcaption></figure>)}</div><p className="proposal-fine">Concepts and references illustrate a direction. The approved written scope defines deliverables.</p></section>
      <section className="proposal-panel"><h2>The planned experience</h2><div className="proposal-services">{snapshot.allocations.map((a, i) => <div key={i}><span className="proposal-eyebrow">{String(i + 1).padStart(2, '0')} / {a.category}</span><h3>{a.scope}</h3><p>{a.deliverables}</p><small>Quantity {a.quantity} · {money(a.amount)}</small></div>)}</div></section>
      <section className="proposal-panel"><h2>Your investment</h2><div className="proposal-budget">{snapshot.allocations.map((a, i) => <div key={i}><span>{a.category}</span><strong>{money(a.amount)}</strong></div>)}<div className="proposal-total"><span>Total approved package</span><strong>{money(snapshot.total)}</strong></div></div><h3>Payment schedule</h3><p className="proposal-preserve">{snapshot.paymentTerms}</p><h3>Exclusions</h3><p className="proposal-preserve">{snapshot.exclusions}</p></section>
      <section className="proposal-panel"><h2>The journey from here</h2><p className="proposal-preserve">{snapshot.roadmap || 'STARVNT will coordinate the execution roadmap through your event workspace.'}</p><p className="proposal-fine">Proposal approval records your agreement with this presentation. Booking confirmation and verified payments follow the STARVNT Core booking process.</p></section>
      {isLatest && <section className="proposal-panel"><p className="proposal-eyebrow">AURA+ PROPOSAL GUIDE</p><h2>Every detail, explained</h2><form onSubmit={e => { e.preventDefault(); run(async () => { const result = await externalApi.call(`${path}/ask`, { method: 'POST', body: { question } }); setAnswer(result); }); }}><label htmlFor="proposal-question">Ask about inclusions, exclusions, pricing or payment terms</label><div className="proposal-actions"><input id="proposal-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} required placeholder="What is included in my package?" /><button disabled={busy}>Ask Aura+</button></div></form>{answer && <div className="proposal-answer" role="status"><small>{answer.version ? `FROM APPROVED VERSION ${answer.version}` : 'PROPOSAL STATUS'}</small><p className="proposal-preserve">{answer.answer}</p></div>}</section>}
      {canDecide && <section className="proposal-panel"><h2>Make it yours</h2><label htmlFor="proposal-change">Request changes to this version</label><textarea id="proposal-change" value={change} onChange={e => setChange(e.target.value)} maxLength={3000} placeholder="Tell us what you would like to refine…" /><fieldset><legend>Affected services</legend><div className="proposal-actions">{snapshot.allocations.map(a => <label key={a.category}><input type="checkbox" checked={categories.includes(a.category)} onChange={e => setCategories(e.target.checked ? [...categories, a.category] : categories.filter(c => c !== a.category))} /> {a.category}</label>)}</div></fieldset><div className="proposal-actions"><button disabled={busy || !change.trim()} onClick={() => run(() => decide('CHANGE_REQUESTED'))}>Request changes</button><button className="proposal-primary" disabled={busy} onClick={() => { if (window.confirm(`Approve proposal version ${version.number}? Booking and payment remain separate.`)) run(() => decide('CUSTOMER_APPROVED')); }}>Approve version {version.number}</button><button disabled={busy} onClick={() => { if (window.confirm(`Decline proposal version ${version.number}?`)) run(() => decide('CUSTOMER_DECLINED')); }}>Decline</button></div></section>}
    </>}
    {!!data.versions.length && <section className="proposal-panel"><h2>Proposal history</h2><div className="proposal-history">{data.versions.map(v => <button aria-pressed={v.id === version?.id} key={v.id} onClick={() => { setSelected(v.id); setAnswer(null); }}><strong>Version {v.number}</strong><span>{human(v.status)}</span><small>{new Date(v.createdAt).toLocaleDateString('en-IN')}</small></button>)}</div></section>}
    {!!data.changes.length && <section className="proposal-panel"><h2>Your change requests</h2>{data.changes.map(c => <div className="proposal-answer" key={c.id}><small>{human(c.status)}</small><p>{c.message}</p></div>)}</section>}
  </article>;
}
