import { externalApi } from './api.js';
import { createAuraSpeechPlayer } from './auraSpeechPlayer.js';

export const isBrave = typeof navigator !== 'undefined' && Boolean(navigator.brave);
export const hasMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
export const isSpeechRecognitionSupported = typeof window !== 'undefined' && !isBrave && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

const speech = createAuraSpeechPlayer({
  request: (path, options) => externalApi.raw(path, options),
  createAudio: url => new Audio(url),
  createUrl: blob => URL.createObjectURL(blob),
  revokeUrl: url => URL.revokeObjectURL(url),
  cancelLegacySpeech: () => {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  },
});

/** ElevenLabs only. Provider/playback failures remain visible; no device voice. */
export const speakAura = speech.speak;
export const stopAuraSpeaking = speech.stop;
if (import.meta.hot) import.meta.hot.dispose(() => speech.stop());

/**
 * Transcribes recorded audio via ElevenLabs Speech-to-Text (`/ai/transcribe`).
 * @param {Blob} audioBlob
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAuraAudio(audioBlob) {
  if (!audioBlob) throw new Error('No audio recorded');
  const form = new FormData();
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  form.append('file', audioBlob, `recording.${ext}`);

  const res = await externalApi.raw('/ai/transcribe', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Could not transcribe voice message');
  }

  const data = await res.json();
  return data.text || '';
}

