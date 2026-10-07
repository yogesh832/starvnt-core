import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, PageSkeleton, useLoad } from './customerUi.jsx';

function parseTextLinks(text) {
  if (typeof text !== 'string') return { cleanText: '', images: [], videos: [], pdfs: [], driveLinks: [], otherLinks: [] };
  const urlRegex = /(https?:\/\/[^\s<]+)/gi;
  const matches = text.match(urlRegex) || [];
  const uniqueUrls = [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, '')))];

  const images = [];
  const videos = [];
  const pdfs = [];
  const driveLinks = [];
  const otherLinks = [];
  const mediaUrls = [];

  uniqueUrls.forEach((url) => {
    const lower = url.toLowerCase();
    if (lower.includes('drive.google.com') || lower.includes('docs.google.com') || lower.includes('dropbox.com') || lower.includes('onedrive.live.com')) {
      driveLinks.push(url);
      mediaUrls.push(url);
    } else if (lower.match(/\.(mp4|webm|mov|mkv|avi)$/i) || lower.includes('/video/upload/')) {
      videos.push(url);
      mediaUrls.push(url);
    } else if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) || lower.includes('/image/upload/')) {
      images.push(url);
      mediaUrls.push(url);
    } else if (lower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt)$/i) || lower.includes('/raw/upload/')) {
      pdfs.push(url);
      mediaUrls.push(url);
    } else {
      otherLinks.push(url);
    }
  });

  let cleanText = text;
  cleanText = cleanText.replace(/(?:\[Attached Media\/Link\]:|📷\s*Attachment:|Attachment:|\[Media\]:|Chat attachment preview)/gi, '');
  mediaUrls.forEach((url) => {
    cleanText = cleanText.split(url).join('');
  });
  cleanText = cleanText.replace(/\n\s*\n/g, '\n').trim();

  return { cleanText, images, videos, pdfs, driveLinks, otherLinks };
}

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
  const [uploading, setUploading] = useState(false);
  const [attachedUrl, setAttachedUrl] = useState('');
  const [sendError, setSendError] = useState('');
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const bottom = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [thread.data]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setSendError('');
    try {
      const res = await customerApi.uploadMedia(file);
      if (res?.url) {
        setAttachedUrl(res.url);
      }
    } catch (err) {
      setSendError(errorText(err, 'Failed to upload media asset'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function send(e) {
    e.preventDefault();
    const body = attachedUrl ? `${text.trim()}\n${attachedUrl}`.trim() : text.trim();
    if (!body) return;
    setBusy(true);
    setSendError('');
    try {
      await customerApi.postMessage(id, { body, ...ctx });
      setText('');
      setAttachedUrl('');
      thread.reload();
      reload();
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageSkeleton title="Circle" count={3} type="list" />;
  if (error) return <div className="text-sm text-red-500 dark:text-red-400">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const event = data?.event || { title: 'Event' };
  const contexts = Array.isArray(data?.contexts) && data.contexts.length
    ? data.contexts
    : [{ key: 'event', label: 'Whole event', path: [event.title || 'Event'], messageCount: 0 }];
  const activeKey = bookingId ? `booking:${bookingId}` : requirementId ? `requirement:${requirementId}` : 'event';
  const active = contexts.find((c) => c.key === activeKey) || contexts[0];
  const activePath = Array.isArray(active?.path) && active.path.length ? active.path : [event.title || 'Event'];
  const messages = Array.isArray(thread.data?.messages) ? thread.data.messages : [];

  const choose = (c) => {
    const next = new URLSearchParams();
    if (c.bookingId) next.set('booking', c.bookingId);
    if (c.requirementId) next.set('service', c.requirementId);
    setParams(next);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3 flex flex-col">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy dark:text-white">Event Circle</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {contexts.map((c) => (
          <button
            key={c.key}
            onClick={() => choose(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border transition cursor-pointer ${
              c.key === active.key
                ? 'bg-primary text-white border-primary shadow-xs'
                : 'bg-white dark:bg-[#161926] text-navy dark:text-slate-200 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5'
            }`}
          >
            {c.label}{c.messageCount ? ` · ${c.messageCount}` : ''}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-muted dark:text-slate-400">{activePath.join(' → ')}</div>
      <div className="rounded-2xl bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 shadow-sm p-3">
        <div className="text-[10px] uppercase tracking-wide font-extrabold text-primary dark:text-[#a5b4fc]">Current thread</div>
        <div className="text-sm font-extrabold text-navy dark:text-white mt-0.5">{active.label || activePath.at(-1) || 'Whole event'}</div>
        <div className="text-[11px] text-muted dark:text-slate-400 mt-0.5">{activePath.join(' → ')}</div>
        <div className="text-[10px] text-muted dark:text-slate-400 mt-1">
          Messages here stay attached to this exact {bookingId ? 'booking' : requirementId ? 'service and vendor context' : 'event'}.
        </div>
      </div>

      <div className="bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-3 min-h-[240px]">
        {thread.loading && !thread.data && (
          <div className="space-y-3 py-2">
            <div className="flex gap-2 items-center">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-10 w-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            </div>
            <div className="flex justify-end gap-2 items-center">
              <div className="h-10 w-56 rounded-2xl bg-primary/20 animate-pulse" />
            </div>
          </div>
        )}
        {thread.error && <div className="text-xs text-red-500 dark:text-red-400">{errorText(thread.error)}</div>}
        {!thread.loading && !thread.error && messages.length === 0 && (
          <div className="text-xs text-muted dark:text-slate-400">No messages yet. Ask anything about this — the STARVNT team and your vendor reply here.</div>
        )}
        {messages.map((m) => {
          const mine = m.senderType === 'customer';
          const senderLabel = mine ? 'You' : m.senderName || (m.senderType === 'vendor' ? 'Vendor' : 'STARVNT');
          const parsed = parseTextLinks(m.body);

          return (
            <div key={m.id || m._id} className={`flex ${mine ? 'justify-end' : ''}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs ${mine ? 'bg-primary text-white shadow-xs' : 'bg-lavender dark:bg-[#1e2235] text-navy dark:text-slate-100 border border-transparent dark:border-gray-700'}`}>
                <div className={`text-[10px] font-bold mb-0.5 ${mine ? 'text-white/80' : 'text-primary dark:text-[#a5b4fc]'}`}>{senderLabel}</div>
                {Boolean(parsed.cleanText) && <div className="whitespace-pre-wrap">{parsed.cleanText}</div>}

                {Boolean(parsed.images.length || parsed.videos.length || parsed.pdfs.length || parsed.driveLinks.length) && (
                  <div className={`space-y-2 ${parsed.cleanText ? 'mt-2 pt-1 border-t border-white/10 dark:border-gray-700/50' : ''}`}>
                    {parsed.images.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        {parsed.images.map((imgUrl, i) => (
                          <div
                            key={i}
                            onClick={() => setActiveZoomImage(imgUrl)}
                            className="relative rounded-2xl overflow-hidden cursor-pointer border border-white/20 dark:border-gray-700/60 shadow-xs group"
                          >
                            <img src={imgUrl} alt="Chat attachment preview" className="w-full max-h-52 object-cover group-hover:scale-105 transition duration-300" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="bg-black/70 text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-xs flex items-center gap-1">
                                <Icon name="maximize" size={10} /> View image
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {parsed.videos.map((vidUrl, i) => (
                      <div key={i} className="rounded-xl overflow-hidden bg-black border border-white/20 max-w-xs">
                        <video src={vidUrl} controls className="w-full max-h-48 object-contain" />
                      </div>
                    ))}

                    {parsed.pdfs.map((pdfUrl, i) => (
                      <a
                        key={i}
                        href={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 px-3 rounded-xl bg-slate-900/80 text-white font-bold text-xs hover:bg-slate-900 transition border border-white/20 max-w-xs"
                      >
                        <span className="text-amber-400 font-extrabold text-sm">📄</span>
                        <span className="truncate flex-1">View PDF / Document File</span>
                        <span className="text-[10px] opacity-70">↗</span>
                      </a>
                    ))}

                    {parsed.driveLinks.map((driveUrl, i) => (
                      <a
                        key={i}
                        href={driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 px-3 rounded-xl bg-blue-900/80 text-white font-bold text-xs hover:bg-blue-900 transition border border-blue-400/30 max-w-xs"
                      >
                        <span className="text-blue-300 font-extrabold text-sm">☁️</span>
                        <span className="truncate flex-1">Google Drive / Cloud Link</span>
                        <span className="text-[10px] opacity-70">↗</span>
                      </a>
                    ))}

                    {parsed.otherLinks.map((linkUrl, i) => (
                      <a
                        key={i}
                        href={linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 px-3 rounded-xl bg-white/15 text-current font-bold text-xs hover:bg-white/25 transition border border-current/20 max-w-xs truncate block"
                      >
                        <span className="text-xs">🔗</span>
                        <span className="truncate flex-1">{linkUrl}</span>
                        <span className="text-[10px] opacity-70">↗</span>
                      </a>
                    ))}
                  </div>
                )}

                {Boolean(m.payload?.type === 'EVIDENCE_SUBMITTED' || m.body?.includes('Evidence Uploaded') || m.body?.includes('Completion Evidence') || m.body?.includes('Work Marked Done')) && (
                  <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 space-y-2 text-navy dark:text-slate-100">
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-800 dark:text-emerald-300">
                      <Icon name="check" size={14} />
                      <span>Completion Evidence Ready for Review</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80 leading-relaxed">
                      Vendor has uploaded work completion evidence. Inspect proof photos/videos, verify work, and approve to release balance payment.
                    </p>
                    <Link
                      to={m.payload?.actionUrl || `/customer/events/${id}/bookings?inspect=${m.booking || m.payload?.bookingId || ''}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-extrabold text-xs shadow-xs transition"
                    >
                      <Icon name="upload" size={13} />
                      <span>{m.payload?.actionLabel || 'Review & Verify Evidence'}</span>
                    </Link>
                  </div>
                )}

                <div className={`text-[9px] mt-1 ${mine ? 'text-white/70' : 'text-muted dark:text-slate-400'}`}>{new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {attachedUrl && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-[#1e2235] border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center gap-2">
          <img src={attachedUrl} alt="Attached upload" className="w-9 h-9 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
          <span className="text-xs text-navy dark:text-white font-semibold truncate max-w-xs">Attached Media Asset</span>
          <button
            type="button"
            onClick={() => setAttachedUrl('')}
            className="text-red-500 hover:text-red-700 text-xs font-bold ml-auto px-2 py-1 cursor-pointer"
          >
            Remove
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm px-4 py-2.5">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.zip"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || busy}
          className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 text-muted hover:text-primary dark:text-slate-300 dark:hover:text-white grid place-items-center transition cursor-pointer shrink-0 disabled:opacity-50"
          title="Attach reference photo/video"
        >
          {uploading ? (
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon name="image" size={16} />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={uploading ? "Uploading media to Cloudinary..." : "Write a message…"}
          className="flex-1 outline-none text-sm bg-transparent text-navy dark:text-white placeholder:text-muted/70 dark:placeholder:text-slate-400"
        />
        <button disabled={busy || uploading || (!text.trim() && !attachedUrl)} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 disabled:opacity-50 hover:bg-primary-dark transition cursor-pointer">Send</button>
      </form>
      {sendError && <div className="text-xs text-red-500 dark:text-red-400">{sendError}</div>}

      {/* Image Lightbox Modal */}
      {activeZoomImage && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setActiveZoomImage(null)}>
          <img src={activeZoomImage} alt="Attachment zoom" className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
