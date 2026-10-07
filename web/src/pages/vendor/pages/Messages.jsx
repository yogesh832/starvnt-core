import { useState, useEffect, useCallback, useRef } from 'react';
import { Page, Card } from './shared.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

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
function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Messages({ onMessagesRead }) {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [attachedUrl, setAttachedUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const announceMessagesRead = useCallback(() => {
    if (typeof onMessagesRead === 'function') onMessagesRead();
    window.dispatchEvent(new Event('vendorBadgesRefresh'));
  }, [onMessagesRead]);

  const markThreadRead = useCallback(async (thread) => {
    try {
      const res = await externalApi.call(`/vendor/messages/threads/${thread._id}`);
      if (res.ok && res.thread) {
        setActiveThread(res.thread);
        setThreads((prev) =>
          prev.map((item) => (item._id === thread._id ? { ...res.thread, unreadVendorCount: 0 } : item))
        );
        announceMessagesRead();
        return res.thread;
      }
    } catch (err) {
      console.warn('[Messages] Mark read error:', err.message);
    }
    return thread;
  }, [announceMessagesRead]);

  const loadThreads = useCallback(async (selectId = null, options = {}) => {
    try {
      if (!options.silent) setLoading(true);
      const res = await externalApi.call('/vendor/messages/threads');
      if (res.ok && Array.isArray(res.threads)) {
        setThreads(res.threads);
        const targetId = selectId || activeThreadId || res.threads[0]?._id;
        if (targetId) {
          const match = res.threads.find((t) => t._id === targetId) || res.threads[0];
          if (match) {
            setActiveThreadId(match._id);
            if (match.unreadVendorCount > 0) {
              await markThreadRead(match);
            } else {
              setActiveThread(match);
            }
          }
        } else {
          setActiveThread(null);
          setActiveThreadId(null);
        }
      }
    } catch (err) {
      console.warn('[Messages] Failed to load threads:', err.message);
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, [activeThreadId, markThreadRead]);

  useEffect(() => {
    loadThreads();
    const interval = setInterval(() => loadThreads(activeThreadId, { silent: true }), 10000);
    return () => clearInterval(interval);
  }, [activeThreadId, loadThreads]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread?.messages]);

  // Select thread and mark as read
  async function handleSelectThread(t) {
    setActiveThreadId(t._id);
    setActiveThread(t);
    setShowMobileChat(true);

    if (t.unreadVendorCount > 0) {
      await markThreadRead(t);
    }
  }

  // Upload file / media via Cloudinary API
  async function handleMediaUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const isVideo = file.type.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
      const res = await externalApi.call('/media/upload', {
        method: 'POST',
        body: {
          file: base64Data,
          filename: file.name,
          mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        },
      });

      if (res?.url) {
        setAttachedUrl(res.url);
      } else {
        alert('Failed to upload file. Please try again.');
      }
    } catch (err) {
      alert(`Could not upload file: ${err.message || 'Upload failed'}`);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Send message
  async function handleSendMessage(e) {
    e.preventDefault();
    const textToSend = attachedUrl
      ? (msgText.trim() ? `${msgText.trim()}\n[Attached Media/Link]: ${attachedUrl}` : `[Attached Media/Link]: ${attachedUrl}`)
      : msgText.trim();

    if (!textToSend || !activeThread?._id || sending || uploadingMedia) return;

    setSending(true);
    try {
      const res = await externalApi.call(`/vendor/messages/threads/${activeThread._id}`, {
        method: 'POST',
        body: { text: textToSend },
      });

      if (res.ok && res.message) {
        setMsgText('');
        setAttachedUrl('');
        setActiveThread((prev) => ({
          ...prev,
          messages: [...(prev?.messages || []), res.message],
          lastMessageText: textToSend,
          lastMessageAt: new Date(),
        }));
        setThreads((prev) =>
          prev.map((t) =>
            t._id === activeThread._id
              ? { ...t, lastMessageText: textToSend, lastMessageAt: new Date() }
              : t
          )
        );
      }
    } catch (err) {
      alert(`Could not send message: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <Page
      title="Enquiries & Messages"
      sub="Direct, context-backed customer messaging. Respond to client opportunities and quote negotiations in real-time."
    >
      {loading && threads.length === 0 ? (
        <div className="grid lg:grid-cols-[340px_1fr] gap-0 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[580px]">
          {/* Thread rail skeleton */}
          <div className="border-r border-gray-100 p-4 space-y-4">
            <div className="h-4 w-32 bg-slate-200/80 animate-pulse rounded-full" />
            <div className="space-y-3 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-2xl">
                  <div className="w-10 h-10 rounded-full bg-slate-200/80 animate-pulse shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-28 bg-slate-200/80 animate-pulse rounded-full" />
                    <div className="h-2.5 w-40 bg-slate-200/50 animate-pulse rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Conversation view skeleton */}
          <div className="hidden lg:flex flex-col justify-between p-6 bg-slate-50/40">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200/80 animate-pulse shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-slate-200/80 animate-pulse rounded-full" />
                  <div className="h-3 w-24 bg-slate-200/50 animate-pulse rounded-full" />
                </div>
              </div>
              <div className="h-6 w-20 bg-slate-200/60 animate-pulse rounded-full" />
            </div>
            <div className="space-y-4 py-8">
              <div className="flex gap-2">
                <div className="h-12 w-64 bg-slate-200/60 animate-pulse rounded-2xl" />
              </div>
              <div className="flex justify-end">
                <div className="h-12 w-64 bg-primary-soft/40 animate-pulse rounded-2xl" />
              </div>
              <div className="flex gap-2">
                <div className="h-14 w-80 bg-slate-200/60 animate-pulse rounded-2xl" />
              </div>
            </div>
            <div className="h-12 w-full rounded-2xl bg-white border border-gray-100 animate-pulse" />
          </div>
        </div>
      ) : threads.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <div className="w-14 h-14 rounded-3xl bg-primary-soft text-primary grid place-items-center mx-auto mb-3 shadow-xs">
            <Icon name="message" size={24} />
          </div>
          <h3 className="text-base font-extrabold text-navy">No Active Inquiries Yet</h3>
          <p className="text-xs text-muted max-w-sm mx-auto mt-1 leading-relaxed">
            When prospective clients discover your profile or negotiate quotes, structured communication threads will appear here.
          </p>
          <div className="mt-4">
            <a
              href="/vendor/enquiries"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-xs hover:bg-primary-dark transition"
            >
              <span>View Open Enquiries</span>
              <Icon name="chevronRight" size={13} />
            </a>
          </div>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-0 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[580px] max-h-[750px]">
          {/* Thread List Rail */}
          <div
            className={`border-r border-gray-100 flex flex-col ${
              showMobileChat ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-lavender/30">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted">
                Active Inquiries ({threads.length})
              </span>
              <button
                onClick={() => loadThreads()}
                className="p-1.5 rounded-lg hover:bg-lavender text-muted hover:text-navy transition cursor-pointer"
                title="Refresh messages"
                aria-label="Refresh"
              >
                <Icon name="trend" size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {threads.map((t) => {
                const isSelected = activeThread?._id === t._id;
                const initials = (t.clientName || 'Client')
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                const isCounterQuote = (t.lastMessageText || '').includes('Counter Quote Proposal');

                return (
                  <button
                    key={t._id}
                    onClick={() => handleSelectThread(t)}
                    className={`w-full flex items-start gap-3 p-4 text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-primary-soft/60 border-l-4 border-l-primary'
                        : 'hover:bg-lavender/40'
                    }`}
                  >
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-black grid place-items-center text-xs">
                        {initials}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-navy truncate">
                          {t.clientName}
                        </span>
                        <span className="text-[10px] text-muted shrink-0">
                          {formatMessageTime(t.lastMessageAt)}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-primary truncate mt-0.5">
                        {t.eventName} {t.eventDate ? `· ${t.eventDate}` : ''}
                      </div>
                      <p className="text-xs text-muted truncate mt-1">
                        {isCounterQuote ? (
                          <span className="text-amber-800 font-bold inline-flex items-center gap-1">
                            <span>💬 Counter Quote Proposal</span>
                          </span>
                        ) : (
                          t.lastMessageText || 'New inquiry received'
                        )}
                      </p>
                    </div>
                    {t.unreadVendorCount > 0 && (
                      <span className="bg-primary text-white text-[10px] font-extrabold rounded-full px-2 py-0.5 shrink-0 mt-1">
                        {t.unreadVendorCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Conversation Pane */}
          {activeThread ? (
            <div
              className={`flex-1 flex flex-col bg-slate-50/50 ${
                showMobileChat ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {/* Conversation Header */}
              <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setShowMobileChat(false)}
                    className="lg:hidden p-1.5 -ml-1 rounded-xl hover:bg-lavender text-muted hover:text-navy cursor-pointer"
                    aria-label="Back to threads"
                  >
                    <Icon name="chevronLeft" size={16} />
                  </button>
                  <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary font-black grid place-items-center text-xs shrink-0">
                    {(activeThread.clientName || 'C')
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-navy truncate">
                      {activeThread.clientName}
                    </div>
                    <div className="text-[11px] text-muted flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-primary">{activeThread.eventName}</span>
                      {activeThread.eventDate && (
                        <>
                          <span>·</span>
                          <span>{activeThread.eventDate}</span>
                        </>
                      )}
                      {activeThread.venueLocation && (
                        <>
                          <span>·</span>
                          <span className="truncate">{activeThread.venueLocation}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="/vendor/quotes"
                    className="px-3 py-1.5 rounded-xl border border-primary/30 text-primary hover:bg-primary-soft text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>View / Revise Quotes</span>
                    <Icon name="chevronRight" size={12} />
                  </a>
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
                {activeThread.messages && activeThread.messages.length > 0 ? (
                  activeThread.messages.map((m, idx) => {
                    const isVendor = m.sender === 'VENDOR';
                    const isSystem = m.sender === 'SYSTEM' || m.sender === 'SUPPORT';
                    const isCounterQuote = m.metadata?.type === 'COUNTER_QUOTE' || (m.text || '').includes('Counter Quote Proposal');
                    const parsed = parseTextLinks(m.text);

                    if (isSystem) {
                      return (
                        <div key={idx} className="flex justify-center my-2">
                          <div className="inline-flex items-center gap-1.5 bg-lavender/70 border border-gray-200/80 rounded-full px-3.5 py-1 text-[11px] font-semibold text-muted">
                            <Icon name="shieldCheck" size={12} className="text-emerald-600" />
                            <span>{m.text}</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        className={`flex ${isVendor ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-3xl px-4.5 py-3.5 text-xs leading-relaxed shadow-xs ${
                            isVendor
                              ? 'bg-primary text-white rounded-br-xs'
                              : 'bg-white text-navy border border-gray-100 rounded-bl-xs'
                          }`}
                        >
                          {Boolean(parsed.cleanText) && (
                            <p className="break-words font-medium whitespace-pre-line leading-relaxed">{parsed.cleanText}</p>
                          )}

                          {/* Media & Links Attachment Renderer */}
                          {Boolean(parsed.images.length || parsed.videos.length || parsed.pdfs.length || parsed.driveLinks.length) && (
                            <div className={`space-y-2 ${parsed.cleanText ? 'mt-2.5 pt-2 border-t border-black/10 dark:border-white/10' : ''}`}>
                              {parsed.images.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                  {parsed.images.map((imgUrl, i) => (
                                    <div
                                      key={i}
                                      onClick={() => setLightboxUrl(imgUrl)}
                                      className="relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5 cursor-pointer group shadow-xs"
                                    >
                                      <img src={imgUrl} alt="Attachment" className="w-full max-h-56 object-cover group-hover:scale-105 transition duration-300" />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <span className="bg-black/70 text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-xs flex items-center gap-1">
                                          <Icon name="maximize" size={10} /> View image
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {parsed.videos.map((vidUrl, i) => (
                                <div key={i} className="rounded-2xl overflow-hidden bg-black border border-gray-700 max-w-xs my-1">
                                  <video src={vidUrl} controls className="w-full max-h-48 object-contain" />
                                </div>
                              ))}

                              {parsed.pdfs.map((pdfUrl, i) => (
                                <a
                                  key={i}
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center gap-2 p-2 px-3 rounded-xl font-bold text-xs transition border max-w-xs ${
                                    isVendor ? 'bg-white/20 text-white border-white/30 hover:bg-white/30' : 'bg-slate-900 text-white border-slate-700 hover:bg-slate-800'
                                  }`}
                                >
                                  <span className="text-amber-400 font-extrabold text-sm">📄</span>
                                  <span className="truncate">Document / PDF Attachment</span>
                                </a>
                              ))}

                              {parsed.driveLinks.map((driveUrl, i) => (
                                <a
                                  key={i}
                                  href={driveUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center gap-2 p-2 px-3 rounded-xl font-bold text-xs transition border max-w-xs ${
                                    isVendor ? 'bg-white/20 text-white border-white/30 hover:bg-white/30' : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
                                  }`}
                                >
                                  <span className="text-blue-500 font-extrabold text-sm">📁</span>
                                  <span className="truncate">External Drive / Cloud Folder Link</span>
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Interactive Counter Quote Proposal CTA Card */}
                          {isCounterQuote && (
                            <div className={`mt-3 pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 ${isVendor ? 'border-white/20' : 'border-gray-100'}`}>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${isVendor ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
                                💰 Proposed Budget: {m.metadata?.counterBudget ? `₹${Number(m.metadata.counterBudget).toLocaleString('en-IN')}` : 'Budget Revision Requested'}
                              </span>
                              <a
                                href="/vendor/quotes"
                                className={`text-[11px] font-bold inline-flex items-center gap-1 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-xs ${
                                  isVendor
                                    ? 'bg-white text-primary hover:bg-white/90'
                                    : 'bg-primary text-white hover:bg-primary-dark shadow-primary/20'
                                }`}
                              >
                                <span>Send New Quotation</span>
                                <Icon name="chevronRight" size={11} />
                              </a>
                            </div>
                          )}

                          <div
                            className={`text-[9px] mt-1.5 font-semibold flex items-center justify-end gap-1 ${
                              isVendor ? 'text-white/70' : 'text-muted'
                            }`}
                          >
                            <span>{formatMessageTime(m.createdAt)}</span>
                            {isVendor && <Icon name="check" size={10} />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-muted text-xs">
                    Start the conversation regarding this client opportunity.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="p-3.5 bg-white border-t border-gray-100">
                {attachedUrl && (
                  <div className="mb-2 px-3 py-1.5 bg-lavender/50 border border-gray-200 rounded-2xl flex items-center gap-2">
                    {attachedUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) || attachedUrl.includes('/image/upload/') ? (
                      <img src={attachedUrl} alt="Attachment preview" className="w-8 h-8 rounded-lg object-cover border border-gray-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary grid place-items-center font-bold text-xs">📁</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-navy truncate">Attached Media / File</div>
                      <div className="text-[10px] text-muted truncate">{attachedUrl}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedUrl('')}
                      className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-0.5 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleMediaUpload}
                  accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.zip"
                  className="hidden"
                />

                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploadingMedia}
                    className="p-2.5 rounded-2xl border border-gray-200/80 bg-lavender/40 hover:bg-lavender text-muted hover:text-navy transition cursor-pointer disabled:opacity-40 shrink-0"
                    title="Attach file, image, video, or PDF"
                  >
                    {uploadingMedia ? (
                      <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin block" />
                    ) : (
                      <Icon name="upload" size={17} />
                    )}
                  </button>
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Type a message to client..."
                    disabled={sending || uploadingMedia}
                    className="flex-1 bg-lavender/60 border border-gray-200/80 rounded-2xl px-4 py-2.5 text-xs font-medium text-navy placeholder:text-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
                  />
                  <button
                    type="submit"
                    disabled={(!msgText.trim() && !attachedUrl) || sending || uploadingMedia}
                    className="rounded-2xl bg-primary hover:bg-primary-dark text-white px-5 py-2.5 text-xs font-bold transition disabled:opacity-40 cursor-pointer shadow-xs shadow-primary/20 flex items-center gap-1.5"
                  >
                    <span>{sending ? 'Sending...' : 'Send'}</span>
                    <Icon name="send" size={13} />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="hidden lg:grid place-items-center text-center p-8 bg-slate-50/50">
              <div className="max-w-xs space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary grid place-items-center mx-auto mb-2 shadow-xs">
                  <Icon name="message" size={22} />
                </div>
                <h4 className="text-sm font-bold text-navy">Select a Conversation</h4>
                <p className="text-xs text-muted">
                  Choose an inquiry or quote negotiation from the left rail to view communication history and reply.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img src={lightboxUrl} alt="Zoomed preview" className="w-full h-full object-contain max-h-[85vh]" />
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-3 right-3 bg-black/60 hover:bg-black text-white w-9 h-9 rounded-full grid place-items-center font-bold text-sm transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}
