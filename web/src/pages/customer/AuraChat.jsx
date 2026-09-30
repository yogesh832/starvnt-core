import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import MapLocationPicker from '../../components/MapLocationPicker.jsx';
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


function todayDate() {
  return new Date().toISOString().slice(0, 10);
}


const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Read Aura's reply aloud in the reply's script (Hindi / Bengali / English). */
function speakText(text, onDone) {
  if (!canSpeak || !text) return onDone?.();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[ऀ-ॿ]/.test(text) ? 'hi-IN' : /[ঀ-]/.test(text) ? 'bn-IN' : 'en-IN';
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === u.lang) || voices.find((v) => v.lang?.startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.onend = () => onDone?.();
  u.onerror = () => onDone?.();
  window.speechSynthesis.speak(u);
}

/**
 * Voice conversation (Web Speech API): the spoken words fill the box live and
 * are sent when the customer stops talking; the reply is then read aloud.
 * Only the transcribed text leaves the browser, like a typed message.
 */
function useVoice({ onInterim, onFinal, onError }) {
  // mode: 'dictate' = mic fills the box only (like ChatGPT's mic);
  //       'converse' = voice chat: send when the customer stops talking, reply aloud.
  const [listening, setListening] = useState(null); // null | 'dictate' | 'converse'
  const [speaking, setSpeaking] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const recRef = useRef(null);
  const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  /** Stop listening (keeping what was heard) and stop any reply being spoken. */
  function stop() {
    recRef.current?.stop();
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  // Stop listening/speaking when the chat unmounts.
  useEffect(
    () => () => {
      recRef.current?.abort();
      if (canSpeak) window.speechSynthesis.cancel();
    },
    []
  );

  function start(mode, base = '') {
    if (listening || speaking) return stop();
    if (!Speech) return;
    const rec = new Speech();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const prefix = base.trim() ? `${base.trim()} ` : '';
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onInterim(`${prefix}${(finalText + interim).trim()}`);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError('Microphone permission denied. Allow the mic in your browser to talk to Aura+.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') onError('Could not hear you. Please try again.');
    };
    rec.onend = () => {
      setListening(null);
      recRef.current = null;
      if (mode === 'converse' && finalText.trim()) onFinal(`${prefix}${finalText.trim()}`);
    };
    recRef.current = rec;
    setListening(mode);
    rec.start();
  }

  function speak(text) {
    if (!canSpeak) return;
    setSpeaking(true);
    speakText(text, () => setSpeaking(false));
  }

  return { supported: Boolean(Speech), listening, speaking, lang, setLang, start, stop, speak };
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

export default function AuraChat({ firstName, eventId: embeddedEventId = null, embedded = false, onEventChanged }) {
  const { user } = useExternalAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Embedded (home workspace) chats are scoped by prop and never read or write the URL.
  const scopedEventId = embedded ? embeddedEventId : params.get('event');
  const key = sessionKey(user?.id, scopedEventId);

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [understanding, setUnderstanding] = useState(null);
  const [nextQ, setNextQ] = useState(null);
  const [input, setInput] = useState('');
  const [customChoice, setCustomChoice] = useState('');
  const [pickedDate, setPickedDate] = useState('');
  const [pickedLocation, setPickedLocation] = useState(null);
  const [savingStructured, setSavingStructured] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const askedRef = useRef(false);

  // Asked by voice → sent automatically and answered by voice too (see send()).
  const sendRef = useRef(null);
  const voice = useVoice({
    onInterim: (t) => setInput(t),
    onFinal: (t) => sendRef.current?.(t, {}, { spoken: true }),
    onError: (msg) => setError(msg),
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
    const fresh = !embedded && params.get('new') === '1';
    if (fresh || !sid) {
      sid = newSessionId();
      writeSession(key, sid);
    }
    if (fresh) {
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
    async (text, extra = {}, { spoken = false } = {}) => {
      const msg = (text ?? '').trim();
      if (!msg || !sessionId || sending) return;
      setInput('');
      setError('');
      setSending(true);
      setMessages((prev) => [...prev, { role: 'user', content: msg }]);
      try {
        const res = await customerApi.auraChat({ sessionId, message: msg, eventId: scopedEventId || undefined, ...extra });
        setMessages((prev) => [...prev, { role: 'model', content: res.reply }]);
        if (spoken) voice.speak(res.reply);
        applyState(res);
        // A chat that just created an event keeps its history when opened from that event later.
        if (res.createdEventId) writeSession(sessionKey(user?.id, res.createdEventId), sessionId);
        onEventChanged?.(res);
      } catch (err) {
        setMessages((prev) => prev.slice(0, -1));
        setInput(msg);
        setError(errorText(err, "Aura+ couldn't reply. Please try again."));
      } finally {
        setSending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, sending, scopedEventId, applyState, onEventChanged, user?.id]
  );
  sendRef.current = send;

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
    setCustomChoice('');
    if (opt.prefill) {
      setInput(opt.prefill);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (opt.skipTopic) send(opt.label, { skipTopic: opt.skipTopic });
    else if (opt.budgetRange) send(opt.label, { budgetRange: opt.budgetRange });
    else if (opt.serviceLocation) send(opt.label, { serviceLocation: opt.serviceLocation });
    else send(opt.message || opt.label);
  }

  function sendCustomChoice() {
    const text = customChoice.trim();
    if (!text) return;
    setCustomChoice('');
    send(text);
  }

  function sendPickedDate() {
    if (!pickedDate) return;
    send(pickedDate);
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
    }
  }

  function newChat() {
    const sid = newSessionId();
    writeSession(sessionKey(user?.id, null), sid);
    askedRef.current = false;
    if (embedded) {
      writeSession(key, sid);
      setSessionId(sid);
      setMessages([]);
    } else if (scopedEventId) navigate('/customer/aura');
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
  const latestAuraMessage = [...messages].reverse().find((m) => m.role === 'model')?.content || '';
  const showChipQuestion = nextQ?.question && !latestAuraMessage.includes(nextQ.question);
  const showDatePicker = nextQ?.topic === 'event.date';
  const showLocationPicker = ['event.city', 'event.area'].includes(nextQ?.topic);
  const showAnswerPanel = chips.length > 0 || showDatePicker || showLocationPicker;

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

        {loading && (
          <div className="space-y-4">
            <div className="flex justify-end pr-2"><div className="bg-primary/20 rounded-3xl rounded-br-xs h-10 w-48 sm:w-64 animate-pulse" /></div>
            <div className="flex gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0 mt-0.5" />
              <div className="bg-white border border-gray-100 rounded-3xl rounded-tl-xs h-16 w-64 sm:w-80 animate-pulse shadow-xs" />
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} from={m.role}>{m.content}</Bubble>
        ))}

        {understanding?.showUnderstandingCard && activeEvent && (
          <div className="pl-10">
            <UnderstandingCard understanding={understanding} event={activeEvent} onChanged={onCardChanged} onAsk={(t) => send(t)} />
          </div>
        )}

        {sending && (
          <div className="pl-10 text-[11px] text-muted inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Aura+ is thinking…
          </div>
        )}
        {error && <div className="pl-10 text-[11px] text-red-500">{error}</div>}

        {showAnswerPanel && (
          <div className="pl-10 space-y-2">
            {showChipQuestion && (
              <div className="text-[10px] font-bold text-muted uppercase tracking-wide">{nextQ.question}</div>
            )}
            {chips.length > 0 && (
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
            )}
            {showDatePicker && (
              <div className="max-w-xl bg-white border border-gray-100 rounded-2xl p-3 shadow-xs space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wide">
                  Select date
                  <input
                    type="date"
                    min={todayDate()}
                    value={pickedDate}
                    onChange={(e) => setPickedDate(e.target.value)}
                    disabled={sending || loading}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-primary"
                  />
                  {/* //this is test */}
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
              <div className="max-w-xl bg-white border border-gray-100 rounded-2xl p-3 shadow-xs space-y-2">
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wide">Pin exact event area</div>
                  <p className="text-[11px] text-muted mt-0.5">Search the area or drop the pin so Aura can match nearby vendors more accurately.</p>
                </div>
                <MapLocationPicker
                  height="260px"
                  value={activeEvent?.location?.coordinates || pickedLocation || undefined}
                  onChange={setPickedLocation}
                  guidance="Drag or click pointer to pin the exact event area"
                />
                {pickedLocation && (
                  <div className="rounded-xl bg-lavender/50 px-3 py-2 text-[11px] text-navy">
                    <div className="font-bold">Selected location</div>
                    <div className="text-muted">{pickedLocation.address || `${pickedLocation.lat}, ${pickedLocation.lng}`}</div>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCustomChoice();
              }}
              className="max-w-xl bg-white border border-gray-100 rounded-2xl p-2.5 shadow-xs"
            >
              <textarea
                value={customChoice}
                onChange={(e) => setCustomChoice(e.target.value)}
                disabled={sending || loading}
                rows={2}
                placeholder="Something else? Type your own answer here..."
                className="w-full resize-y min-h-16 max-h-48 outline-none bg-transparent text-xs sm:text-sm text-navy placeholder:text-muted/60 px-2 py-1"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sending || loading || !customChoice.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-xs font-bold px-3 py-2 hover:bg-primary-dark transition disabled:opacity-50"
                >
                  <Icon name="send" size={13} />
                  Send answer
                </button>
              </div>
            </form>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        // abcd
        className="p-3 sm:p-4 max-w-3xl w-full mx-auto"
      >
        {/* ChatGPT-style composer: + · text · language · mic (dictate) · voice mode / send */}
        <div className="flex items-center gap-1.5 bg-white rounded-full shadow-lg shadow-primary/5 pl-2 pr-1.5 py-1.5 border border-gray-200/80 focus-within:border-primary/40 transition">
          <button
            type="button"
            onClick={newChat}
            className="w-9 h-9 grid place-items-center rounded-full text-ink/70 hover:bg-lavender shrink-0 transition"
            title="New chat"
            aria-label="New chat"
          >
            <Icon name="plus" size={18} />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending || loading}
            placeholder={
              voice.listening === 'converse' ? 'Listening… speak now' : voice.listening === 'dictate' ? 'Listening… tap the mic to stop' : 'Ask Aura+ anything'
            }
            className="flex-1 min-w-0 outline-none text-sm placeholder:text-muted/70 bg-transparent px-1"
          />
          {voice.supported && (
            <>
              <button
                type="button"
                onClick={() => voice.setLang(voice.lang === 'en-IN' ? 'hi-IN' : 'en-IN')}
                className="hidden sm:inline-flex items-center gap-1 h-9 rounded-full px-3 text-xs font-semibold text-ink/70 hover:bg-lavender shrink-0 transition"
                title="Voice language — English / Hindi"
              >
                <span className="w-4 h-4 rounded-full border border-current grid place-items-center text-[8px] font-bold">{voice.lang === 'en-IN' ? 'A' : 'अ'}</span>
                {voice.lang === 'en-IN' ? 'English' : 'हिंदी'}
              </button>
              <button
                type="button"
                onClick={() => (voice.listening === 'dictate' ? voice.stop() : voice.start('dictate', input))}
                disabled={sending || loading || voice.listening === 'converse' || voice.speaking}
                className={`relative w-9 h-9 rounded-full grid place-items-center shrink-0 transition disabled:opacity-40 ${
                  voice.listening === 'dictate' ? 'bg-red-50 text-red-500' : 'text-ink/70 hover:bg-lavender'
                }`}
                title={voice.listening === 'dictate' ? 'Stop dictation' : 'Dictate (fills the box)'}
                aria-label={voice.listening === 'dictate' ? 'Stop dictation' : 'Dictate'}
              >
                {voice.listening === 'dictate' && <span className="absolute inset-1 rounded-full bg-red-400/30 animate-ping" />}
                <Icon name="mic" size={17} className="relative" />
              </button>
            </>
          )}
          {(input.trim() && !voice.listening) || !voice.supported ? (
            <button
              type="submit"
              disabled={sending || loading || !input.trim()}
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
                onClick={() => (voice.listening === 'converse' || voice.speaking ? voice.stop() : voice.start('converse'))}
                disabled={(sending || loading || voice.listening === 'dictate') && !voice.speaking}
                className={`relative w-9 h-9 grid place-items-center rounded-full text-white shadow-sm shrink-0 transition disabled:opacity-50 ${
                  voice.listening === 'converse' ? 'bg-red-500' : 'bg-primary hover:bg-primary-dark'
                }`}
                title={voice.listening === 'converse' ? 'Done talking' : voice.speaking ? 'Stop speaking' : 'Talk to Aura+ (voice mode)'}
                aria-label={voice.listening === 'converse' ? 'Done talking' : voice.speaking ? 'Stop speaking' : 'Voice mode'}
              >
                {voice.listening === 'converse' && <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />}
                <span className="relative">
                  {voice.speaking ? <span className="block w-3 h-3 rounded-[3px] bg-white" /> : <WaveIcon active={voice.listening === 'converse'} />}
                </span>
              </button>
            )
          )}
        </div>
        <p className="text-[10px] text-muted text-center mt-1.5">You decide — Aura+ never books or pays without you.</p>
      </form>
    </div>
  );
}
// abcd