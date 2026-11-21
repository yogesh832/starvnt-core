import mongoose from 'mongoose';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { Quote } from '../external/models/Quote.js';
import { AdminUser } from '../admin/models/AdminUser.js';
import { CustomerEvent, EventRequirement } from '../customer/models/index.js';
import { hashPassword } from '../external/utils/password.js';
import { EventManifest, VendorAgreement, Proposal, ProposalVersion, ProposalChangeRequest, CommercialApproval } from './models.js';
import { buildManifest, freezeManifest } from './manifest.service.js';
import { createAgreementFromQuote, sendAgreement, vendorDecideAgreement } from './agreement.service.js';
import { prepareCommercialApproval, submitCommercialApproval, decideCommercialApproval } from './commercial.service.js';
import { createPreliminary, requestFinalGeneration, publishVersion } from './proposal.service.js';
import { renderProposalVersion, browserPath } from './render.service.js';

/**
 * Development demo for Proposal Studio: three journeys at different stages
 * so every screen has something real to show. Never runs in production.
 *
 *  A. Wedding reception  → final proposal published, waiting for the customer
 *  B. Birthday           → a vendor has not approved yet: final generation is blocked,
 *                          a watermarked preliminary preview is shared instead
 *  C. Corporate summit   → commercial record waiting for the Finance checker
 */

export const DEMO_PASSWORD = 'Demo@2027';
export const DEMO_ACCOUNTS = {
  customer: 'proposal.customer@starvnt.demo',
  maker: 'proposal.maker@starvnt.demo',
  checker: 'proposal.checker@starvnt.demo',
};
// Every event the demo creates carries this marker; resets delete only marked events,
// so running the demo for a real account never touches that customer's own events.
export const DEMO_TAG = 'proposal-studio-demo:';
const future = (days) => new Date(Date.now() + days * 86400000);

const MAKER_PERMISSIONS = ['proposals.read', 'proposals.compose', 'proposals.publish', 'agreements.read', 'agreements.manage', 'commercial.read', 'commercial.prepare', 'assets.read', 'assets.manage', 'events.read', 'customers.read', 'vendors.read'];
const CHECKER_PERMISSIONS = ['proposals.read', 'agreements.read', 'commercial.read', 'commercial.approve', 'payments.read', 'financePolicies.read'];

async function upsertUser(email, data) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return ExternalUser.findOneAndUpdate({ email }, { $set: { ...data, email, passwordHash } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function upsertAdmin(email, fullName, permissions) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return AdminUser.findOneAndUpdate({ email }, { $set: { email, fullName, passwordHash, role: 'ADMIN', permissions, status: 'ACTIVE' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function demoVendor(key, category, businessName) {
  const owner = await upsertUser(`proposal.vendor.${key}@starvnt.demo`, { fullName: `${businessName} (demo)`, accountType: 'VENDOR' });
  const org = await VendorOrganization.findOneAndUpdate(
    { owner: owner._id },
    { $set: { owner: owner._id, ownerIdentityKey: owner._id, businessName, category, location: 'Kolkata' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (String(owner.vendorOrganization) !== String(org._id)) { owner.vendorOrganization = org._id; await owner.save(); }
  return { owner, org };
}

/** Removes only what a previous demo run created (DEMO_TAG events and their records). */
async function resetDemo(customerId, demoVendorIds) {
  const events = await CustomerEvent.find({ customer: customerId, idempotencyKey: { $regex: '^' + DEMO_TAG } }).select('_id').lean();
  const ids = events.map((e) => e._id);
  const proposals = await Proposal.find({ event: { $in: ids } }).select('_id').lean();
  await Promise.all([
    ProposalVersion.deleteMany({ proposal: { $in: proposals.map((p) => p._id) } }),
    ProposalChangeRequest.deleteMany({ proposal: { $in: proposals.map((p) => p._id) } }),
    Proposal.deleteMany({ event: { $in: ids } }),
    VendorAgreement.deleteMany({ event: { $in: ids } }),
    EventManifest.deleteMany({ event: { $in: ids } }),
    CommercialApproval.deleteMany({ event: { $in: ids } }),
    Quote.deleteMany({ customer: customerId, vendor: { $in: demoVendorIds } }),
    EventRequirement.deleteMany({ event: { $in: ids } }),
    CustomerEvent.deleteMany({ _id: { $in: ids } }),
  ]);
}

async function eventWith(customerId, event, requirements) {
  const doc = await CustomerEvent.create({ customer: customerId, status: 'planning', ...event, idempotencyKey: DEMO_TAG + event.eventType });
  await EventRequirement.create(requirements.map((r) => ({ event: doc._id, ...r })));
  return doc;
}

async function agreementFor({ manifest, customerId, vendor, category, price, scope, approve, actor }) {
  const quote = await Quote.create({
    vendor: vendor.org._id, customer: customerId, vendorService: new mongoose.Types.ObjectId(), serviceName: `${category} package`,
    category, eventDate: manifest.eventInfo.date, pricingBreakdown: { basePrice: price, totalAmount: price }, status: 'SUBMITTED', validUntil: future(30),
  });
  const agreement = await createAgreementFromQuote({ quoteId: quote._id, manifestId: manifest._id, category, scope, terms: { validUntil: future(45), paymentTerms: 'As per STARVNT payment schedule' } }, { actor });
  await sendAgreement(agreement._id, { actor });
  if (approve) await vendorDecideAgreement(agreement._id, vendor.org._id, { decision: 'APPROVE' }, { actor: String(vendor.owner._id) });
  return agreement;
}

async function frozenManifest(eventId, actor) {
  const manifest = await buildManifest(eventId, { actor });
  return freezeManifest(manifest._id, { actor });
}

/** An existing customer (e.g. one who signs in with OTP); never modified, only given demo events. */
async function existingCustomer(email) {
  const user = await ExternalUser.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) throw new Error(`No account found for ${email}. Sign in once on the website first, then re-run.`);
  if (user.accountType !== 'CUSTOMER') throw new Error(`${email} is a ${user.accountType} account, not a customer.`);
  return user;
}

/**
 * @param customerEmail optional: attach the demo journeys to this existing customer
 *                      instead of the built-in demo customer.
 */
export async function seedProposalDemo({ render = true, log = () => {}, customerEmail = null } = {}) {
  if (String(process.env.NODE_ENV).toLowerCase() === 'production') throw new Error('The Proposal Studio demo never runs in production.');
  const customer = customerEmail
    ? await existingCustomer(customerEmail)
    : await upsertUser(DEMO_ACCOUNTS.customer, { fullName: 'Sudipta Chatterjee', accountType: 'CUSTOMER' });
  const maker = await upsertAdmin(DEMO_ACCOUNTS.maker, 'Proposal Maker (demo)', MAKER_PERMISSIONS);
  const checker = await upsertAdmin(DEMO_ACCOUNTS.checker, 'Finance Checker (demo)', CHECKER_PERMISSIONS);
  const actor = String(maker._id);
  const vendors = {
    catering: await demoVendor('catering', 'Catering', 'Royal Bengal Caterers'),
    decor: await demoVendor('decor', 'Decoration', 'Golden Petal Décor'),
    photography: await demoVendor('photography', 'Photography', 'Frame Story Studio'),
    production: await demoVendor('production', 'Sound & Lights', 'StageCraft AV'),
    cake: await demoVendor('cake', 'Bakery', 'Sugarbloom Cakes'),
  };
  await resetDemo(customer._id, Object.values(vendors).map((v) => v.org._id));
  const canRender = render && Boolean(browserPath());

  // ── A. Wedding: published final proposal ────────────────────────────────
  const wedding = await eventWith(customer._id,
    { eventType: 'wedding', title: 'Wedding Reception Experience', eventDate: '2027-01-31', city: 'Kolkata', guestCount: 300, budgetMax: 500000, theme: 'Royal Luxury', location: { venueName: 'Baranagar, near Noapara Metro' }, specialRequirements: 'Seating for elderly guests near the stage.' },
    [
      { category: 'catering', status: 'confirmed', preferences: { cuisine: 'Bengali', menuStyle: 'Buffet' } },
      { category: 'decor', status: 'confirmed', preferences: { theme: 'Royal Luxury' } },
      { category: 'photography', status: 'confirmed', preferences: { coverage: 'Full day' } },
      { category: 'venue', status: 'customer_provided' },
      { category: 'makeup', status: 'pending' },
    ]);
  const wm = await frozenManifest(wedding._id, actor);
  await agreementFor({ manifest: wm, customerId: customer._id, vendor: vendors.catering, category: 'catering', price: 200000, approve: true, actor,
    scope: { summary: 'Bengali royal feast for approximately 300 guests.', lineItems: [{ name: 'Welcome coffee & tea', quantity: 1, unitPrice: 0 }, { name: 'Fuchka live counter', quantity: 1, unitPrice: 0 }, { name: 'Diamond Fish Fry — Vetki', quantity: 1, unitPrice: 0 }, { name: 'Mutton Dak Bunglo', quantity: 1, unitPrice: 0 }, { name: 'Rajbhog & Makha Sandesh', quantity: 1, unitPrice: 0 }], deliverables: ['Buffet setup & replenishment', 'Service staff'], exclusions: ['Crockery upgrade'] } });
  await agreementFor({ manifest: wm, customerId: customer._id, vendor: vendors.decor, category: 'decor', price: 52000, approve: true, actor,
    scope: { summary: 'Entrance and stage décor with warm lighting.', lineItems: [{ name: 'Entrance décor with lighting', quantity: 1 }, { name: 'Stage décor with lighting', quantity: 1 }, { name: 'Signboards', quantity: 2 }, { name: 'Selfie corner', quantity: 1 }], deliverables: ['Installation and dismantling'] } });
  await agreementFor({ manifest: wm, customerId: customer._id, vendor: vendors.photography, category: 'photography', price: 28000, approve: true, actor,
    scope: { summary: 'Full-day photography and videography.', lineItems: [{ name: 'Full-day photography', quantity: 1 }, { name: 'Full-day videography', quantity: 1 }], deliverables: ['Edited photographs', 'Highlight film'], exclusions: ['Drone coverage'] } });
  const wc = await prepareCommercialApproval(wedding._id, {
    costs: { margin: 140000, contingency: 30000, logistics: 22000, operational: 23000 },
    customerFacing: {
      packageTotal: 495000,
      allocations: [
        { category: 'catering', label: 'Reception catering', scopeSummary: 'Welcome drinks, starters, main course, desserts', quantity: '300 guests', amount: 235000 },
        { category: 'decor', label: 'Entrance, stage & décor', scopeSummary: 'Entrance, stage, signboards, selfie corner', amount: 65000 },
        { category: 'photography', label: 'Photography & videography', scopeSummary: 'Full-day coverage', amount: 35000 },
        { category: 'coordination', label: 'Logistics, team & coordination', scopeSummary: 'Setup, strike, welcome team and event managers', amount: 130000 },
        { category: 'contingency', label: 'Scope reserve', scopeSummary: 'Small event-day requirements, used only with your approval', amount: 30000 },
      ],
      paymentSchedule: [
        { label: 'Booking confirmation', percent: 30, amount: 148500, dueRule: 'On booking' },
        { label: 'Before major procurement', percent: 30, amount: 148500, dueRule: '30 days before the event' },
        { label: 'Before event execution', percent: 40, amount: 198000, dueRule: '7 days before the event' },
      ],
      exclusions: ['Venue / banquet hall rental', 'Additional seating beyond the agreed scope'],
      terms: { cancellation: 'As per the signed booking terms.', postponement: 'Subject to vendor availability on the new date.', scopeChange: 'Changes need written approval and may change the price.', customerResponsibilities: ['Venue access, permissions and power'] },
    },
  }, maker);
  await submitCommercialApproval(wc._id, maker);
  await decideCommercialApproval(wc._id, { decision: 'APPROVE' }, checker);
  const wv = await requestFinalGeneration(wedding._id, { actor, idempotencyKey: `demo-wedding-${Date.now()}`, theme: 'royal-luxury' });
  if (canRender) {
    await renderProposalVersion(wv._id);
    await publishVersion(wv._id, { actor });
  }
  log(`A. Wedding: final proposal v${wv.version} ${canRender ? 'generated and sent to the customer' : 'snapshot frozen (no browser found: render from Proposal Studio)'}`);

  // ── B. Birthday: vendor approval pending → gate blocks, preliminary shared ─
  const birthday = await eventWith(customer._id,
    { eventType: 'birthday', title: "Aarav's 5th Birthday — Space Adventure", eventDate: '2027-03-14', city: 'Kolkata', guestCount: 60, theme: 'Space Adventure', location: { venueName: 'Salt Lake party hall' } },
    [
      { category: 'decor', status: 'confirmed', preferences: { theme: 'Space Adventure' } },
      { category: 'cake', status: 'confirmed', preferences: { flavour: 'Chocolate' } },
      { category: 'photography', status: 'pending' },
    ]);
  const bm = await frozenManifest(birthday._id, actor);
  await agreementFor({ manifest: bm, customerId: customer._id, vendor: vendors.decor, category: 'decor', price: 25000, approve: true, actor,
    scope: { summary: 'Space-themed backdrop, balloon galaxy and entrance arch.', deliverables: ['Setup and cleanup'] } });
  await agreementFor({ manifest: bm, customerId: customer._id, vendor: vendors.cake, category: 'cake', price: 6000, approve: false, actor,
    scope: { summary: 'Two-tier rocket cake for 60 guests.' } });
  const bp = await createPreliminary(birthday._id, { actor, theme: 'contemporary-minimal' });
  if (canRender) {
    await renderProposalVersion(bp._id);
    await publishVersion(bp._id, { actor });
  }
  log('B. Birthday: cake vendor has not approved, so final generation is blocked; preliminary preview shared');

  // ── C. Corporate: waiting for the Finance checker ───────────────────────
  const corporate = await eventWith(customer._id,
    { eventType: 'corporate', title: 'Annual Leadership Summit 2027', eventDate: '2027-02-20', city: 'Kolkata', guestCount: 250, theme: 'Corporate Premium', location: { venueName: 'Biswa Bangla Convention Centre' } },
    [
      { category: 'corporate_production', status: 'confirmed', preferences: { stage: '40 ft LED backdrop' } },
      { category: 'sound', status: 'confirmed' },
      { category: 'catering', status: 'confirmed', preferences: { menuStyle: 'Working lunch + hi-tea' } },
      { category: 'venue', status: 'customer_provided' },
    ]);
  const cm = await frozenManifest(corporate._id, actor);
  await agreementFor({ manifest: cm, customerId: customer._id, vendor: vendors.production, category: 'corporate_production', price: 180000, approve: true, actor,
    scope: { summary: 'Stage, LED wall, AV and show calling.', lineItems: [{ name: 'LED wall 40×12 ft', quantity: 1 }, { name: 'Wireless microphones', quantity: 8 }], deliverables: ['Technical rehearsal', 'Show caller'] } });
  await agreementFor({ manifest: cm, customerId: customer._id, vendor: vendors.production, category: 'sound', price: 60000, approve: true, actor,
    scope: { summary: 'Line-array sound for 250 delegates.' } });
  await agreementFor({ manifest: cm, customerId: customer._id, vendor: vendors.catering, category: 'catering', price: 150000, approve: true, actor,
    scope: { summary: 'Working lunch and hi-tea for 250 delegates.' } });
  const cc = await prepareCommercialApproval(corporate._id, {
    costs: { margin: 95000, contingency: 20000, logistics: 15000 },
    customerFacing: {
      packageTotal: 520000,
      allocations: [
        { category: 'corporate_production', label: 'Stage, LED & AV production', scopeSummary: 'Stage, LED wall, microphones, show calling', amount: 245000 },
        { category: 'sound', label: 'Sound', scopeSummary: 'Line-array system for 250', amount: 75000 },
        { category: 'catering', label: 'Catering', scopeSummary: 'Working lunch and hi-tea', amount: 180000 },
        { category: 'coordination', label: 'Event management', scopeSummary: 'Run of show and on-ground team', amount: 20000 },
      ],
      paymentSchedule: [
        { label: 'Booking confirmation', percent: 40, amount: 208000, dueRule: 'On booking' },
        { label: 'Before event execution', percent: 60, amount: 312000, dueRule: '7 days before the event' },
      ],
      exclusions: ['Venue rental', 'Delegate travel and stay'],
    },
  }, maker);
  await submitCommercialApproval(cc._id, maker);
  log('C. Corporate: commercial record waiting for the Finance checker to approve');

  return {
    password: DEMO_PASSWORD,
    accounts: { ...DEMO_ACCOUNTS, customer: customer.email },
    customerIsDemoAccount: !customerEmail,
    events: { wedding: String(wedding._id), birthday: String(birthday._id), corporate: String(corporate._id) },
    rendered: canRender,
  };
}
