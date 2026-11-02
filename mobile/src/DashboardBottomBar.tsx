import React, { useEffect, useState } from 'react';
import { AppState, Keyboard, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackActions } from '@react-navigation/native';
import { AuraMark } from './AuraMark';
import { dashboardSelection, dashboardTabs, NavState } from './dashboardNavigation';
import { Icon, Txt, usePalette } from './ui';
import { external } from './api/runtime';
import { usePush } from './Push';
import { notifications } from './pushRuntime';

export function DashboardBottomBar({ workspace, state, navigation }: { workspace: 'customer' | 'vendor' | 'admin'; state?: NavState; navigation: any }) {
  const c = usePalette();
  const push = usePush();
  const [unreadCount, setUnreadCount] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  useEffect(() => {
    let mounted = true;
    let loading = false;
    const refreshUnread = async () => {
      if (workspace === 'admin' || loading) return;
      loading = true;
      try {
        const result = workspace === 'vendor'
          ? await external.call('/vendor/badge-counts')
          : await external.call('/customer/notifications');
        const count = workspace === 'vendor'
          ? Math.max(Number(result.unreadNotificationsCount) || 0, Number(result.messagesCount) || 0)
          : Number(result.unread) || 0;
        if (mounted) {
          setUnreadCount(count);
          await notifications()?.setBadgeCountAsync(count).catch(() => {});
        }
      } catch {
        // Keep the last known count while the device is offline.
      } finally {
        loading = false;
      }
    };
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), 30000);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshUnread();
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      appState.remove();
    };
  }, [workspace, push.revision, state]);
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
          {tab.name === 'AuraTab' ? <View style={{ marginTop: -24, marginBottom: -6 }}><AuraMark variant="orb" motion size={60} /></View> : <View style={{ position: 'relative' }}><Icon name={active ? (tab.activeIcon || tab.icon) : tab.icon} size={23} color={color} />{tab.name === 'Updates' && unreadCount > 0 && <View accessibilityLabel={`${unreadCount} unread updates`} style={{ position: 'absolute', top: -7, right: -12, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center' }}><Txt size={9} bold style={{ color: '#fff', lineHeight: 13 }}>{unreadCount > 99 ? '99+' : unreadCount}</Txt></View>}</View>}
          <Txt size={10} bold={active || tab.name === 'AuraTab'} style={{ color: tab.name === 'AuraTab' ? c.accent : color }}>{tab.title}</Txt>
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
}
