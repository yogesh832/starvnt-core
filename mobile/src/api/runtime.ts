import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { createClient, Vault } from "./client";
import { browserDevApi } from '../browserDevApi';

function resolveDevApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return Platform.OS === 'web'
      ? browserDevApi(process.env.EXPO_PUBLIC_API_URL, typeof window === 'undefined' ? undefined : window.location.hostname)
      : process.env.EXPO_PUBLIC_API_URL;
  }

  // On physical devices in Expo Go / Dev Client, extract the development machine's LAN IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const hostIp = hostUri.split(":")[0];
    if (hostIp && hostIp !== "localhost" && hostIp !== "127.0.0.1") {
      return `http://${hostIp}:4000`;
    }
  }

  return Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
}

export const API_URL = (
  __DEV__ ? resolveDevApiUrl() : process.env.EXPO_PUBLIC_API_URL || ""
).replace(/\/$/, "");
if (!API_URL || (!__DEV__ && !API_URL.startsWith("https://"))) {
  throw new Error(
    "Set EXPO_PUBLIC_API_URL to your HTTPS backend before building for production.",
  );
}
function vault(domain: string, legacyKey = `starvnt.${domain}.refresh`): Vault {
  const key = `starvnt.session.v2.${domain}`;
  // Browser preview uses a session in memory; native releases use OS secure storage.
  if (Platform.OS === "web") {
    let value: string | null = null;
    return {
      get: async () => value,
      set: async (v) => {
        value = v;
      },
      clear: async () => {
        value = null;
      },
    };
  }
  // Retire sessions saved by the old domain-selection/logout implementation.
  // Run before every first operation so login cannot race the migration.
  let migration: Promise<void> | undefined;
  const prepare = () => migration ||= SecureStore.deleteItemAsync(legacyKey);
  return {
    get: async () => { await prepare(); return SecureStore.getItemAsync(key); },
    set: async (value) => {
      await prepare();
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    },
    clear: async () => { await prepare(); await SecureStore.deleteItemAsync(key); },
  };
}
export const external = createClient(`${API_URL}/api`, vault("external"));
export const internal = createClient(`${API_URL}/api/admin`, vault("admin"));
export const sessionPreference = vault('session', 'starvnt.session.domain');
