/**
 * Test Auth Flag:
 * Enabled by default across development and pre-production test builds (APK, simulator, Expo)
 * until explicitly disabled via EXPO_PUBLIC_DISABLE_TEST_AUTH=true for final production release.
 */
export const TEST_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_DISABLE_TEST_AUTH !== "true";
