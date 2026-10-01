import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Voice agent (ElevenLabs-style): a full-screen orb conversation.
 * Listen → send the words → speak the reply → listen again, until the user ends it.
 * Speech-to-text and text-to-speech run in the browser (Web Speech API); only the
 * transcribed text is sent, exactly like a typed message.
 */

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
export const voiceAgentSupported = Boolean(Recognition);

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(lang.slice(0, 2))) || null;
}

/**
 * @param {(text: string) => Promise<string|null>} onUtterance  send the words, resolve with the reply to speak
 */
export function useVoiceAgent({ onUtterance, lang = 'en-IN' }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | listening | thinking | speaking
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0); // 0..1, drives the orb

  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const recRef = useRef(null);
  const audioRef = useRef(null); // { ctx, stream, analyser, raf }
  const speakRaf = useRef(null);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const langRef = useRef(lang);
  langRef.current = lang;

  // Microphone level for the orb (best effort — recognition works without it).
  async function startMeter() {
    if (audioRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const meter = { ctx, stream, analyser, raf: 0 };
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevel((prev) => prev * 0.6 + Math.min(1, avg * 2.2) * 0.4);
        meter.raf = requestAnimationFrame(tick);
      };
      tick();
      audioRef.current = meter;
    } catch {
      /* no meter: the orb still animates by state */
    }
  }

  function stopMeter() {
    const m = audioRef.current;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
    audioRef.current = null;
    setLevel(0);
  }

  const listen = useCallback(() => {
    if (!activeRef.current || mutedRef.current || !Recognition) return;
    const rec = new Recognition();
    rec.lang = langRef.current;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone permission denied. Allow the mic in your browser to talk to Aura+.');
        activeRef.current = false;
        setStatus('idle');
      }
    };
    rec.onend = async () => {
      recRef.current = null;
      if (!activeRef.current) return;
      const said = finalText.trim();
      if (!said) {
        // Silence: keep listening.
        if (!mutedRef.current) listen();
        return;
      }
      setStatus('thinking');
      setReply('');
      let answer = null;
      try {
        answer = await onUtteranceRef.current(said);
      } catch {
        answer = null;
      }
      if (!activeRef.current) return;
      if (answer) {
        setReply(answer);
        speak(answer);
      } else {
        setError('Aura+ could not reply. Try again.');
        setStatus('listening');
        listen();
      }
    };
    recRef.current = rec;
    setTranscript('');
    setError('');
    setStatus('listening');
    try {
      rec.start();
    } catch {
      /* already started */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text) {
    if (!canSpeak) {
      setStatus('listening');
      listen();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[ऀ-ॿ]/.test(text) ? 'hi-IN' : /[ঀ-৿]/.test(text) ? 'bn-IN' : 'en-IN';
    const voice = pickVoice(u.lang);
    if (voice) u.voice = voice;
    // A soft wobble while Aura talks (speech synthesis exposes no audio level).
    const t0 = performance.now();
    const wobble = () => {
      const t = (performance.now() - t0) / 1000;
      setLevel(0.35 + 0.25 * Math.abs(Math.sin(t * 6.3)) * Math.abs(Math.sin(t * 2.1 + 1)));
      speakRaf.current = requestAnimationFrame(wobble);
    };
    const done = () => {
      cancelAnimationFrame(speakRaf.current);
      setLevel(0);
      if (activeRef.current) {
        setStatus('listening');
        listen();
      }
    };
    u.onstart = () => {
      setStatus('speaking');
      wobble();
    };
    u.onend = done;
    u.onerror = done;
    setStatus('speaking');
    window.speechSynthesis.speak(u);
  }

  function start() {
    if (!Recognition) return;
    activeRef.current = true;
    mutedRef.current = false;
    setMuted(false);
    setReply('');
    setOpen(true);
    startMeter();
    listen();
  }

  function end() {
    activeRef.current = false;
    recRef.current?.abort();
    recRef.current = null;
    if (canSpeak) window.speechSynthesis.cancel();
    cancelAnimationFrame(speakRaf.current);
    stopMeter();
    setStatus('idle');
    setOpen(false);
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      recRef.current?.abort();
      setStatus('idle');
    } else if (status !== 'thinking' && status !== 'speaking') {
      listen();
    }
  }

  /** Tap the orb while Aura talks to interrupt and speak instead. */
  function interrupt() {
    if (status !== 'speaking') return;
    if (canSpeak) window.speechSynthesis.cancel();
  }

  // Never leave the mic or a voice running after unmount.
  useEffect(
    () => () => {
      activeRef.current = false;
      recRef.current?.abort();
      if (canSpeak) window.speechSynthesis.cancel();
      cancelAnimationFrame(speakRaf.current);
      stopMeter();
    },
    []
  );

  return { supported: voiceAgentSupported, open, status, muted, transcript, reply, error, level, start, end, toggleMute, interrupt };
}

const ORB_CSS = `
@keyframes va-spin { to { transform: rotate(360deg); } }
@keyframes va-spin-rev { to { transform: rotate(-360deg); } }
@keyframes va-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
`;

/** The animated orb: swirling gradient sphere that grows with the voice level. */
export function VoiceOrb({ status = 'idle', level = 0, size = 220 }) {
  const scale = status === 'listening' || status === 'speaking' ? 1 + level * 0.22 : 1;
  const speed = status === 'thinking' ? '2.2s' : status === 'speaking' ? '5s' : '9s';
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <style>{ORB_CSS}</style>
      {/* glow */}
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, rgba(124,92,240,0.55), rgba(56,189,248,0.25) 55%, transparent 70%)',
          opacity: status === 'idle' ? 0.45 : 0.9,
          transform: `scale(${1.05 + level * 0.35})`,
        }}
      />
      {/* sphere */}
      <div
        className="relative rounded-full overflow-hidden shadow-2xl transition-transform duration-150 ease-out"
        style={{
          width: size * 0.78,
          height: size * 0.78,
          transform: `scale(${scale})`,
          animation: status === 'idle' ? 'va-breathe 4s ease-in-out infinite' : undefined,
          boxShadow: '0 20px 60px -15px rgba(91,63,214,0.6), inset 0 -10px 30px rgba(0,0,0,0.15)',
        }}
      >
        <div
          className="absolute -inset-1/4"
          style={{
            background: 'conic-gradient(from 0deg, #7b5cf0, #38bdf8, #a78bfa, #f0abfc, #6366f1, #22d3ee, #7b5cf0)',
            animation: `va-spin ${speed} linear infinite`,
            filter: 'blur(18px)',
          }}
        />
        <div
          className="absolute -inset-1/4 mix-blend-screen opacity-70"
          style={{
            background: 'conic-gradient(from 90deg, transparent, #ffffff99, transparent 30%, #c4b5fd, transparent 60%)',
            animation: `va-spin-rev ${status === 'thinking' ? '1.6s' : '7s'} linear infinite`,
            filter: 'blur(22px)',
          }}
        />
        {/* glassy highlight */}
        <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75), rgba(255,255,255,0) 38%)' }} />
      </div>
    </div>
  );
}

const STATUS_TEXT = {
  idle: 'Muted — tap the mic to talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap the orb to interrupt',
};

/** Full-screen voice conversation with the orb, live caption, mute and end. */
export function VoiceAgentOverlay({ agent, title = 'Aura+', subtitle = 'Voice mode', lang, onToggleLang }) {
  if (!agent.open) return null;
  const caption = agent.status === 'listening' ? agent.transcript : agent.status === 'speaking' || agent.status === 'thinking' ? agent.reply || agent.transcript : '';
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-b from-[#0f0b24] via-[#171036] to-[#0b1026] text-white px-6 py-8" role="dialog" aria-label={`${title} voice mode`}>
      <div className="w-full max-w-md flex items-center justify-between">
        <div>
          <div className="text-sm font-extrabold">{title}</div>
          <div className="text-[11px] text-white/60">{subtitle}</div>
        </div>
        {onToggleLang && (
          <button onClick={onToggleLang} className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10">
            {lang === 'hi-IN' ? 'हिंदी' : 'English'}
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-8">
        <button onClick={agent.interrupt} className="rounded-full focus:outline-none" aria-label="Voice orb" title={agent.status === 'speaking' ? 'Tap to interrupt' : undefined}>
          <VoiceOrb status={agent.muted ? 'idle' : agent.status} level={agent.level} size={Math.min(260, typeof window !== 'undefined' ? window.innerWidth * 0.62 : 260)} />
        </button>
        <div className="text-center max-w-md min-h-[84px]">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{agent.muted ? STATUS_TEXT.idle : STATUS_TEXT[agent.status]}</div>
          {caption && <p className="mt-3 text-[15px] leading-relaxed text-white/90 line-clamp-4">{caption}</p>}
          {agent.error && <p className="mt-3 text-xs text-rose-300">{agent.error}</p>}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={agent.toggleMute}
          className={`w-14 h-14 rounded-full grid place-items-center transition ${agent.muted ? 'bg-white text-[#171036]' : 'bg-white/10 text-white hover:bg-white/20'}`}
          aria-label={agent.muted ? 'Unmute' : 'Mute'}
          title={agent.muted ? 'Unmute' : 'Mute'}
        >
          <span className="relative">
            <Icon name="mic" size={22} />
            {agent.muted && <span className="absolute left-1/2 top-1/2 h-[2px] w-7 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current rounded" />}
          </span>
        </button>
        <button onClick={agent.end} className="w-14 h-14 rounded-full grid place-items-center bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30" aria-label="End voice mode" title="End">
          <Icon name="close" size={22} />
        </button>
      </div>
    </div>
  );
}
