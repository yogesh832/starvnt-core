// Synthetic local browser verification. No configured database or live provider.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const output = resolve('tmp/qa/booking-workflow');
mkdirSync(output, { recursive: true });
Object.assign(process.env, { NODE_ENV: 'test', STARVNT_ENV_FILE: resolve(output, 'no-provider.env'), CLIENT_ORIGINS: 'http://127.0.0.1:5198', COOKIE_SECURE: 'false', JWT_EXTERNAL_SECRET: crypto.randomUUID(), JWT_ADMIN_SECRET: crypto.randomUUID() });
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { chromium } = await import('../../tmp/vendor-os-tools/node_modules/playwright/index.mjs');
const express = (await import('express')).default;
const { adminConn, externalConn } = await import('../src/db/index.js');
const { createApp } = await import('../src/app.js');
const { ExternalUser } = await import('../src/external/models/ExternalUser.js');
const { ExternalSession } = await import('../src/external/models/ExternalSession.js');
const { VendorOrganization } = await import('../src/external/models/VendorOrganization.js');
const { AdminUser } = await import('../src/admin/models/AdminUser.js');
const { AdminSession } = await import('../src/admin/models/AdminSession.js');
const { signExternalAccessToken } = await import('../src/external/utils/tokens.js');
const { signAdminAccessToken } = await import('../src/admin/utils/tokens.js');
const { CustomerEvent } = await import('../src/customer/models/index.js');
const { CoreBooking } = await import('../src/admin/models/CoreBooking.js');
const { FinanceLedgerEntry } = await import('../src/admin/models/FinanceLedgerEntry.js');
const { eventMediaStorage } = await import('../src/customer/services/eventMediaStorage.service.js');
const { acknowledgeCompletion } = await import('../src/admin/services/executionSettlement.service.js');
const report = { environment: 'Synthetic accounts, ephemeral MongoDB, local Express, built Vendor web; private storage replaced with an in-memory fixture, no live money', checks: [], browserErrors: [] };
let mongo, apiServer, siteServer, browser;
try {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('workflow_browser_external')), adminConn.openUri(mongo.getUri('workflow_browser_admin'))]);
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  const customer = await ExternalUser.create({ fullName: 'Browser Customer', email: 'workflow-customer@example.test', accountType: 'CUSTOMER' });
  const owner = await ExternalUser.create({ fullName: 'Browser Vendor', email: 'workflow-vendor@example.test', accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Browser Service Studio', category: 'Photography', status: 'ACTIVE', activationState: 'ACTIVE', activationReview: { status: 'APPROVED' } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const event = await CustomerEvent.create({ customer: customer._id, title: 'Workflow acceptance event', eventType: 'wedding', eventDate: '2027-12-01', guestCount: 125, city: 'Kolkata', status: 'booked' });
  const booking = await CoreBooking.create({ vendorId: vendor._id, customerId: customer._id, customerEvent: event._id, serviceName: 'Browser Photography', category: 'Photography', eventDate: event.eventDate, totalAmount: 1000,
    paymentStatus: 'PAYMENT_VERIFIED', paymentSummary: { paidAmount: 1000 }, executionStatus: 'SERVICE_SCHEDULED',
    financialPolicySnapshot: { version: 1, settlementCondition: 'MANUAL_APPROVAL_REQUIRED', settlementDelayDays: 0, manualFinanceAllowed: true, partialSettlementAllowed: true, partialRefundAllowed: true,
      completionRequirements: { requiredChecklist: ['Agreed deliverables'], requiredMilestones: ['coverage'], requireCheckIn: true, evidenceRequired: true, customerAcknowledgementRequired: true } } });
  const admins = await AdminUser.create([1, 2].map(i => ({ fullName: `Browser reviewer ${i}`, email: `workflow-admin${i}@example.test`, passwordHash: 'fixture-only-no-login', role: 'SUPER_ADMIN' })));
  const expiresAt = new Date(Date.now() + 3600000);
  const vendorSession = await ExternalSession.create({ user: owner._id, refreshTokenHash: crypto.randomUUID(), accountType: 'VENDOR', expiresAt });
  const adminSessions = await AdminSession.create(admins.map(admin => ({ admin: admin._id, refreshTokenHash: crypto.randomUUID(), expiresAt })));
  const uploads = new Map();
  eventMediaStorage.upload = async (eventId, actorId, prepared) => { const publicId = crypto.randomUUID(); uploads.set(publicId, prepared); return { publicId, resourceType: 'raw', mime: prepared.mime, bytes: prepared.buffer.length, format: 'pdf' }; };
  eventMediaStorage.read = async storage => new Response(uploads.get(storage.publicId).buffer, { headers: { 'content-type': storage.mime } });
  apiServer = createApp().listen(4128, '127.0.0.1');
  await new Promise((done, reject) => { apiServer.once('listening', done); apiServer.once('error', reject); });
  const staticApp = express(); staticApp.use(express.static(resolve(output, 'site'))); staticApp.get('*', (req, res) => res.sendFile(resolve(output, 'site/index.html')));
  siteServer = staticApp.listen(5198, '127.0.0.1');
  await new Promise((done, reject) => { siteServer.once('listening', done); siteServer.once('error', reject); });
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}), args: ['--disable-gpu'] });
  async function pageFor(token, admin = false) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
    await context.addInitScript(({ token, key }) => localStorage.setItem(key, token), { token, key: admin ? 'starvnt_admin_access_token' : 'starvnt_external_access_token' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.browserErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('127.0.0.1')) (report.failedRequests ||= []).push({ url: response.url(), status: response.status() }); });
    await page.goto(`http://127.0.0.1:5198/${admin ? 'admin' : 'vendor'}/execution?booking=${booking._id}`);
    try { await page.getByRole('heading', { name: 'Service execution and review', exact: true }).waitFor(); }
    catch (error) { report.pageText = (await page.locator('body').innerText()).slice(0, 4000); await page.screenshot({ path: resolve(output, 'failure.png') }); throw error; }
    return page;
  }
  async function clickAndWait(page, name, path) {
    const response = page.waitForResponse(response => response.url().includes(path) && response.request().method() === 'POST');
    const refreshed = page.waitForResponse(response => response.url().includes('/workflow/bookings/') && response.request().method() === 'GET');
    await page.getByRole('button', { name, exact: true }).click();
    const result = await response; assert.equal(result.status(), 200, await result.text());
    await page.getByRole('button', { name, exact: true }).isEnabled();
    await page.waitForFunction(() => !document.querySelector('button:disabled')?.textContent?.includes('Working'));
    // Wait for authoritative GET refresh before the next command.
    await refreshed;
  }
  const vendorPage = await pageFor(signExternalAccessToken(owner, vendorSession._id));
  await clickAndWait(vendorPage, 'Check in', '/execution');
  await clickAndWait(vendorPage, 'Start service', '/execution');
  await vendorPage.getByLabel('Action or review notes').fill('Agreed service coverage completed');
  await vendorPage.getByLabel('Milestone identifier').fill('coverage');
  await clickAndWait(vendorPage, 'Record milestone', '/execution');
  await vendorPage.getByLabel('Agreed deliverables', { exact: true }).check();
  const uploadInput = vendorPage.locator('input[type=file]').first();
  await uploadInput.setInputFiles({ name: 'completion-proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic private proof') });
  await vendorPage.getByText('completion-proof.pdf · ready to attach').waitFor();
  await clickAndWait(vendorPage, 'Submit completion evidence', '/execution');
  assert.equal((await CoreBooking.findById(booking._id)).executionStatus, 'COMPLETION_SUBMITTED');
  report.checks.push('Vendor browser check-in → start → milestone → private PDF upload → submitted, without self-verifying');
  await acknowledgeCompletion(booking._id, customer._id, { notes: 'Fixture customer reviewed evidence', idempotencyKey: crypto.randomUUID() });
  const adminPage = await pageFor(signAdminAccessToken(admins[0], adminSessions[0]._id), true);
  await adminPage.getByLabel('Action or review notes').fill('Reviewed agreed deliverables and private evidence');
  const validation = adminPage.waitForResponse(r => r.url().includes('/validate') && r.request().method() === 'POST');
  await adminPage.getByRole('button', { name: 'Verify completion', exact: true }).click();
  assert.equal((await validation).status(), 200);
  await adminPage.reload(); await adminPage.getByText('COMPLETION VERIFIED', { exact: false }).first().waitFor();
  assert.equal((await CoreBooking.findById(booking._id)).executionStatus, 'COMPLETION_VERIFIED');
  await adminPage.screenshot({ path: resolve(output, 'admin-core-review.png'), fullPage: true });
  report.checks.push('Admin browser separately validates Core completion after customer acknowledgement');
  await adminPage.getByLabel('Action or review notes').fill('Partial payout requested after Core review');
  await adminPage.getByPlaceholder('Requested amount', { exact: true }).fill('200');
  await clickAndWait(adminPage, 'Request manual finance review', '/finance');
  const checkerPage = await pageFor(signAdminAccessToken(admins[1], adminSessions[1]._id), true);
  await clickAndWait(checkerPage, 'APPROVE', '/finance/');
  await adminPage.reload(); await adminPage.getByRole('heading', { name: 'Service execution and review', exact: true }).waitFor();
  await adminPage.getByLabel('Action or review notes').fill('Bank transfer recorded with private debit advice');
  await adminPage.getByPlaceholder('Bank or provider reference').fill('BROWSER-BANK-REFERENCE');
  await adminPage.getByLabel('Evidence purpose').selectOption('FINANCE_EVIDENCE');
  await adminPage.locator('input[type=file]').first().setInputFiles({ name: 'transfer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic debit evidence') });
  await adminPage.getByText('transfer.pdf · ready to attach').waitFor();
  await clickAndWait(adminPage, 'RECORD TRANSFER', '/finance/');
  assert.equal(await FinanceLedgerEntry.countDocuments({ booking: booking._id, type: 'SETTLEMENT_RELEASE' }), 0);
  await checkerPage.reload(); await checkerPage.getByRole('heading', { name: 'Service execution and review', exact: true }).waitFor();
  await checkerPage.getByLabel('Action or review notes').fill('Independent bank statement matched the transfer');
  await checkerPage.getByPlaceholder('Bank or provider reference').fill('BROWSER-BANK-REFERENCE');
  await checkerPage.getByLabel('Evidence purpose').selectOption('FINANCE_EVIDENCE');
  await checkerPage.locator('input[type=file]').first().setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic independent statement') });
  await checkerPage.getByText('statement.pdf · ready to attach').waitFor();
  await clickAndWait(checkerPage, 'RECONCILE', '/finance/');
  assert.equal(await FinanceLedgerEntry.countDocuments({ booking: booking._id, type: 'SETTLEMENT_RELEASE' }), 1);
  assert.equal((await CoreBooking.findById(booking._id)).financeOperations[0].status, 'CONFIRMED');
  await checkerPage.screenshot({ path: resolve(output, 'admin-finance-reconciled.png'), fullPage: true });
  report.checks.push('Two Admin browser identities request, approve, record private bank evidence and independently reconcile one partial payout; typed reference alone posts nothing');
  await vendorPage.reload(); await vendorPage.getByRole('heading', { name: 'Service execution and review', exact: true }).waitFor();
  await vendorPage.screenshot({ path: resolve(output, 'vendor-execution.png'), fullPage: true });
  assert.deepEqual(report.browserErrors, []);
  report.checks.push('Vendor/Admin render the same persisted execution and independently reconciled payout');
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack; process.exitCode = 1; }
finally {
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await Promise.all([apiServer, siteServer].filter(Boolean).map(server => new Promise(done => server.close(done))));
  await Promise.all([adminConn.close(), externalConn.close()]); await mongo?.stop();
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, error: report.error, report: resolve(output, 'report.json') }));
}
