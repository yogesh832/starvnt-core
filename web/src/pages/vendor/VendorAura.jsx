import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { externalApi } from '../../lib/api.js';
import { useVoiceAgent, VoiceAgentOverlay } from '../../components/VoiceAgent.jsx';

/**
 * Vendor Aura+: answers from the vendor's own data and links to the page
 * where they can act. The only thing it saves is the brand basics (name,
 * category, city) during profile setup; everything else is done on the pages.
 */

// Same 5 steps, order and checks as the dashboard onboarding (activation checklist).
const SETUP_STEPS = [
  { key: 'profile', title: 'Brand name, category & city', done: (c) => c.profile, to: '/vendor/profile', prompt: 'Help me set up my brand profile' },
  { key: 'services', title: 'Add a service with a price', done: (c) => c.services, to: '/vendor/services', prompt: 'How do I add my first service?' },
  { key: 'capabilities', title: 'Team & equipment', done: (c) => c.capabilities, to: '/vendor/services?action=gear', prompt: 'What should I add for team and equipment?' },
  { key: 'coverage', title: 'Location & coverage area', done: (c) => c.locations && c.coverage, to: '/vendor/services?action=coverage', prompt: 'How do I set my location and coverage area?' },
  { key: 'portfolio', title: 'Add a portfolio project', done: (c) => c.portfolio, to: '/vendor/portfolio', prompt: 'What should I put in my portfolio?' },
];

const START_SETUP = 'Help me complete my profile setup';

/** Profile setup checklist: each open step can be done with Aura+ or manually. */
function SetupCard({ setup, expanded, onToggle, onAura, onManual, busy }) {
  const steps = SETUP_STEPS.map((s) => ({ ...s, isDone: Boolean(s.done(setup.checklist)) }));
  const next = steps.find((s) => !s.isDone);
  return (
    <div className="mx-4 mt-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-soft/60 to-white shrink-0">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 pt-2.5 pb-2 text-left" aria-expanded={expanded}>
        <span className="text-[12px] font-extrabold text-navy flex-1">Complete your profile</span>
        <span className="text-[11px] font-bold text-primary">{setup.percent}%</span>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} className="text-muted" />
      </button>
      <div className="mx-3 mb-2.5 h-1.5 rounded-full bg-white overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.max(4, setup.percent)}%` }} />
      </div>
      {expanded && (
        <ul className="px-3 pb-3 space-y-1.5">
          {steps.map((s, i) => (
            <li key={s.key} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${s === next ? 'bg-white shadow-sm' : ''}`}>
              <span
                className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold shrink-0 ${
                  s.isDone ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200 text-muted'
                }`}
              >
                {s.isDone ? '✓' : i + 1}
              </span>
              <span className={`flex-1 min-w-0 text-[12px] truncate ${s.isDone ? 'text-muted line-through' : 'font-semibold text-navy'}`}>{s.title}</span>
              {!s.isDone && (
                <span className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onAura(s.prompt)}
                    disabled={busy}
                    className="rounded-lg bg-primary text-white text-[10px] font-bold px-2 py-1 disabled:opacity-50"
                    title="Let Aura+ guide you"
                  >
                    With Aura
                  </button>
                  <button onClick={() => onManual(s.to)} className="rounded-lg border border-gray-200 bg-white text-navy text-[10px] font-bold px-2 py-1 hover:bg-lavender" title="Open the page and do it yourself">
                    Manually
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

/** ChatGPT-style voice-mode glyph: five bars; they pulse while Aura+ listens. */
function WaveIcon({ active = false }) {
  return (
    <span className="flex items-center gap-[2px] h-4" aria-hidden="true">
      {[6, 11, 15, 11, 6].map((h, i) => (
        <span
          key={i}
          className={`w-[2.5px] rounded-full bg-current ${active ? 'animate-pulse' : ''}`}
          style={{ height: h, animationDelay: active ? `${i * 0.12}s` : undefined }}
        />
      ))}
    </span>
  );
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

export default function VendorAura({ open, onClose, page, userId, prompt, setup }) {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(() => readSession(userId));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [mode, setModeState] = useState(readMode);
  const [setupExpanded, setSetupExpanded] = useState(true);
  const setupIncomplete = Boolean(setup?.checklist) && setup.percent < 100;
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
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages || []);
        setPending(res.pending || null);
      })
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

  // A setup action (service, team & gear, location, coverage) waiting for the vendor's OK.
  const [pending, setPending] = useState(null);

  // ── Voice (ChatGPT-style) ────────────────────────────────────────────────
  // 'dictate' = mic fills the box only; 'converse' = voice mode: send when the
  // vendor stops talking and read the reply aloud.
  const [listening, setListening] = useState(null); // null | 'dictate' | 'converse'
  const [speaking, setSpeaking] = useState(false);
  const [voiceLang, setVoiceLang] = useState('en-IN');
  const recRef = useRef(null);

  /** Stop listening (keeping what was heard) and stop any reply being spoken. */
  function stopVoice() {
    recRef.current?.stop();
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  // Stop listening/speaking when the panel closes or unmounts.
  useEffect(() => {
    const abort = () => {
      recRef.current?.abort();
      if (canSpeak) window.speechSynthesis.cancel();
      setSpeaking(false);
    };
    if (!open) abort();
    return abort;
  }, [open]);

  function startVoice(voiceMode) {
    if (listening || speaking) return stopVoice();
    if (!Recognition) return setError('Voice input is not supported in this browser. Try Chrome or Edge.');
    setError('');
    const rec = new Recognition();
    rec.lang = voiceLang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const prefix = voiceMode === 'dictate' && input.trim() ? `${input.trim()} ` : '';
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInput(`${prefix}${(finalText + interim).trim()}`);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone permission denied. Allow the mic in your browser to talk to Aura+.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Could not hear you. Please try again.');
    };
    rec.onend = () => {
      setListening(null);
      recRef.current = null;
      if (voiceMode === 'converse' && finalText.trim()) send(finalText, { spoken: true });
    };
    recRef.current = rec;
    setListening(voiceMode);
    rec.start();
  }

  async function send(text, { spoken = false, confirm } = {}) {
    const message = String(text || '').trim();
    if (!message || sending) return;
    setError('');
    setInput('');
    const optimistic = { role: 'user', content: message, actions: [] };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    try {
      const res = await externalApi.call('/vendor/aura/chat', {
        method: 'POST',
        body: { sessionId, message, page, ...(typeof confirm === 'boolean' ? { confirm } : {}) },
      });
      setMessages((m) => [...m, { role: 'model', content: res.reply, actions: res.actions || [] }]);
      setPending(res.pending || null);
      // Aura+ saved something for setup → refresh the portal header and the setup checklist.
      if (res.profileUpdated) window.dispatchEvent(new Event('vendorProfileUpdated'));
      // Asked by voice → answer by voice too.
      if (spoken && canSpeak) {
        setSpeaking(true);
        speakText(res.reply, () => setSpeaking(false));
      }
      return res.reply; // the voice agent speaks this
    } catch (err) {
      setMessages((m) => m.filter((x) => x !== optimistic));
      setInput(message);
      setError(ERRORS[err?.data?.error] || 'Aura+ could not reply. Please try again.');
      return null;
    } finally {
      setSending(false);
    }
  }

  // Voice mode (orb): a continuous spoken conversation; each turn goes through send(),
  // so setup confirmations work by voice too ("haan" / "no").
  const agent = useVoiceAgent({ lang: voiceLang, onUtterance: (t) => send(t) });
  useEffect(() => {
    if (!open && agent.open) agent.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    setPending(null);
    setError('');
    setLoaded(true);
  }

  function goTo(to) {
    navigate(to);
    if (window.matchMedia?.('(max-width: 1023px)').matches) onClose();
  }

  function setupWithAura(text) {
    setMode('aura');
    setSetupExpanded(false);
    send(text);
  }

  if (!open) return null;
  const chips = [...(setupIncomplete ? [START_SETUP] : []), ...(PAGE_PROMPTS[page] || []), ...QUICK].slice(0, 5);
  const setupCard = setupIncomplete && (
    <SetupCard
      setup={setup}
      expanded={setupExpanded}
      onToggle={() => setSetupExpanded((v) => !v)}
      onAura={setupWithAura}
      onManual={goTo}
      busy={sending}
    />
  );

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

        {setupCard}

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
          {messages.length === 0 && !sending && (setupIncomplete ? (
            <div className="text-center pt-4">
              <div className="text-sm font-extrabold text-navy">Welcome! Let's set up your business.</div>
              <p className="text-xs text-muted mt-1 max-w-[290px] mx-auto">
                Customers can find and book you once all 5 steps above are done. Just talk or type — I'll set up your brand, services
                with prices, team &amp; gear, location and coverage (you confirm before I save). Or tap “Manually” on any step.
              </p>
              <button
                onClick={() => setupWithAura(START_SETUP)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 shadow-md shadow-primary/25"
              >
                <Icon name="bolt" size={13} /> Start setup with Aura
              </button>
            </div>
          ) : (
            <div className="text-center pt-6">
              <div className="text-sm font-extrabold text-navy">Hi! I'm Aura+.</div>
              <p className="text-xs text-muted mt-1 max-w-[280px] mx-auto">
                Ask me anything about your enquiries, quotes, bookings, payments, reviews or profile — in English, Hindi or Hinglish.
              </p>
            </div>
          ))}
          {messages.map((m, i) => (
            <Bubble key={i} m={m} onAction={goTo} />
          ))}
          {pending && !sending && (
            <div className="ml-9 rounded-2xl border border-primary/30 bg-primary-soft/40 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-primary">Save this?</div>
              <div className="text-[12px] font-semibold text-navy mt-0.5">{pending.summary}</div>
              <div className="flex gap-2 mt-2.5">
                <button onClick={() => send('Yes, save it', { confirm: true })} className="rounded-xl bg-primary text-white text-[11px] font-bold px-3 py-1.5">
                  ✓ Save
                </button>
                <button onClick={() => send('Cancel', { confirm: false })} className="rounded-xl border border-gray-200 bg-white text-navy text-[11px] font-bold px-3 py-1.5 hover:bg-lavender">
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1.5">Or just say “yes” / “haan” — or tell me what to change.</p>
            </div>
          )}
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
          {/* ChatGPT-style composer: + · text · language · mic (dictate) · voice mode / send */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-1 rounded-full border border-gray-200 bg-white shadow-sm focus-within:border-primary/40 pl-1.5 pr-1.5 py-1.5 transition"
          >
            <button type="button" onClick={newChat} className="w-8 h-8 grid place-items-center rounded-full text-ink/70 hover:bg-lavender shrink-0" title="New chat" aria-label="New chat">
              <Icon name="plus" size={17} />
            </button>
            <input
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening === 'converse' ? 'Listening… speak now' : listening === 'dictate' ? 'Listening… tap the mic to stop' : 'Ask Aura+ anything'}
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] px-1"
            />
            {Recognition && (
              <>
                <button
                  type="button"
                  onClick={() => setVoiceLang((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))}
                  className="h-8 rounded-full px-2 text-[11px] font-semibold text-ink/70 hover:bg-lavender shrink-0 inline-flex items-center gap-1"
                  title="Voice language — English / Hindi"
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-current grid place-items-center text-[7px] font-bold">{voiceLang === 'en-IN' ? 'A' : 'अ'}</span>
                  {voiceLang === 'en-IN' ? 'EN' : 'हि'}
                </button>
                <button
                  type="button"
                  onClick={() => (listening === 'dictate' ? stopVoice() : startVoice('dictate'))}
                  disabled={sending || listening === 'converse' || speaking}
                  className={`relative w-8 h-8 rounded-full grid place-items-center shrink-0 transition disabled:opacity-40 ${
                    listening === 'dictate' ? 'bg-red-50 text-red-500' : 'text-ink/70 hover:bg-lavender'
                  }`}
                  title={listening === 'dictate' ? 'Stop dictation' : 'Dictate (fills the box)'}
                  aria-label={listening === 'dictate' ? 'Stop dictation' : 'Dictate'}
                >
                  {listening === 'dictate' && <span className="absolute inset-1 rounded-full bg-red-400/30 animate-ping" />}
                  <Icon name="mic" size={16} className="relative" />
                </button>
              </>
            )}
            {(input.trim() && !listening) || !Recognition ? (
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center shrink-0 disabled:opacity-50"
                aria-label="Send"
                title="Send"
              >
                <Icon name="send" size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (speaking ? stopVoice() : agent.start())}
                disabled={(sending || listening) && !speaking}
                className="relative w-8 h-8 rounded-full text-white grid place-items-center shrink-0 transition disabled:opacity-50 bg-primary hover:bg-primary-dark"
                title={speaking ? 'Stop speaking' : 'Talk to Aura+ (voice mode)'}
                aria-label={speaking ? 'Stop speaking' : 'Voice mode'}
              >
                <span className="relative">{speaking ? <span className="block w-2.5 h-2.5 rounded-[3px] bg-white" /> : <WaveIcon />}</span>
              </button>
            )}
          </form>
          <p className="text-[10px] text-muted/80 px-1 flex items-center justify-between gap-2">
            <span>Aura+ sets up your profile after you confirm; quotes, bookings and payments stay in your hands.</span>
            <button onClick={() => setMode('manual')} className="shrink-0 font-bold text-primary hover:underline">
              Prefer to do it yourself? Ask manually →
            </button>
          </p>
        </div>
        )}
      </aside>

      <VoiceAgentOverlay
        agent={agent}
        title="Aura+"
        subtitle="Your business assistant · voice"
        lang={voiceLang}
        onToggleLang={() => setVoiceLang((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))}
      />
    </>
  );
}
