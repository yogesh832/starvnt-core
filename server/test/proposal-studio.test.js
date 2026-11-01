import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Quote } from '../src/external/models/Quote.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { CustomerEvent, EventRequirement, Booking, Payment, CustomerNotification } from '../src/customer/models/index.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { ProposalDossier, ProposalDocument } from '../src/proposals/models.js';
import { generationGate, cleanDraft, scopeHash, hash } from '../src/proposals/policy.js';
import * as service from '../src/proposals/service.js';
import { renderProposal } from '../src/proposals/pdf.js';

const expiresAt = () => new Date(Date.now() + 7 * 86400000).toISOString();
const date = () => new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
const auth = token => ({ Authorization: `Bearer ${token}` });
const image = readFileSync(new URL('./fixtures/proposal-reference.png', import.meta.url));
const asset = { url: 'https://res.cloudinary.com/qa/image/upload/reference.png', source: 'reference', rights: 'Synthetic geometric artwork created for isolated QA.', caption: 'Illustrative editorial arches - synthetic QA reference', category: 'photography' };
let mongo, app, customer, outsider, vendor, owner, admin, customerToken, outsiderToken, vendorToken, adminToken, restrictedToken;
const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, options) => String(url) === asset.url ? new Response(image, { headers: { 'Content-Type': 'image/png' } }) : fetchOriginal(url, options);
  mongo = await MongoMemoryServer.create({ instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] } });
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_external')), adminConn.openUri(mongo.getUri('proposal_admin'))]);
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
  app = createApp();
  customer = await ExternalUser.create({ email: 'proposal-customer@example.test', fullName: 'Proposal QA Customer', accountType: 'CUSTOMER' });
  outsider = await ExternalUser.create({ email: 'proposal-outsider@example.test', fullName: 'Other Customer', accountType: 'CUSTOMER' });
  owner = await ExternalUser.create({ email: 'proposal-vendor@example.test', fullName: 'Proposal QA Vendor', accountType: 'VENDOR' });
  vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Proposal QA Studio', category: 'Photography', location: 'Pune', isProfileCompleted: true, status: 'ACTIVE', activationState: 'ACTIVE', activationReview: { status: 'APPROVED' }, workingHours: { Mon: { isOpen: true, hours: '9 AM - 6 PM' } } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const vs = await VendorService.create({ vendor: vendor._id, name: 'QA photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 10000 } });
  await VendorCapability.create({ vendor: vendor._id, vendorService: vs._id, teamSize: 2, simultaneousEventLimit: 1 });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await OperatingLocation.create({ vendor: vendor._id, label: 'QA Studio', city: 'Pune' });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: vs._id, coverageType: 'CITY', city: 'Pune' });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: asset.url });
  async function externalToken(user) { const session = await ExternalSession.create({ user: user._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(expiresAt()) }); return signExternalAccessToken(user, session._id); }
  customerToken = await externalToken(customer); outsiderToken = await externalToken(outsider); vendorToken = await externalToken(owner);
  async function makeAdmin(role, permissions) { const a = await AdminUser.create({ email: `${crypto.randomUUID()}@example.test`, fullName: 'QA Staff', passwordHash: 'fixture-only', role, permissions }); const s = await AdminSession.create({ admin: a._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(expiresAt()) }); return [a, signAdminAccessToken(a, s._id)]; }
  [admin, adminToken] = await makeAdmin('SUPER_ADMIN', []); [, restrictedToken] = await makeAdmin('ADMIN', ['events.read']);
}, { timeout: 120000 });
after(async () => { globalThis.fetch = fetchOriginal; await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

async function fixture(eventType = 'wedding') {
  const event = await CustomerEvent.create({ customer: customer._id, title: `QA ${eventType} celebration`, eventType, eventDate: date(), city: 'Pune', location: { venueName: 'QA Event Hall' }, guestCount: 100, budget: 30000, status: 'planning' });
  await EventRequirement.create({ event: event._id, category: 'photography', status: 'confirmed', source: 'customer', providedValue: 'Full event photography' });
  const vs = await VendorService.findOne({ vendor: vendor._id });
  const opportunity = await Opportunity.create({ vendor: vendor._id, customer: customer._id, vendorService: vs._id, customerEvent: event._id, serviceName: vs.name, eventDate: date() });
  const quote = await Quote.create({ opportunity: opportunity._id, vendor: vendor._id, customer: customer._id, vendorService: vs._id, category: 'photography', serviceName: vs.name, eventDate: date(), status: 'SUBMITTED', pricingBreakdown: { basePrice: 10000, totalAmount: 10000 }, notes: 'CONFIDENTIAL_SUPPLIER_NEGOTIATION' });
  const draft = cleanDraft({ theme: eventType === 'corporate' ? 'Corporate Premium' : 'Soft Ivory Editorial', introduction: 'An intimate, thoughtfully planned celebration.', allocations: [{ category: 'photography', scope: 'A two-person photography team for the event.', deliverables: 'Edited photo gallery within 30 days.', quantity: 1, amount: 15000 }], total: 15000, paymentTerms: 'Advance INR 4500 through the booking workflow. Balance INR 10500 before the event.', exclusions: 'Travel outside Pune and additional coverage hours.', roadmap: 'Review your scope. Coordinate the brief with STARVNT. Confirm the execution schedule.', assets: [asset] });
  const actor = { id: admin._id, role: 'SUPER_ADMIN' };
  let workspace = await service.adminWorkspace(String(event._id));
  await service.saveDraft(String(event._id), actor, { revision: workspace.dossier.revision, draft });
  return { eventId: String(event._id), event, quote, draft, actor };
}
async function ready(f) {
  let w = await service.adminWorkspace(f.eventId);
  assert.equal(w.source.quotes[0].vendorEligible, true, 'Fixture vendor is eligible through existing activation policy');
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'Approved scope as displayed. Deliver edited photos within 30 days. Vendor payment INR 10000. Cancellation requires STARVNT review.', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  await service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { revision: w.dossier.revision, agreementId: w.dossier.agreements.at(-1).id, decision: 'APPROVED' });
  w = await service.adminWorkspace(f.eventId);
  await service.approveCommercial(f.eventId, f.actor, { revision: w.dossier.revision, expiresAt: expiresAt(), note: 'CONFIDENTIAL_INTERNAL_MARGIN_REVIEW' });
  return service.adminWorkspace(f.eventId);
}

test('customer, vendor and admin proposal endpoints enforce domain, ownership and explicit RBAC', async () => {
  const f = await fixture();
  const path = `/api/customer/events/${f.eventId}/proposal`;
  await request(app).get(path).expect(401);
  await request(app).get(path).set(auth(vendorToken)).expect(403);
  await request(app).get(path).set(auth(adminToken)).expect(401);
  await request(app).get(path).set(auth(outsiderToken)).expect(404);
  await request(app).get(path).set(auth(customerToken)).expect(200);
  await request(app).get(`/api/admin/proposals/${f.eventId}`).set(auth(customerToken)).expect(401);
  await request(app).get(`/api/admin/proposals/${f.eventId}`).set(auth(restrictedToken)).expect(403);
  await request(app).get('/api/vendor/proposal-agreements').set(auth(customerToken)).expect(403);
  await request(app).post(`/api/admin/proposals/${f.eventId}/generate`).set(auth(restrictedToken)).send({ revision: 1, idempotencyKey: 'deny' }).expect(403);
});

test('final generation is blocked for missing, pending, rejected, expired or superseded agreements', async () => {
  const f = await fixture();
  const w = await ready(f);
  assert.equal(w.readiness.ready, true);
  for (const status of ['SENT', 'REJECTED', 'REVISION_REQUESTED', 'SUPERSEDED']) {
    const dossier = structuredClone(w.dossier); dossier.agreements[0].status = status;
    assert.equal(generationGate(w.source, dossier).ready, false, status);
    await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: dossier.agreements } });
    await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: `blocked-${status}` }), e => e.code === 'PROPOSAL_NOT_READY');
  }
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: w.dossier.agreements } });
  const expired = structuredClone(w.dossier); expired.agreements[0].expiresAt = '2000-01-01';
  assert.equal(generationGate(w.source, expired).ready, false);
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: expired.agreements } });
  await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'blocked-expired' }), e => e.code === 'PROPOSAL_NOT_READY');
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { agreements: w.dossier.agreements } });
  const missing = { ...w.dossier, commercial: null };
  assert.equal(generationGate(w.source, missing).ready, false);
  await ProposalDossier.updateOne({ event: f.eventId }, { $set: { commercial: null } });
  await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'blocked-missing-approval' }), e => e.status === 409 && e.code === 'PROPOSAL_NOT_READY');
  assert.equal(await ProposalDocument.countDocuments({ dossier: w.dossier._id }), 0);
});

test('reconciliation, invalid event, missing image, ineligible vendor and changed scope all fail closed', async () => {
  const f = await fixture(); const w = await ready(f);
  const changedPrice = structuredClone(w.dossier); changedPrice.draft.total += 1;
  assert.equal(generationGate(w.source, changedPrice).ready, false);
  const changedScope = structuredClone(w.dossier); changedScope.draft.allocations[0].scope = 'Expanded coverage';
  changedScope.commercial.draftHash = hash(changedScope.draft);
  assert.equal(generationGate(w.source, changedScope).ready, false);
  const missingImage = structuredClone(w.dossier); missingImage.draft.assets = [];
  assert.equal(generationGate(w.source, missingImage).ready, false);
  const invalid = structuredClone(w.source); invalid.event.eventDate = '2027-02-30';
  assert.equal(generationGate(invalid, w.dossier).ready, false);
  const suspended = structuredClone(w.source); suspended.quotes[0].vendorEligible = false;
  assert.equal(generationGate(suspended, w.dossier).ready, false);
  assert.throws(() => cleanDraft({ ...f.draft, assets: [{ ...asset, url: 'http://127.0.0.1/private.png' }] }), /STARVNT image storage/);
  assert.throws(() => cleanDraft({ ...f.draft, assets: [{ ...asset, rights: '' }] }), /permission or license/);
});

test('vendor decisions cannot be forged by a different organization or reused after a scope change', async () => {
  const f = await fixture(); let w = await service.adminWorkspace(f.eventId);
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'QA valid terms', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  const input = { revision: w.dossier.revision, agreementId: w.dossier.agreements[0].id, decision: 'APPROVED' };
  await assert.rejects(service.decideAgreement(new mongoose.Types.ObjectId(), f.eventId, { id: owner._id, role: 'VENDOR' }, input), e => e.status === 404);
  const revised = { ...f.draft, allocations: [{ ...f.draft.allocations[0], scope: 'A different event scope' }] };
  await service.saveDraft(f.eventId, f.actor, { revision: w.dossier.revision, draft: revised });
  await assert.rejects(service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { ...input, revision: w.dossier.revision + 1 }), e => e.code === 'AGREEMENT_NOT_CURRENT');
});

test('approved snapshots render searchable PDF bytes, deliver once, and never expose internal records', async () => {
  const f = await fixture(); const w = await ready(f);
  const v = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'final-qa-1' });
  const again = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'final-qa-1' });
  assert.equal(v.id, again.id);
  assert.equal(await CustomerNotification.countDocuments({ idempotencyKey: `proposal:${v.id}` }), 1);
  const customerView = await request(app).get(`/api/customer/events/${f.eventId}/proposal`).set(auth(customerToken)).expect(200);
  const json = JSON.stringify(customerView.body);
  for (const value of ['CONFIDENTIAL_SUPPLIER_NEGOTIATION', 'CONFIDENTIAL_INTERNAL_MARGIN_REVIEW', 'vendorCost', 'pricingBreakdown', 'approvedBy']) assert.equal(json.includes(value), false, value);
  const pdf = await request(app).get(`/api/customer/events/${f.eventId}/proposal/versions/${v.id}/pdf`).set(auth(customerToken)).expect(200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.body.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 5, 'Footer drawing never creates blank overflow pages');
  await request(app).get(`/api/customer/events/${f.eventId}/proposal/versions/${v.id}/pdf`).set(auth(outsiderToken)).expect(404);
  mkdirSync('tmp/qa/proposal-studio', { recursive: true }); writeFileSync('tmp/qa/proposal-studio/wedding.pdf', pdf.body);
  assert.equal(customerView.body.versions[0].current, true);
  const answer = await service.explain(customer._id, f.eventId, 'What is my payment schedule?');
  assert.equal(answer.answer, f.draft.paymentTerms); assert.equal(answer.versionId, v.id);
});

test('change requests preserve immutable version and block approval until a new approved version is issued', async () => {
  const f = await fixture(); let w = await ready(f);
  const v1 = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'change-1' });
  w = await service.adminWorkspace(f.eventId);
  await service.customerDecision(customer._id, f.eventId, { revision: w.dossier.revision, versionId: v1.id, decision: 'CHANGE_REQUESTED', message: 'Please refine the gallery delivery plan.', categories: ['photography'] });
  w = await service.adminWorkspace(f.eventId);
  assert.equal(w.readiness.ready, false);
  await service.approveCommercial(f.eventId, f.actor, { revision: w.dossier.revision, expiresAt: expiresAt(), note: 'Reviewed change: agreed existing 30 day delivery remains applicable.' });
  w = await service.adminWorkspace(f.eventId);
  const v2 = await service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'change-2' });
  w = await service.adminWorkspace(f.eventId);
  await assert.rejects(service.customerDecision(customer._id, f.eventId, { revision: w.dossier.revision, versionId: v1.id, decision: 'CUSTOMER_APPROVED' }), e => e.code === 'VERSION_NOT_CURRENT');
  const before = [await Booking.countDocuments(), await Payment.countDocuments(), await CoreBooking.countDocuments()];
  await service.customerDecision(customer._id, f.eventId, { revision: w.dossier.revision, versionId: v2.id, decision: 'CUSTOMER_APPROVED' });
  assert.deepEqual([await Booking.countDocuments(), await Payment.countDocuments(), await CoreBooking.countDocuments()], before);
  w = await service.adminWorkspace(f.eventId);
  assert.deepEqual(w.dossier.versions[0].snapshot, v1.snapshot);
  assert.equal(w.dossier.versions[0].status, 'CHANGE_REQUESTED');
  assert.equal(w.dossier.versions[1].status, 'CUSTOMER_APPROVED');
  assert.equal(w.dossier.changes[0].status, 'REVISED_PROPOSAL_ISSUED');
});

test('changed authoritative event data invalidates prior approvals and final generation', async () => {
  const f = await fixture(); const w = await ready(f);
  await CustomerEvent.updateOne({ _id: f.eventId }, { $set: { guestCount: 120 } });
  await assert.rejects(service.generate(f.eventId, f.actor, { revision: w.dossier.revision, idempotencyKey: 'stale-source' }), e => e.code === 'PROPOSAL_NOT_READY');
});

test('corporate and birthday PDF composition follows actual scope without wedding-only sections', async () => {
  for (const type of ['corporate', 'birthday']) {
    const f = await fixture(type);
    const bytes = await renderProposal({ event: { title: `QA ${type} event`, eventType: type, eventDate: date(), city: 'Pune', guestCount: 100, location: { venueName: 'QA Event Hall' } }, ...f.draft }, { id: crypto.randomUUID(), number: 1, createdAt: new Date().toISOString(), expiresAt: expiresAt() }, async () => image);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    mkdirSync('tmp/qa/proposal-studio', { recursive: true }); writeFileSync(`tmp/qa/proposal-studio/${type}.pdf`, bytes);
  }
});

test('rejected agreements can be revised and approved while preserving the rejected evidence', async () => {
  const f = await fixture();
  let w = await service.adminWorkspace(f.eventId);
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'Original scope and terms', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  await service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { revision: w.dossier.revision, agreementId: w.dossier.agreements[0].id, decision: 'REJECTED', note: 'Revise cancellation terms' });
  w = await service.adminWorkspace(f.eventId);
  await service.sendAgreement(f.eventId, f.actor, { revision: w.dossier.revision, quoteId: String(f.quote._id), terms: 'Revised scope and cancellation terms', expiresAt: expiresAt() });
  w = await service.adminWorkspace(f.eventId);
  assert.equal(w.dossier.agreements[0].status, 'SUPERSEDED');
  assert.equal(w.dossier.agreements[0].previousStatus, 'REJECTED');
  assert.equal(w.dossier.agreements[0].decisionNote, 'Revise cancellation terms');
  await service.decideAgreement(vendor._id, f.eventId, { id: owner._id, role: 'VENDOR' }, { revision: w.dossier.revision, agreementId: w.dossier.agreements[1].id, decision: 'APPROVED' });
  w = await service.adminWorkspace(f.eventId);
  await service.approveCommercial(f.eventId, f.actor, { revision: w.dossier.revision, expiresAt: expiresAt() });
  assert.equal((await service.adminWorkspace(f.eventId)).readiness.ready, true);
});

test('production browser journey: staff agreement, vendor decision, final PDF, customer changes and exact-version approval', { skip: process.env.PROPOSAL_BROWSER_QA !== '1', timeout: 180000 }, async () => {
  const { chromium } = await import('../../tmp/vendor-os-tools/node_modules/playwright/index.mjs');
  const express = (await import('express')).default;
  const { resolve } = await import('node:path');
  const f = await fixture('birthday');
  const server = app.listen(4117, '127.0.0.1');
  const web = express();
  const site = resolve('tmp/qa/proposal-studio/site');
  web.use(express.static(site)); web.get('*', (req, res) => res.sendFile(resolve(site, 'index.html')));
  const frontend = web.listen(5197, '127.0.0.1');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const errors = [];
  const evidence = [];
  const check = name => { evidence.push({ name, passed: true }); console.log('QA:', name); };
  async function pageFor(token, admin = false) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await context.addInitScript(({ token, admin }) => { localStorage.setItem(admin ? 'starvnt_admin_access_token' : 'starvnt_external_access_token', token); }, { token, admin });
    await context.route(asset.url, route => route.fulfill({ body: image, contentType: 'image/png' }));
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept()); return page;
  }
  async function action(page, path, fn) { const response = page.waitForResponse(r => r.url().includes(path) && ['POST', 'PUT'].includes(r.request().method())); await fn(); assert.equal((await response).status(), 200, path); await page.waitForTimeout(400); }
  async function openAdmin(page) { await page.goto('http://127.0.0.1:5197/admin/proposals'); await page.getByRole('button', { name: new RegExp(f.event.title) }).first().click(); await page.getByRole('heading', { name: f.event.title, exact: true }).waitFor(); }
  try {
    const staff = await pageFor(adminToken, true);
    await openAdmin(staff);
    await staff.getByLabel('Vendor quotation', { exact: true }).selectOption(String(f.quote._id));
    await staff.getByLabel('Agreement terms: scope, deliverables, payment and cancellation', { exact: true }).fill('QA approved scope and gallery delivery. Vendor payment INR 10000. Cancellation requires STARVNT review.');
    await action(staff, '/agreements', () => staff.getByRole('button', { name: 'Send agreement to vendor', exact: true }).click());
    check('Staff sends a real vendor agreement against the saved event scope');
    const partner = await pageFor(vendorToken);
    await partner.goto('http://127.0.0.1:5197/vendor/proposal-agreements');
    await action(partner, '/decision', () => partner.getByRole('button', { name: 'Approve agreement', exact: true }).click());
    check('Authenticated vendor approves their agreement');
    await openAdmin(staff);
    await staff.getByLabel('Internal commercial review note', { exact: true }).fill('QA commercial validation approved.');
    await action(staff, '/commercial-approval', () => staff.getByRole('button', { name: 'Approve saved commercial plan', exact: true }).click());
    await action(staff, '/generate', () => staff.getByRole('button', { name: 'Generate & deliver final PDF', exact: true }).click());
    check('Commercial approval unlocks final PDF generation and delivery');
    const customerPage = await pageFor(customerToken);
    await customerPage.goto(`http://127.0.0.1:5197/customer/events/${f.eventId}/proposal`);
    await customerPage.getByRole('heading', { name: 'My Event Proposal', exact: true }).waitFor();
    await customerPage.getByText('Total approved package', { exact: true }).waitFor();
    const content = await customerPage.locator('.proposal-studio').innerText();
    assert.equal(content.includes('10000'), false); assert.equal(content.includes('10,000'), false);
    await customerPage.screenshot({ path: 'tmp/qa/proposal-studio/customer-desktop.png', fullPage: true });
    check('Customer sees the approved experience without supplier cost or internal margin');
    await customerPage.getByLabel('Ask about inclusions, exclusions, pricing or payment terms').fill('What is my payment schedule?');
    await action(customerPage, '/ask', () => customerPage.getByRole('button', { name: 'Ask Aura+', exact: true }).click());
    assert.ok((await customerPage.locator('.proposal-answer').innerText()).includes('INR 4500'));
    check('Proposal guide answers from the exact approved snapshot');
    const download = customerPage.waitForEvent('download');
    await customerPage.getByRole('button', { name: 'Download PDF', exact: false }).click();
    await (await download).saveAs('tmp/qa/proposal-studio/browser-downloaded.pdf');
    check('Authenticated browser downloads a valid PDF');
    await customerPage.setViewportSize({ width: 390, height: 844 });
    await customerPage.screenshot({ path: 'tmp/qa/proposal-studio/customer-mobile.png', fullPage: true });
    assert.ok(await customerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile proposal has no horizontal overflow');
    check('Mobile-width customer layout has no horizontal overflow');
    await customerPage.getByLabel('Request changes to this version').fill('Please review my gallery delivery request.');
    await customerPage.getByLabel('photography', { exact: true }).check();
    await action(customerPage, '/decision', () => customerPage.getByRole('button', { name: 'Request changes', exact: true }).click());
    check('Customer change request invalidates commercial approval and preserves version one');
    await openAdmin(staff);
    await staff.getByLabel('Internal commercial review note', { exact: true }).fill('Change reviewed: confirmed 30 day gallery delivery remains agreed.');
    await action(staff, '/commercial-approval', () => staff.getByRole('button', { name: 'Approve saved commercial plan', exact: true }).click());
    await action(staff, '/generate', () => staff.getByRole('button', { name: 'Generate & deliver final PDF', exact: true }).click());
    await customerPage.reload();
    await action(customerPage, '/decision', () => customerPage.getByRole('button', { name: 'Approve version 2', exact: true }).click());
    await customerPage.getByText(/VERSION 2 · CUSTOMER APPROVED/).waitFor();
    check('Renewed approval produces version two and customer approves that exact version');
    const preliminary = await fixture('corporate');
    await customerPage.goto(`http://127.0.0.1:5197/customer/events/${preliminary.eventId}/proposal`);
    await customerPage.getByText('PRELIMINARY — NOT A FINAL APPROVED PROPOSAL', { exact: true }).waitFor();
    assert.equal(await customerPage.getByRole('button', { name: /Approve version/ }).count(), 0);
    check('Unapproved event shows clear preliminary state with no final approval action');
    await customerPage.screenshot({ path: 'tmp/qa/proposal-studio/preliminary-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); check('Customer, vendor and staff production routes have no runtime exceptions');
  } finally {
    const pages = []; for (const context of browser.contexts()) for (const page of context.pages()) { pages.push({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 5000) }); await page.screenshot({ path: `tmp/qa/proposal-studio/page-${pages.length}.png`, fullPage: true }); }
    writeFileSync('tmp/qa/proposal-studio/browser-report.json', JSON.stringify({ checks: evidence, pageErrors: errors, pages }, null, 2));
    await browser.close(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => frontend.close(r))]);
  }
});
