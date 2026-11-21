import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.env.STARVNT_PERFORMANCE_DIST
  ? resolve(process.env.STARVNT_PERFORMANCE_DIST)
  : fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const find = expression => {
  const file = assets.find(name => expression.test(name));
  assert.ok(file, `Missing built asset: ${expression}`);
  return join(dist, 'assets', file);
};
const initialCss = find(/^index-.*\.css$/);
const initialJs = find(/^index-.*\.js$/);
const vendorJs = find(/^VendorPortal-.*\.js$/);
const workspaceCss = find(/^workspace-.*\.css$/);
// Responsive standalone photos and official brand assets remain cacheable.
for (const name of ['brand-mark-64', 'brand-mark-128', 'brand-mark-192']) {
  find(new RegExp(`^${name}-.*\\.avif$`));
}
const heroPhoto = find(/^partner-hero-1536-.*\.webp$/);
const mobileHero = find(/^partner-hero-768-.*\.webp$/);
const venuePhoto = find(/^partner-venue-1536-.*\.webp$/);
find(/^partner-venue-768-.*\.webp$/);
assert.ok(statSync(heroPhoto).size < 250_000, 'Hero exceeds optimized photo budget.');
assert.ok(statSync(mobileHero).size < 100_000, 'Mobile hero exceeds optimized photo budget.');
assert.ok(!assets.some(name => /^partner-landing-approved-reference-/.test(name)), 'Full-page reference must not be downloaded by the live landing.');
for (const [file, limit] of [[initialCss, 130_000], [initialJs, 225_000], [vendorJs, 250_000]]) {
  assert.ok(statSync(file).size <= limit, `${file} exceeds its reviewed delivery budget (${limit} bytes).`);
}

// A theme referenced by a later stylesheet must retain all its variables.
// Otherwise splitting utilities can silently remove dashboard colors/sizing.
const common = readFileSync(initialCss, 'utf8');
const workspace = readFileSync(workspaceCss, 'utf8');
const definitions = new Set(Array.from(common.matchAll(/(--[\w-]+)\s*:/g), match => match[1]));
const references = new Set(Array.from(workspace.matchAll(/var\((--[\w-]+)/g), match => match[1]));
for (const token of references) {
  if (/^--(color-|text-|container-|breakpoint-|font-weight-|radius-|shadow-|blur-|ease-|animate-)/.test(token)) {
    assert.ok(definitions.has(token), `Deferred workspace has an undefined theme token: ${token}`);
  }
}

const publicStyles = Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g), match => match[1]);
assert.equal(publicStyles.length, 1, 'Public pages must not eagerly load workspace styles.');
assert.ok(!publicStyles.some(url => url.includes('workspace-')));
for (const source of Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g), match => match[1])) {
  assert.ok(statSync(resolve(dist, `.${source}`)).isFile(), `Broken production asset URL: ${source}`);
}
const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || 'null');
assert.equal(schema?.['@type'], 'WebSite');
assert.equal(schema?.url, 'https://vendor.starvnt.com/');

console.log(JSON.stringify({
  initialCss: { bytes: statSync(initialCss).size, gzipBytes: gzipSync(common).length },
  initialJs: { bytes: statSync(initialJs).size, gzipBytes: gzipSync(readFileSync(initialJs)).length },
  vendorShellJs: { bytes: statSync(vendorJs).size, gzipBytes: gzipSync(readFileSync(vendorJs)).length },
  landingPhotos: { heroBytes: statSync(heroPhoto).size, mobileHeroBytes: statSync(mobileHero).size, venueBytes: statSync(venuePhoto).size, independentlyCacheable: true },
  themeReferencesChecked: references.size,
  publicStylesheets: publicStyles.length,
  status: 'PASS',
}, null, 2));
