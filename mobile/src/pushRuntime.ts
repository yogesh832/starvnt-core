import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { external, internal } from "./api/runtime";

export type PushDomain = "external" | "admin";
export const pushAvailable =
  (Platform.OS === "android" || Platform.OS === "ios") &&
  Constants.executionEnvironment !== "storeClient";
export const pushProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  Constants.easConfig?.projectId ||
  Constants.expoConfig?.extra?.eas?.projectId ||
  "";
let sdk: typeof import("expo-notifications") | undefined;
export function notifications() {
  if (!pushAvailable) return null;
  return (sdk ||=
    require("expo-notifications") as typeof import("expo-notifications"));
}
let queue: Promise<unknown> = Promise.resolve();
export function pushSerial<T>(action: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(action);
  queue = next;
  return next;
}
export async function installationId() {
  let value = await SecureStore.getItemAsync("starvnt.push.installation");
  if (!value) {
    value = Crypto.randomUUID();
    await SecureStore.setItemAsync("starvnt.push.installation", value);
  }
  return value;
}
export async function pushEnabled() {
  return (await SecureStore.getItemAsync("starvnt.push.enabled")) !== "no";
}
export async function setPushEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(
    "starvnt.push.enabled",
    enabled ? "yes" : "no",
  );
}
export async function bindPush(domain: PushDomain, token: string) {
  const id = await installationId();
  const result = await (domain === "admin" ? internal : external).call(
    "/push/devices",
    "POST",
    {
      installationId: id,
      projectId: pushProjectId,
      token,
      platform: Platform.OS,
    },
  );
  await SecureStore.setItemAsync(
    `starvnt.push.${domain}.binding`,
    result.bindingId,
  );
}
export async function unbindPush(domain: PushDomain) {
  if (!pushAvailable) return;
  const id = await SecureStore.getItemAsync("starvnt.push.installation");
  const bindingId = await SecureStore.getItemAsync(
    `starvnt.push.${domain}.binding`,
  );
  if (id && bindingId)
    await (domain === "admin" ? internal : external).call(
      `/push/devices/${id}`,
      "DELETE",
      { bindingId },
    );
  await SecureStore.deleteItemAsync(`starvnt.push.${domain}.binding`);
}
export async function logoutPush(domain: PushDomain) {
  await pushSerial(async () => {
    await unbindPush(domain);
    const n = notifications();
    if (n) {
      await n.dismissAllNotificationsAsync().catch(() => {});
      await n.setBadgeCountAsync(0).catch(() => {});
    }
  });
}
export async function acknowledgePush(data: Record<string, any>) {
  const source = String(data.notificationId || "").match(
    /^(customer|vendor):([a-f0-9]{24})$/i,
  );
  if (!source || data.domain !== "external") return;
  await external.call(
    `/${source[1]}/notifications/${source[2]}/read`,
    source[1] === "vendor" ? "PUT" : "POST",
  );
}
