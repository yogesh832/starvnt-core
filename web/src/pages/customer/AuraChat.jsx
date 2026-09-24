import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { customerApi, errorText } from './customerApi.js';
import UnderstandingCard from './UnderstandingCard.jsx';

const QUICK_PROMPTS = [
  "My daughter's wedding",
  'Plan a milestone birthday',
  'Corporate event for 300 people',
  'Arrange a Puja',
  'Plan an anniversary',
];
const EVENT_PROMPTS = ['What am I missing?', 'Budget check', 'Is everything on track?', 'Where are we?'];

const newSessionId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

/** One Aura+ session per customer per event, kept in sessionStorage. */
function sessionKey(userId, eventId) {
  return `aura_session:${userId}:${eventId || 'new'}`;
}
function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* the chat still works; it just won't survive a reload */
  }
}

function Bubble({ from, children }) {
  return (
    <div className={`flex ${from === 'user' ? 'justify-end' : 'gap-2.5'}`}>
      {from !== 'user' && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs shrink-0 mt-0.5 shadow-xs">
          <Icon name="bolt" size={13} />
        </div>
      )}
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-3xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
          from === 'user' ? 'bg-primary text-white rounded-br-xs shadow-xs' : 'bg-white border border-gray-100 rounded-tl-xs shadow-xs text-navy'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Voice input (Web Speech API). Fills the box only; never sends by itself. */
function useVoice(onText) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const recRef = useRef(null);
  const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  function toggle() {
    if (!Speech) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Speech();
    rec.lang = lang;
    rec.interimResults = false;
    rec.onresult = (e) => onText(Array.from(e.results).map((r) => r[0].transcript).join(' '));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }
  return { supported: Boolean(Speech), listening, lang, setLang, toggle };
}

export default function AuraChat({ firstName }) {
  const { user } = useExternalAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scopedEventId = params.get('event');
  const key = sessionKey(user?.id, scopedEventId);

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [understanding, setUnderstanding] = useState(null);
  const [nextQ, setNextQ] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const askedRef = useRef(false);

  const voice = useVoice((t) => {
    setInput((prev) => (prev ? `${prev} ${t}` : t));
    inputRef.current?.focus();
  });

  const applyState = useCallback((s) => {
    setActiveEvent(s.activeEvent || null);
    setUnderstanding(s.understanding || null);
    setNextQ(s.nextQuestion || null);
  }, []);

  // Load (or start) the session for this event scope; history comes from the server.
  useEffect(() => {
    let cancelled = false;
    let sid = readSession(key);
    if (params.get('new') === '1' || !sid) {
      sid = newSessionId();
      writeSession(key, sid);
    }
    if (params.get('new') === '1') {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
    setSessionId(sid);
    setLoading(true);
    setError('');
    customerApi
      .auraSession(sid, scopedEventId)
      .then((s) => {
        if (cancelled) return;
        setMessages(s.messages || []);
        applyState(s);
      })
      .catch((err) => !cancelled && setError(errorText(err, "Couldn't load this conversation.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, understanding, sending]);

  const send = useCallback(
    async (text, extra = {}) => {
      const msg = (text ?? '').trim();
      if (!msg || !sessionId || sending) return;
      setInput('');
      setError('');
      setSending(true);
      setMessages((prev) => [...prev, { role: 'user', content: msg }]);
      try {
        const res = await customerApi.auraChat({ sessionId, message: msg, eventId: scopedEventId || undefined, ...extra });
        setMessages((prev) => [...prev, { role: 'model', content: res.reply }]);
        applyState(res);
      } catch (err) {
        setMessages((prev) => prev.slice(0, -1));
        setInput(msg);
        setError(errorText(err, "Aura+ couldn't reply. Please try again."));
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending, scopedEventId, applyState]
  );

  // ?ask= auto-sends once, then leaves the URL clean.
  useEffect(() => {
    const ask = params.get('ask');
    if (!ask || loading || !sessionId || askedRef.current) return;
    askedRef.current = true;
    const next = new URLSearchParams(params);
    next.delete('ask');
    next.delete('new');
    setParams(next, { replace: true });
    send(ask);
  }, [params, loading, sessionId, send, setParams]);

  function onChip(opt) {
    if (opt.prefill) {
      setInput(opt.prefill);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (opt.skipTopic) send(opt.label, { skipTopic: opt.skipTopic });
    else if (opt.budgetRange) send(opt.label, { budgetRange: opt.budgetRange });
    else send(opt.message || opt.label);
  }

  function newChat() {
    const sid = newSessionId();
    writeSession(sessionKey(user?.id, null), sid);
    askedRef.current = false;
    if (scopedEventId) navigate('/customer/aura');
    else {
      setSessionId(sid);
      setMessages([]);
      applyState({});
    }
  }

  function onCardChanged(detail) {
    setActiveEvent(detail.event);
    setUnderstanding(detail.understanding);
    if (detail.event?.status !== 'draft') setNextQ(null);
  }

  const chips = (() => {
    if (sending || loading) return [];
    if (messages.length === 0) return QUICK_PROMPTS.map((p) => ({ label: p, message: p }));
    if (nextQ?.options?.length) return nextQ.options;
    if (activeEvent && activeEvent.status !== 'draft') return EVENT_PROMPTS.map((p) => ({ label: p, message: p }));
    return [];
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 sm:px-6 py-3 border-b border-gray-100 bg-white/70 backdrop-blur-sm">
        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-sm shrink-0">
          <Icon name="bolt" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          {activeEvent ? (
            <Link to={`/customer/events/${activeEvent.id}`} className="text-sm font-extrabold text-navy hover:text-primary truncate block">{activeEvent.title}</Link>
          ) : (
            <div className="text-sm font-extrabold text-navy">Aura+</div>
          )}
          <div className="text-[10px] text-muted">Your event assistant</div>
        </div>
        <button onClick={newChat} className="text-[11px] font-bold rounded-xl border border-gray-200 px-3 py-1.5 text-navy hover:bg-lavender shrink-0">New chat</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 space-y-4 max-w-3xl w-full mx-auto">
        <Bubble from="model">Hi{firstName ? ` ${firstName}` : ''}! 👋 What are you planning? Tell me in your own words. I'll figure out the rest.</Bubble>

        {loading && <div className="text-[11px] text-muted pl-10">Loading your conversation…</div>}
        {messages.map((m, i) => (
          <Bubble key={i} from={m.role}>{m.content}</Bubble>
        ))}

        {understanding && activeEvent && (
          <div className="pl-10">
            <UnderstandingCard understanding={understanding} event={activeEvent} onChanged={onCardChanged} />
          </div>
        )}

        {sending && (
          <div className="pl-10 text-[11px] text-muted inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Aura+ is thinking…
          </div>
        )}
        {error && <div className="pl-10 text-[11px] text-red-500">{error}</div>}

        {chips.length > 0 && (
          <div className="pl-10 space-y-2">
            {/* In a draft, the question is already in Aura's reply. */}
            {nextQ?.question && activeEvent && activeEvent.status !== 'draft' && (
              <div className="text-[10px] font-bold text-muted uppercase tracking-wide">{nextQ.question}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
              {chips.map((c) => (
                <button
                  key={c.label}
                  onClick={() => onChip(c)}
                  className="text-left text-xs font-semibold bg-white border border-primary/25 text-primary hover:bg-primary hover:text-white rounded-2xl px-4 py-2.5 transition shadow-xs"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="p-3 sm:p-4 max-w-3xl w-full mx-auto"
      >
        <div className="flex items-center gap-2 bg-white rounded-2xl shadow-lg shadow-primary/5 px-4 py-2.5 border border-gray-100">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending || loading}
            placeholder="Type a message or describe your event…"
            className="flex-1 outline-none text-xs sm:text-sm placeholder:text-muted/60 bg-transparent"
          />
          {voice.supported && (
            <>
              <button
                type="button"
                onClick={() => voice.setLang(voice.lang === 'en-IN' ? 'hi-IN' : 'en-IN')}
                className="text-[10px] font-bold text-muted hover:text-primary px-1"
                title="Voice language"
              >
                {voice.lang === 'en-IN' ? 'EN' : 'हि'}
              </button>
              <button
                type="button"
                onClick={voice.toggle}
                className={`p-1 transition ${voice.listening ? 'text-red-500 animate-pulse' : 'text-muted hover:text-primary'}`}
                title="Voice input"
                aria-label="Voice input"
              >
                <Icon name="mic" size={16} />
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={sending || loading || !input.trim()}
            className="w-9 h-9 grid place-items-center rounded-full bg-primary text-white hover:bg-primary-dark transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Send"
            aria-label="Send message"
          >
            <Icon name="send" size={14} className="-translate-y-px translate-x-px" />
          </button>
        </div>
        <p className="text-[10px] text-muted text-center mt-1.5">You decide — Aura+ never books or pays without you.</p>
      </form>
    </div>
  );
}
