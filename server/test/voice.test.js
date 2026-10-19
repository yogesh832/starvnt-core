import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createVoiceRouter } from '../src/external/routes/voice.routes.js';
import { MAX_VOICE_BYTES, synthesizeSpeech, transcribeAudio } from '../src/external/services/voice.service.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
test('ElevenLabs transcription keeps its API key on the server and returns text only', async () => {
  const result = await transcribeAudio({ buffer: Buffer.from('audio'), mimetype: 'audio/mp4' }, { apiKey: 'server-secret', request: async (url, options) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/speech-to-text');
    assert.equal(options.headers['xi-api-key'], 'server-secret');
    assert.equal(options.body.get('model_id'), 'scribe_v2');
    assert.equal(options.body.get('file').type, 'audio/mp4');
    return json({ text: 'Plan my birthday', language_code: 'eng', words: [{ secret: 'not returned' }] });
  } });
  assert.deepEqual(result, { text: 'Plan my birthday', language: 'eng' });
});
test('voice validates missing audio, media type, size and text before calling ElevenLabs', async () => {
  const options = { apiKey: 'secret', request: () => assert.fail('Invalid input reached provider') };
  await assert.rejects(transcribeAudio(null, options), { code: 'VOICE_AUDIO_REQUIRED' });
  await assert.rejects(transcribeAudio({ buffer: Buffer.from('image'), mimetype: 'image/png' }, options), { status: 415 });
  await assert.rejects(transcribeAudio({ buffer: Buffer.alloc(MAX_VOICE_BYTES + 1), mimetype: 'audio/mp4' }, options), { status: 413 });
  await assert.rejects(synthesizeSpeech('', options), { code: 'VOICE_TEXT_REQUIRED' });
  await assert.rejects(synthesizeSpeech('x'.repeat(3001), options), { status: 413 });
});
test('ElevenLabs speech output uses the existing voice and multilingual audio', async () => {
  const audio = await synthesizeSpeech('नमस्ते', { apiKey: 'secret', request: async (url, options) => {
    assert.match(url, /\/text-to-speech\//);
    const body = JSON.parse(options.body);
    assert.equal(body.text, 'नमस्ते');
    assert.equal(body.model_id, process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2');
    return new Response(new Uint8Array([1, 2, 3]));
  } });
  assert.deepEqual(audio, Buffer.from([1, 2, 3]));
});
test('provider payment, permission, quota and timeout errors are actionable without leaking details', async () => {
  for (const [reason, code] of [['payment_required', 'VOICE_PLAN_REQUIRED'], ['missing_permissions', 'VOICE_PERMISSION_REQUIRED'], ['invalid_api_key', 'VOICE_NOT_CONFIGURED'], ['quota_exceeded', 'VOICE_QUOTA_EXCEEDED']]) {
    await assert.rejects(synthesizeSpeech('hello', { apiKey: 'secret', request: async () => json({ detail: { status: reason, message: 'private provider detail' } }, 402) }), error => error.code === code && !error.message.includes('private provider detail'));
  }
  await assert.rejects(synthesizeSpeech('hello', { apiKey: '', request: () => assert.fail('No key') }), { code: 'VOICE_NOT_CONFIGURED' });
  await assert.rejects(synthesizeSpeech('hello', { apiKey: 'secret', request: async () => { throw new Error('offline'); } }), { code: 'VOICE_PROVIDER_TIMEOUT' });
});
test('no-speech audio does not become a fabricated chat message', async () => {
  await assert.rejects(transcribeAudio({ buffer: Buffer.from('silence'), mimetype: 'audio/webm' }, { apiKey: 'secret', request: async () => json({ text: '' }) }), { code: 'VOICE_NO_SPEECH' });
});
test('authenticated voice HTTP routes accept multipart audio and deliver speech bytes', async t => {
  const app = express(); app.use(express.json());
  app.use('/api/ai', createVoiceRouter({ authenticate: (req, res, next) => req.get('Authorization') === 'Bearer test' ? next() : res.status(401).json({ error: 'UNAUTHENTICATED' }), transcribe: async file => { assert.equal(file.mimetype, 'audio/webm'); return { text: 'Hello Aura', language: 'eng' }; }, speak: async text => { assert.equal(text, 'Hello'); return Buffer.from('speech'); } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  assert.equal((await fetch(`${base}/voice`, { method: 'POST' })).status, 401);
  const body = new FormData(); body.append('file', new Blob(['audio'], { type: 'audio/webm' }), 'recording.webm');
  const transcript = await fetch(`${base}/transcribe`, { method: 'POST', headers: { Authorization: 'Bearer test' }, body });
  assert.deepEqual(await transcript.json(), { text: 'Hello Aura', language: 'eng' });
  const speech = await fetch(`${base}/voice`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello' }) });
  assert.equal(speech.headers.get('content-type'), 'audio/mpeg');
  assert.equal(speech.headers.get('cache-control'), 'no-store');
  assert.equal(await speech.text(), 'speech');
});
