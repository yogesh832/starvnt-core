import React, { useCallback, useState } from "react";
import { useFocusEffect } from '@react-navigation/native';
import { Platform, View } from "react-native";
import { useSession } from "../auth/Session";
import { AuthLayout } from "../AuthLayout";
import { external } from "../api/runtime";
import {
  Button,
  Choice,
  ErrorNotice,
  Field,
  Pill,
  Txt,
  useAction,
} from "../ui";

export function AuthScreen({ route, navigation }: any) {
  const { signIn, setActiveDomain, activeDomain } = useSession();
  const isAdmin = activeDomain === "admin";
  const [accountType, setAccountType] = useState(
    route.params?.accountType || "CUSTOMER",
  );
  const [mode, setMode] = useState(route.params?.mode || "login");
  const [method, setMethod] = useState("email");
  const [phase, setPhase] = useState("identity");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    city: "",
    email: "",
    phone: "",
    password: "",
    otp: "",
    mfaToken: "",
  });
  const action = useAction();
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
    setForm((v) => ({ ...v, otp: "", password: "" }));
  }
  async function submit() {
    const payload = {
      ...form,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
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
        await external.call("/auth/otp/send", "POST", { phone: payload.phone });
      } else {
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
                accountType,
              }
            : {}),
        });
        setNeedsPassword(!!result.requiresPasswordSetup || mode === "reset");
      }
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
    if (!form.password) throw new Error("Enter your password.");
    await signIn(
      "external",
      needsPassword
        ? "password/set"
        : mode === "register"
          ? "register"
          : "login",
      payload,
    );
  }
  async function google() {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId)
      throw new Error(
        "Google sign-in is not available yet. Please continue with email or phone.",
      );
    const { GoogleSignin, isSuccessResponse } =
      await import("@react-native-google-signin/google-signin");
    GoogleSignin.configure({
      webClientId,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return;
    if (!response.data.idToken)
      throw new Error("Google did not return a sign-in credential.");
    await signIn("external", "google", {
      credential: response.data.idToken,
      accountType,
      mode,
      businessName: form.businessName,
      city: form.city,
    });
  }
  return (
    <AuthLayout
      navigation={navigation}
      vendor={!isAdmin && accountType === "VENDOR"}
      register={!isAdmin && mode === "register"}
      admin={isAdmin}
    >
      <View style={{ gap: 10, marginTop: 6, marginBottom: 6 }}>
        <Pill>
          {isAdmin ? "CORE · INTERNAL ACCESS" : "EVENTS. SIMPLIFIED."}
        </Pill>
        <Txt bold size={30}>
          {isAdmin
            ? "Sign in to STARVNT Core"
            : mode === "register"
              ? "Create an Account"
              : "Sign in to STARVNT"}
        </Txt>
        <Txt muted>
          {isAdmin
            ? "Sign in with your admin credentials and authenticator."
            : accountType === "VENDOR"
              ? "Operating as Verified Vendor / Brand"
              : "Plan and manage your events"}
        </Txt>
      </View>
      {!isAdmin && phase === "identity" && (
        <>
          <Choice
            label="Your workspace"
            variant="navy"
            value={accountType}
            values={["CUSTOMER", "VENDOR"]}
            onChange={setAccountType}
          />
          <Choice
            label="Continue with"
            variant="tabs"
            value={method}
            values={["email", "phone"]}
            onChange={(v) => {
              setMethod(v);
              reset();
            }}
          />
          <Choice
            label="Account"
            value={mode}
            values={["login", "register"]}
            onChange={(v) => {
              setMode(v);
              reset();
            }}
          />
        </>
      )}
      <View style={{ gap: 16 }}>
        {!isAdmin && (
          <Pill>
            {phase === "identity"
              ? "01 · YOUR DETAILS"
              : phase === "verify"
                ? "02 · VERIFY IT’S YOU"
                : "03 · PASSWORD"}
          </Pill>
        )}
        {!isAdmin && phase === "identity" && mode === "register" && (
          <>
            <Field
              label="Your full name"
              {...field("fullName")}
              autoComplete="name"
            />
            {accountType === "VENDOR" && (
              <>
                <Field label="Business name" {...field("businessName")} />
                <Field label="City" {...field("city")} />
              </>
            )}
          </>
        )}
        {(isAdmin || phase === "identity") &&
          (method === "email" || isAdmin ? (
            <Field
              label="Email address"
              {...field("email")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          ) : (
            <Field
              label="Phone number"
              {...field("phone")}
              placeholder="+919876543210"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          ))}
        {!isAdmin && phase === "verify" && (
          <>
            <Txt muted>
              We sent a code to {method === "phone" ? form.phone : form.email}.
            </Txt>
            <Field
              label="Verification code"
              {...field("otp")}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={8}
            />
            <Button
              title="Change details or resend code"
              secondary
              onPress={reset}
            />
          </>
        )}
        {(isAdmin || phase === "password") && (
          <>
            <Field
              label={
                needsPassword || mode === "register"
                  ? "Create a strong password"
                  : "Password"
              }
              {...field("password")}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoComplete={
                needsPassword || mode === "register"
                  ? "new-password"
                  : "current-password"
              }
            />
            <Button
              title={visible ? "Hide password" : "Show password"}
              secondary
              onPress={() => setVisible((v) => !v)}
            />
            {(needsPassword || mode === "register") && (
              <Txt muted size={12}>
                Use at least 8 characters, with uppercase, lowercase, a number,
                and a symbol.
              </Txt>
            )}
          </>
        )}
        {isAdmin && (
          <Field
            label="Authenticator code (if enabled)"
            {...field("mfaToken")}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
          />
        )}
        <ErrorNotice message={action.error} />
        <Button
          variant={method === "email" || isAdmin ? "navy" : "primary"}
          title={
            isAdmin || phase === "password"
              ? "Enter your workspace"
              : phase === "verify"
                ? "Verify & continue"
                : "Send verification code"
          }
          busy={action.busy}
          onPress={() => {
            void action.run(submit);
          }}
        />
        {!isAdmin && method === "email" && mode !== "register" && (
          <Button
            title="Reset or set a password"
            secondary
            onPress={() => {
              setMode("reset");
              reset();
            }}
          />
        )}
      </View>
      {!isAdmin && phase === "identity" && (
        <Button
          title="Continue with Google"
          secondary
          busy={action.busy}
          onPress={() => {
            void action.run(google);
          }}
        />
      )}
      <Button
        title={isAdmin ? "Customer or vendor sign in" : "Internal team sign in"}
        secondary
        onPress={() => setActiveDomain(isAdmin ? "external" : "admin")}
      />
      {__DEV__ && (<Button
        title="⚡ Quick Test Auth (Skip Login)"
        secondary
        onPress={() => navigation.navigate("TestAuth")}
      />)}
    </AuthLayout>
  );
}
