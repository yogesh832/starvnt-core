import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let vendorUser;
let vendorToken;
let otherVendorUser;
let otherVendorToken;
let customerToken;

before(async () => {
  ctx = await setupTestApp();

  // Register primary vendor
  const vRes = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Arun Photographer',
    email: 'arun@studio.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'Arun Studio Pixel',
    category: 'Photography',
    location: 'Kolkata',
  });
  assert.equal(vRes.status, 201);
  vendorToken = vRes.body.accessToken;
  vendorUser = vRes.body.user;

  // Register second vendor for tenant isolation testing
  const v2Res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Ravi Decorator',
    email: 'ravi@decor.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'Ravi Elegance Decor',
    category: 'Decoration',
    location: 'Delhi',
  });
  assert.equal(v2Res.status, 201);
  otherVendorToken = v2Res.body.accessToken;
  otherVendorUser = v2Res.body.user;

  // Register customer
  const cRes = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Customer Test',
    email: 'cust@test.com',
    password: 'Password123!',
    accountType: 'CUSTOMER',
  });
  assert.equal(cRes.status, 201);
  customerToken = cRes.body.accessToken;
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('GOLDEN TEST N: Security & Tenant Isolation', async () => {
  // 1. Unauthenticated request rejected with 401
  const unauthRes = await request(ctx.app).get('/api/vendor/profile');
  assert.equal(unauthRes.status, 401);

  // 2. Customer token rejected with 403 on vendor route
  const custRes = await request(ctx.app)
    .get('/api/vendor/profile')
    .set('Authorization', `Bearer ${customerToken}`);
  assert.equal(custRes.status, 403);
  assert.equal(custRes.body.error, 'FORBIDDEN');

  // 3. Forged vendorId in payload is ignored - mutations always use authenticated session
  const addServiceRes = await request(ctx.app)
    .post('/api/vendor/services')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      vendor: String(otherVendorUser.vendorOrganization), // Attempted forgery
      name: 'Wedding Photography Special',
      category: 'Photography',
      pricing: { basePrice: 45000 },
    });
  assert.equal(addServiceRes.status, 201);
  // Must belong to authenticated vendor, not forged vendor
  assert.equal(String(addServiceRes.body.service.vendor), String(vendorUser.vendorOrganization));
});

test('GOLDEN TEST A: Vendor Activation Lifecycle', async () => {
  // 1. Initial state check: vendor is not commercially active
  const initialStatusRes = await request(ctx.app)
    .get('/api/vendor/activation-status')
    .set('Authorization', `Bearer ${vendorToken}`);
  assert.equal(initialStatusRes.status, 200);
  assert.equal(initialStatusRes.body.status.isCommerciallyActive, false);
  assert.ok(initialStatusRes.body.status.missingRequirements.length > 0);

  // 2. Add Operating Location
  const locRes = await request(ctx.app)
    .post('/api/vendor/locations')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      label: 'Main Studio Barasat',
      address: '12 Jessore Road, Barasat',
      city: 'Kolkata',
      state: 'West Bengal',
      isPrimary: true,
    });
  assert.equal(locRes.status, 201);

  // 3. Add Service
  const svcRes = await request(ctx.app)
    .post('/api/vendor/services')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      name: 'Full Wedding Coverage',
      category: 'Photography',
      pricing: { basePrice: 48000, unit: 'event' },
      deliverables: ['1 Album', 'Raw Photos', 'Teaser Video'],
      status: 'ACTIVE',
    });
  assert.equal(svcRes.status, 201);
  const serviceId = svcRes.body.service._id;

  // 4. Add Capability for the service
  const capRes = await request(ctx.app)
    .post('/api/vendor/capabilities')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      vendorServiceId: serviceId,
      styles: ['Candid', 'Traditional'],
      format: 'Full day',
      teamSize: 2,
      equipment: ['Sony A7IV', 'Gimbal'],
    });
  assert.equal(capRes.status, 201);

  // 5. Add Service Coverage
  const covRes = await request(ctx.app)
    .post('/api/vendor/coverage')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      vendorServiceId: serviceId,
      coverageType: 'RADIUS',
      city: 'Kolkata',
      radiusKm: 50,
      localities: ['New Town', 'Salt Lake', 'Rajarhat'],
    });
  assert.equal(covRes.status, 201);

  // 6. With complete service model, vendor reaches ELIGIBLE
  const eligibleRes = await request(ctx.app)
    .get('/api/vendor/activation-status')
    .set('Authorization', `Bearer ${vendorToken}`);
  assert.equal(eligibleRes.body.status.isModelComplete, true);
  assert.equal(eligibleRes.body.status.activationState, 'ELIGIBLE');
  assert.equal(eligibleRes.body.status.isCommerciallyActive, false); // Awaiting admin verification

  // 7. Mark vendor as verified in DB (simulating admin verification)
  const { VendorOrganization } = ctx.models;
  const org = await VendorOrganization.findById(vendorUser.vendorOrganization);
  org.verification = { isVerified: true, verifiedAt: new Date() };
  await org.save();

  // 8. Re-evaluating reaches ACTIVE
  const activeRes = await request(ctx.app)
    .get('/api/vendor/activation-status')
    .set('Authorization', `Bearer ${vendorToken}`);
  assert.equal(activeRes.body.status.activationState, 'ACTIVE');
  assert.equal(activeRes.body.status.isCommerciallyActive, true);
});

test('GOLDEN TEST B: Service Coverage & Travel Policy Resolution', async () => {
  // 1. Fetch Travel Policy (auto-initialized)
  const polRes = await request(ctx.app)
    .get('/api/vendor/travel-policy')
    .set('Authorization', `Bearer ${vendorToken}`);
  assert.equal(polRes.status, 200);
  assert.ok(polRes.body.travelPolicy);
  assert.equal(polRes.body.travelPolicy.freeRadiusKm, 15);

  // 2. Update Travel Policy
  const updatePolRes = await request(ctx.app)
    .put('/api/vendor/travel-policy')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      freeRadiusKm: 20,
      perKmRate: 45,
      outstationDailyAllowance: 2000,
    });
  assert.equal(updatePolRes.status, 200);
  assert.equal(updatePolRes.body.travelPolicy.freeRadiusKm, 20);
  assert.equal(updatePolRes.body.travelPolicy.perKmRate, 45);

  // 3. Verify cross-tenant isolation: other vendor cannot see primary vendor's services
  const otherServicesRes = await request(ctx.app)
    .get('/api/vendor/services')
    .set('Authorization', `Bearer ${otherVendorToken}`);
  assert.equal(otherServicesRes.status, 200);
  assert.ok(
    otherServicesRes.body.services.every(
      (s) => String(s.vendor) === String(otherVendorUser.vendorOrganization)
    )
  );
});
