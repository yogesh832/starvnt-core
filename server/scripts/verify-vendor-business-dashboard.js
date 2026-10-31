// Isolated local browser/API verification. No configured database or provider is used.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'tmp/qa/vendor-business-dashboard');
const runtime = resolve(root, 'tmp/vendor-os-test-runtime');
mkdirSync(output, { recursive: true }); mkdirSync(runtime, { recursive: true });
Object.assign(process.env, {
  NODE_ENV: 'test', STARVNT_ENV_FILE: resolve(runtime, 'no-provider.env'), TEMP: runtime, TMP: runtime,
  CLIENT_ORIGINS: 'http://127.0.0.1:5197', VITE_API_URL: 'http://127.0.0.1:4117',
  COOKIE_SECURE: 'false', COOKIE_DOMAIN: '', JWT_EXTERNAL_SECRET: crypto.randomUUID(), JWT_ADMIN_SECRET: crypto.randomUUID(),
});
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { chromium } = await import('../../tmp/vendor-os-tools/node_modules/playwright/index.mjs');
const express = (await import('express')).default;
const { externalConn, adminConn } = await import('../src/db/index.js');
const { createApp } = await import('../src/app.js');
const { ExternalUser } = await import('../src/external/models/ExternalUser.js');
const { VendorOrganization } = await import('../src/external/models/VendorOrganization.js');
const { VendorService } = await import('../src/external/models/VendorService.js');
const { VendorCapability } = await import('../src/external/models/VendorCapability.js');
const { VendorFinancialProfile } = await import('../src/external/models/VendorFinancialProfile.js');
const { OperatingLocation } = await import('../src/external/models/OperatingLocation.js');
const { ServiceCoverage } = await import('../src/external/models/ServiceCoverage.js');
const { PortfolioItem } = await import('../src/external/models/PortfolioItem.js');
const { Opportunity } = await import('../src/external/models/Opportunity.js');
const { Quote } = await import('../src/external/models/Quote.js');
const { CoreBooking } = await import('../src/admin/models/CoreBooking.js');
const { FinanceLedgerEntry } = await import('../src/admin/models/FinanceLedgerEntry.js');
const { VendorReview } = await import('../src/external/models/VendorReview.js');
const bcrypt = await import('bcryptjs');
const report = { environment: 'Ephemeral local MongoDB, real Express API and Vite app, headless Chrome; synthetic fixtures only', checks: [], reconciliation: [], screenshots: [] };
let mongo, api, vite, browser;
const now = new Date();
const ago = days => new Date(now.getTime() - days * 86400000);
const dateOnly = value => value.toISOString().slice(0, 10);
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); report.checks.push({ name, passed: true }); }
try {
  mongo = await MongoMemoryServer.create({ instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] } });
  await Promise.all([externalConn.openUri(mongo.getUri('vendor_business_browser_external')), adminConn.openUri(mongo.getUri('vendor_business_browser_admin'))]);
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  const password = crypto.randomUUID();
  const owner = await ExternalUser.create({ email: 'vendor-dashboard@example.test', fullName: 'QA Vendor', accountType: 'VENDOR', passwordHash: await bcrypt.default.hash(password, 4) });
  const customer = await ExternalUser.create({ email: 'customer-dashboard@example.test', fullName: 'Synthetic Customer', accountType: 'CUSTOMER' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'QA Business Dashboard', category: 'Photography', location: 'Pune', isProfileCompleted: true, status: 'ACTIVE', activationState: 'ACTIVE', activationReview: { status: 'APPROVED' }, workingHours: { Mon: { isOpen: true, hours: '9 AM - 6 PM' } } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const service = await VendorService.create({ vendor: vendor._id, name: 'QA Photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 20000 } });
  await VendorCapability.create({ vendor: vendor._id, vendorService: service._id, teamSize: 2, simultaneousEventLimit: 1 });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await OperatingLocation.create({ vendor: vendor._id, label: 'QA Studio', city: 'Pune' });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: service._id, coverageType: 'CITY', city: 'Pune' });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: 'https://example.test/qa.jpg' });
  const enquiryBase = { vendor: vendor._id, customer: customer._id, vendorService: service._id, serviceName: service.name, eventDate: dateOnly(ago(-7)) };
  const matured = await Opportunity.create({ ...enquiryBase, status: 'RESPONDED', createdAt: ago(45), slaResponseTimeMs: null });
  const actionable = await Opportunity.create({ ...enquiryBase, status: 'NEW', slaExpiresAt: ago(1), createdAt: ago(2) });
  const quoteBase = { ...enquiryBase, pricingBreakdown: { basePrice: 20000, totalAmount: 20000 } };
  const matureQuote = await Quote.create({ ...quoteBase, opportunity: matured._id, status: 'APPROVED', createdAt: ago(44), history: [{ toStatus: 'SUBMITTED', timestamp: ago(44) }, { toStatus: 'APPROVED', timestamp: ago(43) }] });
  const draft = await Quote.create({ ...quoteBase, opportunity: actionable._id, status: 'DRAFT' });
  const bookingBase = { vendorId: vendor._id, customerId: customer._id, serviceName: service.name, eventDate: dateOnly(ago(-7)), totalAmount: 20000, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED', paymentSummary: { paidAmount: 6000, providerPaymentId: 'qa-current-payment' }, taxSummary: { invoiceNumber: 'QA-current-invoice', vendorPayable: 17000 } };
  const contract = await CoreBooking.create({ ...bookingBase, quoteId: String(draft._id), createdAt: ago(2) });
  const matureContract = await CoreBooking.create({ ...bookingBase, quoteId: String(matureQuote._id), paymentSummary: { paidAmount: 6000, providerPaymentId: 'qa-old-payment' }, createdAt: ago(42), eventDate: dateOnly(ago(1)), executionStatus: 'COMPLETION_VERIFIED', validationAudit: { verifiedAt: ago(1) } });
  await FinanceLedgerEntry.create({ booking: matureContract._id, vendorId: vendor._id, customerId: customer._id, type: 'SETTLEMENT_RELEASE', debitAccount: 'Vendor Payable', creditAccount: 'Settlement Bank Clearing', amount: 17000, currency: 'INR', postedAt: ago(2), idempotencyKey: 'qa-release' });
  await VendorReview.create({ vendor: vendor._id, customerName: 'Synthetic unverified reviewer', rating: 5, reviewText: 'Unverified QA review', isVerified: false, status: 'PUBLISHED' });
  api = createApp().listen(4117, '127.0.0.1');
  await new Promise((done, reject) => { api.once('listening', done); api.once('error', reject); });
  const login = await fetch('http://127.0.0.1:4117/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: owner.email, password, accountType: 'VENDOR' }) });
  check('Real local password API sign-in', login.status, 200);
  const { accessToken } = await login.json();
  const before = performance.now();
  const result = await fetch('http://127.0.0.1:4117/api/vendor/dashboard?periodDays=30', { headers: { Authorization: `Bearer ${accessToken}` } });
  const { dashboard } = await result.json();
  report.performance = { fixtureDashboardRequestMs: Math.round(performance.now() - before), meaning: 'Single local fixture request; not a production benchmark' };
  for (const [metric, actual, expected, source] of [
    ['Actionable enquiries', dashboard.snapshot.actionableEnquiries, 1, [String(actionable._id)]],
    ['Draft quotes', dashboard.snapshot.pendingQuotes, 1, [String(draft._id)]],
    ['Mature cohort enquiries', dashboard.sales.enquiries, 1, [String(matured._id)]],
    ['Mature converted enquiries', dashboard.sales.convertedEnquiries, 1, [String(matureContract._id)]],
    ['Mature conversion percentage', dashboard.sales.conversionPercent, 100, [String(matured._id), String(matureContract._id)]],
    ['Contract value in selected period', dashboard.financial.bookingValue, 20000, [String(contract._id)]],
    ['Vendor payable', dashboard.financial.contractedAmount, 17000, [String(contract._id)]],
    ['Verified payments', dashboard.financial.verifiedPayments, 6000, [String(contract._id)]],
    ['Outstanding', dashboard.financial.outstanding, 14000, [String(contract._id)]],
    ['Ledger releases posted in period', dashboard.financial.settlementReleased, 17000, [String(matureContract._id)]],
    ['Verified review count', dashboard.quality.reviewCount, 0, []],
  ]) { check(metric, actual, expected); report.reconciliation.push({ metric, source, expected, apiValue: actual, difference: actual - expected }); }
  check('Unverified five-star review does not produce a verified rating', dashboard.quality.rating, null);
  check('Readiness uses authorized approval', dashboard.readiness.matchingEligible, true);
  const staticApp = express();
  const site = resolve(output, 'site');
  staticApp.use(express.static(site));
  staticApp.get('*', (req, res) => res.sendFile(resolve(site, 'index.html')));
  const staticServer = staticApp.listen(5197, '127.0.0.1');
  await new Promise((done, reject) => { staticServer.once('listening', done); staticServer.once('error', reject); });
  vite = { close: () => new Promise(done => staticServer.close(done)) };
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu', '--renderer-process-limit=2'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(token => localStorage.setItem('starvnt_external_access_token', token), accessToken);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  report.requests = [];
  page.on('response', response => { if (response.url().includes('127.0.0.1')) report.requests.push({ url: response.url(), status: response.status() }); });
  const pageErrors = []; report.browserErrors = pageErrors;
  page.on('pageerror', error => pageErrors.push(error.message));
  report.consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:5197/vendor/dashboard');
  await page.getByRole('heading', { name: 'Business Health Snapshot', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Your business goals', exact: true }).waitFor();
  check('Desktop document has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const financeSection = page.getByRole('heading', { name: 'Financial Clarity', exact: true }).locator('..');
  check('Displayed contract value matches authoritative API value', await financeSection.getByRole('link').filter({ hasText: 'Confirmed booking value' }).getByText('₹20,000', { exact: true }).count(), 1);
  check('Displayed verified payments match authoritative API value', await financeSection.getByRole('link').filter({ hasText: 'Verified payments received' }).getByText('₹6,000', { exact: true }).count(), 1);
  check('Empty review state rendered', await page.getByText('No verified reviews yet.', { exact: true }).count(), 1);
  await page.screenshot({ path: resolve(output, 'desktop.png') }); report.screenshots.push('desktop.png');
  for (const [heading, filename] of [['Business Health Snapshot', 'desktop-health.png'], ['Financial Clarity', 'desktop-finance.png'], ['Your business goals', 'desktop-goals.png']]) { await page.getByRole('heading', { name: heading, exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, filename) }); report.screenshots.push(filename); }
  await page.getByLabel('Goal name', { exact: true }).focus();
  await page.keyboard.press('Tab');
  check('Goal editor keyboard order reaches the metric selector', await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Goal metric');
  await page.getByLabel('Goal name', { exact: true }).fill('QA confirmed bookings');
  await page.getByLabel('Goal metric', { exact: true }).selectOption('CONFIRMED_BOOKINGS');
  await page.getByLabel('Target (record count)', { exact: true }).fill('2');
  await page.getByLabel('Start date (UTC)', { exact: true }).fill(dateOnly(ago(7)));
  await page.getByLabel('End date (inclusive, UTC)', { exact: true }).fill(dateOnly(ago(-7)));
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await page.getByText('1 / 2 (50%)', { exact: true }).waitFor();
  report.checks.push({ name: 'Goal creation measures real Core period records: 1/2 (50%)', passed: true });
  await page.reload(); await page.getByText('1 / 2 (50%)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Target (record count)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('1 / 1 (100%)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await page.getByRole('button', { name: 'Mark completed', exact: true }).waitFor({ state: 'detached' });
  report.checks.push({ name: 'Goal reload persistence, pause, resume, edit, and completion', passed: true });
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText('No goals configured yet.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Open record', exact: true }).first().click();
  await page.waitForURL(`**/vendor/enquiries?record=${actionable._id}`);
  await page.getByRole('button', { name: /Respond & Quote|Revise \/ Update Offer/i }).first().waitFor();
  report.checks.push({ name: 'Action deep-link opens authorized enquiry detail', passed: true });
  await page.goto(`http://127.0.0.1:5197/vendor/quotes?record=${draft._id}`);
  await page.getByRole('button', { name: /close/i }).first().waitFor();
  report.checks.push({ name: 'Quote action opens existing quote detail', passed: true });
  await page.goto(`http://127.0.0.1:5197/vendor/bookings?record=${contract._id}`);
  await page.getByRole('button', { name: new RegExp(contract.bookingReference) }).waitFor();
  await page.getByRole('button', { name: 'Start Service (Check-in)', exact: true }).waitFor();
  report.checks.push({ name: 'Booking action opens existing booking module', passed: true });
  await page.goto('http://127.0.0.1:5197/vendor/dashboard');
  await page.getByRole('heading', { name: 'Business Health Snapshot', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('aside')).visibility === 'hidden');
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('aside')).visibility === 'hidden');
  report.checks.push({ name: 'Mobile navigation opens, closes and hides off-screen controls from keyboard focus', passed: true });
  check('Business sections fit the mobile viewport', await page.locator('section[aria-labelledby^="business-"]').evaluateAll(sections => sections.every(section => { const box = section.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1 && section.scrollWidth <= section.clientWidth + 1; })), true);
  check('Mobile document has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('heading', { name: 'Business Health Snapshot', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'mobile.png') }); report.screenshots.push('mobile.png');
  await page.getByRole('heading', { name: 'Your business goals', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'mobile-goals.png') }); report.screenshots.push('mobile-goals.png');
  await page.route('**/api/vendor/dashboard?*', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /server|wrong|failed|unavailable|fetch/i }).first().waitFor();
  check('Failed overview removes business values instead of displaying zeros', await page.getByRole('heading', { name: 'Business Health Snapshot', exact: true }).count(), 0);
  await page.getByRole('alert').filter({ hasText: /server|wrong|failed|unavailable|fetch/i }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'recoverable-error-mobile.png') }); report.screenshots.push('recoverable-error-mobile.png');
  await page.unroute('**/api/vendor/dashboard?*');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('heading', { name: 'Business Health Snapshot', exact: true }).waitFor();
  report.checks.push({ name: 'Network failure is explicit and Retry restores real API data', passed: true });
  check('No browser JavaScript errors', pageErrors, []);
  check('No unexpected console errors', report.consoleErrors.filter(message => !message.includes('net::ERR_FAILED')), []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message; process.exitCode = 1;
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) { await failedPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {}); report.pageText = (await failedPage.locator('body').innerText().catch(() => '')).slice(-5000); report.html = (await failedPage.content()).slice(-6000); report.url = failedPage.url(); }
} finally {
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); await vite?.close();
  if (api) await new Promise(done => api.close(done));
  await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failure: report.failure, report: resolve(output, 'report.json') }));
}
