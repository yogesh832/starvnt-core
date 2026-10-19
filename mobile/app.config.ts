import type { ExpoConfig } from "expo/config";
import brand from "./src/brand.generated.json";

const config: ExpoConfig = {
  name: "STARVNT",
  slug: "starvnt",
  owner: "yogesh832",
  scheme: "starvnt",
  version: "1.0.0",
  icon: "./assets/brand/starvnt-icon.png",
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: "com.starvnt.mobile" },
  android: {
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
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
