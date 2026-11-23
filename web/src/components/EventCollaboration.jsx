import { useCallback, useEffect, useState } from 'react';
import { adminApi, externalApi } from '../lib/api.js';

export default function EventCollaboration({ admin, eventId, bookingId }) {
  const api = admin ? adminApi : externalApi;
  const base = admin ? '/collaboration' : '/vendor/collaboration';
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState({ privacy: false, safety: false, rights: false });
  const [uploadRights, setUploadRights] = useState(false);
  const load = useCallback(async () => {
    const [media, conversation] = await Promise.all([
      api.call(`${base}/events/${eventId}/media`),
      api.call(`${base}/events/${eventId}/messages?bookingId=${encodeURIComponent(bookingId)}`),
    ]);
    setData(media); setMessages(conversation.messages || []);
  }, [api, base, eventId, bookingId]);
  useEffect(() => { load().catch(err => setError(err.message)); }, [load]);
  async function act(work) {
    setBusy(true); setError('');
    try { await work(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-40';
  return <section className="rounded-xl border bg-white p-4 space-y-3">
    <h2 className="font-bold">Private event media & delivery</h2>
    <p className="text-xs text-muted">Only authorized event members and reviewers can access these files. Customer delivery follows the approved review workflow. Public portfolio, marketing and AI permissions are separate.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="text-sm text-primary">Saving or uploading private event content. Please keep this page open…</p>}
    {data && <>
      <p className="text-sm">{data.event?.title || 'Booked event'} · {data.event?.city || ''}</p>
      <label className="block text-sm">Event message<textarea className="w-full rounded-lg border p-2" value={text} onChange={event => setText(event.target.value)} /></label>
      <button className={button} disabled={busy || !text.trim()} onClick={() => act(() => api.call(`${base}/events/${eventId}/messages`, { method: 'POST', body: { body: text, bookingId, idempotencyKey: crypto.randomUUID() } }))}>Send event message</button>
      {messages.map(message => <p className="text-sm" key={message.id || message._id}>{message.body}</p>)}
      <label className="flex items-start gap-2 text-sm min-h-11"><input type="checkbox" checked={uploadRights} onChange={event => setUploadRights(event.target.checked)} disabled={busy} />I have the rights and event permissions to submit this content for private service delivery and review.</label>
      <label className="block text-sm">Submit event media you have permission to share<input type="file" accept="image/*,video/mp4" disabled={busy || !uploadRights} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        if (!uploadRights) { setError('Confirm your content rights before uploading.'); return; }
        act(async () => {
          const form = new FormData(); form.append('file', file); form.append('bookingId', bookingId);
          form.append('rightsConfirmed', 'true'); form.append('caption', text); form.append('idempotencyKey', crypto.randomUUID());
          await api.call(`${base}/events/${eventId}/media`, { method: 'POST', body: form });
        });
      }} /></label>
      {admin && <div className="flex flex-wrap gap-3 text-sm">{['privacy', 'safety', 'rights'].map(key => <label key={key}><input type="checkbox" checked={checks[key]} onChange={event => setChecks(current => ({ ...current, [key]: event.target.checked }))} /> {key} review passed</label>)}</div>}
      {(data.assets || []).map(asset => <article className="border-t pt-3 space-y-2" key={asset.id}>
        <p className="text-sm">{asset.kind} · {asset.state} · {asset.caption}</p>
        <button className={button} disabled={busy} onClick={() => act(async () => {
          const response = await api.raw(`${base}/media/${asset.id}/file`);
          const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        })}>Review private file</button>
        {(admin ? ['APPROVE', 'REJECT', 'WITHDRAW'] : ['WITHDRAW']).map(decision => <button className={button} disabled={busy || (decision === 'APPROVE' && !Object.values(checks).every(Boolean))} key={decision} onClick={() => act(() => api.call(`${base}/events/${eventId}/media/${asset.id}`, { method: 'POST', body: {
          decision, ...checks, reason: text, expectedVersion: asset.version, idempotencyKey: crypto.randomUUID(), liveEligible: decision === 'APPROVE', memoryIncluded: decision === 'APPROVE',
        } }))}>{decision.toLowerCase()}</button>)}
      </article>)}
    </>}
  </section>;
}
