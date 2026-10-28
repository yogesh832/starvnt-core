import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createAuraSpeechPlayer } from '../src/lib/auraSpeechPlayer.js';

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const response = () => ({ ok: true, blob: async () => new Blob(['ElevenLabs MP3'], { type: 'audio/mpeg' }) });
function setup(request, play) {
  const clips = [], revoked = [];
  const player = createAuraSpeechPlayer({ request, createUrl: () => `blob:${clips.length}`, revokeUrl: url => revoked.push(url), createAudio: url => {
    const audio = { src: url, pauses: 0, plays: 0, async play() { this.plays++; if (play) return play.call(this); this.onplay?.(); }, pause() { this.pauses++; } };
    clips.push(audio); return audio;
  } });
  return { ...player, clips, revoked };
}

test('a late progress response cannot play over the final ElevenLabs answer', async () => {
  const first = deferred(), signals = [];
  let calls = 0;
  const player = setup((_path, options) => { signals.push(options.signal); return ++calls === 1 ? first.promise : Promise.resolve(response()); });
  const progress = player.speak('Let me check');
  await player.speak('Your final answer');
  first.resolve(response()); await progress;
  assert.equal(signals[0].aborted, true);
  assert.equal(player.clips.length, 1);
  assert.equal(player.clips[0].plays, 1);
  player.stop();
});

test('stopping before the response or blob arrives suppresses playback and callbacks', async () => {
  for (const stopAtBlob of [false, true]) {
    const pending = deferred(); let ends = 0, errors = 0;
    const player = setup(() => stopAtBlob ? Promise.resolve({ ok: true, blob: () => pending.promise }) : pending.promise);
    const speech = player.speak('Stopped', { onEnd: () => ends++, onError: () => errors++ });
    await Promise.resolve(); player.stop();
    pending.resolve(stopAtBlob ? new Blob(['audio']) : response()); await speech;
    assert.equal(player.clips.length, 0); assert.equal(ends + errors, 0);
  }
});

test('replacing a playing clip disposes it and ignores its stale ended event', async () => {
  const player = setup(async () => response()); let oldEnds = 0, newEnds = 0;
  await player.speak('One', { onEnd: () => oldEnds++ });
  const oldEnd = player.clips[0].onended;
  await player.speak('Two', { onEnd: () => newEnds++ });
  oldEnd();
  assert.equal(player.clips[0].src, ''); assert.equal(player.clips[0].pauses, 1);
  assert.equal(oldEnds, 0); assert.equal(player.revoked.length, 1);
  const end = player.clips[1].onended; end(); end();
  assert.equal(newEnds, 1); assert.equal(player.revoked.length, 2);
});

test('provider failures surface once and never invoke successful completion', async () => {
  let ends = 0, errors = 0;
  const player = setup(async () => { throw new Error('ElevenLabs quota exhausted'); });
  await player.speak('Hello', { onEnd: () => ends++, onError: error => { errors++; assert.match(error.message, /quota/); } });
  assert.equal(ends, 0); assert.equal(errors, 1); assert.equal(player.clips.length, 0);
});

test('an audio error plus play rejection invokes only one failure callback and revokes the URL', async () => {
  let ends = 0, errors = 0;
  const player = setup(async () => response(), function () { this.onerror(new Error('Decoder failed')); return Promise.reject(new Error('Play rejected')); });
  await player.speak('Hello', { onEnd: () => ends++, onError: () => errors++ });
  assert.equal(errors, 1); assert.equal(ends, 0); assert.equal(player.revoked.length, 1);
});

test('an autoplay rejection is visible and never falls back to another voice', async () => {
  let failures = 0;
  const player = setup(async () => response(), async () => { throw new Error('Playback requires a user gesture'); });
  await player.speak('Hello', { onError: error => { failures++; assert.match(error.message, /gesture/); }, onEnd: () => assert.fail('Failed playback completed successfully') });
  assert.equal(failures, 1); assert.equal(player.clips[0].src, ''); assert.equal(player.revoked.length, 1);
});

test('web and native Aura contain no system speech synthesis calls', async () => {
  for (const path of ['../src/lib/voice.js', '../src/lib/auraSpeechPlayer.js', '../src/components/VoiceAgent.jsx', '../src/pages/customer/AuraChat.jsx', '../src/pages/vendor/VendorAura.jsx', '../../mobile/src/AuraVoice.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /SpeechSynthesisUtterance|speechSynthesis\s*\.\s*speak|Speech\s*\.\s*speak|speakOnDevice/, path);
  }
});
