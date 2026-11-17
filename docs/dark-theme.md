# Dark theme

The WhatsApp references use a black canvas, charcoal cards, white text, gray secondary text and restrained blue interaction accents.

`web/src/dark-theme.css` owns the literal `--sv-*` palette. All its rules are scoped to `html.dark`; the light palette in `theme.css` is independent. Existing screen-specific dark rules use those tokens, and the shared compatibility rules cover legacy utility colors. Photo overlays stay transparent, modal scrims stay translucent, and brand/image pixels are preserved. Status colors keep their success, warning and error meanings.

`mobile/scripts/sync-brand.mjs` reads the same literals and generates `mobile/src/brand.generated.json`. Run `npm run sync:brand -w mobile` after changing the palette. The existing mobile start/export lifecycle also synchronizes it. `Theme.tsx`, `AuraTheme.tsx`, authentication components and public/customer surfaces consume the palette. Keep action fills separate from lighter link colors; white button labels use the darker action blue.

Keep light-mode constants and conditional light branches unchanged when extending the theme. New surfaces should use shared tokens, not new hardcoded navy or violet colors. Test theme switching, readable disabled/placeholder states, focus rings, dialogs, dropdowns, responsive layouts and both products. Test web builds and mobile typechecking/exports independently in the corresponding development worktrees.

Default text/card contrast is 14.59:1; secondary text/card is 7.76:1; blue links/card is 6.26:1; white/action-blue is 5.17:1. Image-backed text needs separate visual checks.
