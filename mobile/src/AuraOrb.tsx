import React, { useEffect, useId, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/** Native rendering of the purple/cyan glass orb used by web/VoiceAgent.jsx. */
export function AuraOrb({ level, thinking, size = 260 }: { level: number; thinking: boolean; size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const gradientId = useId().replace(/\W/g, '');
  useEffect(() => {
    let motion: Animated.CompositeAnimation | undefined, mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!mounted || reduced) return;
      spin.setValue(0);
      motion = Animated.loop(Animated.timing(spin, { toValue: 1, duration: thinking ? 2200 : 9000, useNativeDriver: Platform.OS !== 'web' }));
      motion.start();
    });
    return () => { mounted = false; motion?.stop(); };
  }, [thinking, spin]);
  useEffect(() => { const motion = Animated.timing(scale, { toValue: 1 + Math.min(1, Math.max(0, level)) * .18, duration: 150, useNativeDriver: Platform.OS !== 'web' }); motion.start(); return () => motion.stop(); }, [level, scale]);
  return <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center', transform: [{ scale: size / 260 }] }}>
    <Svg width={260} height={260} style={StyleSheet.absoluteFill}><Defs><RadialGradient id={`${gradientId}glow`}><Stop offset={0.0} stopColor="#7c5cf0" stopOpacity={0.55} /><Stop offset={0.6} stopColor="#38bdf8" stopOpacity={0.13} /><Stop offset={1.0} stopColor="#38bdf8" stopOpacity={0.0} /></RadialGradient></Defs><Circle cx={130} cy={130} r={130} fill={`url(#${gradientId}glow)`} /></Svg>
    <Animated.View style={{ width: 202, height: 202, borderRadius: 101, overflow: 'hidden', backgroundColor: '#7b5cf0', transform: [{ scale }], boxShadow: '0px 20px 50px rgba(91,63,214,0.5)' }}>
      <Animated.View style={{ width: 260, height: 260, position: 'absolute', left: -29, top: -29, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}><Svg width={260} height={260}><Defs>
        <RadialGradient id={`${gradientId}cyan`}><Stop offset={0.0} stopColor="#22d3ee" /><Stop offset={1.0} stopColor="#22d3ee" stopOpacity={0.0} /></RadialGradient>
        <RadialGradient id={`${gradientId}pink`}><Stop offset={0.0} stopColor="#f0abfc" /><Stop offset={1.0} stopColor="#f0abfc" stopOpacity={0.0} /></RadialGradient>
        <RadialGradient id={`${gradientId}deep`}><Stop offset={0.0} stopColor="#6366f1" /><Stop offset={1.0} stopColor="#6366f1" stopOpacity={0.0} /></RadialGradient>
      </Defs><Ellipse cx={75} cy={95} rx={105} ry={125} fill={`url(#${gradientId}cyan)`} /><Ellipse cx={190} cy={95} rx={110} ry={95} fill={`url(#${gradientId}pink)`} /><Ellipse cx={150} cy={220} rx={130} ry={110} fill={`url(#${gradientId}deep)`} /></Svg></Animated.View>
      <Svg width={202} height={202} style={StyleSheet.absoluteFill}><Defs><RadialGradient id={`${gradientId}shine`} cx="32%" cy="28%" r="65%"><Stop offset={0.0} stopColor="#fff" stopOpacity={0.75} /><Stop offset={0.6} stopColor="#fff" stopOpacity={0.0} /></RadialGradient></Defs><Circle cx={101} cy={101} r={101} fill={`url(#${gradientId}shine)`} /></Svg>
    </Animated.View>
  </View></View>;
}
