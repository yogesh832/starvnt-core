import React, { useId } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { LogoWord } from "./BrandLogo";
import { useTheme } from "./Theme";
import { Icon, Txt, usePalette } from "./ui";
import { useSession } from "./auth/Session";
import { TEST_AUTH_ENABLED } from "./testAuth";
import { KeyboardScrollView } from './KeyboardScrollView';

export function PublicGradient({ photo = false }: { photo?: boolean }) {
  const c = usePalette();
  const gradientId = `public${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const colors = photo
    ? ["rgba(14,19,48,.92)", "rgba(14,19,48,.45)", "rgba(14,19,48,.94)"]
    : c.dark
      ? ["#0e1330", "#141a3c", "#1a1d2e"]
      : ["#efeaff", "#f4f5fb", "#ffffff"];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            {colors.map((color, i) => (
              <Stop key={i} offset={`${i * 50}%`} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
export function PublicLayout({
  children,
  navigation,
  auth = false,
}: React.PropsWithChildren<{ navigation: any; auth?: boolean }>) {
  const c = usePalette();
  const compact = useWindowDimensions().width < 400;
  const { mode, toggle } = useTheme();
  const { setActiveDomain } = useSession();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.dark ? "#0e1330" : "#efeaff" }}
    >
      <PublicGradient />
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: c.line,
          backgroundColor: c.dark ? "#0e1330cc" : "#ffffffaa",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 1200,
            alignSelf: "center",
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="StarVnt homepage"
            onPress={() => navigation.navigate("Landing")}
          >
            <LogoWord compact />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {TEST_AUTH_ENABLED && !compact && (<Pressable
              accessibilityRole="button"
              accessibilityLabel="Quick Test Auth"
              onPress={() => navigation.navigate("TestAuth")}
              style={{
                backgroundColor: c.soft,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderWidth: 1,
                borderColor: c.accent + "45",
              }}
            >
              <Icon name="flash" size={13} color={c.accent} />
              <Txt bold size={12} style={{ color: c.accent }}>
                Test Auth
              </Txt>
            </Pressable>)}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              onPress={toggle}
              style={{ padding: 11 }}
            >
              <Icon
                name={mode === "dark" ? "sunny-outline" : "moon-outline"}
                size={20}
                color={c.muted}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (!auth) setActiveDomain("external");
                navigation.navigate(
                  auth ? "Landing" : "Auth",
                  auth ? undefined : { mode: "login", accountType: "CUSTOMER" },
                );
              }}
              style={{ paddingVertical: 12 }}
            >
              <Txt bold size={14}>
                {auth ? "Explore" : "Sign in"}
              </Txt>
            </Pressable>
          </View>
        </View>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <KeyboardScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {children}
        </KeyboardScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
