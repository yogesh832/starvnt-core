import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Vendor Messages: Dynamic DB-backed messaging, blank initial state & strict tenant isolation', async () => {
  const { app, mongod, models, disconnectDB } = await setupTestApp();

  try {
    // 1. Register vendor A
    const regResA = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Vikram Sethi',
        businessName: 'Sethi Sound & Stage',
        category: 'Sound & Lighting',
        city: 'Delhi',
        email: 'vikram@sethisound.com',
        password: 'Password123!',
      });

    assert.equal(regResA.status, 201);
    const tokenA = regResA.body.accessToken;

    // 2. GET /api/vendor/messages/threads must return completely BLANK initial state
    const emptyThreadsRes = await request(app)
      .get('/api/vendor/messages/threads')
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(emptyThreadsRes.status, 200);
    assert.equal(emptyThreadsRes.body.ok, true);
    assert.equal(emptyThreadsRes.body.threads.length, 0, 'New vendor must start with 0 message threads');

    // 3. Create a real dynamic thread for an event inquiry
    const createThreadRes = await request(app)
      .post('/api/vendor/messages/threads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientName: 'Aarav & Meera',
        eventName: 'Sangeet Stage & Live Sound',
        eventType: 'Sangeet',
        eventDate: '2026-12-14',
        venueLocation: 'Heritage Haveli, Delhi',
        text: 'Hello Aarav, we would be delighted to handle the stage sound. What is the expected guest count?',
      });

    assert.equal(createThreadRes.status, 201);
    assert.equal(createThreadRes.body.ok, true);
    const threadA = createThreadRes.body.thread;
    assert.equal(threadA.clientName, 'Aarav & Meera');
    assert.equal(threadA.messages.length, 1);
    assert.equal(threadA.messages[0].sender, 'VENDOR');
    assert.equal(threadA.messages[0].text, 'Hello Aarav, we would be delighted to handle the stage sound. What is the expected guest count?');

    // 4. Send an additional reply from Vendor
    const sendReplyRes = await request(app)
      .post(`/api/vendor/messages/threads/${threadA._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        text: 'We also provide wireless microphones and surround monitor arrays included in our package.',
      });

    assert.equal(sendReplyRes.status, 201);
    assert.equal(sendReplyRes.body.ok, true);
    assert.equal(sendReplyRes.body.thread.messages.length, 2);
    assert.equal(sendReplyRes.body.thread.lastMessageText, 'We also provide wireless microphones and surround monitor arrays included in our package.');

    // 5. Verify thread appears in GET /api/vendor/messages/threads
    const listRes = await request(app)
      .get('/api/vendor/messages/threads')
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.threads.length, 1);
    assert.equal(listRes.body.threads[0]._id, threadA._id);

    // 6. Test strict tenant isolation with Vendor B
    const regResB = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Sunita Rao',
        businessName: 'Rao Floral Designs',
        category: 'Decor & Styling',
        city: 'Bengaluru',
        email: 'sunita@raofloral.com',
        password: 'Password123!',
      });

    assert.equal(regResB.status, 201);
    const tokenB = regResB.body.accessToken;

    // Vendor B must see 0 threads
    const listResB = await request(app)
      .get('/api/vendor/messages/threads')
      .set('Authorization', `Bearer ${tokenB}`);

    assert.equal(listResB.status, 200);
    assert.equal(listResB.body.threads.length, 0, 'Vendor B must not see Vendor A threads');

    // Vendor B must receive 404 when attempting to access Vendor A thread
    const accessResB = await request(app)
      .get(`/api/vendor/messages/threads/${threadA._id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    assert.equal(accessResB.status, 404, 'Vendor B cannot access Vendor A thread');

    // Vendor B cannot post message to Vendor A thread
    const postResB = await request(app)
      .post(`/api/vendor/messages/threads/${threadA._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ text: 'Unauthorized message attempt' });

    assert.equal(postResB.status, 404, 'Vendor B cannot post to Vendor A thread');
  } finally {
    await disconnectDB();
    if (mongod) await mongod.stop();
  }
});
