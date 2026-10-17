# STARVNT mobile

React Native + Expo SDK 57 app for Android and iOS, alongside the existing Vite web app. It connects directly to the existing Express backend and databases. Components are native views, inputs, navigation stacks and tabs; Razorpay and Google use native SDK integrations.

This is an implementation for review and device QA, **not a signed or store-ready release, and not a claim of complete web parity**. See [PARITY.md](./PARITY.md) for implemented flows and remaining work.

## Shared web branding

Mobile uses copies of the exact assets in `web/public/brand/`, including the app logo and favicon. The palette is generated from `web/src/theme.css`, and the mark/gradient wordmark follows `web/src/components/ui.jsx`. Inter fonts ship with the app. Light mode is the default, as on the web; the header theme button switches between the web light/dark palettes and remembers the preference.

After updating web brand files or colors, run `npm run sync:brand -w @starvnt/mobile`. This copies assets without altering their pixels and regenerates `src/brand.generated.json`. Native navigation, touch targets and keyboard spacing remain adapted for phones. Changes to app icons, splash or bundled native modules require a new development build.

Guests start on the public homepage, using the web landing page's copy, planning prompt, suggestions, lavender background and imagery. Sign-in and registration use the web's photo panel, workspace choices and form design. Homepage planning prompts carry through customer sign-in to the Aura+ composer as a draft, ready to send; cancelling the planning dialog clears the handoff. Existing signed-in sessions still open their dashboard. The public pages support light/dark themes, phone layouts and wider tablet layouts.

## Run

Use a current Node 22 LTS release (at least 22.13) or a supported newer LTS release. Node 22.12 does not satisfy the upgraded React Native/Metro toolchain. From the repository root:

```sh
npm install
npm run dev
npm run dev:mobile
```

Create a development build before connecting Metro:

```sh
npm run mobile:android
# Requires macOS + Xcode:
npm run mobile:ios
```

Android requires an Android SDK, emulator/device and the JDK supported by the React Native Android build. This checkout's Android prebuild succeeds, but the development machine did not have an Android emulator/SDK available for a compiled run. Windows cannot run the iOS simulator. Use a Mac or Expo EAS for native iOS builds.

Google and Razorpay require a custom development build; Expo Go does not contain those native SDKs. `mobile/android` and `mobile/ios` are generated and ignored. Run `npx expo prebuild` from `mobile/` after native configuration changes; never edit the generated projects as the only source of configuration.

SDK 57 requires rebuilding any development client created with SDK 55. Native iOS builds require Xcode 26.4 or newer and target iOS 16.4 or newer. The web branding, navigation and backend endpoints are preserved by the upgrade.

The Vite web workspace remains on React 18; mobile uses React 19. `metro.config.cjs` pins mobile React/React DOM imports (including imports inside hoisted dependencies) to the mobile installation. Those two JavaScript packages are excluded from native autolinking because Metro owns their resolution. Other native modules continue to use Expo's automatic monorepo configuration. Resolver regression tests cover the renderer and JSX entry points.

For an Expo Go screen preview, use an SDK 57-compatible Expo Go app. On a phone, set `EXPO_PUBLIC_API_URL` to the development computer's reachable LAN address, keep both devices on the same Wi-Fi, then run:

```powershell
cd D:\starvnt-core\mobile
$env:EXPO_PUBLIC_API_URL="http://YOUR_COMPUTER_LAN_IP:4000"
npx expo start --go --lan --clear
```

Keep the backend running on port 4000. Expo Go previews do not validate native Google sign-in or Razorpay payments; use the development build for those flows.

For browser-only layout review:

```sh
npm run web -w @starvnt/mobile
```

The browser preview uses in-memory session storage. Browser Google sign-in, native payment, native date picker, file picking/sharing and OS keychain behavior require native QA. For authenticated browser preview, include its origin (normally `http://localhost:8081`) in the server's `CLIENT_ORIGINS`. The original Vite web app remains at `npm run dev:web`.

## Frontend environment

Copy `.env.example` to `mobile/.env` when overriding defaults. Restart Metro after editing it.

| Key | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Backend origin only, without `/api`. Android emulator defaults to `http://10.0.2.2:4000`; iOS simulator defaults to `http://localhost:4000`. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Public web OAuth client ID. Must match backend `GOOGLE_CLIENT_ID`; the native SDK requests an ID token with this audience. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Public iOS OAuth client ID for the registered bundle identifier. |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | Reversed iOS client ID for the app config plugin. Rebuild after changing it. |

Production EAS builds already set `EXPO_PUBLIC_API_URL=https://app.starvnt.com`. Production rejects a missing or non-HTTPS backend URL. The default package/bundle identifier is provisionally `com.starvnt.mobile`.

Physical phones must use the computer's reachable LAN address or an HTTPS development URL; `localhost` on a phone refers to the phone. An Android device can also use an explicit `adb reverse tcp:4000 tcp:4000` setup with an appropriate API URL. Do not change production to a development HTTP URL.

Google setup still needed from the project owner:

1. Confirm the final Android package and iOS bundle identifier.
2. Register an Android OAuth client for that package and the development/release signing certificate fingerprints.
3. Register an iOS OAuth client and set its public ID and reversed URL scheme.
4. Set the public web client ID to the same audience the backend already verifies.
5. Rebuild the development client and test Google sign-in on both platforms.

No frontend Razorpay secret, Cloudinary secret, SMTP password, MSG91 auth key, JWT secret or AI API key is needed. Payments receive the public checkout key from the backend. AI, OTP delivery, maps lookup, verification and media signing keep using the existing server configuration. Never copy `server/.env` into this app.

## Session contract and deployment

Deploy the accompanying backend change before using native authentication in production. Native auth requests include `X-Starvnt-Client: native`. Successful token-issuing auth responses add a `refreshToken`; native refresh/logout send it as a JSON body field. Both domains retain their existing signing secrets, audiences, session stores, expiry checks, rotation and revocation. The header negotiates transport and grants no permission.

Access tokens remain in memory. Native refresh credentials are stored in separate OS SecureStore keys for external and admin sessions. Browser requests keep the original HttpOnly-cookie response contract; native requests cannot fall back to a browser cookie. The mobile client handles the backend's existing HTTP 200 invalid-session responses, coalesces concurrent refreshes, and retains credentials during transient network failure so users can reconnect.

Razorpay checkout completion records processing. The UI does not mark payments verified or bookings confirmed from the native SDK callback; the backend remains authoritative. Finance requests still require independent approval and ledger evidence.

## Validate

From the root:

```sh
npm run check:mobile
npm test -w server
npm run build -w web
```

From `mobile/`, with the public backend URL set for the intended build:

```sh
npx expo install --check
npx expo export --platform android --platform ios
npx expo prebuild --platform android --no-install
```

Bundle export verifies Metro/Hermes compilation; it does not build an APK/IPA or verify native SDK linking, credentials, live SMS/email, provider checkout, or app lifecycle behavior. Device QA and the remaining parity items are release gates. The mobile CI workflow checks types, session tests, Expo dependency compatibility, and both native JS exports.

Build profiles in `eas.json` provide development, internal Android APK preview, and production configuration. EAS project association, Apple/Google developer accounts, certificates, store assets and final identifiers have not been created or submitted.
