param(
  [string]$AvdName = 'Starvnt_Phone',
  [switch]$NoMirror
)
$ErrorActionPreference = 'Stop'
foreach ($name in @('ANDROID_HOME', 'ANDROID_AVD_HOME', 'ANDROID_USER_HOME')) {
  if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
    [Environment]::SetEnvironmentVariable($name, [Environment]::GetEnvironmentVariable($name, 'User'), 'Process')
  }
}
$sdk = $env:ANDROID_HOME
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$emulator = Join-Path $sdk 'emulator/emulator.exe'
if (-not (Test-Path $adb) -or -not (Test-Path $emulator)) {
  throw 'Android SDK not found. Set ANDROID_HOME to your installed Android SDK.'
}
$device = 'emulator-5554'
$devices = & $adb devices
if (-not ($devices -match '^emulator-5554\s')) {
  # This PC runs the Android guest with WHPX and host graphics. scrcpy supplies
  # its interactive window because the emulator Qt window fails to load OpenGL.
  Start-Process $emulator -ArgumentList @('-avd', $AvdName, '-port', '5554', '-no-window', '-no-snapshot', '-no-boot-anim', '-gpu', 'host', '-feature', '-Vulkan', '-cores', '2') -WindowStyle Hidden
}
Write-Host 'Waiting for Android to finish booting...'
$deadline = (Get-Date).AddMinutes(8)
do {
  $boot = & $adb -s $device shell getprop sys.boot_completed 2>$null
  if ($boot -eq '1') { break }
  Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)
if ($boot -ne '1') { throw 'Android is still booting. Free some RAM and rerun this command.' }
& $adb -s $device shell input keyevent 224
& $adb -s $device shell wm dismiss-keyguard
if (-not $NoMirror) {
  $androidRoot = Split-Path $sdk
  $mirror = Get-ChildItem (Join-Path $androidRoot 'tools') -Filter scrcpy.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($mirror) {
    $env:ADB = $adb
    $existingMirror = Get-Process scrcpy -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'STARVNT-Android' }
    if (-not $existingMirror) {
      Start-Process $mirror.FullName -ArgumentList @('-s', $device, '--no-audio', '--max-size=960', '--max-fps=30', '--window-title=STARVNT-Android')
    }
  } else {
    Write-Host 'Android is running. Install scrcpy to open its interactive window.'
  }
}
try {
  $null = Invoke-WebRequest 'http://127.0.0.1:8081/status' -UseBasicParsing -TimeoutSec 3
  & $adb -s $device reverse tcp:8081 tcp:8081
  & $adb -s $device shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081' host.exp.exponent
} catch {
  Write-Host 'Start Metro from mobile with npm start, then press a to open Android.'
}
