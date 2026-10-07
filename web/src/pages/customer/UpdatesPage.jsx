import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { Empty, PageSkeleton, Tabs, useLoad } from './customerUi.jsx';

const when = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export function parseTextLinks(text) {
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

const TONE = {
  payment: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800/40',
  booking: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800/40',
  completion: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-100 dark:border-teal-800/40',
  cancellation: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-800/40',
  message: 'bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] border-primary/20',
  event_day: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-100 dark:border-violet-800/40',
  quote: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800/40',
  enquiry: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800/40',
  system: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-gray-700',
};

const ICONS = {
  payment: 'payments',
  booking: 'calendar',
  completion: 'check',
  cancellation: 'close',
  message: 'message',
  event_day: 'star',
  quote: 'quotes',
  enquiry: 'message',
  system: 'bell',
};

function getSafeNotificationLink(n) {
  const type = String(n.type || '').toLowerCase();
  const body = String(n.body || n.lastMessageText || n.text || '').toLowerCase();
  const title = String(n.title || n.senderName || '').toLowerCase();

  const isCompletion =
    ['completion'].includes(type) ||
    body.includes('completion evidence') ||
    body.includes('verify completion') ||
    body.includes('action required') ||
    body.includes('work marked done') ||
    title.includes('completion evidence');

  if (isCompletion) {
    return n.eventId ? `/customer/events/${n.eventId}/bookings` : '/customer/go/bookings';
  }
  if (['booking', 'payment'].includes(type)) {
    return n.eventId ? `/customer/events/${n.eventId}/bookings` : '/customer/go/bookings';
  }
  if (type === 'quote') {
    return n.eventId ? `/customer/events/${n.eventId}/quotes` : '/customer/go/quotes';
  }
  if (type === 'message') {
    return n.eventId ? `/customer/events/${n.eventId}/circle` : '/customer/go/bookings';
  }
  if (type === 'event_day') {
    return n.eventId ? `/customer/events/${n.eventId}/event-day` : '/customer/events';
  }
  if (n.to && !['/customer', '/customer/updates', '/customer/events'].includes(n.to)) {
    return n.to;
  }
  return n.eventId ? `/customer/events/${n.eventId}/bookings` : '/customer/go/bookings';
}

/** Interactive live vendor chat modal overlay for instant messaging */
function extractImageUrls(text) {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+(?:\.(?:png|jpg|jpeg|gif|webp|svg)|cloudinary\.com[^\s]+))/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)];
}

/** Interactive live vendor chat modal overlay for instant messaging */
function VendorChatModal({ thread, onClose, onSent }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachedUrl, setAttachedUrl] = useState('');
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const ctx = {
    threadId: thread.id,
    bookingId: thread.bookingId,
    requirementId: thread.serviceId || thread.requirementId,
  };

  const getTargetEventId = async () => {
    if (thread.eventId && thread.eventId !== 'null' && thread.eventId !== 'undefined') {
      return thread.eventId;
    }
    try {
      const res = await customerApi.events();
      const list = res.events || [];
      if (list.length > 0) return list[0]._id || list[0].id;
    } catch {
      // ignore
    }
    return null;
  };

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const targetEventId = await getTargetEventId();
      if (!targetEventId) {
        setLoading(false);
        return;
      }
      const res = await customerApi.messages(targetEventId, ctx);
      setMessages(res.messages || []);
    } catch (err) {
      setError(errorText(err, 'Could not load messages for this conversation.'));
    } finally {
      setLoading(false);
    }
  }, [thread.eventId, thread.id, thread.bookingId, thread.serviceId, thread.requirementId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await customerApi.uploadMedia(reader.result, file.name, file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE');
          if (res?.url) {
            setAttachedUrl(res.url);
          }
        } catch (err) {
          setError(errorText(err, 'Failed to upload image asset to Cloudinary.'));
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  async function handleSend(e) {
    e.preventDefault();
    const rawMsg = text.trim();
    if ((!rawMsg && !attachedUrl) || sending || uploading) return;
    setSending(true);

    let msg = rawMsg;
    if (attachedUrl) {
      msg = rawMsg ? `${rawMsg}\n📷 Attachment: ${attachedUrl}` : `📷 Attachment: ${attachedUrl}`;
    }

    setText('');
    setAttachedUrl('');

    const targetEventId = await getTargetEventId();
    if (!targetEventId) {
      setSending(false);
      return;
    }

    const tempMsg = {
      id: `temp-${Date.now()}`,
      senderType: 'customer',
      senderName: 'You',
      body: msg,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await customerApi.postMessage(targetEventId, { body: msg, ...ctx });
      await loadMessages();
      onSent?.();
    } catch (err) {
      setError(errorText(err, 'Failed to send message. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[90vh]">
        {/* Chat Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1e2235]/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center font-extrabold text-sm shrink-0 shadow-xs">
              {(thread.vendorName || 'V').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-extrabold text-navy dark:text-white truncate">{thread.vendorName}</h3>
                {thread.vendorCategory && (
                  <span className="text-[10px] font-bold bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] px-2 py-0.5 rounded-full">
                    {thread.vendorCategory}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted dark:text-slate-400 truncate mt-0.5">{thread.eventName}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {thread.to && (
              <Link
                to={thread.to}
                onClick={onClose}
                className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-primary dark:text-[#a5b4fc] hover:underline px-2 py-1"
              >
                <span>Full Circle</span>
                <Icon name="chevronRight" size={13} />
              </Link>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 text-muted dark:text-slate-300 hover:text-navy dark:hover:text-white grid place-items-center transition cursor-pointer"
              aria-label="Close chat"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* Chat Message List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-lavender/30 dark:bg-[#0b0d14]/40">
          {loading && (
            <div className="space-y-3 py-4">
              <div className="flex gap-2 items-center">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                <div className="h-10 w-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              </div>
              <div className="flex justify-end gap-2 items-center">
                <div className="h-10 w-56 rounded-2xl bg-primary/20 animate-pulse" />
              </div>
            </div>
          )}

          {error && <div className="text-xs text-red-500 dark:text-red-400 text-center py-2">{error}</div>}

          {!loading && !error && messages.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center mx-auto">
                <Icon name="message" size={20} />
              </div>
              <div className="text-sm font-bold text-navy dark:text-white">Start the conversation</div>
              <p className="text-xs text-muted dark:text-slate-400 max-w-xs mx-auto">
                Send a message to {thread.vendorName} to discuss pricing, availability, or event details.
              </p>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.senderType === 'customer';
            const senderLabel = mine ? 'You' : m.senderName || (m.senderType === 'vendor' ? thread.vendorName || 'Vendor' : 'STARVNT Team');
            const parsed = parseTextLinks(m.body);

            return (
              <div key={m.id || m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-xs leading-relaxed ${
                    mine
                      ? 'bg-primary text-white rounded-br-xs shadow-xs'
                      : 'bg-white dark:bg-[#1e2235] border border-gray-100 dark:border-gray-700 text-navy dark:text-slate-100 rounded-tl-xs shadow-xs'
                  }`}
                >
                  <div className={`text-[10px] font-bold mb-1 ${mine ? 'text-white/80' : 'text-primary dark:text-[#a5b4fc]'}`}>{senderLabel}</div>
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

                  <div className={`text-[9px] mt-1.5 ${mine ? 'text-white/70' : 'text-muted dark:text-slate-400'}`}>{when(m.createdAt)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Attached preview */}
        {attachedUrl && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-[#1e2235] border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <img src={attachedUrl} alt="Attached upload" className="w-9 h-9 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-navy dark:text-white font-semibold truncate max-w-xs">Attached Cloudinary Asset</span>
            <button
              type="button"
              onClick={() => setAttachedUrl('')}
              className="text-red-500 hover:text-red-700 text-xs font-bold ml-auto px-2 py-1"
            >
              Remove
            </button>
          </div>
        )}

        {/* Input Composer */}
        <form onSubmit={handleSend} className="p-3 sm:p-4 bg-white dark:bg-[#161926] border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.zip"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 text-muted hover:text-primary dark:text-slate-300 dark:hover:text-white grid place-items-center transition cursor-pointer shrink-0 disabled:opacity-50"
            title="Attach photo/video (Cloudinary)"
          >
            {uploading ? (
              <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icon name="image" size={18} />
            )}
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending || uploading}
            placeholder={uploading ? 'Uploading media to Cloudinary...' : `Type a message to ${thread.vendorName}...`}
            className="flex-1 bg-gray-50 dark:bg-[#1e2235] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-navy dark:text-white placeholder:text-muted/70 dark:placeholder:text-slate-400 outline-none focus:border-primary transition"
          />
          <button
            type="submit"
            disabled={sending || uploading || (!text.trim() && !attachedUrl)}
            className="rounded-2xl bg-primary text-white text-xs font-bold px-4 py-2.5 shadow-sm hover:bg-primary-dark transition disabled:opacity-50 shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <span>{sending ? 'Sending...' : 'Send'}</span>
            <Icon name="send" size={13} />
          </button>
        </form>
      </div>

      {/* Image Lightbox */}
      {activeZoomImage && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setActiveZoomImage(null)}>
          <img src={activeZoomImage} alt="Attachment zoom" className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}

/** Messages & Updates Page: real-time notifications, vendor threads, and Aura+ chats. */
export default function UpdatesPage({ onRead }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'all';
  const { data, error, loading, reload, setData } = useLoad(() => customerApi.updates(), []);
  const [tab, setTab] = useState(initialTab);
  const [markingRead, setMarkingRead] = useState(false);
  const [activeThread, setActiveThread] = useState(null);

  useEffect(() => {
    const queryTab = searchParams.get('tab');
    if (queryTab && ['all', 'messages', 'aura', 'important'].includes(queryTab)) {
      setTab(queryTab);
    }
  }, [searchParams]);

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setSearchParams({ tab: newTab });
  };

  const handleMarkAllRead = async () => {
    try {
      setMarkingRead(true);
      await customerApi.readAll();
      onRead?.();
      await reload();
    } catch {
      // ignore
    } finally {
      setMarkingRead(false);
    }
  };

  if (loading) return <PageSkeleton title="Updates" count={4} type="list" />;

  if (error) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-8">
        <div className="rounded-3xl bg-white dark:bg-[#161926] border border-red-100 dark:border-red-900/40 p-6 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 grid place-items-center mx-auto">
            <Icon name="help" size={20} />
          </div>
          <div className="text-sm font-extrabold text-navy dark:text-white">Could not load updates</div>
          <p className="text-xs text-muted dark:text-slate-400 max-w-sm mx-auto">{errorText(error)}</p>
          <button
            onClick={reload}
            className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 hover:bg-primary-dark transition cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
  const threads = Array.isArray(data?.threads) ? data.threads : [];
  const vendorMessages = Array.isArray(data?.vendorMessages) ? data.vendorMessages : [];
  const auraConversations = Array.isArray(data?.auraConversations) ? data.auraConversations : [];
  const important = notifications.filter((n) => n.important);

  const notifSignatures = new Set(notifications.map((n) => `${n.title}|${n.body}`));
  const uniqueMessageItems = vendorMessages
    .filter((m) => !notifSignatures.has(`${m.senderName} replied|${m.body}`))
    .map((m) => {
      const bodyLower = String(m.body || '').toLowerCase();
      const isCompletionMsg =
        bodyLower.includes('completion evidence') ||
        bodyLower.includes('verify completion') ||
        bodyLower.includes('action required') ||
        bodyLower.includes('work marked done');

      return {
        id: `msg:${m.id}`,
        type: isCompletionMsg ? 'completion' : 'message',
        title: m.senderType === 'customer' ? 'You sent a message' : `${m.senderName || 'Vendor'}`,
        body: m.body,
        eventId: m.eventId,
        eventTitle: m.eventTitle,
        createdAt: m.createdAt,
        read: true,
        to: isCompletionMsg
          ? (m.eventId ? `/customer/events/${m.eventId}/bookings` : '/customer/go/bookings')
          : (m.to || (m.eventId ? `/customer/events/${m.eventId}/circle` : '/customer/events')),
      };
    });

  const allItems = [...notifications, ...uniqueMessageItems].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  const openThread = (t) => {
    setActiveThread(t);
    if (t.unreadCount > 0) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unread: Math.max(0, (prev.unread || 0) - (t.unreadCount || 1)),
          threads: (prev.threads || []).map((item) =>
            item.id === t.id ? { ...item, unreadCount: 0 } : item
          ),
        };
      });
      onRead?.();
    }
  };

  const handleNotificationClick = async (n) => {
    if (!n.read && n.id && !String(n.id).startsWith('msg:')) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unread: Math.max(0, (prev.unread || 1) - 1),
          notifications: (prev.notifications || []).map((item) =>
            item.id === n.id ? { ...item, read: true, readAt: new Date().toISOString() } : item
          ),
        };
      });
      onRead?.();
      try {
        await customerApi.readNotification(n.id);
      } catch {
        // ignore
      }
    }
  };

  const renderNotificationList = (items) =>
    items.length === 0 ? (
      <Empty title="No updates yet">Booking, payment, quote and vendor updates will appear here.</Empty>
    ) : (
      <div className="space-y-2.5">
        {items.map((n, idx) => {
          const typeKey = String(n.type || 'system').toLowerCase();
          const typeLabel = String(n.type || 'update').replace(/_/g, ' ');
          const targetUrl = getSafeNotificationLink(n);

          const isMsg = typeKey === 'message';
          const ContentWrapper = isMsg ? 'div' : Link;
          const wrapperProps = isMsg
            ? {
                onClick: () => {
                  handleNotificationClick(n);
                  openThread({
                    id: n.id,
                    eventId: n.eventId,
                    vendorName: n.title || 'Vendor Partner',
                    bookingId: n.bookingId,
                  });
                },
                className: `block bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/40 dark:hover:border-primary/50 shadow-xs hover:shadow-sm p-4 transition group cursor-pointer ${
                  !n.read ? 'ring-1 ring-primary/40' : ''
                }`,
              }
            : {
                to: targetUrl,
                onClick: () => handleNotificationClick(n),
                className: `block bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/40 dark:hover:border-primary/50 shadow-xs hover:shadow-sm p-4 transition group ${
                  !n.read ? 'ring-1 ring-primary/40' : ''
                }`,
              };

          return (
            <ContentWrapper key={n.id || `notif-${idx}`} {...wrapperProps}>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5 border ${
                    TONE[typeKey] || TONE.system
                  }`}
                >
                  <Icon name={ICONS[typeKey] || 'bell'} size={12} />
                  <span>{typeLabel}</span>
                </span>
                <div className="flex items-center gap-2">
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary" title="Unread" />}
                  <span className="text-[10px] text-muted dark:text-slate-400">{when(n.createdAt)}</span>
                </div>
              </div>
              <div className="text-sm font-bold text-navy dark:text-white group-hover:text-primary dark:group-hover:text-[#a5b4fc] transition mt-2">{n.title}</div>
              {n.body && <p className="text-xs text-ink/80 dark:text-slate-300 mt-1 leading-relaxed">{n.body}</p>}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50 dark:border-gray-800">
                <span className="text-[11px] font-medium text-muted dark:text-slate-400 truncate">
                  {n.eventTitle ? `📍 ${n.eventTitle}` : 'STARVNT Core'}
                </span>
                <span className="text-xs font-bold text-primary dark:text-[#a5b4fc] group-hover:translate-x-0.5 transition flex items-center gap-0.5">
                  <span>{isMsg ? 'Open Live Chat' : ['completion', 'booking', 'payment'].includes(typeKey) ? 'View Booking & Verify' : 'View'}</span>
                  <Icon name="chevronRight" size={13} />
                </span>
              </div>
            </ContentWrapper>
          );
        })}
      </div>
    );

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header with Title and Quick Actions */}
      <div className="flex items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl font-extrabold text-navy dark:text-white">Messages & updates</h1>
          <p className="text-xs text-muted dark:text-slate-400 mt-0.5">Real-time alerts, bookings, vendor chats and Aura+ sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className="rounded-xl border border-primary/30 bg-primary-soft dark:bg-primary/20 hover:bg-primary hover:text-white text-primary dark:text-[#a5b4fc] px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
            >
              {markingRead ? 'Marking...' : 'Mark all read'}
            </button>
          )}
          <button
            onClick={reload}
            className="w-8 h-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161926] text-muted dark:text-slate-300 hover:text-navy dark:hover:text-white grid place-items-center transition cursor-pointer"
            title="Refresh updates"
            aria-label="Refresh updates"
          >
            <Icon name="trend" size={14} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs
        value={tab}
        onChange={handleTabChange}
        tabs={[
          { key: 'all', label: 'All', count: allItems.length },
          { key: 'messages', label: 'Messages', count: threads.length || vendorMessages.length },
          { key: 'aura', label: 'Aura+', count: auraConversations.length },
          { key: 'important', label: 'Important', count: important.length },
        ]}
      />

      {/* Tab Contents */}
      {tab === 'all' && renderNotificationList(allItems)}
      {tab === 'important' && renderNotificationList(important)}

      {/* Messages Tab: active conversation threads with vendor partners */}
      {tab === 'messages' && (
        <div className="space-y-3">
          {threads.length === 0 && vendorMessages.length === 0 ? (
            <Empty title="No messages yet">
              Messages with your vendors and Event Circle discussions will appear here.
            </Empty>
          ) : threads.length > 0 ? (
            <div className="space-y-2.5">
              {threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => openThread(t)}
                  className={`bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/40 dark:hover:border-primary/50 shadow-xs hover:shadow-md p-4 transition group cursor-pointer ${
                    t.unreadCount > 0 ? 'ring-1 ring-primary/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center shrink-0 font-extrabold text-sm shadow-xs">
                        {(t.vendorName || 'V').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-navy dark:text-white group-hover:text-primary dark:group-hover:text-[#a5b4fc] transition">
                            {t.vendorName}
                          </span>
                          {t.vendorCategory && (
                            <span className="text-[10px] font-bold bg-lavender dark:bg-white/10 text-navy dark:text-slate-200 px-2 py-0.5 rounded-full">
                              {t.vendorCategory}
                            </span>
                          )}
                          {t.unreadCount > 0 && (
                            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>
                        {t.lastMessageText && (
                          <p className="text-xs text-ink/80 dark:text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
                            {t.lastMessageText}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-muted dark:text-slate-400 mt-2">
                          <span className="font-semibold">{t.eventName}</span>
                          <span>·</span>
                          <span>{when(t.lastMessageAt)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openThread(t);
                      }}
                      className="text-xs font-bold text-primary dark:text-[#a5b4fc] bg-primary-soft/60 dark:bg-primary/20 hover:bg-primary hover:text-white transition px-3 py-1.5 rounded-xl shrink-0 self-center flex items-center gap-1 cursor-pointer"
                    >
                      <span>Chat</span>
                      <Icon name="chevronRight" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {vendorMessages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => openThread({ id: m.id, eventId: m.eventId, vendorName: m.senderName || 'Vendor', eventName: m.eventTitle || 'Event' })}
                  className="bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/40 dark:hover:border-primary/50 shadow-xs p-4 transition group cursor-pointer"
                >
                  <div className="flex justify-between items-center text-[10px] text-muted dark:text-slate-400 mb-1">
                    <span className="font-semibold text-primary dark:text-[#a5b4fc]">{m.eventTitle || 'Event Message'}</span>
                    <span>{when(m.createdAt)}</span>
                  </div>
                  <div className="text-sm font-bold text-navy dark:text-white group-hover:text-primary dark:group-hover:text-[#a5b4fc] transition">
                    {m.senderType === 'customer' ? 'You' : m.senderName}
                  </div>
                  <p className="text-xs text-ink/80 dark:text-slate-300 mt-1">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aura+ Planning Conversations Tab */}
      {tab === 'aura' && (
        <div className="space-y-3">
          <Link
            to="/customer/aura?new=1"
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-primary-soft/30 dark:bg-primary/10 hover:bg-primary-soft/60 dark:hover:bg-primary/20 text-primary dark:text-[#a5b4fc] text-xs font-bold py-3.5 transition"
          >
            <Icon name="bolt" size={16} />
            <span>+ Start a New Aura+ Planning Session</span>
          </Link>
          {auraConversations.length === 0 ? (
            <Empty title="No Aura+ conversations yet">
              Conversations with Aura+ will be saved here so you can review or resume them anytime.
            </Empty>
          ) : (
            <div className="space-y-2.5">
              {auraConversations.map((c) => (
                <Link
                  key={c.sessionId}
                  to={
                    c.eventId
                      ? `/customer/aura?event=${c.eventId}&session=${c.sessionId}`
                      : `/customer/aura?session=${c.sessionId}`
                  }
                  className="block bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/40 dark:hover:border-primary/50 shadow-xs hover:shadow-sm p-4 transition group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0 shadow-xs">
                        <Icon name="bolt" size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-navy dark:text-white group-hover:text-primary dark:group-hover:text-[#a5b4fc] transition truncate">
                          {c.eventTitle || 'Event Planning with Aura+'}
                        </div>
                        <div className="text-[11px] text-muted dark:text-slate-400 mt-0.5">Last active {when(c.updatedAt)}</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary dark:text-[#a5b4fc] group-hover:translate-x-0.5 transition flex items-center gap-1 shrink-0">
                      <span>Resume</span>
                      <Icon name="chevronRight" size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Live Vendor Chat Modal */}
      {activeThread && (
        <VendorChatModal
          thread={activeThread}
          onClose={() => setActiveThread(null)}
          onSent={() => reload()}
        />
      )}
    </div>
  );
}
