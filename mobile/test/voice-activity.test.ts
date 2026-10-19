import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceActivity } from '../src/voiceActivity.ts';

test('quiet speech followed by a pause automatically sends a turn without a tap', () => {
  const voice = createVoiceActivity();
  assert.equal(voice.update(200, -46, 200), null);
  assert.equal(voice.update(350, -45, 350), null);
  assert.equal(voice.update(500, -44, 500), null);
  assert.equal(voice.update(1000, -65, 1000), null);
  assert.equal(voice.update(1550, -65, 1550), 'pause');
});
test('silence and an isolated noise do not become a spoken turn', () => {
  const voice = createVoiceActivity();
  voice.update(150, -70, 150); voice.update(300, -20, 300);
  assert.equal(voice.update(3000, -70, 3000), null);
});
test('continuing speech at the pause boundary keeps recording; the next turn resets speech state', () => {
  const voice = createVoiceActivity(); voice.update(150, -30, 150); voice.update(300, -30, 300); voice.update(450, -30, 450);
  assert.equal(voice.update(1500, -30, 1500), null);
  assert.equal(voice.update(2100, -65, 2100), null);
  assert.equal(voice.update(2200, -65, 2200), 'pause');
  voice.reset(); assert.equal(voice.update(3000, -70, 6000), null);
});
test('recording still has a bounded duration if a microphone cannot report levels', () => {
  const voice = createVoiceActivity();
  assert.equal(voice.update(2000, undefined, 2000), null);
  assert.equal(voice.update(60000, undefined, 60000), 'noise');
});

test('repeated clock ticks and their brief decay never qualify as speech', () => {
  const voice = createVoiceActivity();
  for (let now = 100; now < 10000; now += 100) {
    const level = now % 1000 < 200 ? -25 : -65;
    assert.equal(voice.update(now, level, now), null);
  }
  assert.equal(voice.hasSpeech(), false);
});

test('clock ticks after speech do not keep extending the automatic turn', () => {
  const voice = createVoiceActivity();
  [100, 200, 300, 400].forEach(now => voice.update(now, -32, now));
  voice.update(500, -65, 500); voice.update(600, -22, 600);
  voice.update(700, -65, 700); voice.update(900, -22, 900);
  assert.equal(voice.update(1050, -65, 1050), 'pause');
});

