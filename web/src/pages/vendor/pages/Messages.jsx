import { useState, useEffect, useCallback, useRef } from 'react';
import { Page, Card } from './shared.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

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
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef(null);

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

  // Send message
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!msgText.trim() || !activeThread?._id || sending) return;

    setSending(true);
    const textToSend = msgText.trim();
    try {
      const res = await externalApi.call(`/vendor/messages/threads/${activeThread._id}`, {
        method: 'POST',
        body: { text: textToSend },
      });

      if (res.ok && res.message) {
        setMsgText('');
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
        <Card className="text-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-muted font-medium">Loading conversation threads...</p>
        </Card>
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
                    const isCounterQuote = m.metadata?.type === 'COUNTER_QUOTE' || m.text.includes('Counter Quote Proposal');

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
                          <p className="break-words font-medium whitespace-pre-line leading-relaxed">{m.text}</p>

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
    </Page>
  );
}
