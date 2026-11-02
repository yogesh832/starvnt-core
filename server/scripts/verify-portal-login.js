// Isolated browser verification: synthetic accounts, temporary MongoDB, no provider calls.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const surface = process.env.PORTAL_QA_SURFACE;
assert.ok(['CUSTOMER', 'VENDOR'].includes(surface), 'Set PORTAL_QA_SURFACE');
const output = resolve(root, `tmp/qa/portal-login/${surface.toLowerCase()}`);
mkdirSync(output, { recursive: true });
const runtime = resolve(root, 'tmp/vendor-os-test-runtime'); mkdirSync(runtime, { recursive: true });
Object.assign(process.env, { NODE_ENV: 'test', STARVNT_ENV_FILE: resolve(runtime, 'no-provider.env'), TEMP: runtime, TMP: runtime,
  CLIENT_ORIGINS: 'http://127.0.0.1:5198', JWT_EXTERNAL_SECRET: crypto.randomUUID(), JWT_ADMIN_SECRET: crypto.randomUUID(), COOKIE_SECURE: 'false', COOKIE_DOMAIN: '' });
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { chromium } = await import('../../tmp/vendor-os-tools/node_modules/playwright/index.mjs');
const express = (await import('express')).default;
const { externalConn, adminConn } = await import('../src/db/index.js');
const { createApp } = await import('../src/app.js');
const { ExternalUser } = await import('../src/external/models/ExternalUser.js');
const { ExternalSession } = await import('../src/external/models/ExternalSession.js');
const { VendorOrganization } = await import('../src/external/models/VendorOrganization.js');
const { hashPassword } = await import('../src/external/utils/password.js');
let mongo, api, frontend, browser;
const checks = [], errors = [], consoleErrors = [];
const wrong = surface === 'CUSTOMER' ? 'VENDOR' : 'CUSTOMER';
const label = type => type === 'VENDOR' ? 'vendor' : 'customer';
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS: ' + name); }
try {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('portal_browser_external')), adminConn.openUri(mongo.getUri('portal_browser_admin'))]);
  await Promise.all(Object.values(externalConn.models).map(model => model.init()));
  const password = 'BrowserPortal42!';
  const passwordHash = await hashPassword(password);
  const users = {};
  for (const type of ['CUSTOMER', 'VENDOR']) {
    users[type] = await ExternalUser.create({ email: `${label(type)}@portal-browser.test`, fullName: `Synthetic ${label(type)}`, accountType: type, passwordHash });
    if (type === 'VENDOR') {
      const org = await VendorOrganization.create({ owner: users[type]._id, businessName: 'Synthetic portal studio', category: 'Photography', location: 'Delhi', isProfileCompleted: true, status: 'ACTIVE', activationState: 'ACTIVE', activationReview: { status: 'APPROVED' } });
      users[type].vendorOrganization = org._id; await users[type].save();
    }
  }
  api = createApp().listen(4118, '127.0.0.1');
  const web = express();
  const site = resolve(process.env.PORTAL_QA_SITE || resolve(output, 'site'));
  web.use(express.static(site)); web.get('*', (_req, res) => res.sendFile(resolve(site, 'index.html')));
  frontend = web.listen(5198, '127.0.0.1');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const context = await browser.newContext();
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:5198/login?as=${label(wrong)}&next=/${label(wrong)}`);
  await page.getByRole('heading', { name: surface === 'VENDOR' ? 'Vendor Sign in' : 'Sign in to STARVNT', exact: true }).waitFor();
  check('Role query cannot change the product login surface', await page.getByRole('button', { name: surface === 'VENDOR' ? 'Customer' : 'Vendor', exact: true }).count(), 0);
  await page.locator('input[type=email]').fill(users[wrong].email);
  const response = page.waitForResponse(r => r.url().endsWith('/auth/otp/email/send'));
  await page.getByRole('button', { name: 'Send OTP to Email', exact: true }).click();
  check('Wrong-portal email sign-in is rejected by the real backend', (await response).status(), 403);
  await page.getByRole('alert').getByText(new RegExp(`registered as a ${label(wrong)}`)).waitFor();
  const link = page.getByRole('link', { name: `Go to ${label(wrong)} dashboard login`, exact: false });
  check('Error includes the correct dashboard login link', await link.getAttribute('href'), `https://${label(wrong)}.starvnt.com/login`);
  check('Wrong login does not persist a browser token', await page.evaluate(() => localStorage.getItem('starvnt_external_access_token')), null);
  check('Wrong login does not create a session', await ExternalSession.countDocuments(), 0);
  await page.screenshot({ path: resolve(output, 'wrong-portal-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await link.scrollIntoViewIfNeeded();
  check('Error and link remain available on a mobile viewport', await link.isVisible(), true);
  await page.screenshot({ path: resolve(output, 'wrong-portal-mobile.png'), fullPage: true });
  await context.close();
  for (const type of [wrong, surface]) {
    const login = await fetch('http://127.0.0.1:4118/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: users[type].email, password, accountType: type }) });
    assert.equal(login.status, 200); const data = await login.json();
    const saved = await browser.newContext();
    await saved.addInitScript(token => localStorage.setItem('starvnt_external_access_token', token), data.accessToken);
    const tab = await saved.newPage(); tab.setDefaultTimeout(12000); tab.on('pageerror', error => errors.push(error.message)); tab.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    const calls = []; tab.on('request', req => calls.push(req.url()));
    await tab.goto(`http://127.0.0.1:5198/${label(surface)}`);
    if (type === wrong) {
      await tab.getByRole('link', { name: `Go to ${label(wrong)} dashboard login`, exact: false }).waitFor();
      check('Saved opposite-role identity is cleared without converting it', await tab.evaluate(() => localStorage.getItem('starvnt_external_access_token')), null);
      check('Restore never requests a surface conversion', calls.some(url => url.endsWith('/auth/switch-surface')), false);
    } else {
      if (surface === 'VENDOR') await tab.getByRole('link', { name: 'Dashboard', exact: true }).first().waitFor();
      else await tab.getByRole('button', { name: 'My Events', exact: true }).first().waitFor();
      check('Matching saved identity still mounts its own dashboard', await tab.getByRole('heading', { name: 'We ran into an unexpected hiccup', exact: true }).count(), 0);
    }
    await saved.close();
  }
  check('Browser journeys have no JavaScript exceptions', errors, []);
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ surface, status: 'PASS', checks, errors }, null, 2));
  console.log(JSON.stringify({ surface, status: 'PASS', checks: checks.length, report: resolve(output, 'report.json') }));
} finally {
  if (browser) {
    const pages = [];
    for (const context of browser.contexts()) for (const page of context.pages()) {
      pages.push({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 10000) });
      await page.screenshot({ path: resolve(output, `debug-${pages.length}.png`), fullPage: true });
    }
    writeFileSync(resolve(output, 'debug.json'), JSON.stringify({ checks, errors, consoleErrors, pages }, null, 2));
  }
  await browser?.close();
  if (api) { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
  if (frontend) { frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve)); }
  await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop();
}
