/** Vendor product design contract. Customer/Admin keep their own theme preferences. */
export const vendorPalette = Object.freeze({
  bg:'#0e1020',card:'#211e35',panel:'#17182b',elevated:'#2b2542',input:'#141526',
  ink:'#f5f0fc',navy:'#f5f0fc',muted:'#bdb2ce',line:'#433852',lineStrong:'#655176',
  accent:'#d8b8f4',accentDark:'#62348a',onAccent:'#ffffff',soft:'#342342',
  action:'#7649a9',actionHover:'#8759b9',danger:'#efa9bc',success:'#8bceb0',warning:'#e0c48d',
});
export function isVendorThemeRoute(pathname,search='') {
  if (/^\/vendor(?:\/|$)/.test(pathname)) return true;
  if (!/^\/(?:login|signup)\/?$/.test(pathname)) return false;
  const params = new URLSearchParams(search);
  const account = (params.get('as') || params.get('role') || params.get('type') || 'vendor').toLowerCase();
  return account === 'vendor';
}
