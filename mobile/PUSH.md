# Android and iOS push notifications

Implementation is present, but live delivery is not enabled. The owner created `@yogesh832/starvnt` on EAS; app config now contains its project ID, `e3aa19c9-0964-4768-8507-985be8f040bd`. Firebase/Apple credentials and device delivery remain unverified. No real push messages, provider verification calls, account creation, or cloud builds were performed by the agent.

## Configure once

1. Confirm the identifiers. Both platforms currently use `com.starvnt.mobile`.
2. From `mobile/`, log into EAS and associate this app with an Expo project:

   ```sh
   npx eas-cli login
   npx eas-cli init
   ```

   This project's association is already present in `app.config.ts`; initialization does not need repeating. Its default UUID is `e3aa19c9-0964-4768-8507-985be8f040bd`. `EXPO_PUBLIC_EAS_PROJECT_ID` is an optional override; if set, it must refer to the intended EAS project.
3. Android: create a Firebase Android app for the exact package identifier; download its `google-services.json` to `mobile/google-services.json` (ignored by Git). Set build-time `GOOGLE_SERVICES_JSON=./google-services.json`, or use an EAS **file** environment variable whose value is the uploaded file path. Upload the FCM v1 service-account credential through `npx eas-cli credentials` / the EAS dashboard. Keep service-account private keys out of the repository and frontend environment variables.
4. iOS: use the Apple Developer account to configure signing and an APNs push key with EAS credentials for the exact bundle identifier. EAS builds and the notifications config plugin manage the entitlement. Do not put APNs keys in the app.
5. Backend: configure the same public UUID as `EXPO_EAS_PROJECT_ID`, set `PUSH_ENABLED=true`, and restart/deploy the server. If Expo enhanced push security is enabled, put its bearer token in server-only `EXPO_PUSH_ACCESS_TOKEN`. `PUSH_WORKER_INTERVAL_MS` defaults to 15000. The backend and its Mongo databases must stay running even when no app is open; a sleeping web service cannot run the queue worker.
6. Build and install the native app on physical devices:

   ```sh
   npx eas-cli build --profile development --platform android
   npx eas-cli build --profile development --platform ios
   ```

   A preview or production build also works. Changing the Firebase configuration or native plugin requires a new build. **Expo Go and the browser preview do not test remote push.** The existing Google sign-in and payment credentials remain separate setup items.
7. Sign in and allow notifications. Use Account → Notifications to enable/retry, pause delivery on that device, or open OS settings. Production uses the HTTPS backend. For development, keep the backend reachable when tapping a notification; a LAN backend will not load from outside that LAN.

Official setup references: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Android FCM v1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/), [Apple/EAS credentials](https://docs.expo.dev/app-signing/app-credentials/).

## Delivery behavior

- Customer and vendor push uses the existing persisted notifications, including messages, quotes, booking, payment and execution updates. A durable per-device checkpoint catches notifications written while the app or worker was offline, without requiring the mobile app to poll in the background. New registrations start at registration time rather than replaying the historical inbox.
- Core's web inbox is derived from operational queues and audit logs. Push covers those underlying vendor-review, planning, payment, execution, automation and audit sources, plus finance approval updates. Current permissions are checked during collection and again before dispatch; the native destination also rechecks permissions.
- External and Core registrations are separate. Each is attached to the authenticated owner, current surface and server session. Refreshed sessions re-register, provider token changes are handled, and logout unregisters before revoking the session. Disabled/revoked identities and replaced bindings cancel queued work. Multiple phones can register independently; pausing affects this installation.
- Jobs are stored before their source checkpoint advances, have a unique deduplication key, use worker leases, retry transient errors with backoff, check Expo receipts, and disable uninstalled device tokens. Jobs expire after 24 hours. Delivery is at least once; an ambiguous network timeout can lead to a duplicate alert. A provider receipt means acceptance by FCM/APNs, not proof the person saw the notification.
- Push uses a visible notification plus routing data, so the OS can display it in background/terminated states. Foreground alerts are restricted to a signed-in matching identity. Cold-start taps wait for real authentication, select the proper domain and route to the event, conversation or permitted Core module. Tapping customer/vendor notifications attempts to mark the inbox record read.
- Queue counts and worker health appear in Core → Automation. Invalid provider credentials are surfaced as a worker error. No unauthenticated broadcast/test-send endpoint was added.
- Existing in-app read state remains separate from provider delivery. Core summary read state is still in memory; this work does not claim cross-device synchronization of that read state.

An Android force-stop from Settings prevents notifications until the app is reopened. Permission denial, offline devices, battery restrictions, and push-provider outages can also delay or suppress delivery. Already delivered OS alerts cannot be recalled from another offline phone. See [Expo delivery behavior](https://docs.expo.dev/push-notifications/what-you-need-to-know/) and [receipt handling](https://docs.expo.dev/push-notifications/sending-notifications/).

## Acceptance tests on isolated QA accounts

1. Test a real customer/vendor conversation, quote, booking/payment and completion update; test each Core queue with a permitted and limited staff account. Check the original inbox and the corresponding push.
2. For each OS, test foreground, background, swipe-away/terminated, screen locked, cold-start tap, logged-out tap followed by sign-in, denied permission followed by Settings enable, and app restart.
3. Test account switching, customer/vendor switching, simultaneous external/Core sessions, session refresh, logout, administrator disable/revocation, and two phones. An old account must not receive newly dispatched notifications after its binding is revoked.
4. Test backend restart, transient provider failure, delayed receipts, invalid credentials and uninstall. Check queue status and worker diagnostics. Confirm retries do not mark an in-app notification failed or paid/verified.
5. Verify Android force-stop behavior by reopening manually. Verify delivery against release credentials on both OSs, not just development signing.

Automated coverage exercises notification payloads, scoped HTTP registration, durable checkpoints, receipt/error handling, revoked bindings, session observers and destination routing with mocked persistence/provider transport. APK/IPA compilation and physical-device push delivery require the setup above and have not been verified.

Verification for this change: TypeScript and 38 mobile tests passed; 45 backend tests passed; Expo Doctor passed 21/21; Android prebuild, Android/iOS/web production bundle exports and iOS push-entitlement introspection passed. No live push was sent. Provider token rotation is checked before processing old receipts, so an old uninstall response cannot disable a newly registered token.
