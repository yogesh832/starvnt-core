# Aura+ identity

The user supplied the glossy cyan/violet orb and four-point star references on 20 October 2026. These identify Aura+, while the existing STARVNT company logo remains unchanged.

- `public/images/aura/orb-96.png`: transparent navigation/launcher artwork, resized from the supplied orb with alpha preserved (16 KB).
- `public/images/aura/orb-384.png`: transparent voice artwork (227 KB).
- `src/components/AuraMark.jsx`: scalable, code-native four-point glass star for small headings, replies, cards and actions. The shape and cyan/violet/pink palette follow the supplied reference without embedding its rectangular crop.
- `src/components/auraMark.css`: theme-aware shadows and voice-state effects; reduced-motion settings disable animation and scaling. Icons are decorative; their containing controls retain accessible names.

Use `Icon name="aura"` for compact marks, or `AuraMark variant="orb"` for navigation and voice. Do not replace rating stars, category icons, microphone/send controls or the STARVNT brand with Aura marks. The artwork is served locally, with no remote dependency. Only display/asset changes were made to the voice orb; microphone, mute, interruption and ElevenLabs playback logic is unchanged.

Vendor mobile navigation is Dashboard / Leads / Aura+ / Bookings / More. Calendar remains in the full navigation opened by More. The Aura panel reserves bottom-nav space.
