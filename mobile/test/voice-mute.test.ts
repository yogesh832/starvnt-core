import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { createVoicePlayback } from '../src/voicePlayback.ts';
import { createVoiceTurnGate } from '../src/voiceTurnGate.ts';
import { createVoiceActivity } from '../src/voiceActivity.ts';
import { spokenReply } from '../src/voiceText.ts';

// Exercise the actual native voice component with deterministic audio hardware.
function voiceHarness(answer: (text?: string, body?: Record<string, unknown>) => Promise<string> = async () => 'Here is your event plan.') {
  const slots: any[] = [], effects: (() => void)[] = [];
  let cursor = 0, tree: any, listener: any, submit: any;
  const calls = { record: 0, stop: 0, play: 0, pause: 0 };
  const React: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState(initial: any) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value: any) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial: any) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(callback: any, deps: any[]) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  const recorder = { uri: '/recording.m4a', isRecording: false, prepareToRecordAsync: async () => {},
    record() { calls.record++; this.isRecording = true; },
    async stop() { calls.stop++; this.isRecording = false; },
  };
  const player = { pause() { calls.pause++; }, replace() {}, play() { calls.play++; listener?.({ playing: true }); },
    addListener(_event: string, callback: any) { listener = callback; return { remove() { listener = undefined; } }; },
  };
  class NativeFile extends Blob {
    uri: string; exists = true;
    constructor(path: string, name = '') { super([new Uint8Array(128)]); this.uri = `${path}${name}`; }
    create() {} write() {} delete() { this.exists = false; }
  }
  const native: any = { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) } };
  native.useWindowDimensions = () => ({ height: 800, width: 360 });
  native.AccessibilityInfo = { isReduceMotionEnabled: async () => false };
  native.Animated = { View: 'Animated.View', Value: class { interpolate() { return 0; } stopAnimation() {} }, timing: () => ({ start() {} }) };
  for (const name of ['ActivityIndicator', 'Pressable', 'ScrollView', 'StatusBar', 'View']) native[name] = name;
  const modules: any = {
    react: React, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-audio': { AudioModule: { requestRecordingPermissionsAsync: async () => ({ granted: true }) }, RecordingPresets: { HIGH_QUALITY: {} }, setAudioModeAsync: async () => {}, useAudioRecorder: () => recorder, useAudioRecorderState: () => ({ durationMillis: 0, metering: -60 }), useAudioPlayer: () => player },
    'expo-file-system': { File: NativeFile, Paths: { cache: '/cache/' } },
    './api/runtime': { external: { call: async (path: string) => path === '/ai/transcribe' ? { text: 'Plan my wedding' } : { response: { arrayBuffer: async () => new ArrayBuffer(64) } } } },
    './AuthUI': { AuthGradient: 'Gradient', AuthText: 'Text' }, './AuraOrb': { AuraOrb: 'Orb' }, './ui': { Icon: 'Icon' },
    './AuraTheme': { useAuraPalette: () => ({ ink: '#111', muted: '#666', soft: '#eee', primary: '#55f' }) },
    './voicePlayback': { createVoicePlayback }, './voiceTurnGate': { createVoiceTurnGate }, './voiceActivity': { createVoiceActivity }, './voiceText': { spokenReply },
  };
  const code = transformSync(readFileSync(new URL('../src/AuraVoice.tsx', import.meta.url), 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((name: string) => { assert.ok(modules[name], name); return modules[name]; }, module, module.exports);
  function render() { cursor = 0; tree = module.exports.AuraVoice({ compact: true, onController(value: any) { submit = value; }, onUtterance: answer, onClose() {}, onKeyboard() {} }); while (effects.length) effects.shift()!(); }
  function find(node: any, label: string): any {
    if (!node || typeof node !== 'object') return;
    if (node.props?.accessibilityLabel === label) return node;
    for (const child of [node.props?.children || []].flat(Infinity)) { const result = find(child, label); if (result) return result; }
  }
  async function flush() { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
  render();
  return { calls, flush, submit(text: string, body?: Record<string, unknown>) { return submit(text, body); }, press(label: string) { render(); const node = find(tree, label); assert.ok(node, `Missing voice control: ${label}`); return node.props.onPress(); }, complete() { listener?.({ playing: false, didJustFinish: true }); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('microphone mute preserves native playback and waits for unmute after completion', async () => {
  const h = voiceHarness();
  try {
    await h.flush(); await h.press('Finish speaking'); await h.flush();
    assert.equal(h.calls.play, 1);
    h.press('Mute microphone'); await h.flush();
    assert.equal(h.calls.pause, 0, 'Mute must not pause ElevenLabs output');
    h.complete(); await h.flush();
    assert.equal(h.calls.record, 1, 'Muted playback completion must not reopen the microphone');
    h.press('Unmute microphone'); await h.flush();
    assert.equal(h.calls.record, 2);
  } finally { h.dispose(); }
});

test('unmuting during native playback waits until Aura finishes', async () => {
  const h = voiceHarness();
  try {
    await h.flush(); await h.press('Finish speaking'); await h.flush();
    h.press('Mute microphone'); h.press('Unmute microphone'); await h.flush();
    assert.equal(h.calls.record, 1);
    assert.equal(h.calls.pause, 0);
    h.complete(); await h.flush();
    assert.equal(h.calls.record, 2);
  } finally { h.dispose(); }
});

test('muting while a native reply is pending still delivers its speech', async () => {
  let resolve!: (value: string) => void;
  const h = voiceHarness(() => new Promise<string>(done => { resolve = done; }));
  try {
    await h.flush(); const pending = h.press('Finish speaking'); await h.flush();
    h.press('Mute microphone');
    resolve('Your wedding plan is ready.'); await pending; await h.flush();
    assert.equal(h.calls.play, 1);
    assert.equal(h.calls.pause, 0);
    h.complete(); await h.flush();
    assert.equal(h.calls.record, 1);
  } finally { h.dispose(); }
});

test('native typed suggestions keep their payload and speak even while the microphone is muted', async () => {
  const requests: any[] = [];
  const h = voiceHarness(async (text, body) => { requests.push({ text, body }); return 'Your budget has been saved.'; });
  try {
    await h.flush(); h.press('Mute microphone'); await h.flush();
    await h.submit('₹1–2 lakh', { budgetRange: 'one-two' }); await h.flush();
    assert.deepEqual(requests, [{ text: '₹1–2 lakh', body: { budgetRange: 'one-two' } }]);
    assert.equal(h.calls.play, 1);
    h.complete(); await h.flush();
    assert.equal(h.calls.record, 1);
    h.press('Unmute microphone'); await h.flush();
    assert.equal(h.calls.record, 2);
  } finally { h.dispose(); }
});
