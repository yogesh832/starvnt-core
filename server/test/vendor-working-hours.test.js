import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Vendor Working Hours & Resources: Dynamic DB persistence and auto-save consistency', async () => {
  const { app, mongod, models, disconnectDB } = await setupTestApp();

  try {
    // 1. Register vendor
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Sameer Rao',
        businessName: 'Rao Wedding Cinematics',
        category: 'Videography',
        city: 'Mumbai',
        email: 'sameer@raocine.com',
        password: 'Password123!',
      });

    assert.equal(regRes.status, 201);
    const token = regRes.body.accessToken;

    // 2. GET initial hours from DB - Saturday default is open
    const initialHoursRes = await request(app)
      .get('/api/vendor/availability/hours')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(initialHoursRes.status, 200);
    assert.equal(initialHoursRes.body.ok, true);
    assert.equal(initialHoursRes.body.workingHours.Saturday.isOpen, true);

    // 3. User turns Saturday OFF in the UI
    const updatedHours = {
      ...initialHoursRes.body.workingHours,
      Saturday: { isOpen: false, hours: 'Off' },
    };

    const putRes = await request(app)
      .put('/api/vendor/availability/hours')
      .set('Authorization', `Bearer ${token}`)
      .send({ workingHours: updatedHours });

    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.ok, true);
    assert.equal(putRes.body.workingHours.Saturday.isOpen, false);
    assert.equal(putRes.body.workingHours.Saturday.hours, 'Off');

    // 4. Fresh GET request (simulating page refresh) must retrieve Saturday as OFF from DB
    const refreshHoursRes = await request(app)
      .get('/api/vendor/availability/hours')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(refreshHoursRes.status, 200);
    assert.equal(refreshHoursRes.body.ok, true);
    assert.equal(refreshHoursRes.body.workingHours.Saturday.isOpen, false);
    assert.equal(refreshHoursRes.body.workingHours.Saturday.hours, 'Off');

    // 5. Test adding resources with both canonical type and aliases (TEAM_MEMBER, STAFF)
    const addRes1 = await request(app)
      .post('/api/vendor/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'TEAM_MEMBER',
        name: 'Team Alpha (Lead & Drone)',
        identifier: '2 cinematographers · 4 cameras',
        capacityUnits: 1,
      });

    assert.equal(addRes1.status, 201);
    assert.equal(addRes1.body.ok, true);
    assert.equal(addRes1.body.resource.type, 'TEAM_MEMBER');

    const addRes2 = await request(app)
      .post('/api/vendor/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'STAFF', // Friendly alias should normalize to TEAM_MEMBER
        name: 'Team Beta',
        identifier: '1 photographer',
        capacityUnits: 1,
      });

    assert.equal(addRes2.status, 201);
    assert.equal(addRes2.body.ok, true);
    assert.equal(addRes2.body.resource.type, 'TEAM_MEMBER');

    // 6. Verify resources in DB
    const listRes = await request(app)
      .get('/api/vendor/resources')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.resources.length, 2);
  } finally {
    await disconnectDB();
  }
});
