import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, BackHandler, Platform, Pressable, ScrollView, StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { external } from './api/runtime';
import { AuthGradient, AuthText as Text } from './AuthUI';
import { AuraOrb } from './AuraOrb';
import { Icon } from './ui';
import { spokenReply } from './voiceText';
import { createVoiceTurnGate } from './voiceTurnGate';
import { createVoicePlayback } from './voicePlayback';
import { createVoiceActivity } from './voiceActivity';
import { useAuraPalette } from './AuraTheme';

type Phase = 'starting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'ready' | 'error' | 'muted';
export type AuraVoiceSubmit = (text: string, body?: Record<string, unknown>) => Promise<void>;
export function AuraVoice({ onUtterance, onClose, onKeyboard, mode = 'conversation', onTranscription, compact = false, expanded = false, dense = false, onExpand, onController }: { onUtterance: (text: string, body?: Record<string, unknown>) => Promise<string>; onClose: () => void; onKeyboard: () => void; mode?: 'conversation' | 'dictate'; onTranscription?: (text: string) => void; compact?: boolean; expanded?: boolean; dense?: boolean; onExpand?: () => void; onController?: (submit: AuraVoiceSubmit | null) => void }) {
  const c = useAuraPalette();
  const { height: screenHeight } = useWindowDimensions();
  const expansion = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (active) Animated.timing(expansion, { toValue: expanded && !dense ? 1 : 0, duration: reduce ? 0 : 280, useNativeDriver: false }).start(); });
    return () => { active = false; expansion.stopAnimation(); };
  }, [expanded, dense, expansion]);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recording = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const [phase, updatePhase] = useState<Phase>('starting');
  const phaseRef = useRef<Phase>('starting');
  function setPhase(value: Phase) { phaseRef.current = value; updatePhase(value); }
  const [micMuted, setMicMuted] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [voiceSource, setVoiceSource] = useState('');
  const active = useRef(true);
  const requestingPermission = useRef(false);
  const muted = useRef(false);
  const microphoneRevision = useRef(0);
  const lifetime = useRef(0);
  const cleanup = useRef<Promise<void>>(Promise.resolve());
  const [gate] = useState(createVoiceTurnGate);
  const [voiceActivity] = useState(createVoiceActivity);
  const recordingStartedAt = useRef(0);
  const audioFile = useRef<File | null>(null);
  const webAudio = useRef<string | null>(null);
  const playbackCleanup = useRef<() => void>(() => {});

  const utterance = useRef(onUtterance);
  utterance.current = onUtterance;
  function discard(uri: string | null) {
    if (!uri) return;
    try { if (Platform.OS === 'web') URL.revokeObjectURL(uri); else { const file = new File(uri); if (file.exists) file.delete(); } } catch {}
  }
  async function stopMicrophone() {
    let recorderUri: string | null = null;
    try {
      recorderUri = recorder.uri;
      if (recorder.isRecording) { await recorder.stop(); recorderUri = recorder.uri; }
    } catch { /* The Expo hook may already have released the native object. */ }
    discard(recorderUri);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }
  async function stopAudio() {
    playbackCleanup.current();
    try { player.pause(); } catch {}
    await stopMicrophone();
    discard(audioFile.current?.uri || null); audioFile.current = null;
    discard(webAudio.current); webAudio.current = null;
  }
  function close(keyboard = false) {
    active.current = false;
    lifetime.current++;
    gate.close();
    cleanup.current = stopAudio();
    if (keyboard) onKeyboard(); else onClose();
  }
  function resumeListening() { gate.afterCurrent(() => { if (active.current) void start(); }); }
  function toggleMute() {
    const next = !muted.current;
    muted.current = next; setMicMuted(next);
    if (next && ['starting', 'listening'].includes(phaseRef.current)) {
      microphoneRevision.current++;
      cleanup.current = stopMicrophone();
      setPhase('muted');
    } else if (!next && ['muted', 'ready', 'error'].includes(phaseRef.current)) resumeListening();
  }
  async function start() {
    if (!active.current || muted.current || !gate.enter()) return;
    const expected = lifetime.current;
    const expectedMicrophone = microphoneRevision.current;
    const current = () => active.current && !muted.current && expected === lifetime.current && expectedMicrophone === microphoneRevision.current;
    setError(''); setPhase('starting');
    try {
      await cleanup.current;
      if (!current()) return;
      // Android can report background while its own permission dialog is open.
      // Keep this voice screen alive until that dialog returns its result.
      requestingPermission.current = true;
      const permission = await AudioModule.requestRecordingPermissionsAsync()
        .finally(() => { requestingPermission.current = false; });
      if (!permission.granted) throw new Error('Allow microphone access in your device settings to talk to Aura.');
      if (!current()) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      if (!current()) return;
      await recorder.prepareToRecordAsync();
      if (!current()) return;
      voiceActivity.reset();
      recorder.record();
      recordingStartedAt.current = Date.now();
      setTranscript(''); setPhase('listening');
    } catch (e) { if (current()) { setError((e as Error).message); setPhase('error'); } }
    finally { gate.leave(); }
  }
  async function finish(automatic = false) {
    if (!active.current || muted.current || !recorder.isRecording || !gate.enter()) return;
    const expected = lifetime.current;
    const current = () => active.current && expected === lifetime.current;
    let uri: string | null = null;
    try {
      if (automatic && !voiceActivity.hasSpeech()) {
        await stopMicrophone();
        if (current()) { setPhase(muted.current ? 'muted' : 'ready'); resumeListening(); }
        return;
      }
      setPhase('transcribing');
      await recorder.stop();
      uri = recorder.uri;
      if (!uri) throw new Error('No audio was recorded. Please try again.');
      if (!current()) return;
      const body = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        body.append('file', blob, 'aura-recording.webm');
      } else {
        // Expo 57 uses expo/fetch: URI-only React Native parts are rejected
        // locally. File implements the Blob/bytes interface its encoder needs.
        const file = new File(uri);
        if (!file.exists || !file.size) throw new Error('The recording is empty or no longer available. Please record again.');
        body.append('file', file);
      }
      if (!current()) return;
      const result = await external.call('/ai/transcribe', 'POST', body);
      if (!current()) return;
      if (typeof result.text !== 'string' || !result.text.trim()) { setPhase(muted.current ? 'muted' : 'ready'); resumeListening(); return; }
      setTranscript(result.text);
      if (mode === 'dictate') { close(); onTranscription?.(result.text); return; }
      setPhase('thinking');
      const answer = await utterance.current(result.text);
      await playReply(answer, expected);
    } catch (e) { if (current()) { playbackCleanup.current(); player.pause(); setError((e as Error).message); setPhase('error'); } }
    finally { discard(uri); gate.leave(); }
  }
  async function playReply(answer: string, expected: number) {
      const current = () => active.current && expected === lifetime.current;
      if (!current()) return;
      setReply(answer);
      const speech = spokenReply(answer);
      if (!speech) { setPhase(muted.current ? 'muted' : 'ready'); resumeListening(); return; }
      const { response } = await external.call('/ai/voice', 'POST', { text: speech }, true);
      if (!current()) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (!current()) return;
      discard(audioFile.current?.uri || null); discard(webAudio.current);
      let source: string;
      if (Platform.OS === 'web') { source = URL.createObjectURL(await response.blob()); webAudio.current = source; }
      else {
        const file = new File(Paths.cache, `aura-voice-${Date.now()}.mp3`);
        file.create({ overwrite: true });
        file.write(new Uint8Array(await response.arrayBuffer()));
        audioFile.current = file; source = file.uri;
      }
      if (!current()) { discard(source); return; }
      playbackCleanup.current();
      const observer = createVoicePlayback(() => {
        if (current()) { setPhase(muted.current ? 'muted' : 'ready'); resumeListening(); }
      }, () => {
        if (current()) { player.pause(); setError('ElevenLabs audio could not play. Your reply is saved in chat. Please try again.'); setPhase('error'); }
      });
      // Expo exposes this SharedObject event at runtime; its inherited event
      // methods are absent from this SDK's consumer AudioPlayer declaration.
      const emitter = player as typeof player & { addListener(event: 'playbackStatusUpdate', listener: (status: Parameters<typeof observer.update>[0]) => void): { remove(): void } };
      const subscription = emitter.addListener('playbackStatusUpdate', status => { if (current()) observer.update(status); });
      playbackCleanup.current = () => { observer.cancel(); subscription.remove(); };
      setVoiceSource('ElevenLabs voice'); setPhase('speaking');
      player.replace(source); player.play();
  }
  async function submitText(text: string, body?: Record<string, unknown>) {
    if (!active.current || !text.trim() || !gate.enter()) return;
    const expected = ++lifetime.current;
    microphoneRevision.current++;
    setError(''); setTranscript(text); setPhase('thinking');
    try {
      await stopAudio();
      if (!active.current || expected !== lifetime.current) return;
      await playReply(await utterance.current(text, body), expected);
    } catch (e) { if (active.current && expected === lifetime.current) { setError((e as Error).message); setPhase('error'); } }
    finally { gate.leave(); }
  }
  useEffect(() => { onController?.(submitText); return () => onController?.(null); }, []);
  useEffect(() => {
    active.current = true;
    lifetime.current++;
    gate.open();
    resumeListening();
    const app = AppState.addEventListener('change', state => { if (state === 'background' && !requestingPermission.current) close(); });
    const back = Platform.OS === 'android' ? BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; }) : null;
    return () => { active.current = false; lifetime.current++; gate.close(); app.remove(); back?.remove(); cleanup.current = stopAudio(); };
  }, []);
  useEffect(() => {
    if (phase !== 'listening') return;
    const now = Date.now();
    if (voiceActivity.update(now - recordingStartedAt.current, recording.metering, now)) void finish(true);
  }, [recording.durationMillis, recording.metering, phase]);
  const processing = ['starting', 'transcribing', 'thinking'].includes(phase);
  const title = { starting: 'Opening microphone…', listening: 'Listening… pause when you’re done', transcribing: 'Understanding…', thinking: 'Thinking…', speaking: 'Speaking… tap the orb to interrupt', ready: 'Ready when you are', error: 'Voice needs attention', muted: 'Muted — tap the mic to talk' }[phase];
  const caption = phase === 'speaking' || phase === 'thinking' ? reply || transcript : transcript;
  const level = phase === 'listening' ? Math.max(0, Math.min(1, ((recording.metering ?? -60) + 60) / 50)) : phase === 'speaking' ? .3 : 0;
  function interrupt() {
    if (phase === 'listening') void finish();
    else if (phase === 'speaking') { playbackCleanup.current(); player.pause(); setPhase(muted.current ? 'muted' : 'ready'); resumeListening(); }
    else if (phase === 'error' || phase === 'ready') void start();
  }
  if (compact) return <Animated.View accessibilityLabel="Aura voice controls" style={{ alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 6, minHeight: dense ? 82 : expansion.interpolate({ inputRange: [0, 1], outputRange: [144, Math.min(340, screenHeight * .45)] }) }}>
    {onExpand && !dense && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Show conversation and event details' : 'Expand voice mode'} onPress={onExpand} style={{ minHeight: 32, paddingHorizontal: 12, justifyContent: 'center' }}><Text size={10} color={c.muted}>{expanded ? 'Show conversation ↓' : 'Expand voice ↑'}</Text></Pressable>}
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: expansion.interpolate({ inputRange: [0, 1], outputRange: [22, 44] }), height: dense ? 64 : expansion.interpolate({ inputRange: [0, 1], outputRange: [108, 210] }) }}>
      <Pressable accessibilityRole="button" accessibilityLabel={micMuted ? 'Unmute microphone' : 'Mute microphone'} accessibilityState={{ selected: micMuted }} onPress={toggleMute} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}><Icon name={micMuted ? 'mic-off-outline' : 'mic-outline'} size={21} color={micMuted ? c.primary : c.muted} /></Pressable>
      <Animated.View style={{ width: dense ? 64 : 108, alignItems: 'center', transform: [{ scale: expansion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }] }}><Pressable accessibilityRole="button" accessibilityLabel={phase === 'speaking' ? 'Interrupt Aura' : phase === 'listening' ? 'Finish speaking' : 'Voice orb'} disabled={processing || phase === 'muted'} onPress={interrupt}><AuraOrb size={dense ? 64 : 108} level={level} thinking={processing} /></Pressable></Animated.View>
      <Pressable accessibilityRole="button" accessibilityLabel="End voice mode" onPress={() => close()} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.soft }}><Icon name="close" size={22} color={c.ink} /></Pressable>
    </Animated.View>
    <Text size={10} color={c.muted}>{phase === 'speaking' && micMuted ? 'Aura is speaking · microphone muted' : title}</Text>
    {!!error && <View accessibilityRole="alert"><Text size={11} color={c.danger}>{error}</Text></View>}
  </Animated.View>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: '#0f0b24' }}>
    <StatusBar barStyle="light-content" backgroundColor="#0f0b24" />
    <AuthGradient vertical colors={['#0f0b24', '#171036', '#0b1026']} />
    <View style={{ paddingHorizontal: 24, paddingTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View><Text size={14} bold>Aura+</Text><Text size={11} color="#ffffff99">{mode === 'dictate' ? 'Dictate a message' : 'Your event assistant · voice'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Switch to keyboard" onPress={() => close(true)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="keypad-outline" size={21} color="#ffffffcc" /></Pressable>
    </View>
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={phase === 'listening' ? 'Finish speaking' : phase === 'speaking' ? 'Interrupt Aura' : 'Voice orb'} accessibilityState={{ disabled: processing || phase === 'muted' }} disabled={processing || phase === 'muted'} onPress={interrupt}><AuraOrb level={level} thinking={processing} /></Pressable>
      <View style={{ alignItems: 'center', gap: 12, minHeight: 100, maxWidth: 340, paddingTop: 12 }}>
        {phase === 'listening' && mode === 'conversation' && <Text size={12} color="#ffffff99">Speak naturally. Aura replies automatically when you pause.</Text>}
        <Text size={11} bold color="#ffffff88">{title.toUpperCase()}</Text>
        {micMuted && phase !== 'muted' && <Text size={11} color="#ffffff99">Microphone muted — Aura can keep speaking.</Text>}
        {processing && <ActivityIndicator color="#c4b5fd" size="small" />}
        {!!caption && <Text size={13} color="#ffffffe6">{caption.slice(0, 260)}{caption.length > 260 ? '…' : ''}</Text>}
        {mode === 'dictate' && phase === 'listening' && <Text size={12} color="#ffffff99">Your words will fill the message box for review.</Text>}
        {!!error && <View accessibilityRole="alert"><Text size={12} color="#fda4af">{error}</Text></View>}
        {phase === 'error' && <Pressable accessibilityRole="button" onPress={() => { void start(); }} style={{ padding: 10 }}><Text size={12} bold color="#c4b5fd">Try again</Text></Pressable>}
        {!!voiceSource && phase === 'speaking' && <Text size={10} color="#ffffff66">{voiceSource}</Text>}
      </View>
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 28 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={micMuted ? 'Unmute microphone' : 'Mute microphone'} accessibilityState={{ selected: micMuted }} onPress={toggleMute} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: micMuted ? '#fff' : '#ffffff1a' }}><Icon name={micMuted ? 'mic-off-outline' : 'mic-outline'} size={22} color={micMuted ? '#171036' : '#fff'} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="End voice mode" onPress={() => close()} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f43f5e' }}><Icon name="close" size={23} color="#fff" /></Pressable>
    </View>
  </SafeAreaView>;
}

