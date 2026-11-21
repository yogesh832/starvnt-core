/** Vendor product design contract. Customer/Admin keep their own theme preferences. */
export const vendorPalette = Object.freeze({
  bg:'#0b0d14',card:'#161926',panel:'#1b1e2e',elevated:'#222638',input:'#121520',
  ink:'#edf2fa',navy:'#edf2fa',muted:'#a5b1c8',line:'#262a3d',lineStrong:'#38405d',
  accent:'#818cf8',accentDark:'#6366f1',onAccent:'#ffffff',soft:'#292845',
  action:'#6051d5',actionHover:'#5142bd',danger:'#efa9bc',success:'#8bceb0',warning:'#e0c48d',
});
export function isVendorThemeRoute(pathname,search='') {
  if (/^\/vendor(?:\/|$)/.test(pathname)) return true;
  if (!/^\/(?:login|signup)\/?$/.test(pathname)) return false;
  const params = new URLSearchParams(search);
  const account = (params.get('as') || params.get('role') || params.get('type') || 'vendor').trim().toLowerCase();
  return account === 'vendor';
}

/** Runtime authority: legacy dark styles cannot substitute their grey palette. */
export const vendorThemeVariables = Object.freeze({
  '--sv-bg':vendorPalette.bg,'--sv-surface':vendorPalette.card,'--sv-panel':vendorPalette.panel,
  '--sv-elevated':vendorPalette.elevated,'--sv-input':vendorPalette.input,'--sv-ink':vendorPalette.ink,
  '--sv-muted':vendorPalette.muted,'--sv-border':vendorPalette.line,'--sv-border-strong':vendorPalette.lineStrong,
  '--sv-link':vendorPalette.accent,'--sv-action':vendorPalette.action,'--sv-action-hover':vendorPalette.actionHover,
  '--sv-on-action':vendorPalette.onAccent,'--sv-selected':vendorPalette.soft,
  '--sv-danger':vendorPalette.danger,'--sv-success':vendorPalette.success,
  '--color-primary':vendorPalette.accent,'--color-primary-dark':vendorPalette.actionHover,
  '--color-primary-soft':vendorPalette.soft,'--color-navy':vendorPalette.ink,'--color-navy-deep':vendorPalette.bg,
  '--color-lavender':vendorPalette.bg,'--color-ink':vendorPalette.ink,'--color-muted':vendorPalette.muted,
});
