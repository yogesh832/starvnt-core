/** Vendor product design contract. Customer/Admin keep their own theme preferences. */
export const vendorPalette = Object.freeze({
  bg:'#0e1020',card:'#29223f',panel:'#1b1b32',elevated:'#392b50',input:'#17172c',
  ink:'#f5f0fc',navy:'#f5f0fc',muted:'#c7bbd8',line:'#544164',lineStrong:'#8c729d',
  accent:'#d8b8f4',accentDark:'#62348a',onAccent:'#ffffff',soft:'#342342',
  action:'#7649a9',actionHover:'#8759b9',danger:'#efa9bc',success:'#8bceb0',warning:'#e0c48d',
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
