import { useState, useEffect, useCallback, useRef } from 'react';
import { Page, Card} from './shared.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';
import { CardListSkeleton } from '../../../components/LoadingSkeleton.jsx';

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

export default function Messages() {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef(null);

  const loadThreads = useCallback(async (selectId = null) => {
    try {
      setLoading(true);
      const res = await externalApi.call('/vendor/messages/threads');
      if (res.ok && Array.isArray(res.threads)) {
        setThreads(res.threads);
        const targetId = selectId || activeThreadId || res.threads[0]?._id;
        if (targetId) {
          const match = res.threads.find((t) => t._id === targetId) || res.threads[0];
          if (match) {
            setActiveThreadId(match._id);
            setActiveThread(match);
          }
        } else {
          setActiveThread(null);
          setActiveThreadId(null);
        }
      }
    } catch (err) {
      console.warn('[Messages] Failed to load threads:', err.message);
    } finally {
      setLoading(false);
    }
  }, [activeThreadId]);

  useEffect(() => {
    loadThreads();
  }, []);

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
      try {
        const res = await externalApi.call(`/vendor/messages/threads/${t._id}`);
        if (res.ok && res.thread) {
          setActiveThread(res.thread);
          setThreads((prev) =>
            prev.map((item) => (item._id === t._id ? { ...item, unreadVendorCount: 0 } : item))
          );
        }
      } catch (err) {
        console.warn('[Messages] Mark read error:', err.message);
      }
    }
  }

  // Send message
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!msgText.trim() || !activeThreadId || sending) return;

    const sendingText = msgText.trim();
    setMsgText('');
    setSending(true);

    try {
      const res = await externalApi.call(`/vendor/messages/threads/${activeThreadId}`, {
        method: 'POST',
        body: { text: sendingText },
      });

      if (res.ok && res.thread) {
        setActiveThread(res.thread);
        setThreads((prev) =>
          prev.map((item) => (item._id === activeThreadId ? res.thread : item))
        );
      }
    } catch (err) {
      console.warn('[Messages] Send error:', err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Page
      title="Messages"
      sub="Direct, authenticated client communications and booking coordination."
    >
      {loading && threads.length === 0 ? (
        <CardListSkeleton count={4} />
      ) : threads.length === 0 ? (
        <Card className="text-center py-16 px-6 max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-primary-soft text-primary grid place-items-center mx-auto mb-4 shadow-xs">
            <Icon name="message" size={28} />
          </div>
          <h2 className="text-lg font-black text-navy">No Client Messages Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-2 leading-relaxed">
            Direct client messaging unlocks automatically when clients enquire about your services or confirm bookings.
            All messages are strictly tied to validated event requirements to prevent unqualified spam.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/vendor/enquiries"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold transition shadow-sm"
            >
              <Icon name="search" size={14} />
              <span>Browse Inbound Enquiries</span>
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
                className="p-1.5 rounded-lg hover:bg-lavender text-muted hover:text-navy transition"
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

                return (
                  <button
                    key={t._id}
                    onClick={() => handleSelectThread(t)}
                    className={`w-full flex items-start gap-3 p-4 text-left transition ${
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
                        {t.lastMessageText || 'New inquiry received'}
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
                    className="lg:hidden p-1.5 -ml-1 rounded-xl hover:bg-lavender text-muted hover:text-navy"
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
                  {activeThread.opportunity && (
                    <a
                      href="/vendor/enquiries"
                      className="px-3 py-1.5 rounded-xl border border-primary/30 text-primary hover:bg-primary-soft text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <span>Prepare Quote</span>
                      <Icon name="chevronRight" size={12} />
                    </a>
                  )}
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
                {activeThread.messages && activeThread.messages.length > 0 ? (
                  activeThread.messages.map((m, idx) => {
                    const isVendor = m.sender === 'VENDOR';
                    const isSystem = m.sender === 'SYSTEM' || m.sender === 'SUPPORT';

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
                          className={`max-w-[80%] sm:max-w-[70%] rounded-3xl px-4.5 py-3 text-xs leading-relaxed shadow-xs ${
                            isVendor
                              ? 'bg-primary text-white rounded-br-xs'
                              : 'bg-white text-navy border border-gray-100 rounded-bl-xs'
                          }`}
                        >
                          <p className="break-words font-medium">{m.text}</p>
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
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Type a message to client..."
                    disabled={sending}
                    className="flex-1 bg-lavender/60 border border-gray-200/80 rounded-2xl px-4 py-2.5 text-xs font-medium text-navy placeholder:text-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
                  />
                  <button
                    type="submit"
                    disabled={!msgText.trim() || sending}
                    className="px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-1.5 transition shadow-sm"
                  >
                    <span>Send</span>
                    <Icon name="send" size={13} />
                  </button>
                </form>
                <div className="mt-2 text-[10px] text-muted text-center flex items-center justify-center gap-1.5">
                  <Icon name="shield" size={11} className="text-emerald-600 shrink-0" />
                  <span>
                    Sensitive KYC and bank details are protected by STARVNT Core escrow and should not be shared in chat.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center bg-lavender/20">
              <div className="max-w-xs space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-lavender text-muted grid place-items-center mx-auto">
                  <Icon name="message" size={20} />
                </div>
                <h3 className="text-sm font-bold text-navy">Select a Conversation</h3>
                <p className="text-xs text-muted">
                  Choose an active inquiry from the left rail to view message history and reply.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

    </Page>
  );
}
