import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceTurnGate } from '../src/voiceTurnGate.ts';
import { browserDevApi } from '../src/browserDevApi.ts';

test('a fast speech completion resumes listening after the current turn releases hardware', () => {
  const gate = createVoiceTurnGate();
  const events: string[] = [];
  assert.equal(gate.enter(), true);
  gate.afterCurrent(() => { assert.equal(gate.enter(), true); events.push('listening'); });
  assert.deepEqual(events, []);
  assert.equal(gate.enter(), false);
  gate.leave();
  assert.deepEqual(events, ['listening']);
  gate.leave();
});
test('ending voice chat cancels pending automatic microphone restart', () => {
  const gate = createVoiceTurnGate(); gate.enter();
  gate.afterCurrent(() => assert.fail('Closed voice chat restarted recording'));
  gate.close(); gate.leave();
  assert.equal(gate.enter(), false);
});
test('localhost preview resolves local API to loopback without changing phone or production destinations', () => {
  assert.equal(browserDevApi('http://192.168.0.103:4000', 'localhost'), 'http://localhost:4000');
  assert.equal(browserDevApi('http://192.168.0.103:4000', '192.168.0.103'), 'http://192.168.0.103:4000');
  assert.equal(browserDevApi('https://app.starvnt.com', 'localhost'), 'https://app.starvnt.com');
  assert.equal(browserDevApi('http://remote.example:4000', 'localhost'), 'http://remote.example:4000');
});
