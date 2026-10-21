import { VendorCategoryPicker } from "../VendorCategoryPicker";
import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from '@react-navigation/native';
import { Modal, Platform, Pressable, TurboModuleRegistry, View } from "react-native";
import Constants from 'expo-constants';
import { useSession } from "../auth/Session";
import { AuthLayout } from "../AuthLayout";
import { external } from "../api/runtime";
import { TEST_AUTH_ENABLED } from "../testAuth";
import { useAction } from "../ui";
import { AuthButton, AuthCode, AuthField, AuthLink, AuthTabs, AuthText } from '../AuthUI';
export function AuthScreen({ route, navigation }: any) {
    const { signIn, setActiveDomain, activeDomain } = useSession();
    const isAdmin = activeDomain === "admin";
    const [accountType, setAccountType] = useState(route.params?.accountType || "CUSTOMER");
    const [mode, setMode] = useState(route.params?.mode || "login");
    const [method, setMethod] = useState("email");
    const [phase, setPhase] = useState("identity");
    const [needsPassword, setNeedsPassword] = useState(false);
    const [visible, setVisible] = useState(false);
    const [form, setForm] = useState({
        fullName: "",
        businessName: "",
        city: "",
        category: "",
        email: "",
        phone: "",
        password: "",
        otp: "",
        mfaToken: "",
    });
    const action = useAction();
    const [resendAt, setResendAt] = useState(0);
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const tick = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [resendAt]);
    useFocusEffect(useCallback(() => {
        setAccountType(route.params?.accountType || "CUSTOMER");
        setMode(activeDomain === 'admin' ? 'login' : route.params?.mode || "login");
        setPhase("identity");
        setNeedsPassword(false);
        setVisible(false);
        setForm((v) => ({ ...v, password: "", otp: "", mfaToken: "" }));
    }, [route.params?.accountType, route.params?.mode, activeDomain]));
    const field = (key: keyof typeof form) => ({
        value: form[key],
        onChangeText: (value: string) => setForm((v) => ({ ...v, [key]: value })),
    });
    function reset() {
        setPhase("identity");
        setNeedsPassword(false);
        setForm((v) => ({ ...v, otp: "", password: "" }));
    }
    async function submit() {
        const payload = {
            ...form,
            email: form.email.trim().toLowerCase(),
            phone: form.phone.replace(/[\s()-]/g, ''),
            accountType,
        };
        if (isAdmin) {
            await signIn("admin", "login", payload);
            return;
        }
        if (phase === "identity") {
            if (method === "phone") {
                if (!/^\+?[0-9]{10,15}$/.test(payload.phone))
                    throw new Error("Enter your phone number with country code.");
                await external.call("/auth/otp/send", "POST", { ...payload, mode });
            }
            else {
                if (!/^\S+@\S+\.\S+$/.test(payload.email))
                    throw new Error("Enter a valid email address.");
                const result = await external.call("/auth/otp/email/send", "POST", {
                    email: payload.email,
                    mode: mode === "register" ? "register" : "login",
                    ...(mode === "register"
                        ? {
                            fullName: payload.fullName,
                            businessName: payload.businessName,
                            city: payload.city,
                            category: payload.category,
                            accountType,
                        }
                        : {}),
                });
                setNeedsPassword(!!result.requiresPasswordSetup || mode === "reset");
            }
            setResendAt(Date.now() + 30000);
            setPhase("verify");
            return;
        }
        if (phase === "verify") {
            if (!/^\d{4,8}$/.test(form.otp))
                throw new Error("Enter the verification code.");
            if (method === "phone") {
                await signIn("external", "otp/verify", payload);
                return;
            }
            await external.call("/auth/otp/email/verify", "POST", {
                email: payload.email,
                otp: payload.otp,
            });
            setPhase("password");
            return;
        }
        if (!form.password)
            throw new Error("Enter your password.");
        await signIn("external", needsPassword
            ? "password/set"
            : mode === "register"
                ? "register"
                : "login", payload);
    }
    async function google() {
        // Check the host binary before importing the SDK: its module evaluates
        // getEnforcing('RNGoogleSignin') immediately, even with a dynamic import.
        if (Platform.OS === 'web') {
            throw new Error('Native Google sign-in requires the installed STARVNT app. Please continue with email or mobile OTP here.');
        }
        if (Constants.executionEnvironment === 'storeClient') {
            throw new Error('Google sign-in is not supported in Expo Go. Install the STARVNT development build to use Google, or continue with email or mobile OTP.');
        }
        if (!TurboModuleRegistry.get('RNGoogleSignin')) {
            throw new Error('This STARVNT build does not include Google sign-in. Rebuild and reinstall the native app, then try again. Email and mobile OTP are still available.');
        }
        if (Platform.OS === 'ios' && (!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || !process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME)) {
            throw new Error('Google sign-in for iOS is not configured yet. Please continue with email or phone.');
        }
        const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
        if (!webClientId)
            throw new Error("Google sign-in is not available yet. Please continue with email or phone.");
        const { GoogleSignin, isSuccessResponse } = await import("@react-native-google-signin/google-signin");
        GoogleSignin.configure({
            webClientId,
            iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        });
        if (Platform.OS === "android")
            await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response))
            return;
        if (!response.data.idToken)
            throw new Error("Google did not return a sign-in credential.");
        await signIn("external", "google", {
            credential: response.data.idToken,
            accountType,
            mode,
            businessName: form.businessName,
            city: form.city,
            category: form.category,
        });
    }
    const vendor = !isAdmin && accountType === 'VENDOR';
    const register = !isAdmin && mode === 'register';
    const verifying = !isAdmin && phase === 'verify';
    const working = action.busy;
    const run = (fn: () => Promise<void>) => { void action.run(fn); };
    const changeMode = () => { setMode(register ? 'login' : 'register'); reset(); };
    async function resend() {
        if (Date.now() < resendAt)
            return;
        if (method === 'phone')
            await external.call('/auth/otp/send', 'POST', { phone: form.phone.replace(/[\s()-]/g, '') });
        else
            await external.call('/auth/otp/email/send', 'POST', {
                email: form.email.trim().toLowerCase(), mode: register ? 'register' : 'login',
                ...(register ? { fullName: form.fullName, businessName: form.businessName, category: form.category, city: form.city, accountType } : {}),
            });
        setForm(v => ({ ...v, otp: '' }));
        setResendAt(Date.now() + 30000);
    }
    return <AuthLayout navigation={navigation} vendor={vendor} register={register} admin={isAdmin} verify={!isAdmin && phase !== 'identity'} phone={method === 'phone'} onBack={phase !== 'identity' ? reset : undefined}>
    {!isAdmin && phase === 'identity' && <>
      <AuthTabs value={accountType} disabled={working} onChange={v => { setAccountType(v); reset(); }} options={[
                { value: 'CUSTOMER', title: 'Customer', icon: 'person-outline' },
                { value: 'VENDOR', title: 'Vendor', icon: 'storefront-outline' },
            ]}/>
      {!register && <View style={{ gap: 3 }}><AuthText size={23} bold>Sign in to STARVNT</AuthText><AuthText color="#c5d3e9">Choose how you want to continue.</AuthText></View>}
      <AuthTabs value={method} disabled={working} onChange={v => { if (v === 'google')
            run(google);
        else {
            setMethod(v);
            reset();
        } }} options={[
                { value: 'email', title: 'Email', icon: 'mail-outline' },
                { value: 'phone', title: 'Mobile OTP', icon: 'phone-portrait-outline' },
                { value: 'google', title: 'Google', icon: 'logo-google' },
            ]}/>
    </>}
    {verifying && <View style={{ gap: 10 }}>
      <AuthText bold size={25}>{method === 'phone' ? 'Verify your mobile number' : 'Verify your email'}</AuthText>
      <AuthText size={16} color="#c5d3e9">We've sent a 6-digit code to</AuthText>
      <AuthText size={16}>{method === 'phone' ? form.phone : form.email}</AuthText>
    </View>}
    {!isAdmin && phase === 'password' && <View style={{ gap: 8 }}><AuthText bold size={25}>{needsPassword || register ? 'Set your password' : 'Welcome back'}</AuthText><AuthText color="#c5d3e9">{needsPassword || register ? 'Secure your account to continue.' : 'Enter your password to access your workspace.'}</AuthText></View>}
    <View style={{ gap: 15 }}>
      {register && phase === 'identity' && <>
        <AuthField label="Full name" icon="person-outline" placeholder="Aarav Mehta" {...field('fullName')} autoCapitalize="words" autoComplete="name" editable={!working}/>
        {vendor && <>
          <AuthField label="Brand name" icon="storefront-outline" placeholder="CineMade Studios" {...field('businessName')} autoCapitalize="words" editable={!working}/>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1.2 }}><VendorCategoryPicker label="Category" value={form.category} disabled={working} onChange={(category) => setForm(current => ({ ...current, category }))}/></View>
            <View style={{ flex: 1 }}><AuthField label="City" icon="location-outline" placeholder="e.g. Mumbai" {...field('city')} autoCapitalize="words" editable={!working}/></View>
          </View>
        </>}
      </>}
      {(isAdmin || phase === 'identity') && (isAdmin || method === 'email'
            ? <AuthField label="Email address" icon="mail-outline" placeholder="you@example.com" {...field('email')} keyboardType="email-address" autoComplete="email" editable={!working}/>
            : <AuthField label="Mobile number" icon="phone-portrait-outline" placeholder="+91 98765 43210" {...field('phone')} keyboardType="phone-pad" autoComplete="tel" editable={!working}/>)}
      {verifying && <>
        <AuthCode {...field('otp')}/>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 5 }}><AuthText color="#c5d3e9" size={12}>Didn't receive the code?</AuthText><AuthLink title={seconds ? `Resend in 00:${String(seconds).padStart(2, '0')}` : 'Resend code'} disabled={working || seconds > 0} onPress={() => run(resend)}/></View>
      </>}
      {(isAdmin || phase === 'password') && <>
        <AuthField label={needsPassword || register ? 'Create a strong password' : 'Password'} icon="lock-closed-outline" {...field('password')} secureTextEntry={!visible} autoComplete={needsPassword || register ? 'new-password' : 'current-password'} editable={!working}/>
        <AuthLink title={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(v => !v)}/>
        {(needsPassword || register) && <AuthText size={12} color="#a9bddb">Use at least 8 characters with uppercase, lowercase, a number and a symbol.</AuthText>}
      </>}
      {isAdmin && <AuthField label="Authenticator code (if enabled)" {...field('mfaToken')} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!working}/>}
      {!!action.error && <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 12, backgroundColor: '#401d32' }}><AuthText color="#ffb7ca">{action.error}</AuthText></View>}
      <View style={{ marginTop: verifying ? 28 : 0 }}><AuthButton title={isAdmin || phase === 'password' ? 'Enter your workspace' : verifying ? 'Verify & Continue' : method === 'email' ? 'Send OTP to Email  →' : 'Send OTP to Mobile  →'} busy={working} onPress={() => run(submit)}/></View>
      {verifying && <AuthLink title={method === 'phone' ? 'Change mobile number' : 'Change email address'} disabled={working} onPress={reset}/>}
      {!isAdmin && phase === 'password' && <AuthLink title="Reset or set a password" disabled={working} onPress={() => { setMode('reset'); reset(); }}/>}
    </View>
    {phase === 'identity' && <View style={{ gap: 2 }}>
      {!isAdmin && <AuthLink title={register ? 'Switch to sign in' : 'Create an account'} disabled={working} onPress={changeMode}/>}
      <AuthLink title={isAdmin ? 'Customer or vendor sign in' : 'Internal team sign in'} disabled={working} onPress={() => setActiveDomain(isAdmin ? 'external' : 'admin')}/>
      {TEST_AUTH_ENABLED && <AuthLink title="Dev · Quick Test Auth" onPress={() => navigation.navigate('TestAuth')}/>}
    </View>}

  </AuthLayout>;
}
