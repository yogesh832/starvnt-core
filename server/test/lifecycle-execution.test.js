import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let customerToken;
let customerUser;
let vendor1Token;
let vendor1User;
let vendor2Token;
let vendor2User;
let adminToken;

before(async () => {
  ctx = await setupTestApp();

  // Register Customer
  const cRes = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Ananya Roy',
    email: 'ananya@customer.com',
    password: 'Password123!',
    accountType: 'CUSTOMER',
  });
  assert.equal(cRes.status, 201);
  customerToken = cRes.body.accessToken;
  customerUser = cRes.body.user;

  // Register Vendor 1 (Primary Photographer in Barasat/Kolkata)
  const v1Res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Arun Photographer',
    email: 'arun@shuttertalk.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'ShutterTalk Pro Studios',
    category: 'Photography',
    location: 'Barasat',
  });
  assert.equal(v1Res.status, 201);
  vendor1Token = v1Res.body.accessToken;
  vendor1User = v1Res.body.user;

  // Register Vendor 2 (Alternative Photographer in Kolkata)
  const v2Res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Pooja Creative Lens',
    email: 'pooja@lensmagic.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'LensMagic Visuals',
    category: 'Photography',
    location: 'Kolkata',
  });
  assert.equal(v2Res.status, 201);
  vendor2Token = v2Res.body.accessToken;
  vendor2User = v2Res.body.user;

  // Activate Vendor 1 (Service + Capability + Coverage + Verification)
  const v1SvcRes = await request(ctx.app)
    .post('/api/vendor/services')
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({
      name: 'Wedding Photography & Cinematic Video',
      category: 'Photography',
      pricing: { basePrice: 45000, unit: 'event' },
      deliverables: ['Edited Photos', 'Teaser Film'],
      status: 'ACTIVE',
    });
  assert.equal(v1SvcRes.status, 201);
  const v1ServiceId = v1SvcRes.body.service._id;

  const cap1Res = await request(ctx.app)
    .post('/api/vendor/capabilities')
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({
      vendorServiceId: v1ServiceId,
      styles: ['Candid', 'Traditional', 'Cinematic'],
      deliverables: ['Edited Photos', 'Teaser Film'],
    });
  assert.equal(cap1Res.status, 201);

  const cov1Res = await request(ctx.app)
    .post('/api/vendor/coverage')
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({
      vendorServiceId: v1ServiceId,
      coverageType: 'CITY',
      city: 'Kolkata',
      localities: ['New Town', 'Salt Lake', 'Rajarhat'],
    });
  assert.equal(cov1Res.status, 201);

  // Activate Vendor 2 (Alternative Candidate)
  const v2SvcRes = await request(ctx.app)
    .post('/api/vendor/services')
    .set('Authorization', `Bearer ${vendor2Token}`)
    .send({
      name: 'Elite Candid Wedding Shoots',
      category: 'Photography',
      pricing: { basePrice: 52000, unit: 'event' },
      deliverables: ['Raw Photos', 'Edited Album'],
      status: 'ACTIVE',
    });
  assert.equal(v2SvcRes.status, 201);
  const v2ServiceId = v2SvcRes.body.service._id;

  const cap2Res = await request(ctx.app)
    .post('/api/vendor/capabilities')
    .set('Authorization', `Bearer ${vendor2Token}`)
    .send({
      vendorServiceId: v2ServiceId,
      styles: ['Candid', 'Traditional'],
    });
  assert.equal(cap2Res.status, 201);

  const cov2Res = await request(ctx.app)
    .post('/api/vendor/coverage')
    .set('Authorization', `Bearer ${vendor2Token}`)
    .send({
      vendorServiceId: v2ServiceId,
      coverageType: 'CITY',
      city: 'Kolkata',
      localities: ['New Town'],
    });
  assert.equal(cov2Res.status, 201);

  // Mark both vendors as commercially active and verified in DB
  const { VendorOrganization } = ctx.models;
  await VendorOrganization.findByIdAndUpdate(vendor1User.vendorOrganization, {
    verification: { isVerified: true, verifiedAt: new Date() },
    activationState: 'ACTIVE',
    isCommerciallyActive: true,
  });
  await VendorOrganization.findByIdAndUpdate(vendor2User.vendorOrganization, {
    verification: { isVerified: true, verifiedAt: new Date() },
    activationState: 'ACTIVE',
    isCommerciallyActive: true,
  });

  // Create Super Admin for operations
  const { AdminUser } = ctx.models;
  const { hashPassword } = await import('../src/external/utils/password.js');
  const passwordHash = await hashPassword('AdminPass123!');
  const adminEmail = `core_ops_${Date.now()}@starvnt.com`;
  await AdminUser.create({
    fullName: 'Core Operations Lead',
    email: adminEmail,
    passwordHash,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });

  const adminLogin = await request(ctx.app).post('/api/admin/auth/login').send({
    email: adminEmail,
    password: 'AdminPass123!',
  });
  assert.equal(adminLogin.status, 200);
  adminToken = adminLogin.body.accessToken;
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

let createdOpportunity;
let createdQuote;
let createdBooking;

test('GOLDEN TEST F: Structured Requirement becomes Vendor Opportunity with Actionable Context', async () => {
  // Customer submits a requirement for an event in New Town, Kolkata
  const reqRes = await request(ctx.app)
    .post('/api/opportunities/generate')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      category: 'Photography',
      date: '2026-11-26',
      serviceLocation: {
        address: 'Kisan Palace',
        locality: 'New Town',
        city: 'Kolkata',
      },
      guestCount: 500,
      durationHours: 8,
      requiredStyles: ['Candid', 'Traditional'],
    });

  assert.equal(reqRes.status, 200);
  assert.equal(reqRes.body.ok, true);
  assert.ok(reqRes.body.opportunities.length >= 1, 'Should create structured opportunity for eligible vendor');

  createdOpportunity = reqRes.body.opportunities[0];
  // Verify actionable context in opportunity (Spec §9, §10)
  assert.equal(createdOpportunity.status, 'NEW');
  assert.equal(createdOpportunity.eventDate, '2026-11-26');
  assert.equal(createdOpportunity.serviceLocation.locality, 'New Town');
  assert.equal(createdOpportunity.guestCount, 500);
  assert.ok(createdOpportunity.action, 'Should include actionable prompt');

  // Vendor views their opportunities
  const vendorOppsRes = await request(ctx.app)
    .get('/api/vendor/opportunities')
    .set('Authorization', `Bearer ${vendor1Token}`);

  assert.equal(vendorOppsRes.status, 200);
  assert.ok(vendorOppsRes.body.opportunities.some((o) => o._id === createdOpportunity._id));
});

test('GOLDEN TEST G: Quote Lifecycle & Invalid Transition Rejection', async () => {
  // 1. Vendor drafts a Quote
  const quoteRes = await request(ctx.app)
    .post('/api/quotes')
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({
      opportunityId: createdOpportunity._id,
      customerId: customerUser.id,
      vendorServiceId: createdOpportunity.vendorService,
      serviceName: createdOpportunity.serviceName,
      eventDate: createdOpportunity.eventDate,
      serviceLocation: createdOpportunity.serviceLocation,
      pricingBreakdown: {
        basePrice: 45000,
        travelFee: 2000,
        totalAmount: 47000,
      },
      status: 'DRAFT',
      notes: 'Full day coverage with candid and traditional photographers',
    });

  assert.equal(quoteRes.status, 201);
  createdQuote = quoteRes.body.quote;
  assert.equal(createdQuote.status, 'DRAFT');

  // 2. Vendor submits the Quote (DRAFT -> SUBMITTED)
  const submitRes = await request(ctx.app)
    .post(`/api/quotes/${createdQuote._id}/transition`)
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({ targetStatus: 'SUBMITTED' });

  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.quote.status, 'SUBMITTED');

  // 3. Illegal transition: Trying to transition from SUBMITTED directly to invalid or illegal status
  // For instance, from SUBMITTED back to DRAFT is rejected by state machine
  const illegalRes = await request(ctx.app)
    .post(`/api/quotes/${createdQuote._id}/transition`)
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({ targetStatus: 'DRAFT' });

  assert.equal(illegalRes.status, 400);
  assert.equal(illegalRes.body.error, 'INVALID_QUOTE_TRANSITION');
  assert.ok(illegalRes.body.message.includes('Cannot transition'));

  // 4. Valid transition: Customer approves the quote (SUBMITTED -> APPROVED)
  const approveRes = await request(ctx.app)
    .post(`/api/quotes/${createdQuote._id}/transition`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ targetStatus: 'APPROVED' });

  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.quote.status, 'APPROVED');

  // 5. Illegal transition after terminal APPROVED state
  const postApproveIllegal = await request(ctx.app)
    .post(`/api/quotes/${createdQuote._id}/transition`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ targetStatus: 'REJECTED' });

  assert.equal(postApproveIllegal.status, 400);
  assert.equal(postApproveIllegal.body.error, 'INVALID_QUOTE_TRANSITION');

  // Verify that CoreBooking was created in Core Admin DB via Central Automation Outbox!
  const { CoreBooking } = await import('../src/admin/models/CoreBooking.js');
  const booking = await CoreBooking.findOne({ quoteId: createdQuote._id.toString() });
  assert.ok(booking, 'CoreBooking must be automatically created upon quote approval');
  assert.equal(booking.bookingStatus, 'CONFIRMED');
  assert.equal(booking.paymentStatus, 'PENDING');
  assert.equal(booking.executionStatus, 'NOT_STARTED');
  assert.equal(booking.settlementStatus, 'NOT_ELIGIBLE');
  createdBooking = booking;
});

test('GOLDEN TEST I: Payment Truth strictly from Core Authority', async () => {
  // 1. Vendor tries to declare payment verified (Forbidden)
  const vendorAttempt = await request(ctx.app)
    .post(`/api/vendor/bookings/${createdBooking._id}/verify-payment`)
    .set('Authorization', `Bearer ${vendor1Token}`);

  assert.equal(vendorAttempt.status, 403);
  assert.equal(vendorAttempt.body.error, 'CORE_AUTHORITY_VIOLATION');

  // 2. Core Operations verifies payment
  const coreVerifyRes = await request(ctx.app)
    .post(`/api/admin/operations/bookings/${createdBooking._id}/verify-payment`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ transactionId: 'TXN-RAZORPAY-889922', method: 'UPI' });

  assert.equal(coreVerifyRes.status, 200);
  assert.equal(coreVerifyRes.body.booking.paymentStatus, 'PAYMENT_VERIFIED');
  // State machine advances execution to SERVICE_SCHEDULED
  assert.equal(coreVerifyRes.body.booking.executionStatus, 'SERVICE_SCHEDULED');
});

test('GOLDEN TEST J: Vendor Execution Evidence vs Core Completion Validation', async () => {
  // 1. Vendor starts service
  const startRes = await request(ctx.app)
    .post(`/api/vendor/bookings/${createdBooking._id}/start`)
    .set('Authorization', `Bearer ${vendor1Token}`);

  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.booking.executionStatus, 'SERVICE_STARTED');

  // 2. Vendor submits completion facts & deliverables
  const submitEvidenceRes = await request(ctx.app)
    .post(`/api/vendor/bookings/${createdBooking._id}/submit-completion`)
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({
      deliverablesUrl: 'https://cloud.starvnt.com/deliverables/shuttertalk-event-2026',
      checklist: [
        { item: 'Ceremony Photography Completed', checked: true },
        { item: 'Raw Footage Backed Up', checked: true },
      ],
      notes: 'All 8 hours covered successfully. Client signed off on site.',
    });

  assert.equal(submitEvidenceRes.status, 200);
  assert.equal(submitEvidenceRes.body.booking.executionStatus, 'COMPLETION_SUBMITTED');
  assert.equal(submitEvidenceRes.body.booking.completionEvidence.length, 1);

  // 3. Vendor attempts to self-verify completion (Forbidden)
  const selfVerifyAttempt = await request(ctx.app)
    .post(`/api/vendor/bookings/${createdBooking._id}/verify-completion`)
    .set('Authorization', `Bearer ${vendor1Token}`);

  assert.equal(selfVerifyAttempt.status, 403);
  assert.equal(selfVerifyAttempt.body.error, 'CORE_AUTHORITY_VIOLATION');
});

test('GOLDEN TEST K: Settlement Eligibility occurs only after Completion Validation', async () => {
  // 1. Core attempts to settle before completion validation -> Fails
  const prematureSettleRes = await request(ctx.app)
    .post(`/api/admin/operations/bookings/${createdBooking._id}/settle`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ transactionReference: 'BANK-NEFT-99112' });

  assert.equal(prematureSettleRes.status, 400);
  assert.equal(prematureSettleRes.body.error, 'SETTLEMENT_NOT_ELIGIBLE');

  // 2. Core Platform validates completion
  const validateRes = await request(ctx.app)
    .post(`/api/admin/operations/bookings/${createdBooking._id}/validate-completion`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      approved: true,
      notes: 'Reviewed high-res drive deliverables and checklist. Service quality verified.',
    });

  assert.equal(validateRes.status, 200);
  assert.equal(validateRes.body.booking.executionStatus, 'COMPLETION_VERIFIED');
  assert.equal(validateRes.body.booking.settlementStatus, 'SETTLEMENT_ELIGIBLE');

  // 3. Core Platform releases settlement
  const settleRes = await request(ctx.app)
    .post(`/api/admin/operations/bookings/${createdBooking._id}/settle`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ transactionReference: 'BANK-NEFT-99112' });

  assert.equal(settleRes.status, 200);
  assert.equal(settleRes.body.booking.settlementStatus, 'SETTLED');
  assert.ok(settleRes.body.booking.settlementDetails.settledAt);
});

test('GOLDEN TEST L: Vendor Failure Recovery triggers Eligible Alternative Discovery on same Requirement', async () => {
  // Create a second booking to simulate a mid-lifecycle vendor failure
  const { CoreBooking } = await import('../src/admin/models/CoreBooking.js');
  const failureBooking = await CoreBooking.create({
    bookingReference: 'BK-FAIL-TEST',
    vendorId: vendor1User.vendorOrganization,
    customerId: customerUser.id,
    serviceName: 'Wedding Photography',
    category: 'Photography',
    eventDate: '2026-11-26',
    serviceLocation: {
      address: 'Kisan Palace',
      locality: 'New Town',
      city: 'Kolkata',
    },
    totalAmount: 45000,
    bookingStatus: 'CONFIRMED',
    executionStatus: 'SERVICE_SCHEDULED',
  });

  // Trigger failure handling and automatic alternative discovery
  const failRes = await request(ctx.app)
    .post(`/api/admin/operations/bookings/${failureBooking._id}/fail-and-reassign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ reason: 'Vendor camera team emergency illness' });

  assert.equal(failRes.status, 200);
  assert.equal(failRes.body.ok, true);
  assert.equal(failRes.body.failedBooking.bookingStatus, 'FAILED');

  // Assert that alternative discovery found Vendor 2 and excluded the failed Vendor 1
  assert.ok(failRes.body.alternativeCandidates.length >= 1);
  const foundVendor2 = failRes.body.alternativeCandidates.find(
    (c) => c.vendorId.toString() === vendor2User.vendorOrganization.toString()
  );
  assert.ok(foundVendor2, 'Should discover Vendor 2 as an eligible alternative candidate');

  const foundFailedVendor = failRes.body.alternativeCandidates.find(
    (c) => c.vendorId.toString() === vendor1User.vendorOrganization.toString()
  );
  assert.equal(foundFailedVendor, undefined, 'Failed vendor must be excluded from alternatives');
});
