import AuraMark from './AuraMark.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { speakAura, stopAuraSpeaking, transcribeAuraAudio } from '../lib/voice.js';
import { createVoiceActivity } from '../../../shared/voiceActivity.ts';

/**
 * Voice agent (ElevenLabs-powered): a full-screen orb conversation.
 * Listen → send the words → speak the reply → listen again, until the user ends it.
 * Speech is rendered using ElevenLabs via the backend `/ai/voice` route with
 * no device speech synthesis fallback.
 */

// Pure ElevenLabs voice agent: recordings use MediaRecorder + /ai/transcribe (ElevenLabs STT),
// and replies use /ai/voice (ElevenLabs TTS). Browser speech recognition & synthesis are bypassed.
export const voiceAgentSupported =
  typeof window !== 'undefined' &&
  Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');

/**
 * @param {(text: string) => Promise<string|null>} onUtterance  send the words, resolve with the reply to speak
 */
export function useVoiceAgent({ onUtterance, lang = 'en-IN' }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [status, updateStatus] = useState('idle'); // idle | listening | thinking | speaking
  const statusRef = useRef('idle');
  function setStatus(value) { statusRef.current = value; updateStatus(value); }
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0); // 0..1, drives the orb

  const activeRef = useRef(false);
  const sessionRevision = useRef(0);
  const microphoneRevision = useRef(0);
  const listeningRef = useRef(false);
  const mutedRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const voiceActivityRef = useRef(createVoiceActivity());
  const recordingStartedAt = useRef(0);
  const conversationLanguageRef = useRef('en');
  const streamRef = useRef(null);
  const audioRef = useRef(null); // { ctx, stream, analyser, raf }
  const speakRaf = useRef(null);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const langRef = useRef(lang);
  langRef.current = lang;

  // Microphone level for the orb (best effort — recognition works without it).
  async function startMeter() {
    const expected = sessionRevision.current;
    const expectedMicrophone = microphoneRevision.current;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      if (!streamRef.current || !streamRef.current.active) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!activeRef.current || mutedRef.current || expected !== sessionRevision.current || expectedMicrophone !== microphoneRevision.current) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
      }
      const stream = streamRef.current;

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Float32Array(analyser.fftSize);
        const meter = { ctx, stream, analyser, raf: 0 };
        const tick = () => {
          analyser.getFloatTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
          const level = 20 * Math.log10(Math.max(rms, 0.00001));
          setLevel(prev => prev * 0.6 + Math.min(1, rms * 8) * 0.4);
          if (mediaRecorderRef.current?.state === 'recording') {
            const now = performance.now();
            const action = voiceActivityRef.current.update(now - recordingStartedAt.current, level, now);
            speechDetectedRef.current = voiceActivityRef.current.hasSpeech();
            if (action) mediaRecorderRef.current.stop();
          }

          meter.raf = requestAnimationFrame(tick);
        };
        tick();
        audioRef.current = meter;
      } catch {
        /* no meter if AudioContext blocked, stream still preserved */
      }
    } catch {
      if (!activeRef.current || expected !== sessionRevision.current || expectedMicrophone !== microphoneRevision.current) return;
      setError('Microphone permission denied. Allow mic access in your browser.');
      setStatus('idle');
    }
  }

  function stopMeter() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;
    }
    const m = audioRef.current;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    try { m.ctx.close(); } catch {}
    audioRef.current = null;
    setLevel(0);
  }

  async function handleUserUtterance(said, extra) {
    if (!activeRef.current) return;
    const expected = sessionRevision.current;
    setExpanded(false);
    if (/[\u0900-\u097f]/.test(said)) conversationLanguageRef.current = 'hi';
    else if (/\b(mujhe|mera|meri|chahiye|hai|haan|nahi|karna|shaadi|aap)\b/i.test(said)) conversationLanguageRef.current = 'hinglish';
    else if (said.trim().split(/\s+/).length >= 4) conversationLanguageRef.current = 'en';
    setStatus('thinking');
    setReply('');
    let answer = null;
    let progressTimer = null;
    let hasSpokenProgress = false;

    const PROGRESS_PHRASES = conversationLanguageRef.current === 'hi' ? ['ठीक है, मैं आपके लिए जानकारी देख रही हूँ।'] : conversationLanguageRef.current === 'hinglish' ? ['Theek hai, main aapke liye jaankari dekh rahi hoon.'] : [
      'Okay, let me get that information for you.',
      'Sure, let me check that for you.',
      'Got it, I’m looking into that for you.',
    ];

    progressTimer = setTimeout(() => {
      if (activeRef.current && expected === sessionRevision.current && !hasSpokenProgress) {
        hasSpokenProgress = true;
        const phrase = PROGRESS_PHRASES[Math.floor(Math.random() * PROGRESS_PHRASES.length)];
        speakProgress(phrase);
      }
    }, 1200);

    try {
      answer = await onUtteranceRef.current(said, extra);
    } catch {
      answer = null;
    } finally {
      if (progressTimer) clearTimeout(progressTimer);
    }

    if (!activeRef.current || expected !== sessionRevision.current) return;
    stopAuraSpeaking();
    cancelAnimationFrame(speakRaf.current);
    if (answer) {
      setReply(answer);
      speak(answer);
    } else {
      setError('Aura+ could not reply. Try again.');
      setStatus(mutedRef.current ? 'idle' : 'listening');
      listen();
    }
  }

  const listen = useCallback(async () => {
    if (!activeRef.current || mutedRef.current || listeningRef.current) return;
    const expected = sessionRevision.current;
    const expectedMicrophone = microphoneRevision.current;
    listeningRef.current = true;

    if (!streamRef.current || !streamRef.current.active) {
      await startMeter();
      if (!activeRef.current || mutedRef.current || expected !== sessionRevision.current || expectedMicrophone !== microphoneRevision.current) { if (expected === sessionRevision.current && expectedMicrophone === microphoneRevision.current) listeningRef.current = false; return; }
    }

    const activeStream = streamRef.current || audioRef.current?.stream;
    if (activeStream && typeof MediaRecorder !== 'undefined') {
      audioChunksRef.current = [];
      speechDetectedRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }

      try {
        const recorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = async () => {
          if (expected !== sessionRevision.current || expectedMicrophone !== microphoneRevision.current) return;
          mediaRecorderRef.current = null;
          listeningRef.current = false;
          stopMeter();
          if (!activeRef.current || mutedRef.current) return;
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          if (blob.size < 500 || !speechDetectedRef.current) {
            if (!mutedRef.current) listen();
            return;
          }
          setStatus('thinking');
          setTranscript('Transcribing…');
          try {
            const text = await transcribeAuraAudio(blob);
            if (!activeRef.current || expected !== sessionRevision.current) return;
            if (text && text.trim()) {
              setTranscript(text);
              await handleUserUtterance(text);
            } else {
              setStatus('idle');
              if (!mutedRef.current) listen();
            }
          } catch (error) {
            if (!activeRef.current || expected !== sessionRevision.current) return;
            setError(error?.message || 'ElevenLabs transcription failed. Please try again.');
            setStatus('idle');
          }
        };
        mediaRecorderRef.current = recorder;
        setTranscript('');
        setError('');
        setStatus('listening');
        recorder.start(250);
        voiceActivityRef.current.reset();
        recordingStartedAt.current = performance.now();
      } catch {
        listeningRef.current = false;
        setError('Microphone recording not supported on this browser.');
        setStatus('idle');
      }
    } else listeningRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speakProgress(text) {
    if (!activeRef.current) return;
    stopAuraSpeaking();
    cancelAnimationFrame(speakRaf.current);

    const t0 = performance.now();
    const wobble = () => {
      const t = (performance.now() - t0) / 1000;
      setLevel(0.35 + 0.25 * Math.abs(Math.sin(t * 6.3)) * Math.abs(Math.sin(t * 2.1 + 1)));
      speakRaf.current = requestAnimationFrame(wobble);
    };

    speakAura(text, {
      onStart: () => {
        setStatus('speaking');
        wobble();
      },
      onEnd: () => {
        cancelAnimationFrame(speakRaf.current);
        setLevel(0);
        if (activeRef.current) setStatus('thinking');
      },
      onError: () => {
        cancelAnimationFrame(speakRaf.current);
        setLevel(0);
        if (activeRef.current) setStatus('thinking');
      },
    });
  }

  function speak(text) {
    stopAuraSpeaking();
    cancelAnimationFrame(speakRaf.current);
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
        setStatus(mutedRef.current ? 'idle' : 'listening');
        listen();
      }
    };

    speakAura(text, {
      onStart: () => {
        setStatus('speaking');
        wobble();
      },
      onEnd: done,
      onError: error => {
        cancelAnimationFrame(speakRaf.current);
        setLevel(0);
        if (activeRef.current) { setError(error?.message || 'ElevenLabs voice is unavailable. Your reply is saved in chat.'); setStatus('idle'); }
      },
    });
  }

  async function start(expand = true) {
    if (!voiceAgentSupported || activeRef.current) return;
    sessionRevision.current++;
    listeningRef.current = false;
    stopAuraSpeaking();
    activeRef.current = true;
    mutedRef.current = false;
    setMuted(false);
    setReply('');
    setOpen(true);
    setExpanded(expand);
    await listen();
  }

  function end() {
    activeRef.current = false;
    sessionRevision.current++;
    listeningRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    stopAuraSpeaking();
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
      microphoneRevision.current++;
      listeningRef.current = false;
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder && recorder.state === 'recording') {
        try { recorder.stop(); } catch { /* ignore */ }
      }
      stopMeter();
      if (statusRef.current === 'listening') setStatus('idle');
    } else if (statusRef.current === 'idle') {
      listen();
    }
  }

  async function submit(text, extra) {
    if (!activeRef.current || !text?.trim() || statusRef.current === 'thinking') return;
    sessionRevision.current++;
    microphoneRevision.current++;
    listeningRef.current = false;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder?.state === 'recording') recorder.stop();
    stopMeter(); stopAuraSpeaking(); cancelAnimationFrame(speakRaf.current);
    setTranscript(text);
    await handleUserUtterance(text, extra);
  }

  /** Tap the orb while Aura talks to interrupt, or tap while listening to finish talking early. */
  function interrupt() {
    if (status === 'speaking') {
      stopAuraSpeaking();
      cancelAnimationFrame(speakRaf.current);
      setLevel(0);
      if (activeRef.current) {
        setStatus(mutedRef.current ? 'idle' : 'listening');
        listen();
      }
    } else if (status === 'listening') {
      speechDetectedRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
    } else if (status === 'idle' && !mutedRef.current) {
      setError(''); listen();
    }
  }

  // Never leave the mic or a voice running after unmount.
  useEffect(
    () => () => {
      activeRef.current = false;
      sessionRevision.current++;
      listeningRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      stopAuraSpeaking();
      cancelAnimationFrame(speakRaf.current);
      stopMeter();
    },
    []
  );

  return { supported: voiceAgentSupported, open, expanded, toggleExpanded: () => setExpanded(value => !value), status, muted, transcript, reply, error, level, start, end, toggleMute, interrupt, submit };
}

/** Shared Aura identity responds to the existing voice state and microphone level. */
export function VoiceOrb({ status = 'idle', level = 0, size = 220 }) {
  return <AuraMark variant="orb" state={status} level={level} size={size} />;
}

const STATUS_TEXT = {
  idle: 'Ready — tap the orb to talk',
  listening: 'Listening… pause when you’re done',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap the orb to interrupt',
};

/** Voice conversation with the orb, live caption, mute and end. Can be full-screen or embedded inside the Aura panel. */
export function VoiceAgentOverlay({ agent, title = 'Aura+', subtitle = 'Voice mode', lang, onToggleLang, embedded = false, compact = false }) {
  if (!agent.open) return null;
  if (compact) return <section aria-label={`${title} voice controls`} className="flex shrink-0 flex-col items-center justify-center gap-1 pb-2 text-ink dark:text-slate-100 transition-[min-height] duration-300 motion-reduce:transition-none" style={{ minHeight: agent.expanded ? 'min(42dvh, 320px)' : 142 }}>
    <button type="button" onClick={agent.toggleExpanded} aria-expanded={agent.expanded} className="min-h-8 px-3 text-[10px] text-muted dark:text-slate-400">{agent.expanded ? 'Show conversation ↓' : 'Expand voice ↑'}</button>
    <div className="flex items-center transition-[gap,height] duration-300 motion-reduce:transition-none" style={{ gap: agent.expanded ? 44 : 20, height: agent.expanded ? 190 : 92 }}>
      <button type="button" onClick={agent.toggleMute} aria-label={agent.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={agent.muted} className={`relative h-11 w-11 rounded-full grid place-items-center ${agent.muted ? 'bg-primary/15 text-primary' : 'bg-black/5 dark:bg-white/10'}`}><Icon name="mic" size={19} />{agent.muted && <span className="absolute h-0.5 w-6 rotate-45 bg-current rounded" />}</button>
      <button type="button" onClick={agent.interrupt} aria-label={agent.status === 'speaking' ? 'Interrupt Aura' : 'Voice orb'} className="rounded-full transition-transform duration-300 motion-reduce:transition-none focus-visible:outline focus-visible:outline-primary" style={{ transform: `scale(${agent.expanded ? 1.8 : 1})` }}><VoiceOrb status={agent.status} level={agent.level} size={92} /></button>
      <button type="button" onClick={agent.end} aria-label="End voice mode" className="h-11 w-11 rounded-full grid place-items-center bg-black/5 dark:bg-white/10"><Icon name="close" size={21} /></button>
    </div>
    <p role="status" className="text-center text-[11px] text-muted dark:text-slate-400">{agent.muted ? agent.status === 'speaking' ? 'Aura is speaking · microphone muted' : agent.status === 'thinking' ? 'Aura is thinking · microphone muted' : 'Microphone muted' : STATUS_TEXT[agent.status]}</p>
    {agent.error && <p role="alert" className="text-center text-xs text-rose-500">{agent.error}</p>}
  </section>;
  const caption = agent.status === 'listening' ? agent.transcript : agent.status === 'speaking' || agent.status === 'thinking' ? agent.reply || agent.transcript : '';
  return (
    <div
      className={
        embedded
          ? "absolute inset-0 z-30 flex flex-col items-center justify-between bg-gradient-to-b from-[#0f0b24] via-[#171036] to-[#0b1026] text-white px-5 py-6 rounded-3xl overflow-hidden shadow-2xl animate-[pop_.18s_ease-out]"
          : "fixed inset-0 z-[99999] flex flex-col items-center justify-between bg-gradient-to-b from-[#0f0b24] via-[#171036] to-[#0b1026] text-white px-6 py-8"
      }
      role="dialog"
      aria-label={`${title} voice mode`}
    >
      <div className="w-full max-w-md flex items-center justify-between">
        <div>
          <div className="text-sm font-extrabold">{title}</div>
          <div className="text-[11px] text-white/60">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          {onToggleLang && (
            <button onClick={onToggleLang} className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 transition">
              {lang === 'hi-IN' ? 'हिंदी' : 'English'}
            </button>
          )}
          {embedded && (
            <button onClick={agent.end} className="w-7 h-7 grid place-items-center rounded-xl bg-white/10 hover:bg-white/20 text-white/80 transition" aria-label="Close voice mode">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 my-auto">
        <button onClick={agent.interrupt} className="rounded-full focus:outline-none" aria-label="Voice orb" title={agent.status === 'speaking' ? 'Tap to interrupt' : agent.status === 'listening' ? 'Tap when done speaking' : undefined}>
          <VoiceOrb status={agent.status} level={agent.level} size={embedded ? 165 : Math.min(260, typeof window !== 'undefined' ? window.innerWidth * 0.62 : 260)} />
        </button>
        <div className="text-center max-w-xs min-h-[70px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{agent.muted && agent.status === 'idle' ? 'Microphone muted — tap the mic to talk' : STATUS_TEXT[agent.status]}</div>
          {agent.muted && agent.status !== 'idle' && <div className="mt-2 text-[11px] text-white/60">Microphone muted — Aura can keep speaking.</div>}
          {caption && <p className="mt-2.5 text-[13px] leading-relaxed text-white/90 line-clamp-3">{caption}</p>}
          {agent.error && <p className="mt-2 text-xs text-rose-300">{agent.error}</p>}
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <button
          onClick={agent.toggleMute}
          className={`w-12 h-12 rounded-full grid place-items-center transition ${agent.muted ? 'bg-white text-[#171036]' : 'bg-white/10 text-white hover:bg-white/20'}`}
          aria-label={agent.muted ? 'Unmute' : 'Mute'}
          title={agent.muted ? 'Unmute' : 'Mute'}
        >
          <span className="relative">
            <Icon name="mic" size={20} />
            {agent.muted && <span className="absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current rounded" />}
          </span>
        </button>
        <button onClick={agent.end} className="w-12 h-12 rounded-full grid place-items-center bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30 transition" aria-label="End voice mode" title="End">
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  );
}
