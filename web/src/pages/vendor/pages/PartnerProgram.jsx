import { useEffect, useState } from 'react';
import { externalApi } from '../../../lib/api.js';
import { Page, Card } from './shared.jsx';

const button = 'min-h-11 rounded-xl border border-primary/25 bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

export default function PartnerProgram() {
  const [data, setData] = useState(null);
  const [code, setCode] = useState('AURA6MONTHS');
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refresh = async () => setData(await externalApi.call('/vendor/partner-program'));

  useEffect(() => {
    let mounted = true;
    externalApi.call('/vendor/partner-program')
      .then(result => { if (mounted) setData(result); })
      .catch(err => { if (mounted) setError(err.data?.message || err.message); });
    return () => { mounted = false; };
  }, []);

  async function act(work) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (err) { setError(err.data?.message || err.message); }
    finally { setBusy(false); }
  }

  return <Page title="Plans & Aura+" sub="Your complimentary Aura+ offer and upcoming partner plans." wide>
    {error && <Card><p role="alert" className="text-red-700">{error}</p><button className={`${button} mt-3`} disabled={busy} onClick={() => act(refresh)}>Retry</button></Card>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {!data && !error && <Card><p role="status">Loading partner plans…</p></Card>}
    {data && <div className="space-y-5">
      <Card title="Six months of Aura+ on us">
        <p className="text-2xl font-bold text-primary break-words">AURA6MONTHS</p>
        <p className="mt-3 text-sm">We have subscription plans for partners. Right now, use this code to get Aura+ free for six months.</p>
        <p className="mt-2 text-xs text-muted">Your six months start when you activate the code. No payment method, automatic paid renewal, or change to your verification and enquiry eligibility.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {[['Starter', 'Free profile and portfolio'], ['Growth', 'Planned partner workspace plan'], ['Professional', 'Planned advanced workspace plan']].map(([name, summary]) =>
          <Card key={name} title={name}><p className="text-sm">{summary}</p><p className="mt-2 text-xs text-muted">{name === 'Starter' ? 'Available now' : 'Pricing and checkout are not open yet'}</p></Card>
        )}
      </div>
      {data.entitlement ? <Card title="Your Aura+ offer">
        <p role="status" className="font-semibold text-primary">{data.entitlement.status === 'ACTIVE' ? 'Active — six months free' : 'Expired — no paid renewal'}</p>
        <p className="mt-2 text-sm">Started {new Date(data.entitlement.startedAt).toLocaleDateString()} · Ends {new Date(data.entitlement.expiresAt).toLocaleDateString()}</p>
        <p className="mt-2 text-xs text-muted">This code can be used once per vendor. Reusing it cannot extend the end date, and no payment is scheduled.</p>
      </Card> : <Card title="Activate your free Aura+ offer">
        <form onSubmit={event => { event.preventDefault(); act(async () => { setCheck(await externalApi.call('/vendor/partner-program/validate', { method: 'POST', body: { code } })); }); }}>
          <label className="block text-sm font-semibold" htmlFor="partner-promo-code">Promotion code</label>
          <input id="partner-promo-code" className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 py-2 text-ink" maxLength={60} autoComplete="off" value={code} onChange={event => { setCode(event.target.value); setCheck(null); }} />
          <button type="submit" disabled={busy} className={`${button} mt-4`}>Check code</button>
        </form>
        {check && <div role="status" className="mt-4 text-sm">
          <p className="font-semibold">{check.recognized ? 'Code recognized — ready to activate' : check.message}</p>
          {check.recognized && <><p className="mt-2">{check.notice}</p><button type="button" disabled={busy} className={`${button} mt-4`} onClick={() => act(async () => { await externalApi.call('/vendor/partner-program/redeem', { method: 'POST', body: { code: check.code } }); await refresh(); setCheck(null); setMessage('Your six free months of Aura+ are active.'); })}>Activate six free months</button></>}
        </div>}
      </Card>}
    </div>}
  </Page>;
}
