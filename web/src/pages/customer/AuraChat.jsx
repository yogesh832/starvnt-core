import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
// AuraActivity is vendor-only; removed from the customer chat.
import MapLocationPicker from '../../components/MapLocationPicker.jsx';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { customerApi, errorText } from './customerApi.js';
import UnderstandingCard from './UnderstandingCard.jsx';
import AuraEventMenu from './AuraEventMenu.jsx';
import './auraSidebar.css';
import AuraVendorResults from './AuraVendorResults.jsx';
import { createAuraLive, sameAuraValue } from '../../../../shared/auraLive.ts';
import { useVoiceAgent, VoiceAgentOverlay } from '../../components/VoiceAgent.jsx';
import { stopAuraSpeaking, transcribeAuraAudio } from '../../lib/voice.js';

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

function Bubble({ from, children, onZoomImage }) {
  const textContent = typeof children === 'string' ? children : '';
  const parsed = parseTextLinks(textContent);
  const displayContent = typeof children === 'string' ? (parsed.cleanText || (parsed.images.length || parsed.videos.length || parsed.pdfs.length ? '' : children)) : children;

  return (
    <div className={`flex ${from === 'user' ? 'justify-end' : 'gap-2.5'}`}>
      {from !== 'user' && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs shrink-0 mt-0.5 shadow-xs">
          <Icon name="aura" size={13} />
        </div>
      )}
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-3xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
          from === 'user'
            ? 'bg-primary text-white rounded-br-xs shadow-xs font-medium'
            : 'bg-white dark:bg-[#1e2235] border border-gray-100 dark:border-gray-700/80 rounded-tl-xs shadow-xs text-navy dark:text-slate-100'
        }`}
      >
        {Boolean(displayContent) && <div>{displayContent}</div>}
        {Boolean(parsed.images.length || parsed.videos.length || parsed.pdfs.length || parsed.driveLinks.length) && (
          <div className={`space-y-2 ${displayContent ? 'mt-2.5 pt-1 border-t border-black/10 dark:border-white/10' : ''}`}>
            {parsed.images.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {parsed.images.map((imgUrl, i) => (
                  <div
                    key={i}
                    onClick={() => onZoomImage?.(imgUrl)}
                    className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/5 cursor-pointer group shadow-xs"
                  >
                    <img src={imgUrl} alt="Work sample or reference" className="w-full max-h-52 object-cover group-hover:scale-105 transition duration-300" />
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
              <div key={i} className="rounded-2xl overflow-hidden bg-black border border-gray-700 max-w-xs">
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
                <span className="truncate flex-1">View PDF / Document</span>
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
                <span className="truncate flex-1">Google Drive / Cloud Folder</span>
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
      </div>
    </div>
  );
}

function AuraLoadingState() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-[#9b6dff]/20 animate-pulse shrink-0 mt-0.5" />
        <div className="bg-white border border-gray-100 rounded-3xl rounded-tl-xs p-4 shadow-xs w-full max-w-md">
          <div className="h-3 w-28 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-3 w-5/6 rounded-full bg-gray-100 animate-pulse mt-3" />
          <div className="h-3 w-2/3 rounded-full bg-gray-100 animate-pulse mt-2" />
        </div>
      </div>
      <div className="flex justify-end pr-2">
        <div className="bg-primary/15 rounded-3xl rounded-br-xs h-12 w-48 sm:w-64 animate-pulse" />
      </div>
      <div className="pl-10 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded-2xl bg-white border border-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function AuraErrorState({ message, onRetry }) {
  return (
    <div className="pl-0 sm:pl-10">
      <div className="bg-white border border-red-100 rounded-3xl p-4 shadow-xs max-w-xl">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-2xl bg-red-50 text-red-500 grid place-items-center shrink-0">
            <Icon name="help" size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-navy">Aura+ could not load</div>
            <div className="text-xs text-muted mt-0.5">{message}</div>
            <button type="button" onClick={onRetry} className="mt-3 rounded-xl bg-primary text-white text-xs font-bold px-4 py-2">
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Voice conversation: the spoken words fill the box live and
 * are sent when the customer stops talking; the reply is then read aloud.
 * Continuous conversation and ElevenLabs playback are owned by VoiceAgent.
 */
function useVoice({ onInterim, onError }) {
  // mode: 'dictate' = mic fills the box only (like ChatGPT's mic);
  //       'converse' = voice chat: send when the customer stops talking, reply aloud.
  const [listening, setListening] = useState(null); // null | 'dictate' | 'converse'
  const [speaking, setSpeaking] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  const isSupported = typeof window !== 'undefined' && Boolean(
    typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  );

  /** Stop listening (keeping what was heard) and stop any reply being spoken. */
  function stop() {
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

  // Stop listening/speaking when the chat unmounts.
  useEffect(
    () => () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (streamRef.current) {
        try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      }
      stopAuraSpeaking();
    },
    []
  );

  async function start(mode, base = '') {
    if (listening || speaking) return stop();
    const prefix = base.trim() ? `${base.trim()} ` : '';

    // Universal ElevenLabs STT via MediaRecorder across all browsers
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
          onInterim(`${prefix}Transcribing…`);
          const text = await transcribeAuraAudio(blob);
          if (text) {
            onInterim(`${prefix}${text}`);

          } else {
            onInterim(prefix.trim());
          }
        } catch (err) {
          onError(err?.message || 'Could not transcribe voice');
        }
      };
      mediaRecorderRef.current = recorder;
      setListening(mode);
      recorder.start(250);
      onInterim(`${prefix}Listening…`);
    } catch {
      onError('Microphone permission denied. Allow mic access in your browser.');
      setListening(null);
    }
  }

  return { supported: isSupported, listening, speaking, lang, setLang, start, stop };
}

/** ChatGPT-style voice-mode glyph: five bars; they bounce while Aura+ listens or talks. */
function WaveIcon({ active = false }) {
  const bars = [6, 12, 16, 12, 6];
  return (
    <span className="flex items-center gap-[2px] h-4" aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-[2.5px] rounded-full bg-current ${active ? 'animate-pulse' : ''}`}
          style={{ height: h, animationDelay: active ? `${i * 0.12}s` : undefined }}
        />
      ))}
    </span>
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

export default function AuraChat({ firstName, eventId: embeddedEventId = null, embedded = false, onEventChanged }) {
  const { user } = useExternalAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Embedded (home workspace) chats are scoped by prop and never read or write the URL.
  const scopedEventId = embedded ? embeddedEventId : params.get('event');
  const requestedSession = embedded ? null : params.get('session');
  const key = sessionKey(user?.id, scopedEventId);

  const [sessionId, setSessionId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarTrigger = useRef(null);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [messages, setMessages] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  // activity state removed – AuraActivity is vendor-only
  const activeEventRef = useRef(null);
  const [switchChoices, setSwitchChoices] = useState([]);
  const [vendorSuggestions, setVendorSuggestions] = useState([]), [vendorSearch, setVendorSearch] = useState(null);
  const [understanding, setUnderstanding] = useState(null);
  const [nextQ, setNextQ] = useState(null);
  const [input, setInput] = useState('');
  const [attachedUrl, setAttachedUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const [pickedDate, setPickedDate] = useState('');
  const [pickedLocation, setPickedLocation] = useState(null);
  const [savingStructured, setSavingStructured] = useState(false);
  const [sending, setSending] = useState(false);
  const [showThinkingStatus, setShowThinkingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState('');
  const live = useRef(null), sendingRef = useRef(false);
  const failedSend = useRef(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const bottomRef = useRef(null);
  const nearBottom = useRef(true);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const askedRef = useRef(false);

  async function handleMediaUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    setError('');
    try {
      const res = await customerApi.uploadMedia(file);
      if (res?.url) {
        setAttachedUrl(res.url);
      }
    } catch (err) {
      setError(errorText(err, 'Failed to upload reference image/video'));
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Asked by voice → sent automatically and answered by voice too (see send()).
  const sendRef = useRef(null);
  const voice = useVoice({
    onInterim: (t) => setInput(t),
    onError: (msg) => setError(msg),
  });

  const applyState = useCallback((s) => {
    const failed = failedSend.current;
    if (failed && s.messages?.some((message, index) => message.role === 'user' && message.content === failed.text && new Date(message.createdAt).getTime() >= failed.startedAt - 2000 && s.messages[index + 1]?.role === 'model')) {
      failedSend.current = null;
      setError('');
      setInput(value => value === failed.text ? '' : value);
    }
    activeEventRef.current = s.activeEvent || null;
    const retain = (previous, next) => sameAuraValue(previous, next) ? previous : next;
    // activity is vendor-only; skip it in customer chat
    setActiveEvent(previous => retain(previous, s.activeEvent || null));
    setUnderstanding(previous => retain(previous, s.understanding || null));
    setNextQ(previous => retain(previous, s.nextQuestion || null));
    setSwitchChoices(previous => retain(previous, s.eventChoices || []));
    setVendorSuggestions(previous => retain(previous, s.vendorSuggestions || [])); setVendorSearch(previous => retain(previous, s.vendorSearch || null));
  }, []);

  // Load (or start) the session for this event scope; history comes from the server.
  useEffect(() => {
    let cancelled = false;
    const urlSession = requestedSession;
    let sid = urlSession || readSession(key);
    const fresh = !embedded && params.get('new') === '1';
    if (fresh || !sid) {
      sid = newSessionId();
      writeSession(key, sid);
    } else if (urlSession) {
      writeSession(key, urlSession);
    }
    if (fresh) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
    setSessionId(sid);
    setLoading(true);
    setError('');
    const sync = createAuraLive({
      read: async () => {
        const request = new AbortController(), timeout = setTimeout(() => request.abort(), 15000);
        try { return await customerApi.auraSession(sid, scopedEventId, { signal: request.signal }); }
        finally { clearTimeout(timeout); }
      },
      apply: snapshot => {
        if (cancelled) return;
        setMessages(previous => sameAuraValue(previous, snapshot.messages || []) ? previous : snapshot.messages || []);
        applyState(snapshot);
      },
      onSuccess: () => { if (!cancelled) { setLoading(false); setLiveError(''); } },
      onError: error => { if (!cancelled) { setLoading(false); setLiveError(errorText(error, 'Live cards could not refresh. Please try again.')); } },
    });
    live.current = sync;
    const visible = () => {
      if (document.visibilityState === 'hidden') sync.stop();
      else { sync.start(); void sync.refresh(); }
    };
    if (document.visibilityState !== 'hidden') sync.start();
    window.addEventListener('focus', visible); window.addEventListener('online', visible); document.addEventListener('visibilitychange', visible);
    return () => {
      cancelled = true;
      sync.stop(); if (live.current === sync) live.current = null;
      window.removeEventListener('focus', visible); window.removeEventListener('online', visible); document.removeEventListener('visibilitychange', visible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadAttempt, requestedSession]);

  useEffect(() => {
    if (nearBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, understanding, sending]);

  const send = useCallback(
    async (text, extra = {}) => {
      const msg = (text ?? '').trim();
      if (!msg || !sessionId || sendingRef.current || !live.current) return;
      sendingRef.current = true;
      const startedAt = Date.now();
      failedSend.current = null;
      nearBottom.current = true;
      const sync = live.current; sync?.beginWrite();
      setInput('');
      setError('');
      setSending(true);
      setShowThinkingStatus(false);
      setStatusMessage(STATUS_MESSAGES[0]);

      // Optimistically insert user message and placeholder model message
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: msg },
        { role: 'model', content: '' }
      ]);

      let hasReceivedToken = false;
      let thinkingTimer = null;
      let rotationInterval = null;
      let timeoutTimer = null;
      let statusIdx = 0;
      const abortController = new AbortController();

      // Show "Thinking..." status only if request takes longer than 1200ms
      thinkingTimer = setTimeout(() => {
        if (!hasReceivedToken) {
          setShowThinkingStatus(true);
          rotationInterval = setInterval(() => {
            statusIdx = (statusIdx + 1) % STATUS_MESSAGES.length;
            setStatusMessage(STATUS_MESSAGES[statusIdx]);
          }, CHAT_STATUS_ROTATION_MS);
        }
      }, CHAT_THINKING_STATUS_DELAY_MS);

      // Leave room for the bounded model call plus context and durable writes.
      timeoutTimer = setTimeout(() => {
        abortController.abort();
      }, 45000);

      const cleanupTimers = () => {
        if (thinkingTimer) clearTimeout(thinkingTimer);
        if (rotationInterval) clearInterval(rotationInterval);
        if (timeoutTimer) clearTimeout(timeoutTimer);
      };

      let accumulatedText = '';
      let donePayload = null;

      try {
        await customerApi.auraChatStream(
          { sessionId, message: msg, eventId: activeEventRef.current?.id || scopedEventId || undefined, ...extra },
          (event) => {
            if (live.current !== sync) return;
            if (event.type === 'status') {
              if (event.message) setStatusMessage(event.message);
            } else if (event.type === 'chunk') {
              if (!hasReceivedToken) {
                hasReceivedToken = true;
                cleanupTimers();
                setShowThinkingStatus(false);
              }
              accumulatedText += event.text || '';
              setMessages((prev) => {
                const next = [...prev];
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
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === 'model') {
                    next[next.length - 1] = { ...last, content: event.reply };
                  }
                  return next;
                });
              }
            } else if (event.type === 'error') {
              throw new Error(event.error || "Aura+ couldn't reply.");
            }
          },
          abortController.signal
        );

        cleanupTimers();
        if (live.current !== sync) return null;
        setShowThinkingStatus(false);
        setSending(false);

        if (donePayload) {
          applyState(donePayload);
          if (donePayload.createdEventId) writeSession(sessionKey(user?.id, donePayload.createdEventId), sessionId);
          onEventChanged?.(donePayload);
        }
        return accumulatedText;
      } catch (err) {
        cleanupTimers();
        if (live.current !== sync) return null;
        setShowThinkingStatus(false);
        setSending(false);

        // Remove empty placeholder or revert optimistic user message on failure
        setMessages((prev) => {
          let list = [...prev];
          if (list.length > 0 && list[list.length - 1].role === 'model' && !accumulatedText) {
            list = list.slice(0, -1);
          }
          if (!accumulatedText && list.length > 0 && list[list.length - 1].role === 'user' && list[list.length - 1].content === msg) {
            list = list.slice(0, -1);
          }
          return list;
        });

        if (!accumulatedText) {
          failedSend.current = { text: msg, startedAt };
          setInput(msg);
          setError(err?.name === 'AbortError' || /signal.*abort/i.test(err?.message || '') ? 'Aura is taking longer than expected. Checking whether your reply was saved…' : errorText(err, "Aura+ couldn't reply. Please try again."));
        }
        return null;
      } finally { if (live.current === sync) sendingRef.current = false; sync?.endWrite(); }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, sending, scopedEventId, applyState, onEventChanged, user?.id]
  );
  sendRef.current = send;

  // Voice mode (orb): a continuous spoken conversation; each turn goes through send().
  const agent = useVoiceAgent({ lang: voice.lang, onUtterance: (t, extra) => sendRef.current?.(t, extra) });
  const sendInteractive = (message, extra) => agent.open ? agent.submit(message, extra) : send(message, extra);
  const switchEvent = event => sendInteractive(`Switch to ${event.title}`, { switchEventId: event.id });

  // ?ask= auto-sends once, then leaves the URL clean.
  useEffect(() => {
    const ask = embedded ? null : params.get('ask');
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
    } else if (opt.skipTopic) sendInteractive(opt.label, { skipTopic: opt.skipTopic });
    else if (opt.budgetRange) sendInteractive(opt.label, { budgetRange: opt.budgetRange });
    else if (opt.serviceLocation) sendInteractive(opt.label, { serviceLocation: opt.serviceLocation });
    else sendInteractive(opt.message || opt.label);
  }


  function sendPickedDate() {
    if (!pickedDate) return;
    sendInteractive(pickedDate);
    setPickedDate('');
  }

  async function savePickedLocation() {
    if (!activeEvent?.id || !pickedLocation) return;
    const loc = pickedLocation;
    const city = loc.city || activeEvent.city || '';
    const locality = loc.locality || loc.address?.split(',')?.[0] || '';
    const payload = {
      ...(city ? { city } : {}),
      location: {
        ...(city ? { city } : {}),
        ...(locality ? { locality } : {}),
        ...(loc.state ? { state: loc.state } : {}),
        ...(loc.postalCode ? { pincode: loc.postalCode } : {}),
        ...(loc.address ? { address: loc.address } : {}),
        coordinates: { lat: loc.lat, lng: loc.lng },
      },
    };
    setSavingStructured(true);
    setError('');
    const sync = live.current; sync?.beginWrite();
    try {
      await customerApi.patchEvent(activeEvent.id, payload);
      const refreshed = await customerApi.auraSession(sessionId, activeEvent.id);
      applyState(refreshed);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: `Pinned location: ${loc.address || `${loc.lat}, ${loc.lng}`}` },
        { role: 'model', content: 'Saved the exact map location. I will use this for matching nearby options.' },
      ]);
      setPickedLocation(null);
      onEventChanged?.(refreshed);
    } catch (err) {
      setError(errorText(err, "Couldn't save this location. Please try again."));
    } finally {
      setSavingStructured(false);
      sync?.endWrite();
    }
  }

  function newChat() {
    // activity cleared on new chat – vendor-only, no-op here
    if (agent.open) agent.end();
    live.current?.stop();
    live.current = null; sendingRef.current = false; setSending(false); setShowThinkingStatus(false);
    const sid = newSessionId();
    writeSession(sessionKey(user?.id, null), sid);
    askedRef.current = false;
    if (embedded) {
      writeSession(key, sid);
      setSessionId(sid);
      setMessages([]);
      applyState({});
      setLoadAttempt(value => value + 1);
    } else if (scopedEventId) navigate('/customer/aura');
    else {
      const next = new URLSearchParams(params); next.delete('session'); next.delete('new'); setParams(next, { replace: true });
      setSessionId(sid);
      setMessages([]);
      applyState({});
      setLoadAttempt(value => value + 1);
    }
  }

  function onCardChanged(detail) {
    live.current?.invalidate();
    activeEventRef.current = detail.event;
    setActiveEvent(detail.event);
    setUnderstanding(detail.understanding);
    if (detail.event?.status !== 'draft') setNextQ(null);
    void live.current?.refresh();
    onEventChanged?.(detail);
  }

  const chips = (() => {
    if (sending || loading) return [];
    if (nextQ?.options?.length) return nextQ.options;
    if (messages.length === 0 && !activeEvent && !nextQ?.topic) return agent.open ? [] : QUICK_PROMPTS.map((p) => ({ label: p, message: p }));
    if (activeEvent && activeEvent.status !== 'draft') return EVENT_PROMPTS.map((p) => ({ label: p, message: p }));
    return [];
  })();
  const latestAuraMessage = [...messages].reverse().find((m) => m.role === 'model')?.content || '';
  const showChipQuestion = nextQ?.question && !latestAuraMessage.includes(nextQ.question);
  const showDatePicker = nextQ?.topic === 'event.date';
  const showLocationPicker = ['event.city', 'event.area'].includes(nextQ?.topic);
  const showAnswerPanel = chips.length > 0 || showDatePicker || showLocationPicker;
  const displayError = error || liveError;

  return (
    <div className="aura-chat-shell flex h-full min-h-0 bg-white dark:bg-[#161926]">
      <AuraEventMenu activeId={activeEvent?.id} busy={sending || loading} onSwitch={switchEvent} onNew={newChat} open={sidebarOpen} onClose={closeSidebar} triggerRef={sidebarTrigger} />
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 sm:px-6 py-3 border-b border-gray-100 dark:border-gray-800/80 bg-white/70 dark:bg-[#161926]/80 backdrop-blur-sm shrink-0">
        <button ref={sidebarTrigger} type="button" aria-label={sidebarOpen ? 'Close Aura sidebar' : 'Open Aura sidebar'} title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} aria-controls="aura-chat-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)} className="aura-sidebar-trigger w-10 h-10 shrink-0 rounded-xl grid place-items-center text-navy dark:text-slate-200 hover:bg-primary/10 transition"><Icon name="panelLeft" size={22} /></button>
        <Icon name="aura" size={30} />
        <div className="min-w-0 flex-1">
          {activeEvent ? (
            <Link to={`/customer/events/${activeEvent.id}`} className="text-sm font-extrabold text-navy dark:text-white hover:text-primary dark:hover:text-[#a5b4fc] truncate block">{activeEvent.title}</Link>
          ) : (
            <div className="text-sm font-extrabold text-navy dark:text-white">Aura+</div>
          )}
          <div className="text-[10px] text-muted dark:text-slate-400">Your event assistant</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-5 space-y-4 max-w-3xl w-full mx-auto" onScroll={event => { const view = event.currentTarget; nearBottom.current = view.scrollHeight - view.scrollTop - view.clientHeight < 160; }}>
        <Bubble from="model">Hi{firstName ? ` ${firstName}` : ''}! 👋 What are you planning? Tell me in your own words. I'll figure out the rest.</Bubble>

        {loading && <AuraLoadingState />}
        {messages.map((m, i) => {
          if (m.role === 'model' && !m.content) return null;
          return <Bubble key={i} from={m.role} onZoomImage={setActiveZoomImage}>{m.content}</Bubble>;
        })}

        {switchChoices.length > 0 && <div className="pl-10 space-y-2 aura-card-reveal"><div className="text-xs font-semibold text-navy dark:text-slate-100">Your events</div>{switchChoices.map(event => <button key={event.id} type="button" disabled={sending || loading} onClick={() => switchEvent(event)} className="block w-full max-w-xl text-left rounded-2xl border border-primary/25 p-3 text-primary dark:text-[#a5b4fc] hover:bg-primary/10 disabled:opacity-50"><span className="block text-xs font-semibold">{event.title}</span><span className="block text-[10px] mt-1">{[event.city, event.date || 'Date to be decided'].filter(Boolean).join(' · ')}</span></button>)}</div>}

        {/* AuraActivity removed – it is vendor-only and should not appear in the customer chat */}
        {!!vendorSuggestions.length && <div className="pl-10"><AuraVendorResults key={`${activeEvent?.id || 'new'}-${vendorSearch?.query || 'catalog'}`} rows={vendorSuggestions} search={vendorSearch} eventId={activeEvent?.id} /></div>}

        {understanding?.showUnderstandingCard && activeEvent && (
          <div className="pl-10 aura-card-reveal">
            <UnderstandingCard key={activeEvent.id} understanding={understanding} event={activeEvent} onChanged={onCardChanged} onAsk={(t) => sendInteractive(t)} />
          </div>
        )}

        {sending && showThinkingStatus && (
          <div className="pl-10 text-[11px] font-medium text-muted dark:text-slate-400 inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {displayError && !loading && messages.length === 0 ? (
          <AuraErrorState message={displayError} onRetry={() => setLoadAttempt((n) => n + 1)} />
        ) : displayError ? (
          <div className="pl-10 text-[11px] text-red-500 dark:text-red-400">{displayError}</div>
        ) : null}

        {showAnswerPanel && (
          <div key={nextQ?.topic || 'ideas'} className="pl-10 space-y-2 aura-card-reveal">
            {showChipQuestion && (
              <div className="text-xs text-navy dark:text-slate-200">{nextQ.question}</div>
            )}
            {chips.length > 0 && (
              <>
              <p className="text-[10px] text-muted dark:text-slate-400">{nextQ?.language === 'hi' ? 'चाहें तो यह देख लें — या अपना जवाब बोलें या लिखें।' : nextQ?.language === 'hinglish' ? 'Chahein to yeh dekh lein — ya apna jawab bolein ya likhein.' : 'A few ideas, if helpful. You can also speak or type your own answer.'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => onChip(c)}
                    className="text-left text-xs font-semibold bg-white dark:bg-[#1e2235] border border-primary/25 text-primary dark:text-[#a5b4fc] hover:bg-primary hover:text-white dark:hover:bg-primary dark:hover:text-white rounded-2xl px-4 py-2.5 transition shadow-xs"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              </>
            )}
            {showDatePicker && (
              <div className="max-w-xl bg-white dark:bg-[#1e2235] border border-gray-100 dark:border-gray-700 rounded-2xl p-3 shadow-xs space-y-2">
                <label className="text-[10px] font-bold text-muted dark:text-slate-400 uppercase tracking-wide">
                  Select date
                  <input
                    type="date"
                    min={todayDate()}
                    value={pickedDate}
                    onChange={(e) => setPickedDate(e.target.value)}
                    disabled={sending || loading}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161926] px-3 py-2 text-sm font-semibold text-navy dark:text-white outline-none focus:border-primary"
                  />
                </label>
                <button
                  type="button"
                  onClick={sendPickedDate}
                  disabled={sending || loading || !pickedDate}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-xs font-bold px-3 py-2 hover:bg-primary-dark transition disabled:opacity-50"
                >
                  <Icon name="calendar" size={13} />
                  Use this date
                </button>
              </div>
            )}
            {showLocationPicker && (
              <div className="max-w-xl bg-white dark:bg-[#1e2235] border border-gray-100 dark:border-gray-700 rounded-2xl p-3 shadow-xs space-y-2">
                <div>
                  <div className="text-[10px] font-bold text-muted dark:text-slate-400 uppercase tracking-wide">Pin exact event area</div>
                  <p className="text-[11px] text-muted dark:text-slate-400 mt-0.5">Search the area or drop the pin so Aura can match nearby vendors more accurately.</p>
                </div>
                <MapLocationPicker
                  height="260px"
                  value={activeEvent?.location?.coordinates || pickedLocation || undefined}
                  onChange={setPickedLocation}
                  guidance="Drag or click pointer to pin the exact event area"
                />
                {pickedLocation && (
                  <div className="rounded-xl bg-lavender/50 dark:bg-white/5 px-3 py-2 text-[11px] text-navy dark:text-white">
                    <div className="font-bold">Selected location</div>
                    <div className="text-muted dark:text-slate-400">{pickedLocation.address || `${pickedLocation.lat}, ${pickedLocation.lng}`}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={savePickedLocation}
                  disabled={sending || loading || savingStructured || !pickedLocation}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-xs font-bold px-3 py-2 hover:bg-primary-dark transition disabled:opacity-50"
                >
                  <Icon name="mapPin" size={13} />
                  {savingStructured ? 'Saving...' : 'Save pinned location'}
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (attachedUrl) {
            const body = input.trim() ? `${input.trim()}\n[Reference Image]: ${attachedUrl}` : `[Reference Image]: ${attachedUrl}`;
            setAttachedUrl('');
            sendInteractive(body);
          } else {
            sendInteractive(input);
          }
        }}
        className="p-3 sm:p-4 max-w-3xl w-full mx-auto shrink-0 bg-white dark:bg-[#161926]"
      >
        <VoiceAgentOverlay agent={agent} compact title={activeEvent?.title || 'Aura+'} />
        {attachedUrl && (
          <div className="mb-2 px-3 py-1.5 bg-lavender/50 dark:bg-[#1e2235] border border-gray-200 dark:border-gray-700 rounded-2xl flex items-center gap-2">
            <img src={attachedUrl} alt="Attached reference" className="w-8 h-8 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-navy dark:text-white font-semibold truncate">Attached Reference Media</span>
            <button
              type="button"
              onClick={() => setAttachedUrl('')}
              className="text-red-500 hover:text-red-700 text-xs font-bold ml-auto px-2 py-0.5 cursor-pointer"
            >
              Remove
            </button>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleMediaUpload}
          accept="image/*,video/*"
          className="hidden"
        />

        {/* ChatGPT-style composer: + · image · text · language · mic (dictate) · voice mode / send */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-[#1e2235] rounded-full shadow-lg shadow-primary/5 pl-2 pr-1.5 py-1.5 border border-gray-200/80 dark:border-gray-700 focus-within:border-primary/40 transition">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || loading || uploadingMedia}
            className="w-9 h-9 grid place-items-center rounded-full text-ink/70 dark:text-slate-300 hover:bg-lavender dark:hover:bg-white/10 shrink-0 transition cursor-pointer disabled:opacity-40"
            title="Attach design reference image/video (Cloudinary)"
          >
            {uploadingMedia ? (
              <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icon name="image" size={17} />
            )}
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending || loading}
            placeholder={
              voice.listening === 'converse' ? 'Listening… speak now' : voice.listening === 'dictate' ? 'Listening… tap the mic to stop' : 'Ask Aura+ anything'
            }
            className="flex-1 min-w-0 outline-none text-sm text-navy dark:text-white placeholder:text-muted/70 dark:placeholder:text-slate-400 bg-transparent px-1"
          />
          {voice.supported && (
            <>
              <button
                type="button"
                onClick={() => voice.setLang(voice.lang === 'en-IN' ? 'hi-IN' : 'en-IN')}
                className="hidden sm:inline-flex items-center gap-1 h-9 rounded-full px-3 text-xs font-semibold text-ink/70 dark:text-slate-300 hover:bg-lavender dark:hover:bg-white/10 shrink-0 transition"
                title="Voice language — English / Hindi"
              >
                <span className="w-4 h-4 rounded-full border border-current grid place-items-center text-[8px] font-bold">{voice.lang === 'en-IN' ? 'A' : 'अ'}</span>
                {voice.lang === 'en-IN' ? 'English' : 'हिंदी'}
              </button>
              <button
                type="button"
                onClick={() => (voice.listening === 'dictate' ? voice.stop() : voice.start('dictate', input))}
                disabled={agent.open || sending || loading || voice.listening === 'converse' || voice.speaking}
                className={`relative w-9 h-9 rounded-full grid place-items-center shrink-0 transition disabled:opacity-40 ${
                  voice.listening === 'dictate' ? 'bg-red-50 text-red-500' : 'text-ink/70 dark:text-slate-300 hover:bg-lavender dark:hover:bg-white/10'
                }`}
                title={voice.listening === 'dictate' ? 'Stop dictation' : 'Dictate (fills the box)'}
                aria-label={voice.listening === 'dictate' ? 'Stop dictation' : 'Dictate'}
              >
                {voice.listening === 'dictate' && <span className="absolute inset-1 rounded-full bg-red-400/30 animate-ping" />}
                <Icon name="mic" size={17} className="relative" />
              </button>
            </>
          )}
          {((input.trim() || attachedUrl) && !voice.listening) || !voice.supported ? (
            <button
              type="submit"
              disabled={sending || loading || uploadingMedia || (!input.trim() && !attachedUrl)}
              className="w-9 h-9 grid place-items-center rounded-full bg-primary text-white hover:bg-primary-dark transition shadow-sm shrink-0 disabled:opacity-50"
              title="Send"
              aria-label="Send message"
            >
              <Icon name="send" size={14} className="-translate-y-px translate-x-px" />
            </button>
          ) : (
            voice.supported && (
              <button
                type="button"
                onClick={() => agent.open ? agent.end() : (voice.speaking ? voice.stop() : agent.start(!messages.length && !activeEvent))}
                disabled={(sending || loading || voice.listening) && !voice.speaking}
                className="relative w-9 h-9 grid place-items-center rounded-full text-white shadow-sm shrink-0 transition disabled:opacity-50 bg-primary hover:bg-primary-dark"
                title={agent.open ? 'End voice mode' : voice.speaking ? 'Stop speaking' : 'Talk to Aura+ (voice mode)'}
                aria-label={agent.open ? 'End voice mode' : voice.speaking ? 'Stop speaking' : 'Voice mode'}
              >
                <span className="relative">
                  {voice.speaking ? <span className="block w-3 h-3 rounded-[3px] bg-white" /> : <WaveIcon />}
                </span>
              </button>
            )
          )}
        </div>
        <p className="text-[10px] text-muted dark:text-slate-400 text-center mt-1.5">You decide — Aura+ never books or pays without you.</p>
      </form>

      </div>
      {/* Lightbox Zoom Modal */}
      {activeZoomImage && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setActiveZoomImage(null)}>
          <img src={activeZoomImage} alt="Attachment zoom" className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
