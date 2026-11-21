/** Vendor product design contract. Customer/Admin keep their own theme preferences. */
export const vendorPalette = Object.freeze({
  bg:'#10111e',card:'#1a1c2d',panel:'#151724',elevated:'#222438',input:'#121421',
  ink:'#f2f1f7',navy:'#f2f1f7',muted:'#b1afc3',line:'#323447',lineStrong:'#484a61',
  accent:'#c6b6ed',accentDark:'#664c9a',onAccent:'#ffffff',soft:'#29233e',
  action:'#7357aa',actionHover:'#8366b9',danger:'#f2a9b0',success:'#90cbb3',warning:'#d9be83',
});
export function isVendorThemeRoute(pathname,search='') {
  if (/^\/(?:customer|admin|auth-test|api|experience)(?:\/|$)/.test(pathname)) return false;
  return new URLSearchParams(search).get('as')!=='customer' && new URLSearchParams(search).get('for')!=='customer';
}
