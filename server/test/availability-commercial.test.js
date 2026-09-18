import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let eligibleVendorToken;
let eligibleVendorUser;
let eligibleServiceId;

let cheaperIneligibleVendorToken;
let cheaperIneligibleVendorUser;
let cheaperIneligibleServiceId;

before(async () => {
  ctx = await setupTestApp();

  // 1. Setup Eligible Vendor: Premium Moments Studio
  const v1Res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Yogesh Director',
    email: 'yogesh@premiummoments.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'Premium Moments Photography',
    category: 'Photography',
    location: 'Kolkata',
  });
  eligibleVendorToken = v1Res.body.accessToken;
  eligibleVendorUser = v1Res.body.user;

  // Add Operating Location: Barasat
  await request(ctx.app)
    .post('/api/vendor/locations')
    .set('Authorization', `Bearer ${eligibleVendorToken}`)
    .send({
      label: 'Barasat Hub',
      address: 'Jessore Road',
      locality: 'Barasat',
      city: 'Kolkata',
      isPrimary: true,
    });

  // Add Service: Base 46,000
  const s1Res = await request(ctx.app)
    .post('/api/vendor/services')
    .set('Authorization', `Bearer ${eligibleVendorToken}`)
    .send({
      name: 'Wedding Photography Elite',
      category: 'Photography',
      pricing: { basePrice: 46000, unit: 'event' },
      status: 'ACTIVE',
    });
  eligibleServiceId = s1Res.body.service._id;

  // Add Capability
  await request(ctx.app)
    .post('/api/vendor/capabilities')
    .set('Authorization', `Bearer ${eligibleVendorToken}`)
    .send({
      vendorServiceId: eligibleServiceId,
      styles: ['Candid', 'Traditional'],
      simultaneousEventLimit: 1,
    });

  // Add Service Coverage for New Town & Kolkata
  await request(ctx.app)
    .post('/api/vendor/coverage')
    .set('Authorization', `Bearer ${eligibleVendorToken}`)
    .send({
      vendorServiceId: eligibleServiceId,
      coverageType: 'RADIUS',
      city: 'Kolkata',
      radiusKm: 60,
      localities: ['New Town', 'Salt Lake', 'Kolkata'],
    });

  // Set verified in DB
  const { VendorOrganization } = ctx.models;
  const org1 = await VendorOrganization.findById(eligibleVendorUser.vendorOrganization);
  org1.verification = { isVerified: true, verifiedAt: new Date() };
  await org1.save();
  await request(ctx.app).get('/api/vendor/activation-status').set('Authorization', `Bearer ${eligibleVendorToken}`);

  // 2. Setup Cheaper Vendor (Base 30,000) that will be Ineligible due to travel conflict
  const v2Res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Budget Clicks',
    email: 'budget@clicks.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'Cheap Clicks Studio',
    category: 'Photography',
    location: 'Kolkata',
  });
  cheaperIneligibleVendorToken = v2Res.body.accessToken;
  cheaperIneligibleVendorUser = v2Res.body.user;

  // Add Location: Howrah
  await request(ctx.app)
    .post('/api/vendor/locations')
    .set('Authorization', `Bearer ${cheaperIneligibleVendorToken}`)
    .send({
      label: 'Howrah Office',
      address: 'Station Road',
      locality: 'Howrah',
      city: 'Kolkata',
      isPrimary: true,
    });

  // Add Service with cheaper price: 30,000
  const s2Res = await request(ctx.app)
    .post('/api/vendor/services')
    .set('Authorization', `Bearer ${cheaperIneligibleVendorToken}`)
    .send({
      name: 'Budget Wedding Photo',
      category: 'Photography',
      pricing: { basePrice: 30000, unit: 'event' },
      status: 'ACTIVE',
    });
  cheaperIneligibleServiceId = s2Res.body.service._id;

  // Add Capability with strict single event limit
  await request(ctx.app)
    .post('/api/vendor/capabilities')
    .set('Authorization', `Bearer ${cheaperIneligibleVendorToken}`)
    .send({
      vendorServiceId: cheaperIneligibleServiceId,
      styles: ['Traditional'],
      simultaneousEventLimit: 1,
    });

  // Add Coverage
  await request(ctx.app)
    .post('/api/vendor/coverage')
    .set('Authorization', `Bearer ${cheaperIneligibleVendorToken}`)
    .send({
      vendorServiceId: cheaperIneligibleServiceId,
      coverageType: 'RADIUS',
      city: 'Kolkata',
      radiusKm: 50,
      localities: ['New Town', 'Howrah', 'Kolkata'],
    });

  const org2 = await VendorOrganization.findById(cheaperIneligibleVendorUser.vendorOrganization);
  org2.verification = { isVerified: true, verifiedAt: new Date() };
  await org2.save();
  await request(ctx.app).get('/api/vendor/activation-status').set('Authorization', `Bearer ${cheaperIneligibleVendorToken}`);
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('GOLDEN TEST D: Deterministic Validated Total Cost Calculation', async () => {
  // Service location: Kisan Palace, New Town
  // Origin: Barasat Studio (approx 18 km)
  // Free radius: 15 km. Billable km: 3 km.
  // Per km rate: 40. Travel cost: 3 * 40 = 120.
  // Base price: 46,000. Validated total: 46,120.
  const costRes = await request(ctx.app)
    .post('/api/commercial/calculate-cost')
    .send({
      vendorId: String(eligibleVendorUser.vendorOrganization),
      vendorServiceId: String(eligibleServiceId),
      serviceLocation: {
        address: 'Kisan Palace',
        locality: 'New Town',
        city: 'Kolkata',
      },
      guestCount: 500,
    });

  assert.equal(costRes.status, 200);
  assert.equal(costRes.body.ok, true);
  const { breakdown, validatedTotalCost } = costRes.body.cost;

  assert.equal(breakdown.basePrice, 46000);
  assert.equal(breakdown.billableKm, 3);
  assert.equal(breakdown.travelCharge, 120);
  assert.equal(validatedTotalCost, 46120);
});

test('GOLDEN TEST C: True Availability & Geographic Conflict Detection', async () => {
  // 1. Initial check: Date 26 Nov 2026 is feasible
  const check1 = await request(ctx.app)
    .post('/api/commercial/check-availability')
    .send({
      vendorId: String(cheaperIneligibleVendorUser.vendorOrganization),
      vendorServiceId: String(cheaperIneligibleServiceId),
      date: '2026-11-26',
      startTime: '17:00',
      endTime: '22:00',
      serviceLocation: { locality: 'New Town', city: 'Kolkata' },
    });
  assert.equal(check1.status, 200);
  assert.equal(check1.body.availability.feasible, true);

  // 2. Add an existing booking on 26 Nov 2026 ending at 16:30 in Howrah (30 km away from New Town)
  const bookRes = await request(ctx.app)
    .post('/api/vendor/availability/bookings')
    .set('Authorization', `Bearer ${cheaperIneligibleVendorToken}`)
    .send({
      vendorServiceId: String(cheaperIneligibleServiceId),
      date: '2026-11-26',
      startTime: '10:00',
      endTime: '16:30',
      serviceLocation: {
        address: 'Howrah Town Hall',
        locality: 'Howrah',
        city: 'Kolkata',
      },
    });
  assert.equal(bookRes.status, 201);

  // 3. Re-evaluate opportunity starting at 17:00 in New Town (only 30 min gap, but needs ~120 min turnaround)
  const check2 = await request(ctx.app)
    .post('/api/commercial/check-availability')
    .send({
      vendorId: String(cheaperIneligibleVendorUser.vendorOrganization),
      vendorServiceId: String(cheaperIneligibleServiceId),
      date: '2026-11-26',
      startTime: '17:00',
      endTime: '22:00',
      serviceLocation: { locality: 'New Town', city: 'Kolkata' },
    });

  assert.equal(check2.status, 200);
  assert.equal(check2.body.availability.feasible, false);
  // Must surface the required architectural invariant message
  assert.ok(
    check2.body.availability.reason.includes(
      'Calendar says available, but resource or travel constraints make this opportunity infeasible'
    )
  );
  assert.equal(check2.body.availability.conflicts[0].type, 'GEOGRAPHIC_TRAVEL_CONFLICT');
});

test('GOLDEN TEST E: Lowest Validated Total Cost Ranking (Ineligible Lower-Cost Excluded)', async () => {
  // We match for a Wedding requirement on 2026-11-26 from 17:00 to 22:00 at New Town
  // - Cheap Clicks has Base Price = 30,000 (cheaper!), but has a GEOGRAPHIC_TRAVEL_CONFLICT
  // - Premium Moments has Base Price = 46,000 (higher), but is 100% available and eligible
  const matchRes = await request(ctx.app)
    .post('/api/commercial/match')
    .send({
      category: 'Photography',
      date: '2026-11-26',
      startTime: '17:00',
      endTime: '22:00',
      serviceLocation: {
        address: 'Kisan Palace',
        locality: 'New Town',
        city: 'Kolkata',
      },
      guestCount: 500,
    });

  assert.equal(matchRes.status, 200);
  assert.equal(matchRes.body.ok, true);
  const { eligibleCandidates, excludedCandidates } = matchRes.body.matches;

  // 1. Verify cheaper vendor was excluded
  const cheaperExcluded = excludedCandidates.find(
    (c) => String(c.vendorId) === String(cheaperIneligibleVendorUser.vendorOrganization)
  );
  assert.ok(cheaperExcluded, 'Cheaper vendor with travel conflict must be excluded');
  assert.equal(cheaperExcluded.gate, 'TRUE_AVAILABILITY_GATE');

  // 2. Verify eligible vendor was selected and marked as recommended
  assert.equal(eligibleCandidates.length, 1);
  const topCandidate = eligibleCandidates[0];
  assert.equal(String(topCandidate.vendorId), String(eligibleVendorUser.vendorOrganization));
  assert.equal(topCandidate.recommended, true);
  assert.equal(topCandidate.validatedTotalCost, 46120);
  assert.ok(topCandidate.whyCallout.includes('Lowest validated total cost'));
});
