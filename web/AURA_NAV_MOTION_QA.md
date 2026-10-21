# Aura navigation motion

The customer and vendor bottom bars use the approved orbit video's animation,
exported as an animated transparent WebP so the icon blends into either theme.
The existing orb PNG remains the loading/error/reduced-motion fallback.

Asset: `orb-motion-128.v1.webp`, 636,958 bytes, 128×128, 192 frames,
24 fps, 8-second seamless loop, no audio. Native receives the identical bytes
through `mobile/scripts/sync-brand.mjs`. The former procedural ring and extra
CSS/Animated sparkle layers have been removed.

Web keeps the PNG in place until onLoad, then crossfades the two layers. The
animation unmounts when offscreen, the document is hidden, or reduced motion is
enabled. Native waits for expo-image onDisplay before hiding the PNG, and
unmounts the animation when backgrounded or reduced motion is enabled. An asset
error leaves the PNG visible. No spinner, controls, or layout resize is used.

Validation (2026-10-21):
- Web production build passed (existing bundle-size advisory remains).
- Mobile TypeScript check and Android Metro export passed.
- Asset decoded: 192 frames, 8,000 ms, infinite loop, transparent alpha, changing
  frames; web/native asset checksums match.
- Browser vendor dashboard displayed the static fallback while the animation
  asset was unavailable during asset replacement; a fresh load displayed the
  animated asset with data-motion-ready=true. Screenshot in
  tmp/qa/web-review/aura-nav-optimized.png.
- Native device playback has not been visually checked in this change.
