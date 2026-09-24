import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, useLoad } from './customerUi.jsx';

/** Event Circle: one thread per context (whole event, each booking, a service). */
export default function CirclePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => customerApi.circle(id), [id]);
  const bookingId = params.get('booking');
  const requirementId = params.get('service');
  const ctx = bookingId ? { bookingId } : requirementId ? { requirementId } : {};
  const thread = useLoad(() => customerApi.messages(id, ctx), [id, bookingId, requirementId]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottom = useRef(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [thread.data]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setSendError('');
    try {
      await customerApi.postMessage(id, { body: text, ...ctx });
      setText('');
      thread.reload();
      reload();
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <div className="text-xs text-muted">Loading…</div>;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, contexts } = data;
  const activeKey = bookingId ? `booking:${bookingId}` : requirementId ? `requirement:${requirementId}` : 'event';
  const active = contexts.find((c) => c.key === activeKey) || contexts[0];

  const choose = (c) => {
    const next = new URLSearchParams();
    if (c.bookingId) next.set('booking', c.bookingId);
    if (c.requirementId) next.set('service', c.requirementId);
    setParams(next);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3 flex flex-col">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Event Circle</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {contexts.map((c) => (
          <button
            key={c.key}
            onClick={() => choose(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border transition ${c.key === active.key ? 'bg-primary text-white border-primary' : 'bg-white text-navy border-gray-200'}`}
          >
            {c.label}{c.messageCount ? ` · ${c.messageCount}` : ''}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-muted">{active.path.join(' → ')}</div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 min-h-[240px]">
        {thread.loading && !thread.data && <div className="text-xs text-muted">Loading…</div>}
        {thread.error && <div className="text-xs text-red-500">{errorText(thread.error)}</div>}
        {thread.data?.messages.length === 0 && <div className="text-xs text-muted">No messages yet. Ask anything about this — the STARVNT team and your vendor reply here.</div>}
        {thread.data?.messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderType === 'customer' ? 'justify-end' : ''}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs ${m.senderType === 'customer' ? 'bg-primary text-white' : 'bg-lavender text-navy'}`}>
              {m.senderType !== 'customer' && <div className="text-[10px] font-bold mb-0.5">{m.senderName}</div>}
              <div className="whitespace-pre-wrap">{m.body}</div>
              <div className={`text-[9px] mt-1 ${m.senderType === 'customer' ? 'text-white/70' : 'text-muted'}`}>{new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 bg-white rounded-2xl shadow-sm px-4 py-2.5">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" className="flex-1 outline-none text-sm bg-transparent" />
        <button disabled={busy || !text.trim()} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 disabled:opacity-50">Send</button>
      </form>
      {sendError && <div className="text-xs text-red-500">{sendError}</div>}
    </div>
  );
}
