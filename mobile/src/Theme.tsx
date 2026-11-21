import React, { createContext, useContext, useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import brand from "./brand.generated.json";
import { vendorPalette } from '../../shared/vendorTheme.js';

type Mode = "light" | "dark";
const Context = createContext({ mode: "light" as Mode, locked: false, vendor: false, toggle: () => {} });
function browserMode(): Mode {
  try {
    return Platform.OS === "web" &&
      localStorage.getItem("starvnt-theme") === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}
export function ThemeProvider({ children }: React.PropsWithChildren) {
  // Like web/src/lib/ThemeContext.jsx, new installations start in light mode.
  const [mode, setMode] = useState<Mode>(browserMode);
  const [ready, setReady] = useState(Platform.OS === "web");
  useEffect(() => {
    if (Platform.OS === "web") return;
    let mounted = true;
    SecureStore.getItemAsync("starvnt.theme")
      .then((value) => {
        if (mounted && value === "dark") setMode("dark");
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(mode);
      void SystemUI.setBackgroundColorAsync(brand[mode].bg).catch(() => {});
    } else {
      document.documentElement.style.colorScheme = mode;
      document.body.style.backgroundColor = brand[mode].bg;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content', mode === 'dark' ? brand.dark.bg : brand.launchBackground,
      );
    }
    if (Platform.OS === "web") {
      try {
        localStorage.setItem("starvnt-theme", mode);
      } catch {}
    } else {
      void SecureStore.setItemAsync("starvnt.theme", mode).catch(() => {});
    }
  }, [mode, ready]);
  return (
    <Context.Provider
      value={{
        mode,
        locked: false,
        vendor: false,
        toggle: () => setMode((v) => (v === "light" ? "dark" : "light")),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
export function VendorThemeBoundary({ enabled, children }: React.PropsWithChildren<{ enabled: boolean }>) {
  const inherited = useTheme();
  useEffect(() => {
    const background = enabled ? vendorPalette.bg : brand[inherited.mode].bg;
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(enabled ? 'dark' : inherited.mode);
      void SystemUI.setBackgroundColorAsync(background).catch(() => {});
    } else {
      document.documentElement.style.colorScheme = enabled ? 'dark' : inherited.mode;
      document.body.style.backgroundColor = background;
    }
  }, [enabled, inherited.mode]);
  return <Context.Provider value={enabled ? { mode: 'dark', locked: true, vendor: true, toggle: () => {} } : inherited}>{children}</Context.Provider>;
}
export function usePalette() {
  const { mode, vendor } = useTheme();
  const dark = mode === "dark";
  return {
    ...brand[mode], dark,
    panel: dark ? brand.dark.panel : brand.light.card,
    elevated: dark ? brand.dark.elevated : brand.light.soft,
    input: dark ? brand.dark.input : brand.light.card,
    lineStrong: dark ? brand.dark.lineStrong : brand.light.line,
    action: dark ? brand.dark.action : brand.light.accent,
    success: dark ? brand.dark.success : "#059669",
    ...(vendor ? vendorPalette : {}),
  };
}
