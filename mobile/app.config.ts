import type { ExpoConfig } from "expo/config";
import brand from "./src/brand.generated.json";

const config: ExpoConfig = {
  name: "STARVNT",
  slug: "starvnt",
  scheme: "starvnt",
  version: "1.0.0",
  icon: "./assets/brand/starvnt-icon.png",
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: "com.starvnt.mobile" },
  android: {
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
};
export default config;
