import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { externalApi } from '../../lib/api.js';

/**
 * Vendor Aura+: answers from the vendor's own data and links to the page
 * where they can act. It never changes anything itself.
 */

const QUICK = ['What should I do today?', 'Show pending enquiries', "This week's bookings", "What's my payment status?", "What's missing in my profile?"];

const PAGE_PROMPTS = {
  enquiries: ['Which enquiries still need a reply?'],
  quotes: ['Which quotes are pending?', 'How many draft quotes do I have?'],
  bookings: ['When is my next booking?'],
  calendar: ['Which days are busy in the next 2 weeks?'],
  availability: ['Which dates are blocked?'],
  payments: ['Which bookings have the advance pending?'],
  reviews: ['Which reviews still need a reply?'],
  services: ['Summarise my services'],
  profile: ["What's missing for activation?"],
  documents: ["What's pending in my KYC?"],
};

// "Ask manually": plain shortcuts for vendors who'd rather do it themselves — no AI.
const MANUAL = [
  { page: 'enquiries', title: 'Reply to enquiries', sub: 'See new leads and send a quote', icon: 'message' },
  { page: 'quotes', title: 'Manage quotes', sub: 'Send drafts, track status', icon: 'quotes' },
  { page: 'bookings', title: 'View bookings', sub: 'Upcoming events, start / complete work', icon: 'bookings' },
  { page: 'availability', title: 'Block dates', sub: 'Mark holidays or busy days', icon: 'calendar' },
  { page: 'payments', title: 'Payments', sub: 'Advance and payment status', icon: 'wallet' },
  { page: 'reviews', title: 'Reply to reviews', sub: 'Respond to your customers', icon: 'star' },
  { page: 'services', title: 'Add / edit services', sub: 'Pricing and packages', icon: 'services' },
  { page: 'portfolio', title: 'Upload portfolio', sub: 'Add photos and videos', icon: 'image' },
  { page: 'documents', title: 'KYC documents', sub: 'GST, PAN, bank proof', icon: 'documents' },
  { page: 'profile', title: 'Complete your profile', sub: 'Brand, city, locations', icon: 'profile' },
];

const MODE_KEY = 'vendor_aura_mode';

function readMode() {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'manual' ? 'manual' : 'aura';
  } catch {
    return 'aura';
  }
}

const ERRORS = {
  RATE_LIMITED: 'Too many messages. Please wait a minute and try again.',
  MESSAGE_TOO_LONG: 'Message is too long (max 2000 characters).',
};

function storageKey(userId) {
  return `vendor_aura_session:${userId || 'me'}`;
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

function readSession(userId) {
  try {
    const sid = sessionStorage.getItem(storageKey(userId));
    if (sid) return sid;
  } catch {
    /* storage unavailable */
  }
  const sid = newId();
  writeSession(userId, sid);
  return sid;
}

function writeSession(userId, sid) {
  try {
    sessionStorage.setItem(storageKey(userId), sid);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Voice: speech-to-text for the question (browser Web Speech API) and
 * text-to-speech for Aura's reply. Nothing leaves the browser except the
 * transcribed text, which is sent like a typed message.
 */
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

function speakText(text, onDone) {
  if (!canSpeak || !text) return onDone?.();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[ऀ-ॿ]/.test(text) ? 'hi-IN' : /[ঀ-৿]/.test(text) ? 'bn-IN' : 'en-IN';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang) || window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.rate = 1;
  u.onend = () => onDone?.();
  u.onerror = () => onDone?.();
  window.speechSynthesis.speak(u);
}

function Bubble({ m, onAction }) {
  const mine = m.role === 'user';
  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0 mt-0.5">
          <Icon name="bolt" size={13} />
        </span>
      )}
      <div className={`max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
        <div
          className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
            mine ? 'bg-primary text-white rounded-br-md' : 'bg-lavender/70 text-navy rounded-bl-md'
          }`}
        >
          {m.content}
        </div>
        {!mine && m.actions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.actions.map((a) => (
              <button
                key={a.to}
                onClick={() => onAction(a.to)}
                className="rounded-full border border-primary/30 bg-white text-primary text-[11px] font-bold px-2.5 py-1 hover:bg-primary-soft transition"
              >
                {a.label} →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VendorAura({ open, onClose, page, userId, prompt }) {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(() => readSession(userId));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [mode, setModeState] = useState(readMode);
  const listRef = useRef(null);
  const lastPromptId = useRef(null);

  function setMode(next) {
    setModeState(next);
    try {
      sessionStorage.setItem(MODE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  // A question from the dashboard card always goes to Aura.
  useEffect(() => {
    if (prompt?.text) setMode('aura');
  }, [prompt]);

  // Load the conversation the first time the panel opens (and after "New chat").
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    externalApi
      .call(`/vendor/aura/sessions/${encodeURIComponent(sessionId)}`)
      .then((res) => !cancelled && setMessages(res.messages || []))
      .catch(() => {
        /* a fresh session simply starts empty */
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [open, loaded, sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, open, mode]);

  // ── Voice ────────────────────────────────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef(null);

  function stopVoice() {
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  // Stop listening/speaking when the panel closes or unmounts.
  useEffect(() => {
    if (!open) stopVoice();
    return () => stopVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleVoice() {
    if (listening || speaking) return stopVoice();
    if (!Recognition) return setError('Voice input is not supported in this browser. Try Chrome or Edge.');
    setError('');
    const rec = new Recognition();
    rec.lang = 'en-IN'; // understands English and Hinglish
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone permission denied. Allow the mic in your browser to talk to Aura+.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Could not hear you. Please try again.');
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) send(finalText, { spoken: true });
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function send(text, { spoken = false } = {}) {
    const message = String(text || '').trim();
    if (!message || sending) return;
    setError('');
    setInput('');
    const optimistic = { role: 'user', content: message, actions: [] };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    try {
      const res = await externalApi.call('/vendor/aura/chat', { method: 'POST', body: { sessionId, message, page } });
      setMessages((m) => [...m, { role: 'model', content: res.reply, actions: res.actions || [] }]);
      // Asked by voice → answer by voice too.
      if (spoken && canSpeak) {
        setSpeaking(true);
        speakText(res.reply, () => setSpeaking(false));
      }
    } catch (err) {
      setMessages((m) => m.filter((x) => x !== optimistic));
      setInput(message);
      setError(ERRORS[err?.data?.error] || 'Aura+ could not reply. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // A prompt handed over from elsewhere (dashboard card) is sent once the panel is ready.
  useEffect(() => {
    if (!open || !loaded || !prompt?.text || lastPromptId.current === prompt.id) return;
    lastPromptId.current = prompt.id;
    send(prompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded, prompt]);

  function newChat() {
    const sid = newId();
    writeSession(userId, sid);
    setSessionId(sid);
    setMessages([]);
    setError('');
    setLoaded(true);
  }

  function goTo(to) {
    navigate(to);
    if (window.matchMedia?.('(max-width: 1023px)').matches) onClose();
  }

  if (!open) return null;
  const chips = [...(PAGE_PROMPTS[page] || []), ...QUICK].slice(0, 5);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-navy/20 lg:hidden" onClick={onClose} />
      <aside
        className="fixed z-50 inset-0 lg:inset-auto lg:top-3 lg:right-3 lg:bottom-3 lg:w-[400px] bg-white lg:rounded-3xl shadow-2xl border border-gray-100 flex flex-col animate-[pop_.18s_ease-out]"
        role="dialog"
        aria-label="Aura+ assistant"
      >
        <header className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-md shadow-primary/30">
            <Icon name="bolt" size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-navy">Aura+</div>
            <div className="text-[10px] text-muted truncate">Your business assistant · answers from your data</div>
          </div>
          {mode === 'aura' && (
            <button onClick={newChat} className="text-[11px] font-bold text-primary rounded-lg px-2 py-1 hover:bg-primary-soft" title="Start a new chat">
              New chat
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-xl hover:bg-lavender text-ink/60" aria-label="Close Aura+">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="px-4 pt-3 shrink-0" role="tablist">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-lavender/70 p-1">
            {[
              ['aura', 'Ask Aura', 'bolt'],
              ['manual', 'Ask manually', 'edit'],
            ].map(([key, label, icon]) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold transition ${
                  mode === key ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-navy'
                }`}
              >
                <Icon name={icon} size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'manual' ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2">
            <p className="text-[11px] text-muted px-1 pb-1">Go straight to what you want to do:</p>
            {MANUAL.map((s) => {
              const here = s.page === page;
              return (
                <button
                  key={s.page}
                  onClick={() => goTo(`/vendor/${s.page}`)}
                  className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition hover:shadow-sm ${
                    here ? 'border-primary/40 bg-primary-soft/40' : 'border-gray-100 hover:bg-lavender/50'
                  }`}
                >
                  <span className="w-9 h-9 rounded-xl bg-lavender text-primary grid place-items-center shrink-0">
                    <Icon name={s.icon} size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-navy truncate">{s.title}</span>
                      {here && <span className="text-[9px] font-bold uppercase rounded-full bg-primary text-white px-1.5 py-0.5 shrink-0">You're here</span>}
                    </span>
                    <span className="block text-[11px] text-muted truncate">{s.sub}</span>
                  </span>
                  <Icon name="chevronRight" size={15} className="text-muted shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !sending && (
            <div className="text-center pt-6">
              <div className="text-sm font-extrabold text-navy">Hi! I'm Aura+.</div>
              <p className="text-xs text-muted mt-1 max-w-[280px] mx-auto">
                Ask me anything about your enquiries, quotes, bookings, payments, reviews or profile — in English, Hindi or Hinglish.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} m={m} onAction={goTo} />
          ))}
          {sending && (
            <div className="flex gap-2 items-center text-[11px] text-muted">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center">
                <Icon name="bolt" size={13} />
              </span>
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:.3s]" />
              </span>
            </div>
          )}
        </div>
        )}

        {mode === 'manual' ? (
          <div className="px-4 py-3 border-t border-gray-100 shrink-0 text-[10px] text-muted/80">
            These shortcuts open the page directly — no AI involved.
          </div>
        ) : (
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 shrink-0 space-y-2">
          {error && <div className="text-[11px] text-red-500 px-1">{error}</div>}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => send(c)}
                disabled={sending}
                className="shrink-0 rounded-full bg-lavender text-navy text-[11px] font-semibold px-3 py-1.5 hover:bg-primary-soft disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 focus-within:bg-white focus-within:border-primary/40 px-3 py-2"
          >
            <textarea
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={listening ? 'Listening… speak now' : 'Ask Aura+ about your business…'}
              className="flex-1 resize-none bg-transparent outline-none text-[13px] max-h-28 py-1"
            />
            {Recognition && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={sending && !speaking}
                className={`relative w-8 h-8 rounded-xl grid place-items-center shrink-0 transition disabled:opacity-50 ${
                  listening ? 'bg-red-500 text-white' : speaking ? 'bg-primary-soft text-primary' : 'bg-lavender text-primary hover:bg-primary-soft'
                }`}
                aria-label={listening ? 'Stop listening' : speaking ? 'Stop speaking' : 'Talk to Aura+'}
                title={listening ? 'Stop listening' : speaking ? 'Stop speaking' : 'Talk to Aura+ (voice)'}
              >
                {listening && <span className="absolute inset-0 rounded-xl bg-red-500/40 animate-ping" />}
                {speaking ? <span className="w-2.5 h-2.5 rounded-[3px] bg-primary" /> : <Icon name="mic" size={15} className="relative" />}
              </button>
            )}
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="w-8 h-8 rounded-xl bg-primary text-white grid place-items-center shrink-0 disabled:opacity-50"
              aria-label="Send"
            >
              <Icon name="send" size={15} />
            </button>
          </form>
          <p className="text-[10px] text-muted/80 px-1 flex items-center justify-between gap-2">
            <span>Aura+ only explains and suggests — quotes, bookings and payments stay in your hands.</span>
            <button onClick={() => setMode('manual')} className="shrink-0 font-bold text-primary hover:underline">
              Prefer to do it yourself? Ask manually →
            </button>
          </p>
        </div>
        )}
      </aside>
    </>
  );
}
