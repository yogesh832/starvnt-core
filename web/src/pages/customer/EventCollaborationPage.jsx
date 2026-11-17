import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';
import { errorText } from './customerApi.js';
import { BackLink, useLoad } from './customerUi.jsx';
import useCustomerRefresh from './useCustomerRefresh.js';
import ConfirmActionButton from '../../components/ConfirmActionButton.jsx';

const button = 'customer-primary-action min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
const field = 'block w-full min-h-11 rounded-xl border bg-white p-3 text-base';

export default function EventCollaborationPage() {
  const { id } = useParams();
  const base = `/customer/events/${id}`;
  const source = useLoad(() => externalApi.call(`${base}/collaboration`), [id]);
  const [bookingId, setBookingId] = useState('');
  const messages = useLoad(() => externalApi.call(`${base}/circle/messages${bookingId ? `?bookingId=${bookingId}` : ''}`), [id, bookingId]);
  useCustomerRefresh(source.reload, id);
  useCustomerRefresh(messages.reload, `${id}:${bookingId}`);
  const [email, setEmail] = useState(''), [role, setRole] = useState('PARTICIPANT'), [text, setText] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID());
  const [inviteKey, setInviteKey] = useState(() => crypto.randomUUID());
  async function act(work) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); source.reload(); messages.reload(); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  if (source.loading && !source.data) return <p role="status">Loading your Event Circle…</p>;
  if (!source.data || [401, 403, 404].includes(source.error?.status) || source.error?.data?.error === 'CIRCLE_LOCKED') return <div role="alert">{errorText(source.error)} <button onClick={source.reload}>Try again</button></div>;
  const { event, unlocked, permissions = [], members = [], bookings = [] } = source.data;
  return <div className="mx-auto max-w-3xl space-y-4">
    <BackLink to="/customer/events">Events</BackLink>
    <h1 className="text-2xl font-extrabold">Your Event Circle</h1>
    <p>{event.title}</p>
    {source.error && <p role="alert">Updates are unavailable. <button onClick={source.reload}>Try again</button></p>}
    {!unlocked ? <p className="rounded-2xl border bg-white p-5">Your private Circle opens after a verified service booking. <Link className="text-primary underline" to={`/customer/events/${id}/circle`}>Continue your planning conversations</Link></p> : <>
      <p className="text-sm text-muted">A private space for the people you invite. Your service and booking conversations stay in their own context.</p>
      <div className="flex flex-wrap gap-3"><Link className="customer-secondary-action" to={`/customer/events/${id}/media`}>Photos, videos & updates</Link><Link className="customer-secondary-action" to={`/customer/events/${id}/memory`}>Event Memory</Link></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {permissions.includes('invite') && <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold">Invite someone</h2>
        <p className="text-sm text-muted">Invitations appear after they sign in with their verified email. They expire in seven days.</p>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); act(async () => {
          await externalApi.call(`${base}/circle/members`, { method: 'POST', body: { email, role, idempotencyKey: inviteKey } });
          setEmail(''); setInviteKey(crypto.randomUUID()); setNotice('Invitation saved.');
        }); }}>
          <label className="block">Email<input type="email" required value={email} className={field} disabled={busy} onChange={e => { setEmail(e.target.value); setInviteKey(crypto.randomUUID()); }} /></label>
          <label className="block">Access<select className={field} value={role} disabled={busy} onChange={e => { setRole(e.target.value); setInviteKey(crypto.randomUUID()); }}><option value="VIEWER">View approved content</option><option value="PARTICIPANT">Message and contribute</option><option value="COORDINATOR">Coordinate and review content</option></select></label>
          <button className={button} disabled={busy}>Send invitation</button>
        </form>
        <ul className="space-y-3">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span>{member.email} · {member.role.toLowerCase()} · {member.state.toLowerCase()}</span>{member.state !== 'REVOKED' && <button className="min-h-11 text-red-700 underline" disabled={busy} onClick={() => { if (window.confirm('Remove this person’s access to this event?')) act(() => externalApi.call(`${base}/circle/members/${member.id}/revoke`, { method: 'POST', body: { idempotencyKey: crypto.randomUUID() } })); }}>Revoke access</button>}</li>)}</ul>
      </section>}
      <section className="space-y-4 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold">Conversations</h2>
        <label className="block">Conversation<select className={field} value={bookingId} onChange={e => setBookingId(e.target.value)}><option value="">Family & participants</option>{bookings.map(b => <option key={b.id} value={b.id}>{b.serviceName} · {b.vendorName}</option>)}</select></label>
        {messages.error && <p role="alert">{errorText(messages.error)} <button onClick={messages.reload}>Try again</button></p>}
        {messages.loading && !messages.data && <p role="status">Loading messages…</p>}
        {!messages.error && <ol className="space-y-3">{(messages.data?.messages || []).map(m => <li key={m.id} className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-bold">{m.senderName} · {new Date(m.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-sm">{m.body}</p></li>)}</ol>}
        {!messages.loading && !messages.error && !messages.data?.messages?.length && <p className="text-sm text-muted">Start the conversation.</p>}
        {permissions.includes('message') && <form onSubmit={e => { e.preventDefault(); act(async () => {
          await externalApi.call(`${base}/circle/messages`, { method: 'POST', body: { body: text, bookingId: bookingId || null, idempotencyKey: messageKey } });
          setText(''); setMessageKey(crypto.randomUUID());
        }); }} className="space-y-3">
          <label className="block">Message<textarea className={field} maxLength={2000} required disabled={busy} value={text} onChange={e => { setText(e.target.value); setMessageKey(crypto.randomUUID()); }} /></label>
          <button disabled={busy || !text.trim()} className={button}>Send message</button>
        </form>}
      </section>
    </>}
  </div>;
}

export function CircleInvitationsPage() {
  const source = useLoad(() => externalApi.call('/customer/circle-invitations'), []);
  const [error, setError] = useState(''), [busy, setBusy] = useState('');
  return <div className="mx-auto max-w-2xl space-y-4">
    <BackLink to="/customer/events">Events</BackLink><h1 className="text-2xl font-bold">Your invitations</h1>
    {source.loading && !source.data && <p role="status">Loading invitations…</p>}
    {source.error && <p role="alert">{errorText(source.error)} <button onClick={source.reload}>Try again</button></p>}
    {source.data?.emailVerificationRequired && <p>Verify the email on your account to see invitations.</p>}
    {error && <p role="alert">{error}</p>}
    {(source.data?.invitations || []).map(invite => <section key={invite.id} className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">{invite.eventTitle}</h2><p>{invite.role.toLowerCase()} · {invite.state.toLowerCase()}</p>{invite.state === 'ACTIVE' ? <Link className="customer-secondary-action" to={`/customer/events/${invite.eventId}/collaboration`}>Open Event Circle</Link> : <button disabled={Boolean(busy)} className={button} onClick={async () => { setBusy(invite.id); setError(''); try { await externalApi.call(`/customer/circle-invitations/${invite.id}/accept`, { method: 'POST', body: { idempotencyKey: crypto.randomUUID() } }); source.reload(); } catch (err) { setError(errorText(err)); } finally { setBusy(''); } }}>Accept invitation</button>}</section>)}
    {source.data && !source.data.invitations?.length && !source.data.emailVerificationRequired && <p>No event invitations yet.</p>}
  </div>;
}
