import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { createClient, Vault } from "./client";

function resolveDevApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
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
function vault(domain: string): Vault {
  const key = `starvnt.${domain}.refresh`;
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
  return {
    get: () => SecureStore.getItemAsync(key),
    set: (value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    clear: () => SecureStore.deleteItemAsync(key),
  };
}
export const external = createClient(`${API_URL}/api`, vault("external"));
export const internal = createClient(`${API_URL}/api/admin`, vault("admin"));
