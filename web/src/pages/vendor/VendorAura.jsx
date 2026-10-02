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

const CHAT_THINKING_STATUS_DELAY_MS = 1200;
const CHAT_STATUS_ROTATION_MS = 2500;
const STATUS_MESSAGES = [
  'Thinking...',
  'Getting the right information for you...',
  'Checking the details...',
  'Putting this together...',
  'Using what I know to find the best answer...',
  'Analyzing the information...',
  'Almost there...',
];

const DESKTOP_MIN_W = 340;
const DESKTOP_MIN_H = 360;
const DESKTOP_MAX_W = 900;

function desktopPanelBounds(width, height) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    minX: 12,
    minY: 12,
    maxX: Math.max(12, vw - width - 12),
    maxY: Math.max(12, vh - height - 12),
    maxW: Math.min(DESKTOP_MAX_W, Math.max(DESKTOP_MIN_W, vw - 24)),
    maxH: Math.max(DESKTOP_MIN_H, vh - 24),
  };
}

function clampPanelPosition(pos, width, height) {
  const bounds = desktopPanelBounds(width, height);
  return {
    x: Math.round(Math.min(bounds.maxX, Math.max(bounds.minX, pos.x))),
    y: Math.round(Math.min(bounds.maxY, Math.max(bounds.minY, pos.y))),
  };
}

export default function VendorAura({ open, onClose, page, userId, prompt, setup }) {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(() => readSession(userId));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showThinkingStatus, setShowThinkingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
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
    setSending(true);
    setShowThinkingStatus(false);
    setStatusMessage(STATUS_MESSAGES[0]);

    setMessages((m) => [
      ...m,
      { role: 'user', content: message, actions: [] },
      { role: 'model', content: '', actions: [] },
    ]);

    const VOICE_PROGRESS_PHRASES = [
      'Okay, let me get that information for you.',
      'Sure, let me check that for you.',
      'Got it, I’m looking into that for you.',
    ];

    let hasReceivedToken = false;
    let thinkingTimer = null;
    let rotationInterval = null;
    let timeoutTimer = null;
    let voiceProgressTimer = null;
    let hasSpokenVoiceProgress = false;
    let statusIdx = 0;
    const abortController = new AbortController();

    thinkingTimer = setTimeout(() => {
      if (!hasReceivedToken) {
        setShowThinkingStatus(true);
        rotationInterval = setInterval(() => {
          statusIdx = (statusIdx + 1) % STATUS_MESSAGES.length;
          setStatusMessage(STATUS_MESSAGES[statusIdx]);
        }, CHAT_STATUS_ROTATION_MS);
      }
    }, CHAT_THINKING_STATUS_DELAY_MS);

    if (spoken) {
      voiceProgressTimer = setTimeout(() => {
        if (!hasReceivedToken && !hasSpokenVoiceProgress) {
          hasSpokenVoiceProgress = true;
          const phrase = VOICE_PROGRESS_PHRASES[Math.floor(Math.random() * VOICE_PROGRESS_PHRASES.length)];
          speakText(phrase);
        }
      }, CHAT_THINKING_STATUS_DELAY_MS);
    }

    timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, 25000);

    const cleanupTimers = () => {
      if (thinkingTimer) clearTimeout(thinkingTimer);
      if (rotationInterval) clearInterval(rotationInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (voiceProgressTimer) clearTimeout(voiceProgressTimer);
    };

    let accumulatedText = '';
    let donePayload = null;

    try {
      await externalApi.stream(
        '/vendor/aura/chat',
        {
          method: 'POST',
          body: { sessionId, message, page, ...(typeof confirm === 'boolean' ? { confirm } : {}) },
          signal: abortController.signal,
        },
        (event) => {
          if (event.type === 'status') {
            if (event.message) setStatusMessage(event.message);
          } else if (event.type === 'chunk') {
            if (!hasReceivedToken) {
              hasReceivedToken = true;
              cleanupTimers();
              setShowThinkingStatus(false);
            }
            accumulatedText += event.text || '';
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last && last.role === 'model') {
                next[next.length - 1] = { ...last, content: accumulatedText };
              }
              return next;
            });
          } else if (event.type === 'done') {
            donePayload = event;
            if (event.reply) {
              accumulatedText = event.reply;
              setMessages((m) => {
                const next = [...m];
                const last = next[next.length - 1];
                if (last && last.role === 'model') {
                  next[next.length - 1] = {
                    ...last,
                    content: event.reply,
                    actions: event.actions || [],
                  };
                }
                return next;
              });
            }
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Aura+ could not reply.');
          }
        }
      );

      cleanupTimers();
      setShowThinkingStatus(false);
      setSending(false);

      if (donePayload) {
        setPending(donePayload.pending || null);
        if (donePayload.profileUpdated) window.dispatchEvent(new Event('vendorProfileUpdated'));
        if (spoken && canSpeak) {
          setSpeaking(true);
          speakText(donePayload.reply || accumulatedText, () => setSpeaking(false));
        }
      }
      return accumulatedText;
    } catch (err) {
      cleanupTimers();
      setShowThinkingStatus(false);
      setSending(false);

      setMessages((m) => {
        let list = [...m];
        if (list.length > 0 && list[list.length - 1].role === 'model' && !accumulatedText) {
          list = list.slice(0, -1);
        }
        if (!accumulatedText && list.length > 0 && list[list.length - 1].role === 'user' && list[list.length - 1].content === message) {
          list = list.slice(0, -1);
        }
        return list;
      });

      if (!accumulatedText) {
        setInput(message);
        setError(ERRORS[err?.data?.error] || err?.message || 'Aura+ could not reply. Please try again.');
      }
      return null;
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

  // ── Draggable panel positioning on desktop (PC) ──────────────────────────
  // ── Smooth Sliding, Custom Resizing & Draggable panel positioning ─────────
  const [dockMode, setDockMode] = useState(() => {
    try {
      const saved = sessionStorage.getItem('vendor_aura_dock_mode');
      if (['docked', 'floating', 'minimized'].includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    return 'docked';
  });

  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const saved = sessionStorage.getItem('vendor_aura_width');
      const num = parseInt(saved, 10);
      if (num >= DESKTOP_MIN_W && num <= DESKTOP_MAX_W) return num;
    } catch {
      /* ignore */
    }
    return 420;
  });

  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      const saved = sessionStorage.getItem('vendor_aura_height');
      const num = parseInt(saved, 10);
      if (num >= DESKTOP_MIN_H && typeof window !== 'undefined') return Math.min(num, Math.max(DESKTOP_MIN_H, window.innerHeight - 24));
      if (num >= DESKTOP_MIN_H) return num;
    } catch {
      /* ignore */
    }
    return typeof window !== 'undefined' ? Math.min(720, Math.max(DESKTOP_MIN_H, window.innerHeight - 24)) : 680;
  });

  const [dragPos, setDragPos] = useState(() => {
    try {
      const saved = sessionStorage.getItem('vendor_aura_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const resizeRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, initialWidth: 420, initialHeight: 680, mode: 'left' });

  function updateDockMode(newMode) {
    setDockMode(newMode);
    try {
      sessionStorage.setItem('vendor_aura_dock_mode', newMode);
    } catch {
      /* ignore */
    }
  }

  // When an explicit prompt arrives, ensure Aura is visible and not minimized
  useEffect(() => {
    if (open && prompt?.text && dockMode === 'minimized') {
      updateDockMode('docked');
    }
  }, [open, prompt, dockMode]);

  function updatePanelWidth(newWidth) {
    const clamped = Math.max(DESKTOP_MIN_W, Math.min(newWidth, Math.max(DESKTOP_MIN_W, window.innerWidth - 60)));
    setPanelWidth(clamped);
    try {
      sessionStorage.setItem('vendor_aura_width', String(clamped));
    } catch {
      /* ignore */
    }
  }

  function cycleWidth() {
    if (panelWidth < 450) updatePanelWidth(520);
    else if (panelWidth < 580) updatePanelWidth(680);
    else updatePanelWidth(380);
  }

  function updatePanelHeight(newHeight) {
    const maxH = Math.max(DESKTOP_MIN_H, window.innerHeight - 24);
    const clamped = Math.max(DESKTOP_MIN_H, Math.min(newHeight, maxH));
    setPanelHeight(clamped);
    try {
      sessionStorage.setItem('vendor_aura_height', String(clamped));
    } catch {
      /* ignore */
    }
  }

  function cycleHeight() {
    if (panelHeight < 520) updatePanelHeight(620);
    else if (panelHeight < 720) updatePanelHeight(Math.max(DESKTOP_MIN_H, window.innerHeight - 24));
    else updatePanelHeight(430);
  }

  function handleDragStart(e) {
    if (window.innerWidth < 1024 || e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

    e.preventDefault();
    const panel = document.getElementById('vendor-aura-panel');
    const rect = panel ? panel.getBoundingClientRect() : { left: window.innerWidth - panelWidth - 16, top: 12 };

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };
    setIsDragging(true);
    if (dockMode !== 'floating') {
      updateDockMode('floating');
    }

    function onMouseMove(moveEvent) {
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      setDragPos(clampPanelPosition({ x: dragRef.current.initialX + dx, y: dragRef.current.initialY + dy }, panelWidth, panelHeight));
    }

    function onMouseUp() {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setDragPos((curr) => {
        if (curr) {
          try {
            sessionStorage.setItem('vendor_aura_pos', JSON.stringify(curr));
          } catch {
            /* ignore */
          }
        }
        return curr;
      });
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function handleResizeStart(e, mode = 'left') {
    if (window.innerWidth < 1024 || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const panel = document.getElementById('vendor-aura-panel');
    const rect = panel ? panel.getBoundingClientRect() : { left: window.innerWidth - panelWidth - 12, top: 12 };

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
      initialWidth: panelWidth,
      initialHeight: panelHeight,
      mode,
    };
    setIsResizing(true);
    if (dockMode !== 'floating' && mode !== 'left') {
      setDragPos(clampPanelPosition({ x: rect.left, y: rect.top }, panelWidth, panelHeight));
      updateDockMode('floating');
    }

    function onResizeMove(moveEvent) {
      const r = resizeRef.current;
      const bounds = desktopPanelBounds(panelWidth, panelHeight);
      const dx = moveEvent.clientX - r.startX;
      const dy = moveEvent.clientY - r.startY;

      let nextWidth = r.initialWidth;
      let nextHeight = r.initialHeight;
      let nextX = r.initialX;
      let nextY = r.initialY;

      if (r.mode.includes('left')) {
        nextWidth = Math.round(Math.min(bounds.maxW, Math.max(DESKTOP_MIN_W, r.initialWidth - dx)));
        nextX = r.initialX + (r.initialWidth - nextWidth);
      }
      if (r.mode.includes('right')) {
        nextWidth = Math.round(Math.min(bounds.maxW, Math.max(DESKTOP_MIN_W, r.initialWidth + dx)));
      }
      if (r.mode.includes('bottom')) {
        nextHeight = Math.round(Math.min(bounds.maxH, Math.max(DESKTOP_MIN_H, r.initialHeight + dy)));
      }
      if (r.mode.includes('top')) {
        nextHeight = Math.round(Math.min(bounds.maxH, Math.max(DESKTOP_MIN_H, r.initialHeight - dy)));
        nextY = r.initialY + (r.initialHeight - nextHeight);
      }

      setPanelWidth(nextWidth);
      setPanelHeight(nextHeight);
      if (dockMode === 'floating' || r.mode !== 'left') {
        setDragPos(clampPanelPosition({ x: nextX, y: nextY }, nextWidth, nextHeight));
      }
    }

    function onResizeEnd() {
      setIsResizing(false);
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
      setPanelWidth((w) => {
        try {
          sessionStorage.setItem('vendor_aura_width', String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
      setPanelHeight((h) => {
        try {
          sessionStorage.setItem('vendor_aura_height', String(h));
        } catch {
          /* ignore */
        }
        return h;
      });
      setDragPos((curr) => {
        if (curr) {
          try {
            sessionStorage.setItem('vendor_aura_pos', JSON.stringify(curr));
          } catch {
            /* ignore */
          }
        }
        return curr;
      });
    }

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }

  function dockToRight(e) {
    e?.stopPropagation?.();
    setDragPos(null);
    updateDockMode('docked');
    try {
      sessionStorage.removeItem('vendor_aura_pos');
    } catch {
      /* ignore */
    }
  }

  function switchToFloat(e) {
    e?.stopPropagation?.();
    const panel = document.getElementById('vendor-aura-panel');
    const rect = panel ? panel.getBoundingClientRect() : { left: window.innerWidth - panelWidth - 24, top: 16 };
    setDragPos(clampPanelPosition({ x: Math.max(16, rect.left - 40), y: Math.max(16, rect.top) }, panelWidth, panelHeight));
    updateDockMode('floating');
  }

  function snapTo(place) {
    if (window.innerWidth < 1024) return;
    const margin = 12;
    const wide = Math.min(Math.max(panelWidth, 520), Math.min(DESKTOP_MAX_W, window.innerWidth - 24));
    const tall = Math.min(Math.max(panelHeight, 500), window.innerHeight - 24);
    let nextWidth = panelWidth;
    let nextHeight = panelHeight;
    let next = { x: margin, y: margin };

    if (place === 'right') {
      nextWidth = Math.min(Math.max(panelWidth, 420), window.innerWidth - 24);
      nextHeight = window.innerHeight - 24;
      next = { x: window.innerWidth - nextWidth - margin, y: margin };
    } else if (place === 'left') {
      nextWidth = Math.min(Math.max(panelWidth, 420), window.innerWidth - 24);
      nextHeight = window.innerHeight - 24;
      next = { x: margin, y: margin };
    } else if (place === 'top') {
      nextWidth = wide;
      nextHeight = Math.min(Math.max(420, Math.round(window.innerHeight * 0.55)), window.innerHeight - 24);
      next = { x: Math.round((window.innerWidth - nextWidth) / 2), y: margin };
    } else if (place === 'bottom') {
      nextWidth = wide;
      nextHeight = Math.min(Math.max(420, Math.round(window.innerHeight * 0.55)), window.innerHeight - 24);
      next = { x: Math.round((window.innerWidth - nextWidth) / 2), y: window.innerHeight - nextHeight - margin };
    } else if (place === 'center') {
      nextWidth = wide;
      nextHeight = tall;
      next = { x: Math.round((window.innerWidth - nextWidth) / 2), y: Math.round((window.innerHeight - nextHeight) / 2) };
    }

    setPanelWidth(nextWidth);
    setPanelHeight(nextHeight);
    setDragPos(clampPanelPosition(next, nextWidth, nextHeight));
    updateDockMode('floating');
    try {
      sessionStorage.setItem('vendor_aura_width', String(nextWidth));
      sessionStorage.setItem('vendor_aura_height', String(nextHeight));
      sessionStorage.setItem('vendor_aura_pos', JSON.stringify(clampPanelPosition(next, nextWidth, nextHeight)));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    function handleWindowResize() {
      if (window.innerWidth < 1024) return;
      setDragPos((prev) => {
        if (!prev) return null;
        return clampPanelPosition(prev, panelWidth, panelHeight);
      });
    }
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [panelWidth, panelHeight]);

  if (!open) return null;

  // Minimized Floating Button
  if (dockMode === 'minimized') {
    return (
      <button
        type="button"
        onClick={() => updateDockMode('docked')}
        className="fixed right-3 bottom-20 lg:bottom-5 lg:right-5 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-2xl shadow-primary/30 border border-white/70 hover:scale-105 active:scale-95 transition-all group"
        title="Open Aura+"
        aria-label="Open Aura+"
      >
        <Icon name="bolt" size={18} />
        {pending && (
          <span
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white animate-pulse"
            title="Confirmation pending"
          />
        )}
      </button>
    );
  }

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

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  const isDocked = dockMode === 'docked' || !dragPos;

  const panelStyle = isDesktop
    ? isDocked
      ? {
          top: '12px',
          right: '12px',
          bottom: '12px',
          width: `${panelWidth}px`,
          maxWidth: 'calc(100vw - 24px)',
          height: 'calc(100vh - 24px)',
        }
      : {
          left: `${dragPos?.x || 20}px`,
          top: `${dragPos?.y || 20}px`,
          right: 'auto',
          bottom: 'auto',
          width: `${panelWidth}px`,
          maxWidth: 'calc(100vw - 24px)',
          height: `${panelHeight}px`,
          maxHeight: 'calc(100vh - 24px)',
        }
    : undefined;

  return (
    <>
      {/* Mobile backdrop only - on desktop background remains 100% interactive */}
      <div className="fixed inset-0 z-40 bg-navy/20 lg:hidden" onClick={onClose} />

      {/* Global transparent drag shield to guarantee smooth mouse events */}
      {(isDragging || isResizing) && (
        <div
          className={`fixed inset-0 z-[99999] select-none ${isResizing ? 'cursor-nwse-resize' : 'cursor-grabbing'}`}
        />
      )}

      <aside
        id="vendor-aura-panel"
        style={panelStyle}
        className={`fixed z-50 inset-0 w-screen h-[100dvh] max-h-[100dvh] rounded-none lg:w-auto lg:h-auto lg:max-h-none lg:rounded-3xl lg:inset-auto bg-white shadow-2xl border-0 lg:border lg:border-gray-100 flex flex-col overflow-hidden isolate transition-all duration-200 ease-out ${
          isDragging
            ? 'select-none transition-none shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] ring-2 ring-primary/40'
            : isResizing
            ? 'select-none transition-none ring-2 ring-primary/30'
            : isDocked
            ? 'animate-[slideInRight_.22s_cubic-bezier(0.16,1,0.3,1)]'
            : 'animate-[pop_.18s_ease-out]'
        }`}
        role="dialog"
        aria-label="Aura+ assistant"
      >
        {/* Left Edge Resize Handle (Desktop only) */}
        <div
          onMouseDown={(e) => handleResizeStart(e, 'left')}
          className="hidden lg:flex absolute left-0 top-0 bottom-0 w-3.5 -translate-x-1 cursor-ew-resize group z-30 items-center justify-center select-none"
          title="Drag to resize Aura width"
        >
          <div className="w-1 h-12 rounded-full bg-gray-200 group-hover:bg-primary group-hover:w-1.5 transition-all shadow-sm" />
        </div>

        {/* Bottom Edge Resize Handle (Desktop only) */}
        <div
          onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          className="hidden lg:flex absolute left-8 right-8 bottom-0 h-3.5 translate-y-1 cursor-ns-resize group z-30 items-center justify-center select-none"
          title="Drag to resize Aura height"
        >
          <div className="h-1 w-14 rounded-full bg-gray-200 group-hover:bg-primary group-hover:h-1.5 transition-all shadow-sm" />
        </div>

        {/* Corner Resize Handles (Desktop only) */}
        <button
          type="button"
          onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
          className="hidden lg:block absolute right-1 bottom-1 z-40 w-5 h-5 cursor-nwse-resize rounded-md text-gray-300 hover:text-primary"
          title="Drag corner to resize Aura"
          aria-label="Resize Aura"
        >
          <span className="absolute right-1 bottom-1 w-3 h-3 border-r-2 border-b-2 border-current rounded-br-sm" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => handleResizeStart(e, 'top-left')}
          className="hidden lg:block absolute left-1 top-1 z-40 w-5 h-5 cursor-nwse-resize rounded-md text-gray-200 hover:text-primary"
          title="Drag corner to resize Aura"
          aria-label="Resize Aura"
        >
          <span className="absolute left-1 top-1 w-3 h-3 border-l-2 border-t-2 border-current rounded-tl-sm" />
        </button>

        <header
          onMouseDown={handleDragStart}
          className="flex items-center gap-2 px-3.5 py-3 border-b border-gray-100 shrink-0 select-none lg:cursor-grab active:lg:cursor-grabbing group bg-white/95 backdrop-blur-sm"
          title="Drag header to move Aura anywhere on your screen"
        >
          <span className="hidden lg:flex items-center text-gray-300 group-hover:text-primary transition-colors cursor-grab active:cursor-grabbing shrink-0" title="Drag to move Aura">
            <Icon name="drag" size={15} />
          </span>
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-md shadow-primary/30 shrink-0">
            <Icon name="bolt" size={15} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-navy flex items-center gap-1.5">
              <span>Aura+</span>
              <span className="hidden lg:inline text-[9px] font-semibold text-primary/80 bg-primary-soft px-1.5 py-0.5 rounded">
                {isDocked ? 'Docked' : 'Floating'}
              </span>
            </div>
            <div className="text-[10px] text-muted truncate">Your business assistant · answers from your data</div>
          </div>

          {/* Width Preset Button */}
          <button
            type="button"
            onClick={cycleWidth}
            onMouseDown={(e) => e.stopPropagation()}
            className="hidden lg:inline-flex items-center text-[10px] font-bold text-muted hover:text-navy px-2 py-1 rounded-lg hover:bg-lavender transition cursor-pointer"
            title={`Current width: ${panelWidth}px. Click to cycle (380px → 520px → 680px)`}
          >
            ↔ {panelWidth}px
          </button>

          <button
            type="button"
            onClick={cycleHeight}
            onMouseDown={(e) => e.stopPropagation()}
            className="hidden xl:inline-flex items-center text-[10px] font-bold text-muted hover:text-navy px-2 py-1 rounded-lg hover:bg-lavender transition cursor-pointer"
            title={`Current height: ${Math.round(panelHeight)}px. Click to cycle short, medium, full height.`}
          >
            ↕ {Math.round(panelHeight)}px
          </button>

          <div className="hidden xl:flex items-center gap-0.5 rounded-lg bg-lavender/70 p-0.5" onMouseDown={(e) => e.stopPropagation()} title="Snap Aura to screen edges">
            {[
              ['left', 'L'],
              ['top', 'T'],
              ['center', 'C'],
              ['bottom', 'B'],
              ['right', 'R'],
            ].map(([place, label]) => (
              <button
                key={place}
                type="button"
                onClick={() => snapTo(place)}
                className="w-5 h-5 rounded-md text-[9px] font-extrabold text-muted hover:bg-white hover:text-primary transition"
                aria-label={`Snap Aura ${place}`}
                title={`Snap ${place}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Dock / Float Toggle */}
          {!isDocked ? (
            <button
              type="button"
              onClick={dockToRight}
              onMouseDown={(e) => e.stopPropagation()}
              className="hidden lg:grid w-7 h-7 place-items-center rounded-lg hover:bg-lavender text-muted hover:text-navy transition cursor-pointer"
              title="Dock to right side"
              aria-label="Dock to right side"
            >
              <Icon name="dockRight" size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={switchToFloat}
              onMouseDown={(e) => e.stopPropagation()}
              className="hidden lg:grid w-7 h-7 place-items-center rounded-lg hover:bg-lavender text-muted hover:text-navy transition cursor-pointer"
              title="Float and drag freely"
              aria-label="Float and drag freely"
            >
              <Icon name="float" size={13} />
            </button>
          )}

          {/* Minimize Button */}
          <button
            type="button"
            onClick={() => updateDockMode('minimized')}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender text-muted hover:text-navy transition cursor-pointer"
            title="Minimize Aura (keep active in corner)"
            aria-label="Minimize"
          >
            <Icon name="minus" size={14} />
          </button>

          {mode === 'aura' && (
            <button onClick={newChat} onMouseDown={(e) => e.stopPropagation()} className="text-[11px] font-bold text-primary rounded-lg px-2 py-1 hover:bg-primary-soft transition cursor-pointer" title="Start a new chat">
              New chat
            </button>
          )}
          <button onClick={onClose} onMouseDown={(e) => e.stopPropagation()} className="w-8 h-8 grid place-items-center rounded-xl hover:bg-lavender text-ink/60 transition cursor-pointer" aria-label="Close Aura+">
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
          {messages.map((m, i) => {
            if (m.role === 'model' && !m.content) return null;
            return <Bubble key={i} m={m} onAction={goTo} />;
          })}
          {pending && !sending && (
            <div className="ml-9 rounded-2xl border border-primary/30 bg-primary-soft/40 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-primary">
                {pending.kind === 'block_date'
                  ? (pending.isUpdate || pending.summary?.startsWith('Update') ? 'Update Calendar Date' : 'Block Calendar Date')
                  : pending.kind === 'revise_quote'
                  ? 'Revise Offer'
                  : pending.kind === 'create_quote'
                  ? 'Send Quotation'
                  : 'Save this?'}
              </div>
              <div className="text-[12px] font-semibold text-navy mt-0.5">{pending.summary}</div>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() =>
                    send(
                      pending.kind === 'block_date'
                        ? (pending.isUpdate || pending.summary?.startsWith('Update') ? 'Confirm Update' : 'Confirm Block')
                        : pending.kind === 'revise_quote'
                        ? 'Send Revised Offer'
                        : pending.kind === 'create_quote'
                        ? 'Send Quote'
                        : 'Yes, save it',
                      { confirm: true }
                    )
                  }
                  className="rounded-xl bg-primary text-white text-[11px] font-bold px-3 py-1.5 shadow-sm hover:opacity-95 transition-opacity"
                >
                  {pending.kind === 'block_date'
                    ? (pending.isUpdate || pending.summary?.startsWith('Update') ? '✓ Confirm Update' : '✓ Confirm Block')
                    : pending.kind === 'revise_quote'
                    ? '✓ Send Revised Offer'
                    : pending.kind === 'create_quote'
                    ? '✓ Send Quote'
                    : '✓ Save'}
                </button>
                <button
                  onClick={() => send('Cancel', { confirm: false })}
                  className="rounded-xl border border-gray-200 bg-white text-navy text-[11px] font-bold px-3 py-1.5 hover:bg-lavender transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1.5">
                Or reply “yes” / “haan” / “confirm” — or tell me what to change.
              </p>
            </div>
          )}
          {sending && showThinkingStatus && (
            <div className="flex gap-2 items-center text-[11px] text-muted pl-1">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0">
                <Icon name="bolt" size={13} />
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping shrink-0" />
                <span>{statusMessage}</span>
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
          <p className="text-[9px] text-muted/70 px-1 flex items-center justify-between gap-2 leading-none min-w-0">
            <span className="truncate">Aura saves only after you confirm.</span>
            <button onClick={() => setMode('manual')} className="shrink-0 font-bold text-primary hover:underline">
              Manual setup →
            </button>
          </p>
        </div>
        )}

        <VoiceAgentOverlay
          agent={agent}
          embedded
          title="Aura+"
          subtitle="Your business assistant · voice"
          lang={voiceLang}
          onToggleLang={() => setVoiceLang((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))}
        />
      </aside>
    </>
  );
}
