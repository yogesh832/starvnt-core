# Development shortcut inventory

User preference: Quick Auto-Fill is for development only. When the user requests "remove all dev shortcuts", include this helper and the other test entry points below; do not leave their write handlers behind after removing the buttons.

## Quick Auto-Fill

- Vendor dashboard button and `handleQuickCompleteProfile`: `web/src/pages/vendor/pages/DashboardHome.jsx`.
- Strict gate: `web/src/lib/devShortcuts.js` (`DEV_SHORTCUTS_ENABLED`). Requires Vite development mode. `VITE_ENABLE_DEV_TOOLS=true` cannot enable this helper in production; setting it to false also hides it in development.
- Both the button and handler are gated. It uses ordinary profile, services, capability, location, coverage and portfolio APIs rather than a dedicated auto-fill server endpoint. Those APIs also support real manual setup.
- The helper generates example data; do not execute it when verifying visibility.
- Removal: remove the button, handler, helper-only state and unused gate/import. Check production JS output for its label and sample-data strings.

## Other entry points to audit in the requested future cleanup

- Web `/auth-test`, `/test-auth`, `/api/test` routes and their developer workbench links (`web/src/App.jsx` and auth pages).
- External and admin dev-auth endpoints and reseed utilities; `ENABLE_DEV_TOOLS` / `config.enableDevTools` gates.
- Native Quick Test Auth entries and test account screens.
- Development/master OTP bypasses in authentication services.
- Demo autofill / sample project actions in portfolio and setup pages.

This is a cleanup inventory, not a claim that every existing dev shortcut is now disabled. Only Quick Auto-Fill is changed by the current development-only request. Preserve normal signup, profile editing and production operational APIs during cleanup.
