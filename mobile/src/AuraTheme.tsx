import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from './Theme';

/** Colors from web/theme.css and customer/AuraChat.jsx. */
export function useAuraPalette() {
  const { mode } = useTheme();
  const dark = mode === 'dark';
  return {
    dark, bg: dark ? '#161926' : '#ffffff', panel: dark ? '#1e2235' : '#ffffff',
    soft: dark ? '#222638' : '#f4f5fb', line: dark ? '#374151' : '#e5e7eb',
    subtle: dark ? '#262a3d' : '#f3f4f6', ink: dark ? '#f1f5f9' : '#141a3c',
    muted: dark ? '#94a3b8' : '#6b7194', primary: dark ? '#818cf8' : '#5a4bd1',
    chip: dark ? '#a5b4fc' : '#5a4bd1', chipLine: dark ? '#494e7d' : '#d6d2f4',
    danger: dark ? '#fda4af' : '#dc2626', success: dark ? '#6ee7b7' : '#059669',
    amber: dark ? '#fcd34d' : '#b45309', amberBg: dark ? '#332b22' : '#fffbeb',
  };
}
export function AuraText({ children, size = 13, bold = false, color }: React.PropsWithChildren<{ size?: number; bold?: boolean; color?: string }>) {
  const c = useAuraPalette();
  return <Text style={{ color: color || c.ink, fontSize: size, lineHeight: size * 1.5, fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular' }}>{children}</Text>;
}
export function AuraButton({ title, onPress, busy = false, disabled = false, secondary = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean }) {
  const c = useAuraPalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy || disabled, busy }} disabled={busy || disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: secondary ? 1 : 0, borderColor: c.line, backgroundColor: secondary ? c.panel : c.primary, justifyContent: 'center', alignItems: 'center', opacity: busy || disabled ? .45 : pressed ? .7 : 1 })}>{busy ? <ActivityIndicator color={secondary ? c.primary : '#fff'} /> : <AuraText bold size={12} color={secondary ? c.ink : '#fff'}>{title}</AuraText>}</Pressable>;
}
export function AuraField({ label, ...props }: TextInputProps & { label: string }) {
  const c = useAuraPalette();
  return <View style={{ gap: 6 }}><AuraText size={11} color={c.muted}>{label}</AuraText><TextInput {...props} accessibilityLabel={label} placeholderTextColor={c.muted} style={{ color: c.ink, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, minHeight: 44, fontSize: 14, fontFamily: 'Inter_400Regular' }} /></View>;
}
