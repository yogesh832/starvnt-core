# Aura voice

The composer follows the web mobile layout: plus starts a new chat, image attaches reference media, the microphone records dictation for review in the message box, and the waveform opens continuous voice mode. The send button replaces the waveform when there is a message or attachment. Chat follows the shared light/dark theme.

Continuous voice uses the web's purple/cyan orb, microphone mute and end controls inside the dashboard. Voice starts expanded for a new conversation and smoothly contracts above the composer when planning starts; an expand control changes presentation without restarting audio. Chat, questions and event cards stay in the same scroll view, and controls become smaller while typing. It submits automatically after about 650 ms of quiet following sustained speech, plays the ElevenLabs reply, and resumes listening. Both clients use the same energy detector: an initial -48 dBFS threshold, a 12 dB margin above the measured quiet floor, and at least three samples spanning 180 ms. This rejects brief ticking/noise bursts; it is not semantic speech recognition and cannot reject every background sound. Tapping the orb remains an optional finish/interrupt shortcut. Dictation returns its transcript to the composer without sending a chat message. Recordings are limited to one minute; ending voice, switching tabs, switching to the keyboard, pressing Android Back, or backgrounding the app stops microphone capture.

The dashboard bottom bar is shared outside the page stack, including Aura chat, voice, and detail pages for customers, vendors and admins. Switching destinations pops back to the existing dashboard instead of stacking a duplicate. The orb uses numeric SVG gradient offsets/opacities to avoid native parser warnings.

Audio is uploaded to the authenticated `POST /api/ai/transcribe` route. The server uses its existing `ELEVENLABS_API_KEY` and ElevenLabs Scribe to return text, then the app submits that text to the existing customer or vendor Aura conversation. Proposals retain the existing confirmation workflow. Local recording and reply files are discarded after use.

Replies use only ElevenLabs through the authenticated `POST /api/ai/voice` route and the server's configured voice. There is no browser or device speech fallback. Provider and audio playback errors are shown in voice mode, with the reply retained in chat. Listening resumes once after successful playback. Closing or replacing a voice session fences late responses. Microphone mute discards capture only: pending replies and current ElevenLabs playback continue, and listening stays off until unmute. Typed replies and suggestion actions share the active voice session, preserve structured action payloads, and speak one response. No private provider keys are included in the mobile app.

`expo-audio` is included in Expo Go SDK 57. Installed standalone/development apps need rebuilding to include newly added native packages. The unused `expo-speech` dependency was removed.

Customer follow-up questions and optional suggestions follow Hindi/Hinglish conversation language even after short dates, numbers and place names. Aura uses feminine first-person Hindi/Hinglish verbs. Prompts request concise conversational replies without reading the UI choices aloud. Unknown facts and booking confirmations remain controlled by the backend.

## Validation

- Expo 57's default `expo/fetch` rejects legacy `{ uri, name, type }` multipart parts before making an HTTP request. Native voice and document uploads now append `expo-file-system` `File` objects. A regression test runs the installed SDK encoder against the authenticated voice HTTP route, reproducing the old failure and verifying the replacement sends the exact file bytes and MIME type.
- The replacement transport was also checked against the running backend and ElevenLabs using a generated speech fixture; it returned the expected transcript.

- Live authenticated ElevenLabs transcription succeeded with a locally generated speech fixture: "I am planning a birthday in Delhi for 30 guests".
- Current live ElevenLabs speech output succeeded: the authenticated backend returned `200 audio/mpeg` with 41,003 bytes for the test phrase. Earlier Rachel entitlement failures are no longer hidden behind device speech.
- Backend tests cover authenticated multipart transport, speech bytes, input limits, no-speech handling, provider entitlement/permission errors, and keeping credentials server-side. Mobile tests cover silence/end-of-turn decisions, speech formatting, single completion and canceled playback. Web tests cover late responses, clip replacement, URL cleanup, autoplay rejection and terminal errors.
- Microphone capture, speaker playback, and uninterrupted conversation on a physical phone still require device verification.
