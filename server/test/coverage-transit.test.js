import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Vendor Coverage & Travel Policy: Dynamic DB persistence and Step 4 Activation', async () => {
  const { app, mongod, models, disconnectDB } = await setupTestApp();

  try {
    // 1. Register vendor
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Aarav Patel',
        businessName: 'Patel Wedding Studio',
        category: 'Photography',
        city: 'Mumbai',
        email: 'aarav@patelstudio.com',
        password: 'Password123!',
      });

    assert.equal(regRes.status, 201);
    const token = regRes.body.accessToken;

    // 2. Create a service
    const srvRes = await request(app)
      .post('/api/vendor/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Wedding Photography & Drone',
        category: 'Photography',
        pricing: { basePrice: 45000 },
        leadTimeDays: 7,
      });

    assert.equal(srvRes.status, 201);
    const serviceId = srvRes.body.service._id;

    // 3. Verify Step 4 checklist is initially false (pending)
    const initialActivationRes = await request(app)
      .get('/api/vendor/activation-status')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(initialActivationRes.status, 200);
    assert.equal(initialActivationRes.body.status.checklist.coverage, false);

    // 4. Set Operating Radius, Base City, and Localities (Step 4)
    const covRes = await request(app)
      .post('/api/vendor/coverage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendorServiceId: serviceId,
        coverageType: 'RADIUS',
        city: 'Mumbai',
        state: 'Maharashtra',
        radiusKm: 60,
        localities: ['Bandra', 'Andheri', 'South Mumbai', 'Thane'],
        outstationAllowed: true,
      });

    assert.equal(covRes.status, 201);
    assert.equal(covRes.body.ok, true);
    assert.equal(covRes.body.coverage.radiusKm, 60);
    assert.equal(covRes.body.coverage.city, 'Mumbai');
    assert.equal(covRes.body.coverage.state, 'Maharashtra');
    assert.equal(covRes.body.coverage.outstationAllowed, true);
    assert.equal(covRes.body.coverage.localities.length, 4);

    // 5. Verify Step 4 checklist is now TRUE (Done)
    assert.equal(covRes.body.activation.checklist.coverage, true);

    // 6. Set Travel Policy (Spec §8)
    const tpRes = await request(app)
      .put('/api/vendor/travel-policy')
      .set('Authorization', `Bearer ${token}`)
      .send({
        freeRadiusKm: 20,
        perKmRate: 45,
        equipmentTransitFee: 2000,
        outstationDailyAllowance: 1800,
        tollAndParkingIncluded: true,
        accommodationRequiredBeyondKm: 150,
      });

    assert.equal(tpRes.status, 200);
    assert.equal(tpRes.body.ok, true);
    assert.equal(tpRes.body.travelPolicy.freeRadiusKm, 20);
    assert.equal(tpRes.body.travelPolicy.perKmRate, 45);
    assert.equal(tpRes.body.travelPolicy.equipmentTransitFee, 2000);
    assert.equal(tpRes.body.travelPolicy.outstationDailyAllowance, 1800);
    assert.equal(tpRes.body.travelPolicy.tollAndParkingIncluded, true);
    assert.equal(tpRes.body.travelPolicy.accommodationRequiredBeyondKm, 150);

    // 7. Fresh GET requests to verify persistence across app refreshes
    const getTpRes = await request(app)
      .get('/api/vendor/travel-policy')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(getTpRes.status, 200);
    assert.equal(getTpRes.body.ok, true);
    assert.equal(getTpRes.body.travelPolicy.freeRadiusKm, 20);
    assert.equal(getTpRes.body.travelPolicy.perKmRate, 45);
    assert.equal(getTpRes.body.travelPolicy.equipmentTransitFee, 2000);
    assert.equal(getTpRes.body.travelPolicy.outstationDailyAllowance, 1800);
    assert.equal(getTpRes.body.travelPolicy.tollAndParkingIncluded, true);
    assert.equal(getTpRes.body.travelPolicy.accommodationRequiredBeyondKm, 150);

    // 8. Test updating coverage for same service (should upsert, not create duplicates)
    const updateCovRes = await request(app)
      .post('/api/vendor/coverage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendorServiceId: serviceId,
        coverageType: 'RADIUS',
        city: 'Pune',
        state: 'Maharashtra',
        radiusKm: 75,
        localities: ['Kothrud', 'Baner', 'Viman Nagar'],
        outstationAllowed: false,
      });

    assert.equal(updateCovRes.status, 201);
    assert.equal(updateCovRes.body.coverage.city, 'Pune');
    assert.equal(updateCovRes.body.coverage.radiusKm, 75);
    assert.equal(updateCovRes.body.coverage.outstationAllowed, false);

    // 9. Verify only 1 coverage record exists for this service
    const listSrvRes = await request(app)
      .get('/api/vendor/services')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listSrvRes.status, 200);
    const myService = listSrvRes.body.services.find(s => s._id === serviceId);
    assert.ok(myService);
    assert.equal(myService.coverage.length, 1);
    assert.equal(myService.coverage[0].city, 'Pune');
    assert.equal(myService.coverage[0].radiusKm, 75);
  } finally {
    await disconnectDB();
  }
});
