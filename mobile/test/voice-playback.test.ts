import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoicePlayback } from '../src/voicePlayback.ts';

test('short native clips complete once even when playing and ended events arrive together', () => {
  let ends = 0;
  const voice = createVoicePlayback(() => ends++, () => assert.fail('Unexpected playback error'));
  voice.update({ didJustFinish: true }); // previous source's cached status
  assert.equal(ends, 0);
  voice.update({ playing: true });
  voice.update({ playing: false, didJustFinish: true });
  voice.update({ didJustFinish: true });
  assert.equal(ends, 1);
});
test('native playback failure is terminal and does not restart listening', () => {
  let errors = 0;
  const voice = createVoicePlayback(() => assert.fail('Failed voice resumed listening'), () => errors++);
  voice.update({ playing: true }); voice.update({ error: 'decode failed' });
  voice.update({ didJustFinish: true }); voice.update({ error: 'repeat' });
  assert.equal(errors, 1);
});
test('muting, interrupting or closing native voice ignores late playback events', () => {
  const voice = createVoicePlayback(() => assert.fail('Canceled voice completed'), () => assert.fail('Canceled voice failed'));
  voice.update({ playing: true }); voice.cancel();
  voice.update({ didJustFinish: true }); voice.update({ error: 'late' });
});
