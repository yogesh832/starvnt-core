import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const validAuraSessionId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
export const newAuraSessionId = () =>
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const encode = (value: string) =>
  Array.from(value)
    .map((char) => char.codePointAt(0)!.toString(16))
    .join("_");
function key(owner: string, vendor: boolean, eventId?: string) {
  return `starvnt.aura.${vendor ? "vendor" : "customer"}.${encode(owner)}.${encode(eventId || "new")}`;
}
export async function readAuraSession(
  owner: string,
  vendor: boolean,
  eventId?: string,
) {
  const value =
    Platform.OS === "web"
      ? window.sessionStorage.getItem(key(owner, vendor, eventId))
      : await SecureStore.getItemAsync(key(owner, vendor, eventId));
  return validAuraSessionId(value) ? value : null;
}
export async function rememberAuraSession(
  owner: string,
  vendor: boolean,
  eventId: string | undefined,
  sessionId: string,
) {
  if (!validAuraSessionId(sessionId))
    throw new Error("This conversation link is invalid.");
  if (Platform.OS === "web")
    window.sessionStorage.setItem(key(owner, vendor, eventId), sessionId);
  else await SecureStore.setItemAsync(key(owner, vendor, eventId), sessionId);
}
