// Isolated browser verification. Never connects to configured production data.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'tmp/qa/partner-program');
mkdirSync(output, { recursive: true });
Object.assign(process.env, { NODE_ENV: 'test', STARVNT_ENV_FILE: resolve(output, 'no-provider.env'), CLIENT_ORIGINS: 'http://127.0.0.1:5199', COOKIE_SECURE: 'false', COOKIE_DOMAIN: '', JWT_EXTERNAL_SECRET: randomUUID(), JWT_ADMIN_SECRET: randomUUID() });
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { chromium } = await import('../../tmp/vendor-os-tools/node_modules/playwright/index.mjs');
const express = (await import('express')).default;
const { externalConn, adminConn } = await import('../src/db/index.js');
const { createApp } = await import('../src/app.js');
const { ExternalUser } = await import('../src/external/models/ExternalUser.js');
const { ExternalSession } = await import('../src/external/models/ExternalSession.js');
const { VendorOrganization } = await import('../src/external/models/VendorOrganization.js');
const { signExternalAccessToken } = await import('../src/external/utils/tokens.js');
const { SEO_DRAFT_FIELDS } = await import('../src/common/vendorSeoContract.js');
let mongo, api, site, browser;
const report = { environment: 'Ephemeral local MongoDB + real API + production build; synthetic vendor only', checks: [], screenshots: [] };
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); report.checks.push(name); }
try {
  mongo = await MongoMemoryServer.create({ instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] } });
  await Promise.all([externalConn.openUri(mongo.getUri('partner_browser')), adminConn.openUri(mongo.getUri('partner_browser_admin'))]);
  const owner = await ExternalUser.create({ fullName: 'Demo Partner', email: 'partner@example.test', accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Demo Partner Studio', category: 'Photography', location: 'Pune' });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  const waitServer = server => new Promise((done, reject) => { server.once('listening', done); server.once('error', reject); });
  api = createApp().listen(4121, '127.0.0.1'); await waitServer(api);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const evidence = Object.entries({ businessName: 'Demo Partner Studio', category: 'Photography', services: 'Wedding photography', serviceArea: 'Pune' }).map(([field, value]) => ({ id: randomUUID(), field, value, sourceUrl: 'https://example.test/business', observedAt: new Date().toISOString().slice(0, 10), identityConfirmed: true, publicUseApproved: true }));
  const saved = await fetch('http://127.0.0.1:4121/api/vendor/seo', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, evidence, records: [], draft: Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(k => [k, ''])) }) });
  check('Save synthetic evidence through authenticated API', saved.status, 200);
  const staticApp = express(); staticApp.use(express.static(resolve(output, 'site'))); staticApp.get('*', (_req, res) => res.sendFile(resolve(output, 'site/index.html')));
  site = staticApp.listen(5199, '127.0.0.1'); await waitServer(site);
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(t => { localStorage.setItem('starvnt_external_access_token', t); sessionStorage.setItem('vendor_aura_setup_opened', '1'); }, token);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/vendor/partner-program', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Marketing & offers', exact: true }).waitFor();
  await page.getByLabel('Promotion code', { exact: true }).fill('NOTACODE');
  await page.getByRole('button', { name: 'Check code', exact: true }).click();
  await page.getByText('This code is not configured for the Partner program.', { exact: true }).waitFor();
  await page.getByLabel('Promotion code', { exact: true }).fill(' aura6months ');
  await page.getByRole('button', { name: 'Check code', exact: true }).click();
  await page.getByText('Code recognized — request only', { exact: true }).waitFor();
  check('Offer acknowledgement is unticked', await page.getByLabel('I understand this is an offer request pending approval, with no subscription activation or automatic billing.', { exact: true }).isChecked(), false);
  await page.getByLabel('I understand this is an offer request pending approval, with no subscription activation or automatic billing.', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit offer request', exact: true }).click();
  await page.getByText('Offer request saved. No subscription was activated.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('AURA6MONTHS · REQUESTED', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Withdraw offer request', exact: true }).click();
  await page.getByText('Offer request withdrawn.', { exact: true }).waitFor();
  check('Persistent request can be withdrawn', await page.getByText('AURA6MONTHS · WITHDRAWN', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Terms & legal drafts', exact: true }).click();
  const legal = await (await fetch('http://127.0.0.1:4121/api/vendor/partner-program', { headers })).json();
  for (const doc of Object.values(legal.legal.documents)) {
    await page.getByRole('button', { name: doc.shortTitle, exact: true }).click();
    await page.getByRole('heading', { name: doc.title, exact: true }).waitFor();
    check(`${doc.key} draft clauses are rendered`, await page.locator('details').count(), doc.clauses.length);
  }
  await page.getByRole('button', { name: 'Download reference drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Marketing & SEO/GEO', exact: true }).click();
  await page.getByRole('link', { name: 'Open SEO & GEO growth', exact: true }).click();
  await page.getByRole('button', { name: 'Content drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Add growth suggestions from saved evidence', exact: true }).click();
  await page.getByText('9 suggestions added locally. Review in Research & audits and the roadmap, then save. Nothing was published or sent.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.getByText('Workspace saved. Any previous review has been cleared.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add growth suggestions from saved evidence', exact: true }).click();
  await page.getByText('0 suggestions added locally. Review in Research & audits and the roadmap, then save. Nothing was published or sent.', { exact: true }).waitFor();
  check('Repeated suggestions do not duplicate records or mark the saved workspace dirty', await page.getByRole('button', { name: 'Saved', exact: true }).isDisabled(), true);
  const seo = await (await fetch('http://127.0.0.1:4121/api/vendor/seo', { headers })).json();
  check('Reviewed workflow persists all private suggestion records', seo.workspace.records.length, 9);
  check('Suggestions do not publish content', seo.summary.publication, 'PRIVATE_WORKSPACE_ONLY');
  for (const [theme, width, height] of [['light', 1440, 1000], ['dark', 390, 844], ['light', 320, 740]]) {
    await page.evaluate(t => localStorage.setItem('starvnt-theme', t), theme); await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5199/vendor/partner-program', { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Marketing & offers', exact: true }).waitFor();
    check(`${theme} ${width}px has no document overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    check(`${theme} ${width}px uses requested theme`, await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    const screenshot = `partner-program-${theme}-${width}.png`; await page.screenshot({ path: resolve(output, screenshot) }); report.screenshots.push(screenshot);
  }
  check('No JavaScript page exceptions', errors, []);
  report.status = 'PASS';
} catch (e) {
  report.status = 'FAIL'; report.failure = e.message; process.exitCode = 1;
  const page = browser?.contexts()[0]?.pages()[0]; if (page) { await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {}); report.pageText = (await page.locator('body').innerText()).slice(-4000); }
} finally {
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); for (const server of [site, api]) if (server) await new Promise(done => server.close(done));
  await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failure: report.failure, output }));
}
