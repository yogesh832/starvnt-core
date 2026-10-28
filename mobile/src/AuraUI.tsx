import { AuraMark } from './AuraMark';
import Svg, { Rect, Path } from 'react-native-svg';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, AccessibilityInfo, Animated, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Data } from './api/client';
import { AuthGradient } from './AuthUI';
import { AuraText as Text, useAuraPalette } from './AuraTheme';
import { Icon } from './ui';
import { messageLinks } from './messageMedia';
import { AuraVoice, type AuraVoiceSubmit } from './AuraVoice';
import { AuraEventPicker } from './AuraEventPicker';

export function AuraReveal({ children }: React.PropsWithChildren) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (active) Animated.timing(value, { toValue: 1, duration: reduce ? 0 : 240, useNativeDriver: true }).start(); });
    return () => { active = false; value.stopAnimation(); };
  }, [value]);
  return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}
export function AuraPanel({ children }: React.PropsWithChildren) {
  const c = useAuraPalette();
  return <AuraReveal><View style={{ backgroundColor: c.panel, borderWidth: 1, borderColor: c.subtle, borderRadius: 24, padding: 16, gap: 12 }}>{children}</View></AuraReveal>;
}
export function AuraAvatar({ size = 32 }: { size?: number }) {
  return <AuraMark size={size} />;
}
export function AuraRow({ title, icon, onPress, disabled = false, trailing }: { title: string; icon?: string; onPress: () => void; disabled?: boolean; trailing?: string }) {
  const c = useAuraPalette();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: c.chipLine, borderRadius: 16, backgroundColor: c.panel, paddingHorizontal: 16, paddingVertical: 11, opacity: disabled ? .45 : pressed ? .65 : 1 })}>
    {icon && <Icon name={icon} size={17} color={c.chip} />}<View style={{ flex: 1 }}><Text size={12} color={c.chip}>{title}</Text></View>{trailing && <Icon name={trailing} size={16} color={c.muted} />}
  </Pressable>;
}
const prompts = ["My daughter's wedding", 'Plan a milestone birthday', 'Corporate event for 300 people', 'Arrange a Puja', 'Plan an anniversary'];
function Bubble({ mine = false, content, onOpenLink, children }: React.PropsWithChildren<{ mine?: boolean; content: string; onOpenLink?: (url: string) => void }>) {
  const c = useAuraPalette();
  const links = messageLinks(content), images = links.filter(link => link.image);
  const clean = images.reduce((value, link) => value.replaceAll(link.url, ''), content).replace(/\[Attached Media\/Link\]:|\[Reference Image\]:/gi, '').trim();
  return <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 10, alignItems: 'flex-start' }}>
    {!mine && <AuraAvatar />}
    <View style={{ maxWidth: mine ? '85%' : '82%', gap: 8 }}><View style={{ backgroundColor: mine ? c.primary : c.panel, borderWidth: mine ? 0 : 1, borderColor: c.subtle, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, borderBottomRightRadius: mine ? 3 : 24, borderTopLeftRadius: mine ? 24 : 3, gap: 10 }}>
      {!!clean && <Text size={13} color={mine ? '#fff' : c.ink}>{clean}</Text>}
      {images.map(link => <Pressable key={link.url} accessibilityRole="button" accessibilityLabel="Open reference image" onPress={() => onOpenLink?.(link.url)}><Image source={{ uri: link.url }} style={{ width: 200, maxWidth: '100%', height: 150, borderRadius: 16 }} resizeMode="cover" /></Pressable>)}
      {links.filter(link => !link.image).map(link => <Pressable key={link.url} accessibilityRole="link" onPress={() => onOpenLink?.(link.url)}><Text size={12} color={mine ? '#fff' : c.chip}>{link.url}</Text></Pressable>)}
    </View>{children}</View>
  </View>;
}
function SidebarToggle({ color }: { color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}><Rect x={3} y={4} width={18} height={16} rx={3}/><Path d="M9 4v16"/></Svg>;
}
function WaveIcon() {
  return <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center', height: 18 }}>{[7, 13, 18, 11, 6].map((height, i) => <View key={i} style={{ width: 2.5, height, borderRadius: 2, backgroundColor: '#fff' }} />)}</View>;
}
export function AuraChatView({ messages, user, vendor, text, onChangeText, onSend, busy, loading, error, onRetry, onNew, onHistory, onOpenLink, onVoiceMessage, onVoiceController, navigation, attachment, onAttach, onRemoveAttachment, eventTitle, activeEventId, onSwitchEvent, onOpenEvent, hasQuestion, children }: React.PropsWithChildren<{
  messages: Data[]; user: Data | null; vendor: boolean; text: string; onChangeText: (v: string) => void;
  onSend: (v?: string) => void; busy: boolean; loading: boolean; error: string;
  onRetry: () => void; onNew: () => void; onHistory: () => void; onOpenLink: (url: string) => void; onVoiceMessage: (text: string, body?: Data) => Promise<string>; onVoiceController?: (submit: AuraVoiceSubmit | null) => void; navigation: any;
  attachment?: Data | null; onAttach: () => void; onRemoveAttachment: () => void; eventTitle?: string; activeEventId?: string; onSwitchEvent?: (event: Data) => void; onOpenEvent: () => void; hasQuestion: boolean;
}>) {
  const c = useAuraPalette();
  const scroll = useRef<ScrollView>(null), input = useRef<TextInput>(null), nearBottom = useRef(true);
  const [sheet, setSheet] = useState<'menu' | 'voice' | 'dictate' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false), [pickingEvent, setPickingEvent] = useState(false);
  const [focused, setFocused] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  useEffect(() => { if (messages.length || eventTitle) setVoiceExpanded(false); }, [messages.length, eventTitle]);
  useFocusEffect(useCallback(() => () => setSheet(null), []));
  const firstName = user?.fullName?.split(' ')[0] || '';
  function go(screen: string, params?: Data) { setMenuOpen(false); setSheet(null); navigation.navigate(screen, params); }
  function focusInput() { setSheet(null); setTimeout(() => input.current?.focus(), 100); }
  const unavailable = busy || loading;
  // Keep voice inside the dashboard so its shared bottom navigation remains
  // visible. Losing focus unmounts the recorder/player and cancels the session.
  if (sheet === 'dictate') return <AuraVoice mode="dictate" onTranscription={value => { onChangeText([text.trim(), value].filter(Boolean).join(' ')); focusInput(); }} onUtterance={onVoiceMessage} onClose={() => setSheet(null)} onKeyboard={focusInput} />;
  function newChat() { setMenuOpen(false); setSheet(null); onNew(); }
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
    <StatusBar barStyle={c.dark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.subtle }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Aura sidebar" accessibilityState={{ expanded: menuOpen }} onPress={() => { setPickingEvent(false); setMenuOpen(true); }} style={{ minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center' }}><SidebarToggle color={c.ink} /></Pressable>
        <AuraMark size={28} />
        <Pressable accessibilityRole={eventTitle ? 'button' : undefined} disabled={!eventTitle} onPress={onOpenEvent} style={{ flex: 1 }}><Text bold size={14}>{eventTitle || 'Aura+'}</Text><Text size={10} color={c.muted}>{vendor ? 'Your business assistant' : 'Your event assistant'}</Text></Pressable>
      </View>
      <View style={{ width: '100%', maxWidth: 768, alignSelf: 'center', flex: 1 }}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, paddingVertical: 20, gap: 16, flexGrow: 1 }} onScroll={e => { const v = e.nativeEvent; nearBottom.current = v.contentSize.height - v.contentOffset.y - v.layoutMeasurement.height < 160; }} scrollEventThrottle={100} onContentSizeChange={() => { if (messages.length && nearBottom.current) scroll.current?.scrollToEnd({ animated: true }); }} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRetry} tintColor={c.primary} />}>
          <Bubble content={`Hi${firstName ? ` ${firstName}` : ''}! 👋 What are you ${vendor ? 'working on' : 'planning'}? Tell me in your own words. I'll figure out the rest.`} />
          {loading && <ActivityIndicator accessibilityLabel="Loading Aura conversation" color={c.primary} />}
          {messages.map((m, i) => {
            const content = m.content || m.text || m.body;
            if (!content) return null;
            return <Bubble key={m.id || m._id || i} mine={m.role === 'user'} content={typeof content === 'string' ? content : 'Your conversation has been updated.'} onOpenLink={onOpenLink}>
              {vendor && m.role !== 'user' && (m.actions || []).map((action: Data, index: number) => action.target && <AuraRow key={index} title={action.label || 'Open workspace'} onPress={() => navigation.navigate(action.target.screen, action.target.params)} />)}
            </Bubble>;
          })}
          {busy && <View accessibilityRole="progressbar" accessibilityLabel="Aura is responding" style={{ marginLeft: 42, flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={c.primary} size="small" /><Text size={11} color={c.muted}>Aura is thinking…</Text></View>}
          {!!error && <View accessibilityRole="alert" style={{ marginLeft: 42, gap: 8 }}><Text size={12} color={c.danger}>{error}</Text><Pressable accessibilityRole="button" onPress={onRetry}><Text bold size={12} color={c.chip}>Try again</Text></Pressable></View>}
          {!messages.length && !loading && !hasQuestion && sheet !== 'voice' && <View style={{ marginLeft: 42, gap: 8 }}>{(vendor ? ['Help me with my business setup', 'Review my upcoming bookings', 'Help me draft a customer proposal'] : prompts).map(title => <AuraRow key={title} title={title} disabled={unavailable} onPress={() => { onSend(title); }} />)}</View>}
          <View style={{ marginLeft: 42, gap: 14 }}>{children}</View>
        </ScrollView>
        <View style={{ padding: 12, gap: 8 }}>
          {sheet === 'voice' && <AuraVoice compact dense={focused} expanded={voiceExpanded} onExpand={() => setVoiceExpanded(value => !value)} onController={onVoiceController} onUtterance={onVoiceMessage} onClose={() => setSheet(null)} onKeyboard={focusInput} />}
          {!!attachment && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.soft, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 8 }}>{attachment.url && <Image source={{ uri: attachment.url }} style={{ width: 32, height: 32, borderRadius: 8 }} />}<View style={{ flex: 1 }}><Text size={11}>Attached Reference Media</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={onRemoveAttachment} style={styles.iconButton}><Icon name="close" size={18} color={c.danger} /></Pressable></View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: c.panel, borderWidth: 1, borderColor: focused ? c.chipLine : c.line, borderRadius: 28, padding: 5, paddingLeft: 6, boxShadow: c.dark ? undefined : '0px 4px 16px rgba(90,75,209,0.06)' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Attach reference image or video" accessibilityState={{ disabled: unavailable }} disabled={unavailable} onPress={onAttach} style={[styles.iconButton, { opacity: unavailable ? .4 : 1 }]}><Icon name="image-outline" color={c.muted} size={18} /></Pressable>
            <TextInput ref={input} accessibilityLabel="Message Aura" placeholder="Ask Aura+ anything" placeholderTextColor={c.muted} value={text} onChangeText={onChangeText} multiline maxLength={2000} editable={!unavailable} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ flex: 1, minWidth: 0, minHeight: 36, maxHeight: 104, color: c.ink, fontFamily: 'Inter_400Regular', fontSize: 14, paddingHorizontal: 5, paddingVertical: 8 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={sheet === 'voice' ? 'Switch to typing' : 'Dictate a message'} accessibilityState={{ disabled: unavailable }} disabled={unavailable} onPress={() => { if (sheet === 'voice') focusInput(); else setSheet('dictate'); }} style={[styles.iconButton, { opacity: unavailable ? .4 : 1 }]}><Icon name="mic-outline" color={c.muted} size={19} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={text.trim() || attachment ? 'Send to Aura' : 'Talk to Aura'} accessibilityState={{ disabled: unavailable, busy }} disabled={unavailable} onPress={() => { nearBottom.current = true; if (text.trim() || attachment) { Keyboard.dismiss(); onSend(); } else { setVoiceExpanded(!messages.length && !eventTitle); setSheet('voice'); } }} style={[styles.iconButton, { backgroundColor: c.primary, opacity: unavailable ? .45 : 1 }]}>{text.trim() || attachment ? <Icon name="paper-plane" color="#fff" size={16} /> : <WaveIcon />}</Pressable>
          </View>
          <View style={{ alignItems: 'center' }}><Text size={10} color={c.muted}>You decide — Aura+ never books or pays without you.</Text></View>
        </View>
      </View>
    </KeyboardAvoidingView>
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><View style={{ flex: 1, backgroundColor: '#0008', flexDirection: 'row' }}><Pressable accessibilityRole="button" accessibilityLabel="Close Aura menu" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} /><SafeAreaView edges={['top', 'bottom']} style={{ width: '86%', maxWidth: 320, height: '100%', padding: 16, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.bg }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
      {pickingEvent && !vendor ? <AuraEventPicker activeId={activeEventId} busy={unavailable} onBack={() => setPickingEvent(false)} onSelect={event => { setMenuOpen(false); onSwitchEvent?.(event); }} /> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text size={18} bold>Aura+</Text><Pressable accessibilityRole="button" accessibilityLabel="Close Aura sidebar" onPress={() => setMenuOpen(false)} style={styles.iconButton}><SidebarToggle color={c.ink}/></Pressable></View>
        <AuraRow title="New chat" icon="create-outline" disabled={unavailable} onPress={newChat} />
        {!!eventTitle && <Text size={12} color={c.muted}>Planning: {eventTitle}</Text>}
        {!vendor && <AuraRow title="Switch event" icon="swap-horizontal-outline" disabled={unavailable} onPress={() => setPickingEvent(true)} />}
        <AuraRow title="Home" icon="home-outline" onPress={() => go('Main', { screen: 'Overview' })} />
        {!vendor && <AuraRow title="New event" icon="add-outline" onPress={() => go('NewEvent')} />}
        <AuraRow title="Past conversations" icon="chatbubbles-outline" onPress={() => { setMenuOpen(false); setSheet(null); onHistory(); }} />
        <AuraRow title="Your profile" icon="person-outline" onPress={() => go('Main', { screen: 'Me' })} />
        <AuraRow title="Close" onPress={() => setMenuOpen(false)} />
      </>}
    </ScrollView></SafeAreaView></View></Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ iconButton: { width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 } });


