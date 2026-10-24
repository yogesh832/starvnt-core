# Native iOS testing from Windows

The Apple iOS Simulator runs on macOS. From this Windows workstation, use a hosted simulator streamed to a browser. This runs the native iOS app; the mobile web preview is not an iOS test environment.

## Verified status (23 October 2026)

EAS account `yogesh832` has a finished iOS Simulator build (`53c1fe35-f617-4335-be57-d7ef7d8631b0`, built 18 October). Starting a hosted session returned: "EAS Simulator isn't available on yogesh832 yet — it's coming soon." No running sessions were found. The launcher is prepared, but a working hosted iOS session has not been verified. Request access at https://expo.dev/services/simulators or provision another hosted simulator provider before relying on this workflow.

## Open and close the hosted simulator

From `D:\starvnt-core`:

```powershell
npm run mobile:ios:simulator
```

The launcher selects the latest completed, non-expired iOS Simulator build returned by EAS, starts a private browser preview, and prints its URL. Sign in with the Expo account that has access to the STARVNT project. Expo Simulators is an experimental service with account access requirements; an EAS login alone does not guarantee access. A five-minute idle timeout is requested. Stop the session explicitly when finished:

```powershell
npm run mobile:ios:simulator -- Stop
npm run mobile:ios:simulator -- Status
```

Session connection information is stored by EAS in `mobile/.env.eas-simulator`, which is ignored by Git. Running a new session replaces that file; use `sim:list` and `sim:stop --id <session-id>` through EAS CLI if multiple sessions need to be stopped.

## Include current code

The existing `appetize-ios` profile creates a standalone Release build with native dependencies and bundled JavaScript. It uses `https://app.starvnt.com`; testing writes can affect live data. Use designated test accounts. Local Metro edits do not update this build.

```powershell
npm run mobile:ios:simulator -- Build
npm run mobile:ios:simulator
```

Cloud build and simulator usage count against the account's plan. No Apple Developer membership is needed for a simulator build. If hosted simulator access is unavailable, this same build can be used with another hosted iOS Simulator provider or on a Mac; a cloud build by itself does not provide a running simulator.

## Testing coverage

Use the native simulator for layout, safe areas, navigation, keyboard interactions, validation, API flows, file flows supported by the host, and error states. Test compact and large iPhone sizes and an iPad where available. Google sign-in still needs the iOS OAuth client and URL scheme configured; a simulator does not supply missing credentials.

A simulator alone cannot establish real iPhone performance, camera and microphone behavior, physical sensors, or all notification/background behavior. Before release, use remotely hosted physical iPhones for hardware-dependent checks, native Google sign-in, payment callbacks, notifications, background/resume, and install/upgrade tests. Device builds require Apple signing and provider access. Until those tests pass, record those areas as unverified.

## References

- [Expo iOS Simulator setup and limitations](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo hosted simulator commands](https://docs.expo.dev/eas/cli/#eas-simstart)
- [Expo iOS Simulator builds](https://docs.expo.dev/build-reference/simulators/)
