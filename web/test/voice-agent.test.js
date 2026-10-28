import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createVoiceActivity } from '../../shared/voiceActivity.ts';

function harness(onUtterance = async () => 'Your plan is ready.') {
  const slots = [], cleanups = [], calls = { stopSpeech: 0, record: 0, speech: [] };
  let cursor = 0, agent;
  const hooks = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn) { const i = cursor++; if (!slots[i]) { slots[i] = {}; cleanups.push(fn()); } },
  };
  class Recorder {
    static isTypeSupported() { return true; }
    start() { calls.record++; this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['a'.repeat(800)]) }); void this.onstop?.(); }
  }
  const stream = () => ({ active: true, getTracks: () => [{ stop() {} }] });
  const code = readFileSync(new URL('../src/components/VoiceAgent.jsx', import.meta.url), 'utf8').split('export const voiceAgentSupported')[1].split('export function VoiceOrb')[0];
  const create = new Function(...Object.keys(hooks), 'window', 'navigator', 'MediaRecorder', 'speakAura', 'stopAuraSpeaking', 'transcribeAuraAudio', 'requestAnimationFrame', 'cancelAnimationFrame', 'createVoiceActivity', `const voiceAgentSupported ${code.replace('export function useVoiceAgent', 'function useVoiceAgent')}; return useVoiceAgent;`);
  const useAgent = create(...Object.values(hooks), {}, { mediaDevices: { getUserMedia: async () => stream() } }, Recorder,
    (text, callbacks) => { calls.speech.push({ text, ...callbacks }); callbacks.onStart(); }, () => { calls.stopSpeech++; }, async () => 'Plan my wedding', () => 1, () => {}, createVoiceActivity);
  function render() { cursor = 0; agent = useAgent({ onUtterance }); return agent; }
  async function flush() { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
  render();
  return { calls, flush, get agent() { return render(); }, dispose() { cleanups.forEach(fn => fn?.()); } };
}

test('web microphone mute preserves speech and resumes only after unmute', async () => {
  const h = harness();
  try {
    await h.agent.start(); h.agent.interrupt(); await h.flush();
    assert.equal(h.calls.speech.length, 1);
    const before = h.calls.stopSpeech;
    h.agent.toggleMute(); await h.flush();
    assert.equal(h.calls.stopSpeech, before);
    assert.equal(h.agent.status, 'speaking');
    h.calls.speech[0].onEnd(); await h.flush();
    assert.equal(h.calls.record, 1);
    h.agent.toggleMute(); await h.flush();
    assert.equal(h.calls.record, 2);
  } finally { h.dispose(); }
});

test('web mute during a pending reply does not discard that reply', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  try {
    await h.agent.start(); h.agent.interrupt(); await h.flush();
    h.agent.toggleMute(); resolve('Here is your plan.'); await h.flush();
    assert.equal(h.calls.speech[0].text, 'Here is your plan.');
    assert.equal(h.agent.status, 'speaking');
  } finally { h.dispose(); }
});

test('web typed suggestions retain structured payloads, voice mode and a single reply', async () => {
  const requests = [];
  const h = harness(async (text, body) => { requests.push({ text, body }); return 'Budget saved.'; });
  try {
    await h.agent.start();
    h.agent.toggleExpanded();
    assert.equal(h.calls.record, 1, 'Presentation changes must not restart capture');
    await h.agent.submit('₹1–2 lakh', { budgetRange: 'one-two' }); await h.flush();
    assert.deepEqual(requests, [{ text: '₹1–2 lakh', body: { budgetRange: 'one-two' } }]);
    assert.equal(h.agent.open, true);
    assert.equal(h.agent.expanded, false);
    assert.equal(h.calls.speech.length, 1);
    h.calls.speech[0].onEnd(); await h.flush();
    assert.equal(h.calls.record, 2);
  } finally { h.dispose(); }
});
