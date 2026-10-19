# Native Android UI review — 19 October 2026

Reviewed the app in Expo Go 57.0.9 on an accelerated Android 15 x86_64 emulator.
These checks used native Android screenshots and accessibility hierarchies.
The primary profile was 360 × 800 dp; the admin overview, verification list and
record detail were also inspected at 320 × 640 dp. Light and dark themes were seen.

## Native coverage

| Area | Checked |
| --- | --- |
| Public / auth | Landing, compact header, sign-in navigation, email field focus with Android keyboard, system-bar spacing |
| Quick Auth | Customer, super admin and vendor sign-in; long account names; sign-out returns to landing and stays signed out after a native app restart |
| Customer | Home, stats, events list, event workspace, Updates list, Aura chat |
| Admin | Overview and currency stats, vendor verification list, record detail, Account, sign-out |
| Vendor | Home, workspace menu, calendar, Account, business profile, focused business-name field with keyboard |
| Aura voice | First microphone permission prompt, grant returns to listening orb, persistent tabs, leaving voice through Account |
| Navigation | Bottom tabs on root screens, event/record/profile/calendar detail screens, chat, orb and above Android keyboard |

## Changes from this review

- Added shared Android field scrolling using window coordinates so stack headers
  and persistent tabs are included when locating the visible input area.
- Resized the root Android layout for the keyboard and removed the extra bottom
  system inset from tabs while the keyboard is open.
- Protected auth content from top and bottom system bars; made gradient stop
  opacity explicit so the existing auth artwork remains visible natively.
- Kept Aura open while Android displays its microphone permission dialog.
- Tightened shared cards, headings, buttons, choices and stats for narrow screens.
- Wrapped long Quick Auth names and calendar controls; removed a literal newline
  escape and corrupted text from customer/account content.
- Shortened the calendar toolbar title to avoid truncation.

## Local evidence

Screenshots are in `../tmp/native-ui/`, including:

- `auth-login-final.png`, `auth-keyboard-final.png`
- `customer-home.png`, `customer-events.png`, `customer-event-detail.png`
- `aura-chat.png`, `aura-orb-native.png`
- `admin-home-320.png`, `admin-verifications-320.png`, `admin-record-320.png`
- `vendor-home.png`, `vendor-workspace.png`, `vendor-calendar.png`
- `vendor-profile-keyboard-final.png`
- `signed-out-after-restart.png`

TypeScript passed and all 89 mobile regression tests passed. The test log is
`../tmp/native-ui/mobile-tests.log`. No matching invariant, invalid SVG number,
TypeError or Android runtime exception appeared in the inspected native logs.

## Verification limits

This is a layout and navigation review of the screens above, not proof that every
business action or every record state has been exercised. No purchases, profile
saves, vendor approvals or outbound chat messages were performed. OTP delivery,
native checkout, remote push and iOS device behavior were not verified here.

The voice check verified native permission and listening state. The emulator was
started without host audio during UI diagnosis, so a live spoken ElevenLabs
conversation was not tested in this review. The normal launcher leaves audio
enabled for subsequent manual testing.

See [ANDROID_EMULATOR.md](ANDROID_EMULATOR.md) to reopen the emulator.

## Aura conversation update — 19 October

Native Android screenshots now also cover expanded voice, its compact presentation
above the composer, the event card beside the compact orb, and bottom tabs in both
presentations. See `../tmp/native-ui/aura-compact-native.png` and
`../tmp/native-ui/aura-plan-compact-orb-final.png`. A typed planning request from
the active voice UI saved a development birthday draft (Delhi, 30 guests,
20 December 2027), displayed the response/card, and returned to listening.

125 mobile, web and targeted server tests passed, including microphone-only mute,
pending replies, typed suggestions with structured payloads, brief noise bursts,
language continuity, and feminine first-person prompts. TypeScript and the web
production build passed. Android and iOS bundle export passed. The web build
still reports its existing large-bundle warning.

No live spoken noise or audible speaker assessment was possible in this emulator
session: host audio was disabled. The noise checks use simulated meter samples;
microphone-only mute/playback sequencing additionally uses mocked audio hardware.
