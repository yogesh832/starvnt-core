// DEV_SHORTCUT: never enable production shortcuts through a public environment override.
// Inventory and removal instructions: /DEV_SHORTCUTS.md
export const DEV_SHORTCUTS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_TOOLS !== 'false';
