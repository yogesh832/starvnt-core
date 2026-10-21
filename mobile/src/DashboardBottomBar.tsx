import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackActions } from '@react-navigation/native';
import { AuraMark } from './AuraMark';
import { dashboardSelection, dashboardTabs, NavState } from './dashboardNavigation';
import { Icon, Txt, usePalette } from './ui';

export function DashboardBottomBar({ workspace, state, navigation }: { workspace: 'customer' | 'vendor' | 'admin'; state?: NavState; navigation: any }) {
  const c = usePalette();
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const selected = dashboardSelection(workspace, state);
  return <SafeAreaView edges={Platform.OS === 'android' && keyboardOpen ? ['left', 'right'] : ['bottom', 'left', 'right']} style={{ backgroundColor: c.card, borderTopWidth: 1, borderColor: c.line }}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', minHeight: 60 }}>
      {dashboardTabs(workspace).map(tab => {
        const active = selected === tab.name, color = active ? c.accent : c.muted;
        return <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.title} accessibilityState={{ selected: active }} onPress={() => {
          if (!navigation.isReady()) return;
          const root = navigation.getRootState();
          if (root.routes[root.index].name === 'Main') navigation.navigate('Main', { screen: tab.name });
          else navigation.dispatch({ ...StackActions.popTo('Main', { screen: tab.name }), target: root.key });
        }} style={({ pressed }) => ({ flex: 1, minHeight: 60, paddingVertical: 7, gap: 3, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .6 : 1 })}>
          {tab.name === 'AuraTab' ? <View style={{ marginTop: -24, marginBottom: -6 }}><AuraMark variant="orb" size={60} /></View> : <Icon name={active ? (tab.activeIcon || tab.icon) : tab.icon} size={23} color={color} />}
          <Txt size={10} bold={active || tab.name === 'AuraTab'} style={{ color: tab.name === 'AuraTab' ? c.accent : color }}>{tab.title}</Txt>
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
}
