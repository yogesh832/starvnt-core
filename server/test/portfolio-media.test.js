import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let vendorToken;
let vendorUser;
let otherVendorToken;
let otherVendorUser;

before(async () => {
  ctx = await setupTestApp();

  // Register primary vendor
  const vRes = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Debanjan Photographer',
    email: 'debanjan@framestudio.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'Frame Studio Kolkata',
    category: 'Photography',
    location: 'Kolkata',
  });
  assert.equal(vRes.status, 201);
  vendorToken = vRes.body.accessToken;
  vendorUser = vRes.body.user;

  // Register second vendor for tenant isolation
  const v2Res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Sneha Visuals',
    email: 'sneha@lensqueen.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'LensQueen Studios',
    category: 'Photography',
    location: 'Howrah',
  });
  assert.equal(v2Res.status, 201);
  otherVendorToken = v2Res.body.accessToken;
  otherVendorUser = v2Res.body.user;
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('GOLDEN TEST M: 50+ Photos and Multiple Videos Bulk Uploaded, Organized, Reviewed & Published', async () => {
  // Construct a batch of 52 photos + 4 videos (56 items total, fulfilling 50+ photos + multiple videos)
  const bulkItems = [];

  // 1. Generate 52 photo descriptors
  for (let i = 1; i <= 52; i++) {
    bulkItems.push({
      url: `https://storage.starvnt.com/media/debanjan/wedding_shoot_candid_${i}.jpg`,
      originalFilename: `wedding_candid_photo_${i}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 3.5 * 1024 * 1024,
      title: `Kisan Palace Wedding Moment #${i}`,
      eventType: 'Wedding',
      style: i % 2 === 0 ? 'Candid' : 'Traditional',
      location: {
        venue: 'Kisan Palace',
        locality: 'New Town',
        city: 'Kolkata',
      },
    });
  }

  // 2. Generate 4 videos (social reel, teaser, cinematic highlight, and full-length film)
  bulkItems.push({
    url: 'https://storage.starvnt.com/media/debanjan/wedding_insta_reel.mp4',
    originalFilename: 'wedding_teaser_reel.mp4',
    mimeType: 'video/mp4',
    durationSeconds: 45, // <60s -> REEL
    title: 'Instagram 45s Highlight Reel',
  });
  bulkItems.push({
    url: 'https://storage.starvnt.com/media/debanjan/wedding_cinematic_teaser.mov',
    originalFilename: 'cinematic_wedding_teaser.mov',
    mimeType: 'video/quicktime',
    durationSeconds: 150, // <300s -> HIGHLIGHT_FILM
    title: '2.5 Minute Cinematic Teaser',
  });
  bulkItems.push({
    url: 'https://storage.starvnt.com/media/debanjan/drone_aerial_cinematic.mp4',
    originalFilename: 'drone_aerial_venue_shot.mp4',
    mimeType: 'video/mp4',
    durationSeconds: 120,
    title: 'Drone Aerial Venue Coverage',
  });
  bulkItems.push({
    url: 'https://storage.starvnt.com/media/debanjan/full_ceremony_reception.mp4',
    originalFilename: 'full_wedding_reception_cut.mp4',
    mimeType: 'video/mp4',
    durationSeconds: 1800, // 30 mins -> Full VIDEO
    title: 'Full Reception Documentary Cut',
  });

  assert.equal(bulkItems.length, 56, 'Batch contains 52 photos + 4 videos');

  // 3. Vendor executes bulk upload
  const uploadRes = await request(ctx.app)
    .post('/api/vendor/portfolio/bulk-upload')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      items: bulkItems,
      defaultContext: {
        eventType: 'Wedding',
        locality: 'New Town',
        city: 'Kolkata',
      },
    });

  assert.equal(uploadRes.status, 201);
  assert.equal(uploadRes.body.ok, true);
  assert.equal(uploadRes.body.ingestedCount, 56);
  assert.equal(uploadRes.body.photoCount, 52);
  assert.equal(uploadRes.body.videoCount, 4);

  // 4. Verify pipeline auto-classification and tag suggestions
  const ingested = uploadRes.body.items;
  const samplePhoto = ingested.find((i) => i.originalFilename.includes('wedding_candid_photo_1.jpg'));
  assert.ok(samplePhoto);
  assert.equal(samplePhoto.mediaType, 'IMAGE');
  assert.equal(samplePhoto.status, 'VENDOR_REVIEW'); // Placed in VENDOR_REVIEW for approval
  assert.ok(samplePhoto.tags.includes('Candid'));
  assert.ok(samplePhoto.tags.includes('Wedding'));
  assert.ok(samplePhoto.thumbnailUrl.includes('?w=300'));

  const sampleReel = ingested.find((i) => i.originalFilename.includes('wedding_teaser_reel.mp4'));
  assert.ok(sampleReel);
  assert.equal(sampleReel.mediaType, 'REEL');
  assert.equal(sampleReel.deliverableType, 'Social Media Reel');

  const sampleDrone = ingested.find((i) => i.originalFilename.includes('drone_aerial_venue_shot.mp4'));
  assert.ok(sampleDrone);
  assert.ok(sampleDrone.tags.includes('Aerial/Drone'));

  // 5. Vendor reviews and publishes all ingested items
  const itemIds = ingested.map((i) => i._id);
  const publishRes = await request(ctx.app)
    .post('/api/vendor/portfolio/publish')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({
      itemIds,
      bulkUpdates: {
        description: 'Captured in 4K at Kisan Palace New Town, 2026',
      },
    });

  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.body.publishedCount, 56);

  // 6. Verify items now appear in vendor portfolio query as PUBLISHED
  const listRes = await request(ctx.app)
    .get('/api/vendor/portfolio?status=PUBLISHED')
    .set('Authorization', `Bearer ${vendorToken}`);

  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.count, 56);
  assert.ok(listRes.body.items.every((i) => i.status === 'PUBLISHED'));

  // 7. Security: Another vendor CANNOT publish or modify items belonging to first vendor
  const hijackAttempt = await request(ctx.app)
    .post('/api/vendor/portfolio/publish')
    .set('Authorization', `Bearer ${otherVendorToken}`)
    .send({
      itemIds: [itemIds[0]],
      bulkUpdates: { title: 'Hacked Title' },
    });

  assert.equal(hijackAttempt.status, 200);
  // Zero items modified because of strict tenant isolation
  assert.equal(hijackAttempt.body.publishedCount, 0);

  // 8. Public surface can now view published portfolio
  const publicRes = await request(ctx.app).get(`/api/vendors/${vendorUser.vendorOrganization}/portfolio`);
  assert.equal(publicRes.status, 200);
  assert.equal(publicRes.body.count, 56);
});
