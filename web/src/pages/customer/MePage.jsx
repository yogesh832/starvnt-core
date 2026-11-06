import NotificationPreferences from '../../components/NotificationPreferences.jsx';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { customerApi, errorText } from './customerApi.js';
import { useLoad } from './customerUi.jsx';
import { eventCounts } from './accountState.js';
import AccountEventHistory from './AccountEventHistory.jsx';

export default function MePage({ user, logout }) {
  const profile = useLoad(() => customerApi.profile(), []), events = useLoad(() => customerApi.events(), []);
  const { refreshIdentity } = useExternalAuth();
  const [editing, setEditing] = useState(false), [fullName, setFullName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const editButton = useRef(null), nameInput = useRef(null);
  const p = profile.data?.profile || user, counts = eventCounts(events.data?.events);
  function closeEditor() { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await customerApi.patchProfile({ fullName: fullName.trim() });
      profile.setData(result); closeEditor(); setMessage('Your name has been saved.');
      try { await refreshIdentity(); } catch { setMessage('Your name has been saved. Refresh the page to update the account header.'); }
    } catch (err) { setError(err?.data?.fields ? Object.values(err.data.fields).join(' · ') : errorText(err)); }
    finally { setBusy(false); }
  }
  return <div className="customer-account space-y-5 max-w-3xl mx-auto">
    <header><h1 className="text-2xl font-extrabold">My account & event history</h1><p className="text-sm text-muted mt-2">Your profile, event records, saved references and communication choices in one place.</p></header>
    <section className="customer-home-panel space-y-3" aria-labelledby="account-profile-title"><h2 id="account-profile-title" className="font-bold">Profile</h2><div className="flex flex-wrap items-center gap-4"><div aria-hidden="true" className="w-12 h-12 rounded-full bg-primary text-white grid place-items-center font-bold shrink-0">{p?.fullName?.[0]?.toUpperCase() || '?'}</div><div className="min-w-0 flex-1"><p className="font-bold break-words">{p?.fullName || 'Your profile'}</p><p className="text-sm break-all">{p?.email || 'Email not recorded'}</p><p className="text-sm">{p?.phone || 'Mobile not recorded'}</p></div><button ref={editButton} disabled={profile.loading || Boolean(profile.error) || !profile.data || busy} className="customer-secondary-action w-full sm:w-auto" onClick={() => { setFullName(profile.data.profile.fullName || ''); setError(''); setMessage(''); setEditing(true); requestAnimationFrame(() => nameInput.current?.focus()); }}>Edit name</button></div>
      <p className="text-xs text-muted">Your name is self-reported. Update your mobile through the existing OTP verification flow.</p><Link className="customer-secondary-action" to="/customer/settings">Verify mobile & manage privacy</Link>
      {profile.loading && <p role="status">Loading your saved profile…</p>}{profile.error && <div role="alert" className="text-sm">Saved profile could not be refreshed. The account identity above is the last available session record. <button className="customer-secondary-action" onClick={profile.reload}>Retry profile</button></div>}
      {editing && <form onSubmit={save} className="space-y-3 border-t pt-3"><label className="block text-sm">Name<input ref={nameInput} className="account-field" required maxLength={120} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} /></label>{error && <p role="alert" className="text-red-600 text-sm">{error}</p>}<div className="flex flex-wrap gap-3"><button className="customer-primary-action" disabled={busy || !fullName.trim()}>{busy ? 'Saving…' : 'Save name'}</button><button type="button" className="customer-secondary-action" disabled={busy} onClick={closeEditor}>Cancel edit</button></div></form>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
    <section className="customer-home-panel space-y-3" aria-labelledby="account-records-title"><h2 id="account-records-title" className="font-bold">My records & choices</h2><div className="grid sm:grid-cols-2 gap-3">{[['Event documents', '/customer/documents'], ['Saved items & selections', '/customer/favorites'], ['Proposals', '/customer/proposals'], ['Messages & updates', '/customer/updates'], ['Event reminders', '/customer/reminders'], ['Relationships & feedback', '/customer/customer-360'], ['Privacy & permissions', '/customer/settings']].map(([label, to]) => <Link className="customer-secondary-action" key={to} to={to}>{label}</Link>)}</div><p className="text-sm text-muted">For an event or payment question, open the relevant event conversation. Privacy and account requests use the existing settings flow.</p></section>
    <section aria-label="Saved event counts" className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[['Events', counts?.total], ['Active', counts?.active], ['Completed', counts?.completed], ['Cancelled', counts?.cancelled]].map(([label, value]) => <div key={label} className="customer-home-panel text-center"><p className="text-xl font-bold">{value ?? '—'}</p><p className="text-xs">{label}</p></div>)}</section>
    {events.loading && <p role="status">Loading saved event history…</p>}{events.error && <div role="alert" className="customer-home-panel">Event history could not be refreshed.{events.data ? ' Counts and records below are from the last successful load.' : ' Event counts are unavailable.'} <button className="customer-secondary-action" onClick={events.reload}>Retry event history</button></div>}
    {events.data && <AccountEventHistory events={events.data.events || []} />}
    <section aria-labelledby="account-communication-title"><h2 id="account-communication-title" className="text-lg font-bold mb-3">Communication preferences</h2><NotificationPreferences /></section>
    <div className="flex flex-wrap gap-3"><Link className="customer-primary-action" to="/customer/events/new">Plan another event</Link><Link className="customer-secondary-action" to="/customer/aura">Talk to Aura+</Link><button className="customer-secondary-action" onClick={logout}>Log out</button></div>
  </div>;
}
