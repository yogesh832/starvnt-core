import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Vendor Signup Flow with required fields, mandatory profile completion, and portfolio project creation', async () => {
  const { app, mongod, models, disconnectDB } = await setupTestApp();

  try {
    // 1. Signup Vendor with all 6 required fields
    const signupRes = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Aarav Mehta',
        businessName: 'CineMandap Studios',
        brandName: 'CineMandap Studios',
        category: 'Cinematic Production',
        city: 'Mumbai',
        email: 'aarav@cinemandap.com',
        password: 'Password123!'
      });

    assert.equal(signupRes.status, 201, `Expected 201 Created, got ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    assert.ok(signupRes.body.accessToken, 'Must return accessToken');
    assert.equal(signupRes.body.user.fullName, 'Aarav Mehta');
    assert.equal(signupRes.body.user.accountType, 'VENDOR');

    const token = signupRes.body.accessToken;

    // Verify DB records
    const vendorOrg = await models.VendorOrganization.findById(signupRes.body.user.vendorOrganization);
    assert.ok(vendorOrg, 'VendorOrganization must exist');
    assert.equal(vendorOrg.businessName, 'CineMandap Studios');
    assert.equal(vendorOrg.category, 'Cinematic Production');
    assert.equal(vendorOrg.location, 'Mumbai');
    assert.equal(vendorOrg.status, 'PENDING');
    assert.equal(vendorOrg.activationState, 'REGISTERED');

    // 2. Check initial Activation Status (Must require profile completion, percentage < 100%)
    const statusRes = await request(app)
      .get('/api/vendor/activation-status')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.status.is100Percent, false);
    assert.ok(statusRes.body.status.completionPercentage < 100, 'Initial completion should be < 100%');
    assert.equal(statusRes.body.status.checklist.portfolio, false);

    // 2b. Test Media Upload via POST /api/vendor/portfolio/upload (Cloudinary integration)
    const uploadRes = await request(app)
      .post('/api/vendor/portfolio/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        file: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
        filename: 'royal_mandap_cover.jpg',
        mediaType: 'IMAGE',
      });
    assert.equal(uploadRes.status, 201);
    assert.equal(uploadRes.body.ok, true);
    assert.ok(uploadRes.body.url, 'Uploaded media must return url');

    // 2c. Test Multi-file Batch Upload (Multiple images and videos)
    const batchUploadRes = await request(app)
      .post('/api/vendor/portfolio/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        files: [
          { file: 'data:image/jpeg;base64,/9j/4AAQ...', filename: 'mandap_photo.jpg', mediaType: 'IMAGE' },
          { file: 'data:video/mp4;base64,AAAA...', filename: 'sangeet_reel.mp4', mediaType: 'VIDEO' }
        ]
      });
    assert.equal(batchUploadRes.status, 201);
    assert.equal(batchUploadRes.body.ok, true);
    assert.equal(batchUploadRes.body.count, 2);
    assert.equal(batchUploadRes.body.files[1].resourceType, 'VIDEO');

    // 3. Create a Portfolio Project with multiple images, videos & YouTube links
    const projectRes = await request(app)
      .post('/api/vendor/portfolio/project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: 'Royal Udaipur Destination Wedding',
        category: 'Cinematic Production',
        venue: 'The Oberoi Udaivilas',
        city: 'Udaipur',
        style: 'Grand Cinematic Teaser',
        coverUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552',
        description: '3-day royal palace celebration captured with 4K multi-camera rig and drone cinematography.',
        mediaItems: [
          { url: 'https://images.unsplash.com/photo-1519741497674-611481863552', mediaType: 'IMAGE', title: 'Royal Mandap Cover' },
          { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaType: 'VIDEO', title: '4K Teaser Video' },
          { url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', mediaType: 'VIDEO', title: 'Full Event Video' }
        ],
        tags: ['royal', 'luxury', 'cinematic']
      });

    assert.equal(projectRes.status, 201);
    assert.equal(projectRes.body.ok, true);
    assert.equal(projectRes.body.project.projectName, 'Royal Udaipur Destination Wedding');
    assert.equal(projectRes.body.project.itemCount, 3);

    // 4. Fetch vendor portfolio projects and verify multi-media accessibility
    const projectsListRes = await request(app)
      .get('/api/vendor/portfolio/projects')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(projectsListRes.status, 200);
    assert.ok(Array.isArray(projectsListRes.body.projects));
    assert.equal(projectsListRes.body.projects.length, 1);
    assert.equal(projectsListRes.body.projects[0].projectName, 'Royal Udaipur Destination Wedding');
    assert.equal(projectsListRes.body.projects[0].items.length, 3);
    assert.ok(projectsListRes.body.projects[0].items.some(i => i.mediaType === 'VIDEO'), 'Must contain video items');
    assert.ok(projectsListRes.body.projects[0].items.some(i => i.mediaType === 'IMAGE'), 'Must contain image items');

    // 4b. Test Standalone Media Item addition via URL
    const itemAddRes = await request(app)
      .post('/api/vendor/portfolio/item')
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Wedding Highlight YouTube',
        mediaType: 'VIDEO'
      });
    assert.equal(itemAddRes.status, 201);
    assert.equal(itemAddRes.body.item.mediaType, 'VIDEO');
    assert.ok(itemAddRes.body.item.thumbnailUrl.includes('img.youtube.com'), 'YouTube thumbnail must be auto-generated');

    // 5. Check Activation Status checklist.portfolio is now true
    const updatedStatusRes = await request(app)
      .get('/api/vendor/activation-status')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(updatedStatusRes.status, 200);
    assert.equal(updatedStatusRes.body.status.checklist.portfolio, true);
    assert.ok(updatedStatusRes.body.status.completionPercentage > statusRes.body.status.completionPercentage, 'Completion percentage should have increased');

    // 6. Complete remaining profile milestones (Service, Capability, Location, Coverage)
    // 6a. Service
    const svcRes = await request(app)
      .post('/api/vendor/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cinematic Wedding Film & Teaser',
        category: 'Cinematic Production',
        pricing: {
          basePrice: 75000,
          pricingType: 'FIXED',
          unit: 'event',
        },
        leadTimeDays: 7,
        deliverables: ['4K Teaser (3 mins)', 'Full Event Cut', 'Drone Highlights'],
        status: 'ACTIVE',
      });
    assert.equal(svcRes.status, 201);
    const serviceId = svcRes.body.service._id;

    // 6b. Capability
    const capRes = await request(app)
      .post('/api/vendor/capabilities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendorServiceId: serviceId,
        styles: ['Cinematic', 'Drone 4K', 'Candid'],
        format: 'Full day',
        teamSize: 3,
        equipment: ['Sony FX6', 'DJI Mavic 3 Cine'],
      });
    assert.equal(capRes.status, 201);

    // 6c. Operating Location
    const locRes = await request(app)
      .post('/api/vendor/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Main Studio & Operational Hub',
        type: 'STUDIO',
        address: 'Central Creative Studios, Film City Link Rd',
        locality: 'Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        isPrimary: true,
      });
    assert.equal(locRes.status, 201);

    // 6d. Coverage
    const covRes = await request(app)
      .post('/api/vendor/coverage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vendorServiceId: serviceId,
        coverageType: 'RADIUS',
        radiusKm: 50,
        city: 'Mumbai',
        outstationAllowed: true,
      });
    assert.equal(covRes.status, 201);

    // 7. Verify final 100% profile completion
    const finalStatusRes = await request(app)
      .get('/api/vendor/activation-status')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(finalStatusRes.status, 200);
    assert.equal(finalStatusRes.body.status.completionPercentage, 100, 'Completion percentage must reach 100%');
    assert.equal(finalStatusRes.body.status.is100Percent, true, 'is100Percent flag must be true');
    assert.equal(finalStatusRes.body.status.checklist.profile, true);
    assert.equal(finalStatusRes.body.status.checklist.services, true);
    assert.equal(finalStatusRes.body.status.checklist.capabilities, true);
    assert.equal(finalStatusRes.body.status.checklist.locations, true);
    assert.equal(finalStatusRes.body.status.checklist.coverage, true);
    assert.equal(finalStatusRes.body.status.checklist.portfolio, true);

  } finally {
    await disconnectDB();
    await mongod.stop();
  }
});
