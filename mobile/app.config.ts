import type { ExpoConfig } from "expo/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import brand from "./src/brand.generated.json";

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() || "./google-services.json";
const googleServicesPath = resolve(googleServicesFile);
const googleServicesFileExists = existsSync(googleServicesPath);
let googleServicesMatchesAndroidPackage = false;
if (googleServicesFileExists) {
  try {
    const firebaseConfig = JSON.parse(readFileSync(googleServicesPath, "utf8"));
    googleServicesMatchesAndroidPackage = (firebaseConfig.client || []).some(
      (client: { client_info?: { android_client_info?: { package_name?: string } } }) =>
        client.client_info?.android_client_info?.package_name === "com.starvnt.mobile",
    );
  } catch {
    googleServicesMatchesAndroidPackage = false;
  }
}

const isAndroidEasBuild =
  process.env.EAS_BUILD === "true" &&
  process.env.EAS_BUILD_PLATFORM?.toLowerCase() === "android";
if (googleServicesFileExists && !googleServicesMatchesAndroidPackage) {
  throw new Error(
    "GOOGLE_SERVICES_JSON must point to Firebase google-services.json configured for Android package com.starvnt.mobile.",
  );
}
if (isAndroidEasBuild && !googleServicesMatchesAndroidPackage) {
  throw new Error(
    "Android push is not configured for this build. Add the Firebase google-services.json for com.starvnt.mobile as the EAS file environment variable GOOGLE_SERVICES_JSON, then rebuild.",
  );
}

const config: ExpoConfig = {
  name: "STARVNT",
  slug: "starvnt",
  owner: "yogesh832",
  scheme: "starvnt",
version: "1.0.1",
  icon: "./assets/brand/starvnt-icon.png",
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: "com.starvnt.mobile" },
  android: {
    versionCode: 2,
    ...(googleServicesMatchesAndroidPackage
      ? { googleServicesFile }
      : {}),
    package: "com.starvnt.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/starvnt-icon.png",
      backgroundColor: brand.launchBackground,
    },
  },
  web: {
    favicon: "./assets/brand/favicon-64.png",
    name: "StarVnt Entertainment",
    themeColor: brand.launchBackground,
  },
  plugins: [
    "expo-image",
    ['expo-audio', { microphonePermission: 'Allow STARVNT to use your microphone to talk to Aura.', enableBackgroundRecording: false, enableBackgroundPlayback: false }],
    ["expo-notifications", { defaultChannel: "starvnt-updates" }],
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/starvnt-icon.png",
        imageWidth: 160,
        backgroundColor: brand.light.bg,
        dark: { backgroundColor: brand.dark.bg },
      },
    ],
    "expo-secure-store",
    "expo-document-picker",
    "expo-sharing",
    "@react-native-community/datetimepicker",
    ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME },
          ] as [string, Record<string, string>],
        ]
      : []),
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "e3aa19c9-0964-4768-8507-985be8f040bd",
    },
  },
};
export default config;
