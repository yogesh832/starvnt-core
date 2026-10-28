import React, { createContext, useContext, useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import brand from "./brand.generated.json";

type Mode = "light" | "dark";
const Context = createContext({ mode: "light" as Mode, toggle: () => {} });
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
    if (Platform.OS !== "web") Appearance.setColorScheme(mode);
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
        toggle: () => setMode((v) => (v === "light" ? "dark" : "light")),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
export function usePalette() {
  const { mode } = useTheme();
  return { ...brand[mode], dark: mode === "dark", success: mode === "dark" ? "#6ee7b7" : "#059669" };
}
