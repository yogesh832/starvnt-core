import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Platform, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Path, Stop } from 'react-native-svg';

/** Native counterpart of web/AuraMark; bundled artwork also works offline. */
export function AuraMark({ size = 24, variant = 'compact', motion = false }: { size?: number; variant?: 'compact' | 'orb'; motion?: boolean }) {
  const turn = useRef(new Animated.Value(0)).current, phase = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true), [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    if (!motion || variant !== 'orb') return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    const app = AppState.addEventListener('change',state=>setActive(state === 'active'));
    return () => { mounted=false; preference.remove(); app.remove(); };
  }, [motion,variant]);
  useEffect(() => {
    if (!motion || variant !== 'orb' || reduced || !active) return;
    const useNativeDriver = Platform.OS !== 'web';
    const animation = Animated.parallel([
      Animated.loop(Animated.timing(turn,{toValue:1,duration:14000,easing:Easing.linear,useNativeDriver,isInteraction:false})),
      Animated.loop(Animated.timing(phase,{toValue:1,duration:5000,easing:Easing.linear,useNativeDriver,isInteraction:false})),
    ]);
    animation.start();
    return () => { animation.stop(); turn.setValue(0); phase.setValue(0); };
  }, [motion,variant,reduced,active,turn,phase]);
  const key = useId().replace(/\W/g, '');
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
    {variant === 'orb' ? <Image source={size > 64 ? require('../assets/brand/aura-orb-384.png') : require('../assets/brand/aura-orb-96.png')} style={{ width: size, height: size }} resizeMode="contain" /> :
      <Svg width={size} height={size} viewBox="0 0 40 40"><Defs>
        <LinearGradient id={`${key}edge`} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset={0} stopColor="#54edff"/><Stop offset={0.43} stopColor="#6d46ff"/><Stop offset={1} stopColor="#e392ff"/></LinearGradient>
        <RadialGradient id={`${key}glass`} cx="34%" cy="25%" r="83%"><Stop offset={0} stopColor="#fff"/><Stop offset={0.26} stopColor="#e6f6ff"/><Stop offset={0.52} stopColor="#cbb6ff"/><Stop offset={0.76} stopColor="#a368ff"/><Stop offset={1} stopColor="#5736e8"/></RadialGradient>
      </Defs>
      <Path d="M20 2C23 14 26 17 38 20C26 23 23 26 20 38C17 26 14 23 2 20C14 17 17 14 20 2Z" fill={`url(#${key}edge)`}/>
      <Path d="M20 5C22.7 15 25 17.3 35 20C25 22.7 22.7 25 20 35C17.3 25 15 22.7 5 20C15 17.3 17.3 15 20 5Z" fill={`url(#${key}glass)`} stroke="#eef1ff" strokeOpacity={0.8} strokeWidth={0.7}/>
      <Path d="M20 6L21.3 18.7L34 20L21.3 21.3L20 34L18.7 21.3L6 20L18.7 18.7L20 6Z" fill="#fff" fillOpacity={0.7}/></Svg>}
    {variant === 'orb' && motion && <>
      <Animated.View style={{position:'absolute',width:size,height:size,alignItems:'center',justifyContent:'center',transform:[{rotate:turn.interpolate({inputRange:[0,1],outputRange:['-25deg','335deg']})}]}}>
        <View style={{width:size*.94,height:size*.36,borderRadius:size,borderWidth:1.3,borderTopColor:'#64edff',borderLeftColor:'#ad87ff',borderRightColor:'#f8a6ff',borderBottomColor:'transparent'}} />
      </Animated.View>
      {[0,1,2].map(star=><Animated.View key={star} style={{position:'absolute',left:size*[.01,.73,.84][star],top:size*[.36,0,.7][star],opacity:phase.interpolate({inputRange:[0,.33,.66,1],outputRange:star===0?[.5,1,.65,.5]:star===1?[1,.5,.75,1]:[.65,.5,1,.65]}),transform:[{scale:phase.interpolate({inputRange:[0,.5,1],outputRange:[.85,1.2,.85]})}]}}>
        <Svg width={size*.14} height={size*.14} viewBox="0 0 40 40"><Path d="M20 2C23 14 26 17 38 20C26 23 23 26 20 38C17 26 14 23 2 20C14 17 17 14 20 2Z" fill={star===1?'#9fefff':'#d6b1ff'}/></Svg>
      </Animated.View>)}
    </>}
  </View>;
}
