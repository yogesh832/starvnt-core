import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import NotificationPreferences from '../../components/NotificationPreferences.jsx';

const choices = [
  ['ECOSYSTEM', 'ALL', 'Connect my verified customer relationship with STARVNT'],
  ['PERSONALIZATION', 'ALL', 'Personalized event recommendations'],
  ...['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'].map(channel => ['MARKETING', channel, `Marketing via ${channel.toLowerCase().replace('_', ' ')}`]),
];
export default function PrivacySettings() {
  const [notice, setNotice] = useState(null), [consents, setConsents] = useState([]), [request, setRequest] = useState(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(''), [otp, setOtp] = useState(''), [sent, setSent] = useState(false);
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [links, setLinks] = useState([]), [otherPhone, setOtherPhone] = useState(''), [otherOtp, setOtherOtp] = useState(''), [linkSent, setLinkSent] = useState(false);
  async function load() {
    const [n, c, d, l] = await Promise.all([customerApi.privacyNotice(), customerApi.consents(), customerApi.deletionRequest(), customerApi.identityLinks()]);
    setNotice(n); setConsents(c.consents); setRequest(d.request); setLinks(l.requests);
  }
  useEffect(() => { load().catch(err => setError(errorText(err))); }, []);
  async function act(fn) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <div className="max-w-2xl mx-auto space-y-4">
    <h1 className="text-xl font-extrabold text-navy">Privacy & account settings</h1>
    <Link to="/customer/me" className="text-primary underline">Back to profile</Link>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <h2 className="font-bold">How your information is used</h2>
      {!notice ? <p>Loading privacy settings…</p> : <>
        <p className="text-sm text-muted">{notice.text}</p>
        <p className="text-xs text-muted">Notice version: {notice.version}</p>
        <p className="text-sm">Optional permissions start off. Saving a choice below records your decision separately from account terms. Channel preferences can also stop delivery.</p>
        {choices.map(([purpose, channel, label]) => {
          const current = consents.find(c => c.scope === 'STARVNT' && c.purpose === purpose && c.channel === channel);
          const granted = current?.status === 'GRANTED';
          return <label key={`${purpose}:${channel}`} className="flex gap-3 items-center min-h-11 text-sm">
            <input type="checkbox" checked={granted} disabled={busy || Boolean(request)} onChange={() => act(async () => {
              await customerApi.saveConsent({ purpose, channel, status: granted ? 'WITHDRAWN' : 'GRANTED', noticeVersion: notice.version, revision: current?.revision || 0, idempotencyKey: crypto.randomUUID() });
              await load(); setMessage('Your permission has been saved.');
            })} />{label}
          </label>;
        })}
      </>}
    </section>
    <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <h2 className="font-bold">Verify or update your mobile</h2>
      <p className="text-sm text-muted">Mobile ownership is verified by OTP. Your name remains self-reported.</p>
      <label className="block text-sm">Mobile with country code<input type="tel" autoComplete="tel" value={phone} onChange={e => { setPhone(e.target.value); setSent(false); }} className="block w-full rounded-xl border p-3 mt-1" placeholder="+91…" /></label>
      <button disabled={busy || !phone || Boolean(request)} className="border rounded-xl px-4 min-h-11 disabled:opacity-50" onClick={() => act(async () => { await customerApi.sendMobileVerification(phone); setSent(true); setMessage('OTP requested. Check your phone.'); })}>Send OTP</button>
      {sent && <form className="space-y-2" onSubmit={e => { e.preventDefault(); act(async () => { await customerApi.verifyMobile({ phone, otp }); setOtp(''); setSent(false); setMessage('Mobile verified.'); }); }}>
        <label className="block text-sm">OTP<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value)} className="block w-full rounded-xl border p-3 mt-1" /></label>
        <button disabled={busy || !otp} className="bg-primary text-white rounded-xl px-4 min-h-11 disabled:opacity-50">Verify mobile</button>
      </form>}
    </section>
    <NotificationPreferences />
    <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <h2 className="font-bold">Link another account you own</h2>
      <p className="text-sm text-muted">Both accounts need verified mobiles and ecosystem permission. STARVNT reviews the request. Linking keeps each account's records and permissions separate.</p>
      <label className="block text-sm">Other account mobile<input type="tel" value={otherPhone} onChange={e => { setOtherPhone(e.target.value); setLinkSent(false); }} className="block w-full rounded-xl border p-3 mt-1" placeholder="+91…" /></label>
      <button disabled={busy || !otherPhone || Boolean(request)} className="border rounded-xl px-4 min-h-11 disabled:opacity-50" onClick={() => act(async () => { await customerApi.sendMobileVerification(otherPhone); setLinkSent(true); setMessage('OTP requested for your other account.'); })}>Verify other account</button>
      {linkSent && <form className="space-y-2" onSubmit={e => { e.preventDefault(); act(async () => { await customerApi.requestIdentityLink({ otherPhone, otp: otherOtp }); setOtherOtp(''); setLinkSent(false); await load(); setMessage('Account link submitted for review.'); }); }}>
        <label className="block text-sm">Other account OTP<input inputMode="numeric" autoComplete="one-time-code" value={otherOtp} onChange={e => setOtherOtp(e.target.value)} className="block w-full rounded-xl border p-3 mt-1" /></label>
        <button disabled={busy || !otherOtp} className="border rounded-xl px-4 min-h-11 disabled:opacity-50">Request account link</button>
      </form>}
      {links.map(link => <div key={link._id} className="border rounded-xl p-3 text-sm space-y-2"><p>Account link: {link.status.toLowerCase()}</p>{['LINKED', 'REQUESTED'].includes(link.status) && <button disabled={busy} className="border rounded-lg px-3 min-h-11" onClick={() => act(async () => { await customerApi.revokeIdentityLink(link._id); await load(); setMessage('Account link revoked.'); })}>Revoke link</button>}</div>)}
    </section>
    <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <h2 className="font-bold">Request account deletion</h2>
      <p className="text-sm text-muted">Optional use stops when you request deletion. Support reviews active bookings and retention obligations before anonymizing your account. Retained business records have a recorded reason and review date.</p>
      {request ? <p role="status">Request status: {request.status.toLowerCase()}{request.legalHold && ' — retention review required'}</p> : <>
        <label className="flex items-center gap-3 text-sm min-h-11"><input type="checkbox" checked={deletionConfirmed} onChange={e => setDeletionConfirmed(e.target.checked)} />I want to request deletion of my account.</label>
        <button disabled={busy || !deletionConfirmed || !notice} className="text-red-600 border rounded-xl px-4 min-h-11 disabled:opacity-50" onClick={() => act(async () => { await customerApi.requestDeletion(); await load(); setMessage('Deletion request recorded. Optional use has stopped.'); })}>Submit deletion request</button>
      </>}
    </section>
  </div>;
}
