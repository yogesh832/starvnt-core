# Android emulator on this Windows PC

The SDK and Android 15 AOSP image are installed under `D:\Android` to avoid filling C:.
The AVD is `Starvnt_Phone`: 720 × 1600 pixels at 320 dpi (360 × 800 dp).
WHPX hardware acceleration is available. Expo Go is version 57.0.9 for SDK 57.

Open a new terminal so the Android environment variables are loaded. From
`D:\starvnt-core\mobile`, start Metro with `npm start` if it is not already running
(SDK 57 requires Node 22.13 or newer).
Then open another terminal and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-emulator.ps1
```

The script boots Android, opens its interactive scrcpy window and opens the app
from Metro on port 8081. It forwards that port with ADB so Android can reach
Metro at `127.0.0.1:8081`, including its development WebSocket connection.
The app's backend URL still comes from the existing mobile environment config.

The emulator's own Qt window failed to load OpenGL on this PC, so the script runs
the actual Android emulator in the background and uses scrcpy for its display
and mouse/keyboard controls. This is the native Android app, not React Native Web.

First boot can take several minutes on this 8 GB PC. Close unneeded applications
if Windows runs low on memory. The emulator requires at least 2560 MB despite
the lower requested AVD RAM setting.

To stop Android and free its memory:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 emu kill
```

This AOSP image has no Google Play services. Use Quick Auth to review dashboards.
Native Google Sign-In, remote push and native checkout require their configured
development/production builds; Expo Go does not include those custom modules.

The initial UI-review session used `-no-audio` while diagnosing startup. For live
voice testing, stop that session and reopen it with the launcher above, which
leaves emulator audio enabled. To enable input from your PC microphone, run:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 emu avd hostmicon
```

To turn PC microphone input off again, use `avd hostmicoff`.
