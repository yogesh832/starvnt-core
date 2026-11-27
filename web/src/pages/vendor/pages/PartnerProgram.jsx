import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import { Page, Card } from './shared.jsx';
const button = 'min-h-11 border border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50';
const input = 'w-full min-h-11 border border-gray-200 rounded-xl bg-white text-ink px-3 py-2 mt-2';
function downloadJson(data, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default function PartnerProgram() {
  const [data, setData] = useState(null), [code, setCode] = useState('AURA6MONTHS'), [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [tab, setTab] = useState('offer'), [docKey, setDocKey] = useState('terms');
  const refresh = async () => setData(await externalApi.call('/vendor/partner-program'));
  useEffect(() => { let mounted = true; externalApi.call('/vendor/partner-program').then(d => { if (mounted) setData(d); }).catch(e => { if (mounted) setError(e.data?.message || e.message); }); return () => { mounted = false; }; }, []);
  async function act(work) { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e.data?.message || e.message); } finally { setBusy(false); } }
  const doc = data?.legal.documents[docKey];
  return <Page title="Plans & Aura+" sub="Your complimentary Aura+ offer, future plans and partner growth tools." wide>
    {error && <Card><p role="alert" className="text-red-700">{error}</p><button className={`${button} mt-3`} disabled={busy} onClick={() => act(refresh)}>Reload program</button></Card>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {!data && !error && <Card><p role="status">Loading Partner program…</p></Card>}
    {data && <fieldset disabled={busy} className="min-w-0 space-y-5" aria-label="Partner program">
      <nav className="flex flex-wrap gap-2" aria-label="Partner program sections">{[['offer', 'Plans & free Aura+'], ['growth', 'Marketing & SEO/GEO'], ['legal', 'Terms & legal drafts']].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} className={`${button} ${tab === id ? 'bg-primary text-white' : 'bg-white'}`} onClick={() => setTab(id)}>{label}</button>)}</nav>
      {tab === 'offer' && <>
        <Card title="Six months of Aura+ on us">
          <p className="text-2xl font-bold text-primary break-words">AURA6MONTHS</p>
          <p className="mt-3 text-sm">We have subscription plans for partners. Right now, use this code to get Aura+ free for six months. No payment method or automatic paid renewal.</p>
          <p className="mt-2 text-xs text-muted">The six months begin when you activate the code. This offer does not change verification, matching or enquiry eligibility.</p>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          {[['Starter', 'Free profile and portfolio'], ['Growth', 'Planned partner workspace plan'], ['Professional', 'Planned advanced workspace plan']].map(([name, summary]) =>
            <Card key={name} title={name}><p className="text-sm">{summary}</p><p className="mt-2 text-xs text-muted">{name === 'Starter' ? 'Available now' : 'Pricing and checkout are not open yet'}</p></Card>
          )}
        </div>
        {data.entitlement ? <Card title="Your Aura+ offer">
          <p role="status" className="font-semibold text-primary">{data.entitlement.status === 'ACTIVE' ? 'Active — six months free' : 'Expired — no paid renewal'}</p>
          <p className="mt-2 text-sm">Started {new Date(data.entitlement.startedAt).toLocaleDateString()} · Ends {new Date(data.entitlement.expiresAt).toLocaleDateString()}</p>
          <p className="mt-2 text-xs text-muted">This code can be used once per vendor and cannot extend the original end date. No payment is scheduled.</p>
        </Card> : <Card title="Activate your free Aura+ offer">
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); act(async () => { const result = await externalApi.call('/vendor/partner-program/validate', { method: 'POST', body: { code } }); setCheck(result); }); }}>
            <label className="block text-sm font-semibold" htmlFor="partner-promo-code">Promotion code</label>
            <input className={input} id="partner-promo-code" maxLength={60} autoComplete="off" value={code} onChange={e => { setCode(e.target.value); setCheck(null); }} />
            <button type="submit" className={button}>Check code</button>
          </form>
          {check && <div className="mt-4 text-sm" role="status">
            <p className="font-semibold">{check.recognized ? 'Code recognized — ready to activate' : check.message}</p>
            {check.recognized && <><p className="mt-2">{check.notice}</p><button type="button" className={`${button} bg-primary text-white mt-4`} onClick={() => act(async () => { await externalApi.call('/vendor/partner-program/redeem', { method: 'POST', body: { code: check.code } }); await refresh(); setCheck(null); setMessage('Your six free months of Aura+ are active.'); })}>Activate six free months</button></>}
          </div>}
          {data.request?.status === 'REQUESTED' && <p className="text-xs text-muted mt-4">You previously requested this offer. Activate it above to start your six months.</p>}
        </Card>}
      </>}
      {tab === 'growth' && <>
        <Card title="One connected growth workspace"><p className="text-sm">Marketing suggestions, keyword candidates, AI discovery questions, FAQs, portfolio guidance and 30/60/90-day tasks use your saved, current public-use evidence. Review and save them in SEO & GEO growth; nothing is sent or published automatically.</p><Link className={`${button} inline-flex items-center bg-primary text-white mt-4`} to="/vendor/seo">Open SEO & GEO growth</Link></Card>
        <Card title="Before publishing or sending"><ul className="list-disc pl-5 space-y-2 text-sm"><li>Confirm actual services, locations and business identity.</li><li>Check customer and creator rights before using portfolio media.</li><li>Use marketing messages only with the appropriate recipient permission.</li><li>Validate keyword demand and competitor identity; do not treat candidates as measured rankings.</li><li>Record source dates, enquiries and verified booking outcomes separately from readiness scores.</li></ul></Card>
        <Card title="Existing customer campaigns"><p className="text-sm">Use the existing consent-aware customer growth workflow for eligible in-app recipients. A suggested message does not grant permission to contact anyone.</p><Link className={`${button} inline-flex items-center mt-3`} to="/vendor/growth">Open customer growth</Link></Card>
      </>}
      {tab === 'legal' && <>
        <Card title="Imported legal reference documents"><p className="text-sm font-semibold">Drafts — not active signup terms</p><p className="text-sm text-muted mt-2">These four reference documents are awaiting approval. Entity details, dates and commercial clauses still contain unresolved placeholders. They do not replace the active Terms or Privacy Policy, and this page does not collect binding acceptance.</p><div className="flex flex-wrap gap-3 mt-4"><Link to="/terms?for=vendor" className="text-primary underline text-sm">Current Vendor Terms</Link><Link to="/privacy?for=vendor" className="text-primary underline text-sm">Current Privacy Policy</Link><button className={button} type="button" onClick={() => downloadJson(data.legal, 'starvnt-partner-legal-drafts.json')}>Download reference drafts</button></div></Card>
        <nav aria-label="Legal reference documents" className="flex flex-wrap gap-2">{Object.values(data.legal.documents).map(d => <button type="button" className={`${button} ${docKey === d.key ? 'bg-primary text-white' : 'bg-white'}`} aria-pressed={docKey === d.key} key={d.key} onClick={() => setDocKey(d.key)}>{d.shortTitle}</button>)}</nav>
        <Card title={doc.title}><p className="text-sm font-bold text-primary">DRAFT PENDING REVIEW · {doc.version}</p><p className="text-sm mt-3">{doc.reviewNotice}</p><p className="text-xs text-muted mt-2">Source document date: {doc.publicationDate} · Effective date: {doc.effectiveDate}</p><div className="space-y-3 mt-5">{doc.clauses.map(clause => <details className="border border-gray-200 rounded-xl p-3" key={clause.id}><summary className="font-semibold text-sm cursor-pointer">{clause.number}. {clause.title}</summary><div className="space-y-3 mt-3 text-sm leading-relaxed break-words">{clause.paragraphs.map((p, i) => <p key={i}>{p}</p>)}{clause.bullets && <ul className="list-disc pl-5 space-y-2">{clause.bullets.map((p, i) => <li key={i}>{p}</li>)}</ul>}{clause.table && <div className="overflow-x-auto"><table className="min-w-full text-left"><caption className="text-left">{clause.table.caption}</caption><thead><tr>{clause.table.headers.map((h, i) => <th className="p-2 border border-gray-200" key={i}>{h}</th>)}</tr></thead><tbody>{clause.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="p-2 border border-gray-200" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}{clause.callout && <aside className="rounded-xl bg-lavender p-3"><strong>{clause.callout.title}</strong><p className="mt-2">{clause.callout.body}</p></aside>}</div></details>)}</div></Card>
      </>}
    </fieldset>}
  </Page>;
}
