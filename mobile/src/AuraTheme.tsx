import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import type { TextProps } from 'react-native';
import { usePalette } from './Theme';

/** Colors from web/theme.css and customer/AuraChat.jsx. */
export function useAuraPalette() {
  const c = usePalette();
  return {
    dark: c.dark, bg: c.dark ? c.panel : '#ffffff', panel: c.dark ? c.card : '#ffffff',
    soft: c.dark ? c.elevated : '#f4f5fb', line: c.dark ? c.lineStrong : '#e5e7eb',
    subtle: c.dark ? c.line : '#f3f4f6', ink: c.dark ? c.ink : '#141a3c',
    muted: c.dark ? c.muted : '#6b7194', primary: c.dark ? c.action : '#5a4bd1',
    chip: c.dark ? c.accent : '#5a4bd1', chipLine: c.dark ? c.lineStrong : '#d6d2f4',
    danger: c.dark ? c.danger : '#dc2626', success: c.dark ? c.success : '#059669',
    amber: c.dark ? '#fcd34d' : '#b45309', amberBg: c.dark ? '#241c0b' : '#fffbeb',
  };
}
export function AuraText({ children, size = 13, bold = false, color, style }: React.PropsWithChildren<{ size?: number; bold?: boolean; color?: string; style?: TextProps['style'] }>) {
  const c = useAuraPalette();
  return <Text style={[{ color: color || c.ink, fontSize: size, lineHeight: size * 1.5, fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular' }, style]}>{children}</Text>;
}
export function AuraButton({ title, onPress, busy = false, disabled = false, secondary = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean }) {
  const c = useAuraPalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy || disabled, busy }} disabled={busy || disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: secondary ? 1 : 0, borderColor: c.line, backgroundColor: secondary ? c.panel : c.primary, justifyContent: 'center', alignItems: 'center', opacity: busy || disabled ? .45 : pressed ? .7 : 1 })}>{busy ? <ActivityIndicator color={secondary ? c.primary : '#fff'} /> : <AuraText bold size={12} color={secondary ? c.ink : '#fff'}>{title}</AuraText>}</Pressable>;
}
export function AuraField({ label, ...props }: TextInputProps & { label: string }) {
  const c = useAuraPalette();
  return <View style={{ gap: 6 }}><AuraText size={11} color={c.muted}>{label}</AuraText><TextInput {...props} accessibilityLabel={label} placeholderTextColor={c.muted} style={{ color: c.ink, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, minHeight: 44, fontSize: 14, fontFamily: 'Inter_400Regular' }} /></View>;
}
