import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, Empty, PageSkeleton, Tabs, useLoad } from './customerUi.jsx';
import { formatDate, formatINR } from './format.js';

const WINE = '#5B1F2E';
const STATUS_LABEL = {
  SENT_TO_CUSTOMER: 'Awaiting your review',
  CUSTOMER_VIEWED: 'Awaiting your decision',
  CHANGE_REQUESTED: 'Changes requested',
  CUSTOMER_APPROVED: 'Approved by you',
  CUSTOMER_DECLINED: 'Declined',
  SUPERSEDED: 'Replaced by a newer version',
};

function StatusChip({ status, kind }) {
  if (kind === 'PRELIMINARY') return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">Preliminary concept</span>;
  const tone = status === 'CUSTOMER_APPROVED' ? 'bg-emerald-50 text-emerald-700' : status === 'CUSTOMER_DECLINED' || status === 'SUPERSEDED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{STATUS_LABEL[status] || status}</span>;
}

async function openPdf(proposalId, version, download, filename) {
  const blob = await customerApi.proposalPdf(proposalId, version);
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Loads a private image (auth header) as an object URL. */
export function AuthImage({ load, alt, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null, cancelled = false;
    load().then((blob) => { if (!cancelled) { url = URL.createObjectURL(blob); setSrc(url); } }).catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return src ? <img src={src} alt={alt} className={className} /> : <div className={`${className} animate-pulse bg-[#F3ECE1]`} />;
}

/** Approved images with their mandatory source label. */
function Gallery({ proposalId, version, items }) {
  if (!items?.length) return null;
  return (
    <div className={`mt-3 grid gap-3 ${items.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {items.map((v) => (
        <figure key={v.assetId} className="m-0">
          <AuthImage load={() => customerApi.proposalAsset(proposalId, version, v.assetId)} alt={v.caption || v.label} className="h-48 w-full rounded-xl object-cover" />
          <figcaption className="mt-1 text-[11px] text-muted"><span className="rounded border border-[#E7DCCB] px-1.5 py-0.5 font-semibold">{v.label}</span>{v.caption ? ` ${v.caption}` : ''}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const REFERENCE_STATUS = { PENDING: 'Waiting for STARVNT review', APPROVED: 'Approved for your proposal', REJECTED: 'Not used' };

/** Customer reference images for one event. STARVNT reviews each before any proposal uses it. */
export function EventReferences({ eventId }) {
  const { data, reload } = useLoad(() => customerApi.eventReferences(eventId).catch(() => ({ references: [] })), [eventId]);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refs = data?.references || [];
  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('caption', caption);
      await customerApi.uploadReference(eventId, form);
      setFile(null); setCaption(''); e.target.reset(); reload();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 dark:bg-[#161926]">
      <div className="text-sm font-bold text-navy dark:text-white">Inspiration images</div>
      <p className="mt-0.5 text-xs text-muted">Share photos of décor, stages or styles you love. They are marked “Your reference” and used only after our team reviews them.</p>
      {refs.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {refs.map((r) => (
            <figure key={r.id} className="m-0">
              <AuthImage load={() => customerApi.referenceFile(r.id)} alt={r.caption || 'Reference image'} className="h-24 w-full rounded-xl object-cover" />
              <figcaption className="mt-1 text-[11px] text-muted">{REFERENCE_STATUS[r.status] || r.status}{r.caption ? ` · ${r.caption}` : ''}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" aria-label="Choose reference image" />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What do you like about it? (optional)" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs dark:border-gray-700 dark:bg-transparent" />
        <button type="submit" disabled={!file || busy} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Uploading…' : 'Share image'}</button>
      </form>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </section>
  );
}

/**
 * Premium proposal card. Renders nothing until a proposal is shared.
 * With `eventId` it shows only that event's proposal (event page); `preferEventId`
 * picks the matching one but falls back to the latest (Home).
 */
const PREP_STEPS = [
  ['Event details', 'Date, place, guests and services you need'],
  ['Vendors confirm', 'Each vendor approves scope and price in writing'],
  ['Pricing approved', 'STARVNT finance approves your package'],
  ['Proposal ready', 'You review, ask Aura+ and approve'],
];

/** Shown on every event until STARVNT shares a proposal for it. Never fabricates content. */
function ProposalPreparingCard({ event, eventId }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null); // 'view' | 'pdf'
  const [error, setError] = useState(null);
  const detailsDone = event && event.status !== 'draft';
  const current = detailsDone ? 1 : 0;
  const open = async (mode) => {
    setBusy(mode); setError(null);
    try {
      const p = await Promise.race([
        customerApi.proposalPreview(eventId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('This is taking longer than usual. Please try again in a minute.')), 100000)),
      ]);
      if (mode === 'pdf') await openPdf(p.proposalId, p.version, true, 'starvnt-proposal-v' + p.version + '.pdf');
      else navigate('/customer/proposals/' + p.proposalId);
    } catch (err) {
      setError({ message: errorText(err), problems: err?.data?.problems || [] });
    } finally { setBusy(null); }
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E7DCCB] bg-[#FBF6EE] shadow-sm dark:border-gray-800 dark:bg-[#161926]">
      <div className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: WINE }}>My event proposal</div>
            <h2 className="mt-1 truncate font-serif text-xl font-bold text-navy dark:text-white">{event?.title || 'Your proposal'}</h2>
            <p className="mt-1 text-xs text-muted dark:text-slate-400">
              {detailsDone
                ? 'View your preliminary proposal now. The final proposal with confirmed vendors and pricing replaces it once everything is approved.'
                : 'View a preliminary proposal from your event details. Confirm your details so STARVNT can prepare the final one with verified vendors.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => open('view')} className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: WINE }}>{busy === 'view' ? 'Preparing…' : 'View proposal'}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => open('pdf')} className="rounded-xl border border-[#E7DCCB] bg-white px-4 py-2 text-sm font-bold text-navy disabled:opacity-60">{busy === 'pdf' ? 'Preparing…' : 'PDF'}</button>
            <Link to={`/customer/aura?event=${encodeURIComponent(eventId || '')}&ask=${encodeURIComponent('When will my event proposal be ready?')}`} className="rounded-xl border border-[#E7DCCB] bg-white px-4 py-2 text-sm font-bold text-navy">Ask Aura+</Link>
          </div>
        </div>
        {busy && <p className="mt-3 text-xs font-semibold" style={{ color: WINE }}>Preparing your preliminary proposal. This takes a few seconds…</p>}
        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <p className="font-bold">{error.message}</p>
            {error.problems.length > 0 && <ul className="mt-1 list-disc pl-4">{error.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
        <ol className="mt-4 grid gap-2 sm:grid-cols-4">
          {PREP_STEPS.map(([title, sub], i) => {
            const state = i < current ? 'done' : i === current ? 'now' : 'next';
            return (
              <li key={title} className={`rounded-xl border p-3 text-xs ${state === 'now' ? 'border-[#B8925A] bg-white' : 'border-[#E7DCCB] bg-white/60'} dark:bg-white/5`}>
                <div className="flex items-center gap-2 font-bold text-navy dark:text-white">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${state === 'done' ? 'bg-emerald-600 text-white' : state === 'now' ? 'text-white' : 'bg-gray-200 text-gray-600'}`} style={state === 'now' ? { background: WINE } : undefined}>{state === 'done' ? '✓' : i + 1}</span>
                  {title}
                </div>
                <p className="mt-1 text-muted dark:text-slate-400">{sub}</p>
                {state === 'now' && <p className="mt-1 font-bold" style={{ color: WINE }}>In progress</p>}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/**
 * With `eventId`: that event's proposal, or a "being prepared" card (event page, Home).
 * Without: the latest shared proposal, or nothing.
 */
export function MyProposalCard({ eventId = null, event = null }) {
  const { data, loading } = useLoad(() => customerApi.proposals().catch(() => ({ proposals: [] })), [eventId]);
  const list = data?.proposals || [];
  const proposal = eventId ? list.find((p) => String(p.eventId) === String(eventId)) : list[0];
  if (loading && !data) return null;
  if (!proposal) return eventId ? <ProposalPreparingCard event={event} eventId={eventId} /> : null;
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E7DCCB] bg-[#FBF6EE] shadow-sm dark:border-gray-800 dark:bg-[#161926]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: WINE }}>My event proposal</div>
          <h2 className="mt-1 truncate font-serif text-xl font-bold text-navy dark:text-white">{proposal.eventTitle}</h2>
          <p className="mt-1 text-xs text-muted dark:text-slate-400">
            {proposal.proposalNumber} · Version {proposal.version}
            {proposal.eventDate ? ` · ${formatDate(proposal.eventDate)}` : ''}
            {proposal.city ? ` · ${proposal.city}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={proposal.status} kind={proposal.kind} />
            {proposal.packageTotal != null && <span className="text-sm font-extrabold text-navy dark:text-white">{formatINR(proposal.packageTotal)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/customer/proposals/${proposal.proposalId}`} className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: WINE }}>View proposal</Link>
          {proposal.hasPdf && (
            <button type="button" onClick={() => openPdf(proposal.proposalId, proposal.version, true, `${proposal.proposalNumber}-v${proposal.version}.pdf`)} className="rounded-xl border border-[#E7DCCB] bg-white px-4 py-2 text-sm font-bold text-navy">
              PDF
            </button>
          )}
          <Link to={`/customer/proposals/${proposal.proposalId}?ask=1`} className="rounded-xl border border-[#E7DCCB] bg-white px-4 py-2 text-sm font-bold text-navy">Ask Aura+</Link>
        </div>
      </div>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#161926]">
      <h2 className="font-serif text-lg font-bold" style={{ color: WINE }}>{title}</h2>
      <div className="mt-3 text-sm text-navy dark:text-slate-200">{children}</div>
    </section>
  );
}

function Overview({ s, proposalId, version }) {
  const rows = [
    ['Event', s.event.typeLabel],
    ['Date', formatDate(s.event.date) || 'To be confirmed'],
    ['Guests', s.event.guestCount ? `${s.event.guestCount} guests` : 'To be confirmed'],
    ['Location', [s.event.venueName, s.event.city].filter(Boolean).join(', ') || 'To be confirmed'],
    ...(s.event.theme ? [['Theme', s.event.theme]] : []),
    ...(s.customerProvided.length ? [['Arranged by you', s.customerProvided.map((x) => x.label).join(', ')]] : []),
  ];
  return (
    <Section title="Event overview">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
      </dl>
      <Gallery proposalId={proposalId} version={version} items={s.visuals?.cover} />
    </Section>
  );
}

function Services({ s, proposalId, version }) {
  return (
    <div className="space-y-4">
      {s.services.map((svc) => (
        <Section key={svc.category} title={svc.label}>
          {svc.summary && <p className="mb-2">{svc.summary}</p>}
          <Gallery proposalId={proposalId} version={version} items={s.visuals?.[svc.category]} />
          {svc.items.length > 0 && <ul className="list-disc space-y-1 pl-5">{svc.items.map((i) => <li key={i.name}>{i.name}{i.quantity > 1 ? ` × ${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : ''}</li>)}</ul>}
          {svc.deliverables.length > 0 && <p className="mt-3"><span className="font-bold">Deliverables:</span> {svc.deliverables.join('; ')}</p>}
          {svc.exclusions.length > 0 && <p className="mt-1 text-muted"><span className="font-bold">Not included:</span> {svc.exclusions.join('; ')}</p>}
          {!svc.confirmed && <p className="mt-2 inline-block rounded-lg border px-2 py-1 text-xs font-bold" style={{ color: WINE, borderColor: WINE }}>Vendor confirmation pending</p>}
        </Section>
      ))}
    </div>
  );
}

function Budget({ s }) {
  if (!s.budget) return <Empty title="Pricing not approved yet">The budget appears once STARVNT has approved your pricing.</Empty>;
  const b = s.budget;
  return (
    <div className="space-y-4">
      <Section title="Budget allocation">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-muted"><th className="py-2">Service</th><th>Scope</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {b.allocations.map((a) => <tr key={a.label} className="border-t border-gray-100 dark:border-gray-800"><td className="py-2 font-semibold">{a.label}</td><td className="text-muted">{a.scopeSummary}</td><td className="text-right tabular-nums">{formatINR(a.amount)}</td></tr>)}
              {b.unallocated.amount > 0 && <tr className="border-t"><td className="py-2 font-semibold">Other</td><td className="text-muted">{b.unallocated.explanation}</td><td className="text-right">{formatINR(b.unallocated.amount)}</td></tr>}
            </tbody>
            <tfoot><tr className="border-t-2" style={{ borderColor: WINE }}><td className="py-2 font-extrabold" colSpan={2}>Total package value{b.taxes.included ? ' (taxes included)' : ''}</td><td className="text-right font-extrabold tabular-nums">{formatINR(b.packageTotal)}</td></tr></tfoot>
          </table>
        </div>
      </Section>
      <Section title="Payment schedule">
        <ul className="space-y-2">
          {b.paymentSchedule.map((p) => <li key={p.label} className="flex justify-between gap-4"><span><span className="font-semibold">{p.label}</span> <span className="text-muted">· {p.dueRule}</span></span><span className="tabular-nums font-bold">{p.percent}% · {formatINR(p.amount)}</span></li>)}
        </ul>
      </Section>
    </div>
  );
}

function Terms({ s }) {
  const t = s.terms;
  return (
    <div className="space-y-4">
      {t && <Section title="Commercial terms">
        {[['Cancellation', t.cancellation], ['Postponement', t.postponement], ['Scope changes', t.scopeChange]].filter(([, v]) => v).map(([k, v]) => <p key={k} className="mb-2"><span className="font-bold">{k}:</span> {v}</p>)}
        {t.customerResponsibilities.length > 0 && <p><span className="font-bold">Your responsibilities:</span> {t.customerResponsibilities.join('; ')}</p>}
      </Section>}
      {s.exclusions.length > 0 && <Section title="Exclusions"><ul className="list-disc pl-5">{s.exclusions.map((x) => <li key={x}>{x}</li>)}</ul></Section>}
      {!t && !s.exclusions.length && <Empty title="No terms yet">Terms appear with your final approved proposal.</Empty>}
    </div>
  );
}

function Pending({ s }) {
  const pending = [...s.pending.map((p) => p.item), ...s.services.filter((x) => !x.confirmed).map((x) => `${x.label}: vendor confirmation`)];
  return (
    <Section title="Pending confirmations">
      {pending.length ? <ul className="space-y-1">{pending.map((p) => <li key={p}>○ {p}</li>)}</ul> : <p className="text-muted">Nothing pending. Everything in this proposal is confirmed.</p>}
    </Section>
  );
}

const SUGGESTED_QUESTIONS = ['What is included in my package?', 'Show my decoration details.', 'What is my approved menu?', 'What is excluded?', 'Explain the budget.', 'What is my payment schedule?', 'What confirmations are pending?'];

function AskAura({ proposalId, canChange, onDraftChange }) {
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setBusy(true); setQuestion('');
    try {
      const res = await customerApi.askProposal(proposalId, text);
      setThread((t) => [...t, { q: text, ...res }]);
    } catch (err) {
      setThread((t) => [...t, { q: text, answer: errorText(err) }]);
    } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-[#E7DCCB] bg-white p-4 dark:border-gray-800 dark:bg-[#161926]">
      <div className="flex items-center gap-2 text-sm font-extrabold text-navy dark:text-white"><Icon name="aura" size={16} /> Ask Aura+ about this proposal</div>
      <p className="mt-1 text-xs text-muted">Answers come only from your latest shared proposal.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map((q) => <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="rounded-full border border-[#E7DCCB] px-3 py-1 text-xs font-semibold text-navy hover:bg-[#FBF6EE] dark:text-slate-200">{q}</button>)}
      </div>
      <div className="mt-3 space-y-3">
        {thread.map((m, i) => (
          <div key={i} className="space-y-1 text-sm">
            <p className="font-semibold text-navy dark:text-white">You: {m.q}</p>
            <p className="rounded-xl bg-[#FBF6EE] p-3 text-navy dark:bg-white/5 dark:text-slate-200">{m.answer}</p>
            {m.suggestedChange && canChange && (
              <div className="text-xs text-muted">{m.suggestedChange.note} <button type="button" className="font-bold underline" style={{ color: WINE }} onClick={() => onDraftChange(m.suggestedChange.message)}>Prepare change request</button></div>
            )}
          </div>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent" placeholder="Ask anything about your proposal…" />
        <button type="submit" disabled={busy || !question.trim()} className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: WINE }}>{busy ? '…' : 'Ask'}</button>
      </form>
    </div>
  );
}

function ChangeForm({ proposalId, version, onDone, initial = '' }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await customerApi.requestProposalChange(proposalId, version, { message: text });
      onDone();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#161926]">
      <label className="text-sm font-bold text-navy dark:text-white" htmlFor="change-text">What would you like to change?</label>
      <textarea id="change-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-transparent" placeholder="For example: add a live fuchka counter, or change the stage colours." />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      <p className="mt-1 text-xs text-muted">Our team reviews every change with the vendors and sends you a new version.</p>
      <button type="button" disabled={busy || !text.trim()} onClick={submit} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: WINE }}>{busy ? 'Sending…' : 'Send change request'}</button>
    </div>
  );
}

export default function ProposalPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const version = params.get('v');
  const { data, error, loading, reload } = useLoad(() => customerApi.proposal(id, version), [id, version]);
  const [tab, setTab] = useState('overview');
  const [panel, setPanel] = useState(params.get('ask') ? 'ask' : null); // 'approve' | 'decline' | 'change' | 'ask'
  const [changeDraft, setChangeDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [actionError, setActionError] = useState('');

  if (loading && !data) return <PageSkeleton title="Loading your proposal…" />;
  if (error) return <Empty title="Proposal unavailable">{errorText(error)}</Empty>;
  const s = data.snapshot;
  const filename = `${data.proposalNumber}-v${data.version}.pdf`;

  const decide = async (decision, reason = '') => {
    setBusy(true); setActionError('');
    try {
      const res = await customerApi.decideProposal(id, data.version, { decision, snapshotHash: data.snapshotHash, reason });
      setMessage(decision === 'APPROVE' ? res.nextStep : 'You declined this version. Our team will be in touch.');
      setPanel(null);
      reload();
    } catch (err) { setActionError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-6">
      <BackLink to="/customer">Back to dashboard</BackLink>

      {data.kind === 'PRELIMINARY' && (
        <div className="rounded-xl px-4 py-3 text-center text-sm font-extrabold tracking-wide text-white" style={{ background: '#8C141E' }}>
          PRELIMINARY — NOT A FINAL APPROVED PROPOSAL
        </div>
      )}
      {!data.isCurrent && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are viewing an older version. <button type="button" className="font-bold underline" onClick={() => setParams({})}>Open the latest version</button>
        </div>
      )}

      <header className="rounded-2xl border border-[#E7DCCB] bg-[#FBF6EE] p-6 text-center dark:border-gray-800 dark:bg-[#161926]">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.3em]" style={{ color: WINE }}>STARVNT Proposal Studio</div>
        <h1 className="mt-2 font-serif text-2xl font-bold text-navy sm:text-3xl dark:text-white">{s.event.title || `${s.event.typeLabel} Experience`}</h1>
        <p className="mt-1 text-sm text-muted">{data.proposalNumber} · Version {data.version}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2"><StatusChip status={data.status} kind={data.kind} /></div>
        {s.budget && <div className="mx-auto mt-4 inline-block rounded-xl px-6 py-3 text-white" style={{ background: WINE }}><div className="text-[10px] uppercase tracking-widest opacity-80">{data.kind === 'FINAL' ? 'Approved package value' : 'Package value'}</div><div className="text-2xl font-extrabold">{formatINR(s.budget.packageTotal)}</div></div>}
      </header>

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'services', label: 'Services' },
        { key: 'budget', label: 'Budget' },
        { key: 'terms', label: 'Terms' },
        { key: 'pending', label: 'Pending' },
        { key: 'history', label: 'History' },
      ]} />

      {tab === 'overview' && <Overview s={s} proposalId={id} version={data.version} />}
      {tab === 'services' && <Services s={s} proposalId={id} version={data.version} />}
      {tab === 'budget' && <Budget s={s} />}
      {tab === 'terms' && <Terms s={s} />}
      {tab === 'pending' && <Pending s={s} />}
      {tab === 'history' && (
        <Section title="Proposal history">
          <ul className="space-y-2">
            {data.history.map((h) => (
              <li key={h.version} className="flex items-center justify-between gap-3">
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setParams({ v: String(h.version) })}>Version {h.version}{h.kind === 'PRELIMINARY' ? ' (preliminary)' : ''}</button>
                <StatusChip status={h.status} kind={h.kind} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {panel === 'ask' && <AskAura proposalId={id} canChange={data.isCurrent && ['SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED'].includes(data.status)} onDraftChange={(text) => { setChangeDraft(text); setPanel('change'); }} />}
      {panel === 'change' && <ChangeForm key={changeDraft} initial={changeDraft} proposalId={id} version={data.version} onDone={() => { setPanel(null); setMessage('Change request sent. You will receive a new version once it is reviewed.'); reload(); }} />}
      {panel === 'approve' && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 dark:bg-[#161926]">
          <p className="text-sm font-bold text-navy dark:text-white">Approve version {data.version} of this proposal?</p>
          <p className="mt-1 text-xs text-muted">Approving confirms you are happy with this exact version. It does not confirm your booking or take any payment. Booking is confirmed only after the booking payment is verified.</p>
          {actionError && <p className="mt-1 text-xs text-rose-600">{actionError}</p>}
          <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => decide('APPROVE')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Yes, approve version {data.version}</button><button type="button" onClick={() => setPanel(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button></div>
        </div>
      )}
      {panel === 'decline' && (
        <div className="rounded-2xl border border-rose-200 bg-white p-4 dark:bg-[#161926]">
          <p className="text-sm font-bold text-navy dark:text-white">Decline this version?</p>
          <p className="mt-1 text-xs text-muted">If you would like something different, a change request is usually better. Our team will send you a new version.</p>
          {actionError && <p className="mt-1 text-xs text-rose-600">{actionError}</p>}
          <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => decide('DECLINE')} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Decline</button><button type="button" onClick={() => setPanel('change')} className="rounded-xl border px-4 py-2 text-sm font-bold">Request changes instead</button></div>
        </div>
      )}

      <div className="z-20 rounded-2xl lg:sticky border border-gray-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur lg:bottom-4 lg:shadow-lg dark:border-gray-800 dark:bg-[#0f1220]/95">
        <div className="flex flex-wrap items-center gap-2">
          {data.hasPdf && <>
            <button type="button" onClick={() => openPdf(id, data.version, false, filename)} className="rounded-xl border px-3 py-2 text-sm font-bold"><Icon name="eye" size={14} /> View PDF</button>
            <button type="button" onClick={() => openPdf(id, data.version, true, filename)} className="rounded-xl border px-3 py-2 text-sm font-bold"><Icon name="documents" size={14} /> Download</button>
          </>}
          <button type="button" onClick={() => setPanel(panel === 'ask' ? null : 'ask')} className="rounded-xl border px-3 py-2 text-sm font-bold"><Icon name="aura" size={14} /> Ask Aura+</button>
          <div className="ml-auto flex gap-2">
            {data.isCurrent && ['SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED'].includes(data.status) && <button type="button" onClick={() => setPanel('change')} className="rounded-xl border px-3 py-2 text-sm font-bold">Request changes</button>}
            {data.canDecide && <>
              <button type="button" onClick={() => setPanel('decline')} className="rounded-xl border px-3 py-2 text-sm font-bold">Decline</button>
              <button type="button" onClick={() => setPanel('approve')} className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: WINE }}>Approve v{data.version}</button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}
