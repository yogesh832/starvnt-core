const API = 'https://api.elevenlabs.io/v1';
export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
export function voiceError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
async function requestVoice(path, init, { apiKey = process.env.ELEVENLABS_API_KEY, request = fetch } = {}) {
  if (!apiKey?.trim()) throw voiceError(503, 'VOICE_NOT_CONFIGURED', 'Aura voice is not configured on the server.');
  let response;
  try {
    response = await request(`${API}${path}`, { ...init, headers: { ...init.headers, 'xi-api-key': apiKey }, signal: AbortSignal.timeout(30000) });
  } catch {
    throw voiceError(504, 'VOICE_PROVIDER_TIMEOUT', 'The voice service did not respond. Please try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason = body.detail?.status;
    if (reason === 'payment_required') throw voiceError(503, 'VOICE_PLAN_REQUIRED', 'The configured ElevenLabs voice requires a paid plan. Choose a voice available to your account or upgrade the ElevenLabs plan.');
    if (reason === 'quota_exceeded') throw voiceError(429, 'VOICE_QUOTA_EXCEEDED', 'The ElevenLabs voice allowance is exhausted. Ask the app administrator to check the account.');
    if (reason === 'invalid_api_key') throw voiceError(503, 'VOICE_NOT_CONFIGURED', 'The server ElevenLabs key is invalid. Ask the app administrator to update it.');
    if (reason === 'missing_permissions') throw voiceError(503, 'VOICE_PERMISSION_REQUIRED', 'The server ElevenLabs key needs speech-to-text and text-to-speech access.');
    if (response.status === 429) throw voiceError(429, 'VOICE_RATE_LIMITED', 'Voice is busy. Please wait a moment and retry.');
    throw voiceError(502, 'VOICE_PROVIDER_UNAVAILABLE', 'The voice service is unavailable. Please try again.');
  }
  return response;
}
export async function transcribeAudio(file, options) {
  if (!file?.buffer?.length) throw voiceError(400, 'VOICE_AUDIO_REQUIRED', 'Record something before sending.');
  if (file.buffer.length > MAX_VOICE_BYTES) throw voiceError(413, 'VOICE_AUDIO_TOO_LARGE', 'Keep voice messages under one minute.');
  if (!/^audio\//.test(file.mimetype || '') && file.mimetype !== 'video/webm')
    throw voiceError(415, 'VOICE_AUDIO_TYPE_INVALID', 'Choose a supported audio recording.');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), 'aura-recording');
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v2');
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  const response = await requestVoice('/speech-to-text', { method: 'POST', body: form }, options);
  const data = await response.json();
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw voiceError(422, 'VOICE_NO_SPEECH', "I couldn't hear any words. Please try again.");
  if (text.length > 2000) throw voiceError(413, 'VOICE_TRANSCRIPT_TOO_LONG', 'Please use a shorter voice message.');
  return { text, language: data.language_code || null };
}
export async function synthesizeSpeech(value, options) {
  if (typeof value !== 'string' || !value.trim()) throw voiceError(400, 'VOICE_TEXT_REQUIRED', 'Enter something for Aura to say.');
  if (value.length > 3000) throw voiceError(413, 'VOICE_TEXT_TOO_LONG', 'Please use a shorter spoken reply.');
  const voice = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
  const response = await requestVoice(`/text-to-speech/${encodeURIComponent(voice)}`, {
    method: 'POST', headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: value.trim(), model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.5 } }),
  }, options);
  return Buffer.from(await response.arrayBuffer());
}
