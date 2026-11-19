# Vendor delivery optimization — 19 November 2026

The supplied PageSpeed report was captured on 15 November, before subsequent production changes. A fresh Lighthouse 13.6 audit of the deployed `7a0e7c3` homepage measured desktop Performance 97, Accessibility 100, Best Practices 100, SEO 100; mobile Performance 90 with the same three 100 scores. These are single-run laboratory measurements, not CrUX/real-user Core Web Vitals. Browser, network and CPU conditions affect scores.

## Changes

- Public routes now load their own Tailwind utilities. Workspace utilities load with the authenticated route chunks. All theme variables remain available, preserving the existing light and dark palettes; a build check verifies 286 workspace references.
- Vendor sections load on demand with a loading state inside the workspace, preserving navigation and scroll behavior. The Aura location picker loads when needed instead of pulling the map engine into every dashboard visit.
- Existing hero and brand artwork has AVIF alternatives and WebP fallbacks. Responsive image sizes and the hero preload match the displayed width. Small screens continue to omit the hidden desktop hero. Images and fonts remain separate cacheable files rather than inlining every srcset candidate into JavaScript.
- The same sign-in photograph is served locally as a smaller WebP. Inactive sign-in tabs have stronger text contrast. The public header fits 320px screens, and the planning input has an explicit accessible label.
- Gallery and message thumbnails load lazily; historical video attachments wait until playback. Media URLs, privacy checks, originals and authorization are unchanged.
- Vendor responses negotiate Zstandard or gzip; unhashed public brand/image files have a one-day cache lifetime. Hashed assets retain their immutable lifetime. Private API responses do not receive the public image cache policy.
- The public document includes WebSite JSON-LD and complete Open Graph/social-card metadata. Sign-in and private workspaces retain their intentional noindex policy.

## Artifact measurements

| Item | Before | Optimized |
| --- | ---: | ---: |
| Initial stylesheet, uncompressed | 238,213 B | 118,914 B |
| Vendor shell JavaScript, uncompressed | about 585 KB | 196,193 B |
| Vendor shell JavaScript, gzip | about 141 KB | 52,851 B |
| 64px brand mark | 4,942 B WebP | 1,608 B AVIF |
| 128px brand mark | 14,336 B WebP | 3,087 B AVIF |
| 192px brand mark | 26,146 B WebP | 4,708 B AVIF |
| 640px hero | 13,308 B WebP | 10,018 B AVIF |
| 1200px hero | 31,480 B WebP | 23,012 B AVIF |
| Sign-in photograph | 251,611 B | 66,400 B |

Chunk sizes are not the sum of all requests for every section. A section may request its own dependencies when opened.

## Verification and reproduction

`npm test -w web` passed 36 tests. Mobile typechecking and 115 tests passed; brand synchronization preserves the existing native title, splash background and palettes. `npm run build -w web` and `npm run check:performance -w web` passed. Browser review checked desktop/mobile light and dark layouts, the 320px header, responsive image selection, sign-in navigation and local image delivery. Production CI additionally checks the authenticated dashboard and protected routes before deployment.

```powershell
npm test -w web
npm run build -w web
npm run check:performance -w web
node web/scripts/optimize-public-images.mjs
```

The image script also accepts the locally downloaded original sign-in photo as an optional argument. Its original Unsplash URL is recorded in the script; it preserves the existing photo and composition.

Audit JSON/logs, build measurements and screenshots are in the ignored `tmp/vendor-performance/` directory. Preview-only Lighthouse failures for API CORS and the SPA fallback on missing `.well-known` files do not describe production: production uses the existing API origin policy and returns 404 for absent discovery files. An ARD manifest is optional; no agent endpoints or capabilities have been invented to improve an audit score. The live robots.txt and llms.txt files already passed the fresh baseline audit.

## References

[Chrome render-blocking guidance](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources), [Tailwind explicit stylesheet sources](https://tailwindcss.com/docs/detecting-classes-in-source-files), [Tailwind static theme variables](https://tailwindcss.com/docs/preflight), [Caddy compression negotiation](https://caddyserver.com/docs/caddyfile/directives/encode).
