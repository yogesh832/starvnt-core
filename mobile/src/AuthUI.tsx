import React, { useId, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Icon } from './ui';
import { usePalette } from './Theme';
export function AuthText({ children, size = 14, bold = false, color }: React.PropsWithChildren<{
    size?: number;
    bold?: boolean;
    color?: string;
}>) {
    const c = usePalette();
    const muted = ['#dce6f8', '#a9bddb', '#879bbd', '#c5d3e9', '#b9c5da', '#91a4c4', '#e2e8f0'];
    let themedColor = color || '#f7f8ff';
    if (c.dark) {
        const value = themedColor.toLowerCase();
        if (['#fff', '#ffffff', '#f7f8ff', '#e2ecff'].includes(value)) themedColor = c.ink;
        else if (muted.includes(value)) themedColor = c.muted;
        else if (value === '#61b5ff') themedColor = c.accent;
    }
    return <Text style={{ color: themedColor, fontSize: size, lineHeight: size * 1.5, fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular' }}>{children}</Text>;
}
export function AuthGradient({ vertical = false, colors }: {
    vertical?: boolean;
    colors?: string[];
}) {
    const c = usePalette();
    const stops = colors || (c.dark ? [c.action, c.action] : ['#3568ff', '#7425f5']);
    const id = `auth${useId().replace(/\W/g, '')}`;
    return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%"><Defs><LinearGradient id={id} x1="0%" y1="0%" x2={vertical ? '0%' : '100%'} y2={vertical ? '100%' : '0%'}>{stops.map((c, i) => <Stop key={i} offset={`${i * 100 / (stops.length - 1)}%`} stopColor={/^#[0-9a-f]{8}$/i.test(c) ? c.slice(0, 7) : c} stopOpacity={/^#[0-9a-f]{8}$/i.test(c) ? parseInt(c.slice(7), 16) / 255 : 1}/>)}</LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`}/></Svg></View>;
}
export function AuthButton({ title, onPress, busy = false }: {
    title: string;
    onPress: () => void;
    busy?: boolean;
}) {
    return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 54, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: busy || pressed ? .65 : 1 })}>
    <AuthGradient />{busy ? <ActivityIndicator color="#fff"/> : <AuthText bold>{title}</AuthText>}
  </Pressable>;
}
export function AuthLink({ title, onPress, disabled = false }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ paddingVertical: 9, alignItems: 'center', opacity: disabled ? .5 : 1 }}><AuthText color="#61b5ff" size={13}>{title}</AuthText></Pressable>;
}
export function AuthField({ label, icon, ...props }: TextInputProps & {
    label: string;
    icon?: string;
}) {
    const c = usePalette();
    const [focused, setFocused] = useState(false);
    return <View style={{ gap: 6 }}><AuthText size={13} color="#dce6f8">{label}</AuthText><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.dark ? c.input : '#131e33', borderWidth: 1, borderColor: c.dark ? focused ? c.accent : c.lineStrong : focused ? '#8960ff' : '#25324b' }}>
    {icon && <Icon name={icon} size={19} color={c.dark ? c.muted : "#a9bddb"}/>}<TextInput {...props} accessibilityLabel={label} autoCapitalize={props.autoCapitalize || 'none'} placeholderTextColor={c.dark ? c.muted : "#879bbd"} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ flex: 1, minHeight: 50, color: '#fff', fontSize: 15, fontFamily: 'Inter_400Regular', paddingVertical: 12 }}/>
  </View></View>;
}
export function AuthTabs({ value, options, onChange, disabled = false }: {
    value: string;
    options: {
        value: string;
        title: string;
        icon: string;
    }[];
    onChange: (v: string) => void;
    disabled?: boolean;
}) {
    const c = usePalette();
    return <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 3, borderRadius: 20, borderWidth: 1, borderColor: c.dark ? c.line : '#2a3651', backgroundColor: c.dark ? c.panel : '#101a2d', gap: 3 }}>{options.map(o => <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: value === o.value, disabled }} disabled={disabled} onPress={() => onChange(o.value)} style={{ flex: 1, minHeight: 46, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
    {value === o.value && <AuthGradient />}{o.value === 'google' ? <GoogleMark /> : <Icon name={o.icon} size={19} color="#e2ecff"/>}<AuthText size={12} bold={value === o.value}>{o.title}</AuthText>
  </Pressable>)}</View>;
}
function GoogleMark() {
    return <Svg width={20} height={20} viewBox="0 0 48 48" accessible={false}>
    <Path fill="#FFC107" d="M43.6 20H42V20H24v8h11.3A12 12 0 1 1 32.9 14l5.7-5.7A20 20 0 1 0 44 24c0-1.3-.1-2.7-.4-4Z"/>
    <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 32.9 14l5.7-5.7A20 20 0 0 0 6.3 14.7Z"/>
    <Path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.4-5.2l-6.2-5.2a12 12 0 0 1-18.5-5.5L6.1 33A20 20 0 0 0 24 44Z"/>
    <Path fill="#1976D2" d="M43.6 20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2A20 20 0 0 0 44 24c0-1.3-.1-2.7-.4-4Z"/>
  </Svg>;
}
export function AuthCode({ value, onChangeText }: {
    value: string;
    onChangeText: (v: string) => void;
}) {
    const input = useRef<TextInput>(null);
    const c = usePalette();
    const [focused, setFocused] = useState(false);
    return <Pressable onPress={() => input.current?.focus()} style={{ marginVertical: 22 }}>
    <View pointerEvents="none" style={{ flexDirection: 'row', gap: 6 }}>{Array.from({ length: 6 }, (_, i) => <View key={i} style={{ flex: 1, height: 62, borderRadius: 12, borderWidth: 1, borderColor: c.dark ? focused && i === Math.min(value.length, 5) ? c.accent : c.lineStrong : focused && i === Math.min(value.length, 5) ? '#a367ff' : '#25324b', backgroundColor: c.dark ? focused && i === Math.min(value.length, 5) ? c.soft : c.input : focused && i === Math.min(value.length, 5) ? '#28234c' : '#111c30', alignItems: 'center', justifyContent: 'center' }}><AuthText size={24}>{value[i] || (focused && i === value.length ? '│' : '')}</AuthText></View>)}</View>
    <TextInput ref={input} value={value} onChangeText={v => onChangeText(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} autoFocus accessibilityLabel="Six-digit verification code" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} caretHidden style={[StyleSheet.absoluteFill, { color: 'transparent', backgroundColor: 'transparent', opacity: .02 }]}/>
  </Pressable>;
}

