import test from 'node:test';
import assert from 'node:assert/strict';
import { isVendorThemeRoute, vendorPalette } from '../../shared/vendorTheme.js';
import { applyVendorTheme } from '../src/lib/vendorThemeRuntime.js';

test('vendor signup, login and deep links get the theme without changing public/customer/admin routes',()=>{
  for(const [path,query] of [['/vendor/quotes',''],['/signup','?as=vendor&next=%2Fvendor'],['/login','?role=VENDOR'],['/signup/','?type=%20vendor%20'],['/login','']])assert.equal(isVendorThemeRoute(path,query),true);
  for(const [path,query] of [['/',''],['/login','?as=customer'],['/signup','?role=customer'],['/admin/login',''],['/customer/events',''],['/vendor-profile','']])assert.equal(isVendorThemeRoute(path,query),false);
});

test('leaving Vendor OS restores existing inline preferences and removes vendor-only overrides',()=>{
  const values=new Map([['--sv-bg',['#abc','important']],['--unrelated',['preserved','']]]);
  const root={style:{getPropertyValue:key=>values.get(key)?.[0]||'',getPropertyPriority:key=>values.get(key)?.[1]||'',setProperty:(key,value,priority='')=>values.set(key,[value,priority]),removeProperty:key=>values.delete(key)}};
  const original=new Map(values);
  const restore=applyVendorTheme(root);
  assert.notDeepEqual(values,original);
  restore();
  assert.deepEqual(values,original);
});

const luminance=hex=>{
  const c=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('vendor text, placeholders and primary controls retain readable contrast across dark surfaces',()=>{
  for(const surface of ['bg','card','panel','elevated','input'])for(const text of ['ink','muted','accent'])assert.ok(contrast(vendorPalette[text],vendorPalette[surface])>=4.5,`${text} on ${surface}`);
  for(const action of ['action','actionHover'])assert.ok(contrast(vendorPalette.onAccent,vendorPalette[action])>=4.5,`primary text on ${action}`);
  assert.ok(contrast(vendorPalette.lineStrong,vendorPalette.input)>=3,'input boundary');
});
