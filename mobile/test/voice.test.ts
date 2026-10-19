import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldFinishVoice, spokenReply } from '../src/voiceText.ts';

test('voice waits for speech before detecting the end of an utterance', () => {
  assert.equal(shouldFinishVoice(2000, -60, 5000, null), false);
  assert.equal(shouldFinishVoice(2000, -60, 5000, 4900), false);
  assert.equal(shouldFinishVoice(2000, -60, 5000, 3000), true);
});
test('voice caps recordings at one minute and supports manual web stop without metering', () => {
  assert.equal(shouldFinishVoice(60000, undefined, 10000, null), true);
  assert.equal(shouldFinishVoice(3000, undefined, 10000, 1000), false);
});
test('speech output removes markdown and links while keeping multilingual text bounded', () => {
  assert.equal(spokenReply('**नमस्ते** — visit https://example.com/booking'), 'नमस्ते — visit');
  assert.equal(spokenReply('x'.repeat(4000)).length, 3000);
});
