import AuraMark from '../../components/AuraMark.jsx';
import { useEffect, useRef, useState } from 'react';
import { createAuraLive, sameAuraValue } from '../../../../shared/auraLive.ts';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import AuraActivity from '../../components/AuraActivity.jsx';
import { externalApi } from '../../lib/api.js';
import { useVoiceAgent, VoiceAgentOverlay } from '../../components/VoiceAgent.jsx';
import { stopAuraSpeaking, transcribeAuraAudio } from '../../lib/voice.js';
import { getAuraPrompts } from './vendorAuraPrompts.js';

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
  const doneCount = steps.filter((s) => s.isDone).length;
  const nextLabel = next ? next.title.replace('Brand name, category & city', 'Profile').replace('Add a service with a price', 'Service') : 'Ready';
  return (
    <div className="mx-3 mt-2 rounded-xl border border-primary/15 bg-white/95 px-2.5 py-2 shadow-xs shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-1.5 w-14 rounded-full bg-lavender overflow-hidden shrink-0">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.max(4, setup.percent)}%` }} />
        </div>
        <div className="min-w-0 flex-1 text-[11px] text-muted">
          <span className="font-extrabold text-navy">Profile {setup.percent}%</span>
          <span> · {doneCount}/{steps.length} done</span>
          {!next ? <span> · active</span> : <span> · next: {nextLabel}</span>}
        </div>
        {next ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onAura(next.prompt)}
              disabled={busy}
              className="rounded-lg bg-primary text-white text-[10px] font-bold px-2 py-1 disabled:opacity-50"
              title="Let Aura+ guide you"
            >
              Aura
            </button>
            <button
              onClick={() => onManual(next.to)}
              className="rounded-lg border border-gray-200 bg-white text-navy text-[10px] font-bold px-2 py-1 hover:bg-lavender"
              title="Open manually"
            >
              Open
            </button>
          </div>
        ) : (
          <Icon name="check" size={14} className="text-emerald-600 shrink-0" />
        )}
      </div>
    </div>
  );
}

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
 * Composer dictation uses ElevenLabs transcription. Continuous speech
 * playback is owned by VoiceAgent so a reply has exactly one audio owner.
 */
const voiceInputSupported =
  typeof window !== 'undefined' &&
  Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');

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
          <Icon name="aura" size={13} />
        </span>
      )}
      <div className={`min-w-0 max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1.5 [overflow-wrap:anywhere]`}>
        <div
          className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
            mine ? 'aura-user-message bg-primary text-white rounded-br-md' : 'aura-assistant-message bg-lavender/70 text-navy rounded-bl-md'
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

export default function VendorAura({ open, onClose, page, userId, prompt, setup, conversationRequest }) {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(() => readSession(userId));
  const currentSession = useRef(sessionId); currentSession.current = sessionId;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showThinkingStatus, setShowThinkingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
  const [error, setError] = useState('');
  const live = useRef(null), sendingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [activity, setActivity] = useState(null), [liveError, setLiveError] = useState('');
  const [mode, setModeState] = useState(readMode);
  const [setupExpanded, setSetupExpanded] = useState(true);
  const setupIncomplete = Boolean(setup?.checklist) && setup.percent < 100;
  const listRef = useRef(null);
  const lastPromptId = useRef(null);
  const lastConversationRequest = useRef(null);

  useEffect(() => {
    if (!conversationRequest || sending || lastConversationRequest.current === conversationRequest.id) return;
    lastConversationRequest.current = conversationRequest.id;
    setMode('aura');
    if (conversationRequest.newChat) {
      newChat();
    } else if (/^[A-Za-z0-9_-]{8,80}$/.test(conversationRequest.sessionId || '')) {
      writeSession(userId, conversationRequest.sessionId);
      setSessionId(conversationRequest.sessionId);
      setMessages([]);
      setPending(null);
      setError('');
      setLoaded(false);
    }
  }, [conversationRequest, sending, userId]);

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

  // Refresh visible cards without replacing an in-flight voice/text turn.
  useEffect(() => {
    if (!open || mode !== 'aura') return;
    const sync = createAuraLive({
      read: async () => {
        const request = new AbortController(), timeout = setTimeout(() => request.abort(), 15000);
        try { return await externalApi.call(`/vendor/aura/sessions/${encodeURIComponent(sessionId)}`, { signal: request.signal }); }
        finally { clearTimeout(timeout); }
      },
      apply: snapshot => {
        setActivity(previous => sameAuraValue(previous, snapshot.activity || null) ? previous : snapshot.activity || null);
        setMessages(previous => sameAuraValue(previous, snapshot.messages || []) ? previous : snapshot.messages || []);
        setPending(previous => sameAuraValue(previous, snapshot.pending || null) ? previous : snapshot.pending || null);
      },
      onSuccess: () => { setLoaded(true); setLiveError(''); }, onError: () => { setLoaded(true); setLiveError('Live activity could not refresh. Retrying automatically.'); },
    });
    live.current = sync;
    if (sendingRef.current) sync.beginWrite();
    const visible = () => { if (document.visibilityState === 'hidden') sync.stop(); else { sync.start(); void sync.refresh(); } };
    if (document.visibilityState !== 'hidden') sync.start();
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); window.addEventListener('online', visible);
    return () => {
      sync.stop(); if (live.current === sync) live.current = null;
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); window.removeEventListener('online', visible);
    };
  }, [open, mode, sessionId]);

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
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  /** Stop listening (keeping what was heard) and stop any reply being spoken. */
  function stopVoice() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;
    }
    stopAuraSpeaking();
    setSpeaking(false);
    setListening(null);
  }

  // Stop listening/speaking when the panel closes or unmounts.
  useEffect(() => {
    const abort = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (streamRef.current) {
        try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
        streamRef.current = null;
      }
      stopAuraSpeaking();
      setSpeaking(false);
      setListening(null);
    };
    if (!open) abort();
    return abort;
  }, [open]);

  async function startVoice(voiceMode) {
    if (listening || speaking) return stopVoice();
    if (!voiceInputSupported) return setError('Voice input is not supported in this browser.');
    setError('');
    const prefix = voiceMode === 'dictate' && input.trim() ? `${input.trim()} ` : '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setListening(null);
        mediaRecorderRef.current = null;
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
          streamRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 500) return;
        try {
          setInput(`${prefix}Transcribing…`);
          const text = await transcribeAuraAudio(blob);
          if (text) {
            setInput(`${prefix}${text}`);

          } else {
            setInput(prefix.trim());
          }
        } catch (err) {
          setError(err?.message || 'Could not transcribe voice');
        }
      };
      mediaRecorderRef.current = recorder;
      setListening(voiceMode);
      recorder.start(250);
      setInput(`${prefix}Listening…`);
    } catch {
      setError('Microphone permission denied. Allow mic access in your browser.');
      setListening(null);
    }
  }

  async function send(text, { confirm } = {}) {
    const message = String(text || '').trim();
    if (!message || sendingRef.current) return;
    const sync = live.current, expectedSession = sessionId; sync?.beginWrite(); sendingRef.current = true;
    setError('');
    setInput('');
    setSending(true);
    setShowThinkingStatus(false);
    setStatusMessage(STATUS_MESSAGES[0]);

    setMessages((m) => [
      ...m,
      { role: 'user', content: message, actions: [], page },
      { role: 'model', content: '', actions: [] },
    ]);

    let hasReceivedToken = false;
    let thinkingTimer = null;
    let rotationInterval = null;
    let timeoutTimer = null;
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

    timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, 55000);

    const cleanupTimers = () => {
      if (thinkingTimer) clearTimeout(thinkingTimer);
      if (rotationInterval) clearInterval(rotationInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
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
          if (currentSession.current !== expectedSession) return;
          if (event.type === 'status') {
            if (event.message) setStatusMessage(event.message);
          } else if (event.type === 'chunk') {
            if (!hasReceivedToken) {
              hasReceivedToken = true;
              cleanupTimers();
              setShowThinkingStatus(false);
            }
            accumulatedText += event.content || event.text || '';
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
      if (currentSession.current !== expectedSession) return null;
      setShowThinkingStatus(false);
      setSending(false);

      if (donePayload) {
        setPending(donePayload.pending || null);
        window.dispatchEvent(new Event('vendorAuraUpdated'));
        if (donePayload.profileUpdated) window.dispatchEvent(new Event('vendorProfileUpdated'));

      }
      return accumulatedText;
    } catch (err) {
      cleanupTimers();
      if (currentSession.current !== expectedSession) return null;
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
    } finally {
      if (currentSession.current === expectedSession) { sendingRef.current = false; if (live.current !== sync) live.current?.endWrite(); }
      sync?.endWrite();
    }
  }

  // Voice mode (orb): a continuous spoken conversation; each turn goes through send(),
  // so setup confirmations work by voice too ("haan" / "no").
  const agent = useVoiceAgent({ lang: voiceLang, onUtterance: (t, extra) => send(t, extra) });
  const sendInteractive = (text, extra) => agent.open ? agent.submit(text, extra) : send(text, extra);
  useEffect(() => {
    if ((!open || mode === 'manual') && agent.open) agent.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // A prompt handed over from elsewhere (dashboard card) is sent once the panel is ready.
  useEffect(() => {
    if (!open || !loaded || !prompt?.text || lastPromptId.current === prompt.id) return;
    lastPromptId.current = prompt.id;
    send(prompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded, prompt]);

  function newChat() {
    setActivity(null);
    agent.end();
    live.current?.stop(); live.current = null; sendingRef.current = false; setSending(false); setShowThinkingStatus(false);

    const sid = newId();
    currentSession.current = sid;
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
    if (open && (prompt?.text || conversationRequest) && dockMode === 'minimized') {
      updateDockMode('docked');
    }
  }, [open, prompt, conversationRequest, dockMode]);

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
        <AuraMark variant="orb" size={52} />
        {pending && (
          <span
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white animate-pulse"
            title="Confirmation pending"
          />
        )}
      </button>
    );
  }

  const chips = getAuraPrompts({ page, setup, messages, pending, sending, steps: SETUP_STEPS });
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
        className={`vendor-aura-panel fixed z-50 inset-x-0 top-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] w-screen h-auto max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] rounded-none lg:w-auto lg:h-auto lg:max-h-none lg:rounded-3xl lg:inset-auto bg-white shadow-2xl border-0 lg:border lg:border-gray-100 flex flex-col overflow-hidden isolate transition-all duration-200 ease-out ${
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
          className="hidden lg:block absolute left-0 top-0 z-40 w-3 h-3 cursor-nwse-resize rounded-md text-transparent hover:text-primary"
          title="Drag corner to resize Aura"
          aria-label="Resize Aura"
        >
          <span className="absolute left-1 top-1 w-3 h-3 border-l-2 border-t-2 border-current rounded-tl-sm" />
        </button>

        <header
          onMouseDown={handleDragStart}
          className="aura-header relative flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0 select-none lg:cursor-grab active:lg:cursor-grabbing bg-white/95"
        >
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-sm shrink-0">
            <Icon name="aura" size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-navy leading-tight">Aura+</div>
            <div className="text-[11px] text-muted mt-1 truncate">
              <span className="lg:hidden">Your business assistant</span>
              <span className="hidden lg:inline">{isDocked ? 'Docked' : 'Floating'} · Business assistant</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            {mode === 'aura' && (
              <button type="button" onClick={newChat} className="aura-header-action aura-new-chat" title="Start a new chat" aria-label="New chat">
                <Icon name="edit" size={16} />
                <span className="aura-new-chat-label">New chat</span>
              </button>
            )}
            <details className="hidden lg:block" onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.removeAttribute('open'); }}>
              <summary className="aura-header-action list-none cursor-pointer [&::-webkit-details-marker]:hidden" title="Panel layout" aria-label="Panel layout">
                <Icon name="settings" size={16} />
              </summary>
              <div className="aura-layout-menu absolute right-4 top-[calc(100%-4px)] z-50 w-64 max-w-[calc(100%-2rem)] rounded-2xl border border-gray-200 bg-white shadow-xl p-3" onClick={(e) => { if (e.target.closest('button')) e.currentTarget.closest('details').removeAttribute('open'); }}>
                <div className="text-xs font-bold text-navy mb-3">Panel layout</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={cycleWidth} className="aura-layout-option" title="Cycle panel width">Width <span>{panelWidth}px</span></button>
                  <button type="button" onClick={cycleHeight} className="aura-layout-option" title="Cycle panel height">Height <span>{Math.round(panelHeight)}px</span></button>
                </div>
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mt-4 mb-2">Position</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {['left', 'center', 'right', 'top', 'bottom'].map((place) => (
                    <button key={place} type="button" onClick={() => snapTo(place)} className="aura-layout-option capitalize" aria-label={`Snap Aura ${place}`}>{place}</button>
                  ))}
                </div>
                <button type="button" onClick={isDocked ? switchToFloat : dockToRight} className="aura-layout-option flex items-center justify-center gap-2 w-full mt-3">
                  <Icon name={isDocked ? 'float' : 'dockRight'} size={14} />
                  {isDocked ? 'Float panel' : 'Dock to right'}
                </button>
              </div>
            </details>
            <button type="button" onClick={() => updateDockMode('minimized')} className="aura-header-action" title="Minimize Aura" aria-label="Minimize Aura">
              <Icon name="minus" size={17} />
            </button>
            <button type="button" onClick={onClose} className="aura-header-action" title="Close Aura" aria-label="Close Aura+">
              <Icon name="close" size={17} />
            </button>
          </div>
        </header>

        <div className="px-4 pt-3 shrink-0" role="tablist">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-lavender/70 p-1">
            {[
              ['aura', 'Ask Aura', 'aura'],
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
          <AuraActivity activity={activity} />
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
                <Icon name="aura" size={13} /> Start setup with Aura
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
                <Icon name="aura" size={13} />
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
        <div className="min-w-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 border-t border-gray-100 shrink-0 space-y-2">
          <VoiceAgentOverlay agent={agent} compact title="Aura+" />
          {error && <div className="text-[11px] text-red-500 px-1">{error}</div>}
          {liveError && <p role="status" className="text-[11px] text-amber-600 px-1">{liveError}</p>}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pb-0.5" aria-label="Suggested questions">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => sendInteractive(c)}
                disabled={sending}
                className="aura-suggestion min-w-0 max-w-full whitespace-normal break-words text-left rounded-full bg-lavender text-navy text-[11px] font-semibold px-3 py-1.5 hover:bg-primary-soft disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
          {/* ChatGPT-style composer: + · text · language · mic (dictate) · voice mode / send */}
          <form
            onSubmit={(e) => {
              e.preventDefault();

              sendInteractive(input);
            }}
            className="aura-composer flex items-center gap-1 rounded-full border border-gray-200 bg-white shadow-sm focus-within:border-primary/40 pl-1.5 pr-1.5 py-1.5 transition"
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
            {voiceInputSupported && (
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
                  disabled={agent.open || sending || listening === 'converse' || speaking}
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
            {(input.trim() && !listening) || !voiceInputSupported ? (
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
                onClick={() => agent.open ? agent.end() : (speaking ? stopVoice() : agent.start(!messages.length))}
                disabled={(sending || listening) && !speaking}
                className="relative w-8 h-8 rounded-full text-white grid place-items-center shrink-0 transition disabled:opacity-50 bg-primary hover:bg-primary-dark"
                title={agent.open ? 'End voice mode' : speaking ? 'Stop speaking' : 'Talk to Aura+ (voice mode)'}
                aria-label={agent.open ? 'End voice mode' : speaking ? 'Stop speaking' : 'Voice mode'}
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

      </aside>
    </>
  );
}
