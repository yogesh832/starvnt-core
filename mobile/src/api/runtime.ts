import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createClient, Vault } from "./client";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__
    ? Platform.OS === "android"
      ? "http://10.0.2.2:4000"
      : "http://localhost:4000"
    : "")
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
