import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Vendor Reviews: Authentic DB/API-driven reviews, blank initial state, dynamic stats & tenant isolation', async () => {
  const { app, mongod, models, disconnectDB } = await setupTestApp();

  try {
    // 1. Register a new vendor
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Kabir Sen',
        businessName: 'Sen Cinema Works',
        category: 'Cinematic Production',
        city: 'Kolkata',
        email: 'kabir@sencinema.com',
        password: 'Password123!',
      });

    assert.equal(regRes.status, 201);
    const token = regRes.body.accessToken;
    const vendorOrgId = regRes.body.user.vendorOrganization;

    // Verify VendorOrganization rating defaults to 0, not fake 5.0
    const vendorOrg = await models.VendorOrganization.findById(vendorOrgId);
    assert.equal(vendorOrg.rating.count, 0, 'Initial review count must be 0');
    assert.equal(vendorOrg.rating.average, 0, 'Initial rating average must be 0');

    // 2. GET /api/vendor/reviews must return completely BLANK state
    const emptyReviewsRes = await request(app)
      .get('/api/vendor/reviews')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(emptyReviewsRes.status, 200);
    assert.equal(emptyReviewsRes.body.ok, true);
    assert.equal(emptyReviewsRes.body.reviews.length, 0, 'New vendor must have 0 reviews');
    assert.equal(emptyReviewsRes.body.stats.totalReviews, 0);
    assert.equal(emptyReviewsRes.body.stats.averageRating, '0.0');
    assert.equal(emptyReviewsRes.body.stats.recommendPercentage, '0%');

    // 3. Post a 5-star verified review to the DB
    const createReviewRes = await request(app)
      .post('/api/vendor/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Pooja & Rohan',
        customerEmail: 'pooja@example.com',
        bookingReference: 'BK-2026-901',
        serviceName: 'Grand Cinematic Wedding',
        eventType: 'Wedding',
        eventDate: '2026-11-20',
        rating: 5,
        reviewText: 'Outstanding cinematic film delivered on time! Every guest loved the teaser.',
        wouldRecommend: true,
      });

    assert.equal(createReviewRes.status, 201);
    assert.equal(createReviewRes.body.ok, true);
    assert.equal(createReviewRes.body.review.customerName, 'Pooja & Rohan');
    assert.equal(createReviewRes.body.review.rating, 5);
    assert.equal(createReviewRes.body.review.isVerified, true);
    const reviewId = createReviewRes.body.review._id;

    // 4. Verify VendorOrganization document updated its rating in DB
    const updatedVendorOrg = await models.VendorOrganization.findById(vendorOrgId);
    assert.equal(updatedVendorOrg.rating.count, 1);
    assert.equal(updatedVendorOrg.rating.average, 5);

    // 5. Post a second 4-star review
    const secondReviewRes = await request(app)
      .post('/api/vendor/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Ananya Roy',
        serviceName: 'Pre-wedding Shoot',
        eventType: 'Pre-wedding',
        rating: 4,
        reviewText: 'Great shots and prompt delivery.',
        wouldRecommend: true,
      });

    assert.equal(secondReviewRes.status, 201);

    // 6. Verify GET /api/vendor/reviews computes live stats dynamically
    const liveReviewsRes = await request(app)
      .get('/api/vendor/reviews')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(liveReviewsRes.status, 200);
    assert.equal(liveReviewsRes.body.reviews.length, 2);
    assert.equal(liveReviewsRes.body.stats.totalReviews, 2);
    assert.equal(liveReviewsRes.body.stats.averageRating, '4.5'); // (5 + 4) / 2 = 4.5
    assert.equal(liveReviewsRes.body.stats.recommendPercentage, '100%');
    assert.equal(liveReviewsRes.body.stats.distribution['5'], 1);
    assert.equal(liveReviewsRes.body.stats.distribution['4'], 1);

    // 7. Vendor replies to the review
    const replyRes = await request(app)
      .post(`/api/vendor/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Thank you Pooja and Rohan! It was a delight capturing your celebration.' });

    assert.equal(replyRes.status, 200);
    assert.equal(replyRes.body.ok, true);
    assert.equal(
      replyRes.body.review.vendorReply.text,
      'Thank you Pooja and Rohan! It was a delight capturing your celebration.'
    );
    assert.ok(replyRes.body.review.vendorReply.repliedAt);

    // 8. Tenant Isolation: Another vendor cannot see or reply to Vendor 1's reviews
    const vendor2Res = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Vikram Bose',
        businessName: 'Bose Audio Live',
        category: 'DJ & Sound',
        city: 'Kolkata',
        email: 'vikram@boseaudio.com',
        password: 'Password123!',
      });
    const token2 = vendor2Res.body.accessToken;

    // Vendor 2 has 0 reviews
    const v2ReviewsRes = await request(app)
      .get('/api/vendor/reviews')
      .set('Authorization', `Bearer ${token2}`);
    assert.equal(v2ReviewsRes.body.reviews.length, 0);
    assert.equal(v2ReviewsRes.body.stats.totalReviews, 0);
    assert.equal(v2ReviewsRes.body.stats.averageRating, '0.0');

    // Vendor 2 cannot reply to Vendor 1's review
    const v2ReplyRes = await request(app)
      .post(`/api/vendor/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ text: 'Unauthorized reply attempt' });
    assert.equal(v2ReplyRes.status, 404);
  } finally {
    await disconnectDB();
    await mongod.stop();
  }
});
