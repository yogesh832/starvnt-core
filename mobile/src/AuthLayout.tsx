import React from 'react';
import { ImageBackground, KeyboardAvoidingView, Platform, Pressable, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoWord } from './BrandLogo';
import { AuthGradient, AuthText } from './AuthUI';
import { Icon } from './ui';
import { KeyboardScrollView } from './KeyboardScrollView';
export function AuthLayout({ children, navigation, vendor, register, admin, verify = false, phone = false, onBack }: React.PropsWithChildren<{
    navigation: any;
    vendor: boolean;
    register: boolean;
    admin: boolean;
    verify?: boolean;
    phone?: boolean;
    onBack?: () => void;
}>) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: '#080f1f' }}>
    <StatusBar barStyle="light-content" backgroundColor="#080f1f"/>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', flexGrow: 1, paddingBottom: 28 }}>
          <ImageBackground source={verify && phone ? require('../assets/auth/concert.png') : require('../assets/auth/banquet.png')} style={{ height: verify ? 350 : register ? 270 : 350 }}>
            <AuthGradient vertical colors={['#080f1f55', '#080f1f44', '#080f1f']}/>
            <View style={{ flex: 1, paddingHorizontal: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={verify ? 'Change sign-in details' : 'Back to homepage'} onPress={onBack || (() => navigation.navigate('Landing'))} hitSlop={12} style={{ padding: 4, marginRight: 12 }}><Icon name="chevron-back" color="#fff" size={23}/></Pressable>
                <View style={verify || register ? { flex: 1, alignItems: 'center', marginRight: 39 } : undefined}><LogoWord light sub={admin ? 'STARVNT CORE' : vendor ? 'VENDOR OS' : 'EVENTS. SIMPLIFIED.'}/></View>
              </View>
              {!verify && <View style={{ marginTop: 'auto', paddingBottom: 30, gap: 10 }}>
                <AuthText size={register ? 25 : 31} bold>{admin ? 'Welcome to STARVNT Core.' : register ? vendor ? 'Create your Vendor account' : 'Create your account' : 'Welcome back.'}</AuthText>
                <AuthText size={16} color="#e2e8f0">{admin ? 'Manage your team and operations in one place.' : register ? vendor ? 'Join as a verified vendor and get instant leads, bookings and payouts.' : 'Plan your next event with trusted vendors and protected bookings.' : 'Sign in to access your events, verified vendors and 100% escrow-protected bookings.'}</AuthText>
              </View>}
            </View>
          </ImageBackground>
          <View style={{ paddingHorizontal: 24, gap: 22 }}>{children}</View>
          {!register && !verify && <View style={{ marginTop: 'auto', paddingTop: 52, flexDirection: 'row', gap: 7, justifyContent: 'center' }}><Icon name="shield-outline" size={16} color="#91a4c4"/><AuthText size={11} color="#91a4c4">Protected by Core Escrow</AuthText></View>}
        </View>
      </KeyboardScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
