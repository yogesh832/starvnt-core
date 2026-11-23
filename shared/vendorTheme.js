/** Vendor product design contract. Customer/Admin keep their own theme preferences. */
export const vendorPalette = Object.freeze({
  bg: '#0b0d14', card: '#161926', panel: '#1b1e2e', elevated: '#222638', input: '#121522',
  ink: '#edf2fa', navy: '#edf2fa', muted: '#a5b1c8', line: '#262a3d', lineStrong: '#5b6794',
  accent: '#a5b4fc', accentDark: '#4338ca', onAccent: '#ffffff', soft: '#1e2238',
  action: '#5a4bd1', actionHover: '#4f46e5', danger: '#f43f5e', success: '#10b981', warning: '#f59e0b',
});

export function isVendorThemeRoute(pathname, search = '') {
  if (/^\/vendor(?:\/|$)/.test(pathname)) return true;
  if (!/^\/(?:login|signup)\/?$/.test(pathname)) return false;
  const params = new URLSearchParams(search);
  const account = (params.get('as') || params.get('role') || params.get('type') || 'vendor').trim().toLowerCase();
  return account === 'vendor';
}

/** Runtime authority: deep space navy & midnight bluish palette across all vendor surfaces. */
export const vendorThemeVariables = Object.freeze({
  '--sv-bg': vendorPalette.bg, '--sv-surface': vendorPalette.card, '--sv-panel': vendorPalette.panel,
  '--sv-elevated': vendorPalette.elevated, '--sv-input': vendorPalette.input, '--sv-ink': vendorPalette.ink,
  '--sv-muted': vendorPalette.muted, '--sv-border': vendorPalette.line, '--sv-border-strong': vendorPalette.lineStrong,
  '--sv-link': vendorPalette.accent, '--sv-action': vendorPalette.action, '--sv-action-hover': vendorPalette.actionHover,
  '--sv-on-action': vendorPalette.onAccent, '--sv-selected': vendorPalette.soft,
  '--sv-danger': vendorPalette.danger, '--sv-success': vendorPalette.success,
  '--color-primary': vendorPalette.action, '--color-primary-dark': vendorPalette.actionHover,
  '--color-primary-soft': vendorPalette.soft, '--color-navy': vendorPalette.ink, '--color-navy-deep': vendorPalette.bg,
  '--color-lavender': vendorPalette.bg, '--color-ink': vendorPalette.ink, '--color-muted': vendorPalette.muted,
});
