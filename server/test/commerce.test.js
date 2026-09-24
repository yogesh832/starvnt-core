import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { setup, teardown, makeUser, uniqueDate, scriptLlm, sid } from './helpers.js';

let app;
let models;
const KEY = 'test-internal-key-123';
const WEBHOOK_SECRET = 'whsec_test';
const orders = [];
const realFetch = globalThis.fetch;

before(async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.INTERNAL_API_KEY = KEY;
  // Fake the Razorpay orders API; never call the network in tests.
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.razorpay.com/v1/orders')) {
      const body = JSON.parse(init.body);
      const order = { id: `order_${orders.length + 1}`, amount: body.amount, currency: body.currency, receipt: body.receipt };
      orders.push({ order, auth: init.headers.Authorization });
      return new Response(JSON.stringify(order), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
  };
  ({ app, models } = await setup());
  const { seedDemoListings } = await import('../src/customer/seeds/demoListings.js');
  await seedDemoListings();
});
after(async () => {
  globalThis.fetch = realFetch;
  await teardown();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const internal = (path) => request(app).post(`/api/internal${path}`).set('x-internal-key', KEY);

async function planned(user, token, facts = {}) {
  const ev = await models.CustomerEvent.create({
    customer: user._id, eventType: 'wedding', title: 'My wedding', status: 'draft', eventDate: uniqueDate(), city: 'Kolkata', guestCount: 200, ...facts,
  });
  await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  return ev;
}

/** select → quote → accept; returns reservations. */
async function reserve(token, ev, picks) {
  for (const [category, optionId] of picks) {
    await request(app).post(`/api/customer/events/${ev._id}/requirements/${category}/select`).set(auth(token)).send({ optionId }).expect(200);
  }
  const q = (await request(app).post(`/api/customer/events/${ev._id}/quotes`).set(auth(token)).expect(201)).body.quote;
  const a = await request(app).post(`/api/customer/quotes/${q.id}/accept`).set(auth(token)).expect(200);
  return { quote: q, reservations: a.body.reservations };
}

async function startPayment(token, ev, reservation) {
  return (await request(app).post(`/api/customer/events/${ev._id}/reservations/${reservation.id}/pay`).set(auth(token)).expect(200)).body;
}

let webhookCounter = 0;
function webhook(eventType, { orderId, amountPaise, currency = 'INR', eventId, signature } = {}) {
  webhookCounter += 1;
  const body = JSON.stringify({
    event: eventType,
    payload: {
      payment: { entity: { id: `pay_${webhookCounter}`, order_id: orderId, amount: amountPaise, currency, error_description: 'Card declined' } },
      ...(eventType === 'order.paid' ? { order: { entity: { id: orderId, amount_paid: amountPaise, currency } } } : {}),
    },
  });
  const sig = signature ?? crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', sig)
    .set('x-razorpay-event-id', eventId || `evt_${webhookCounter}`)
    .send(body);
}

test('accepting a quote creates 48 h holds, never bookings', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  const { quote, reservations } = await reserve(token, ev, [['photography', 'demo_pho_01']]);
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, 'pending_payment');
  const hours = (new Date(reservations[0].expiresAt) - Date.now()) / 3600000;
  assert.ok(hours > 47.9 && hours <= 48);
  assert.equal(await models.Booking.countDocuments({ event: ev._id }), 0);
  assert.equal((await request(app).post(`/api/customer/quotes/${quote.id}/accept`).set(auth(token)).expect(409)).body.error, 'QUOTE_NOT_OPEN');

  const d = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  assert.ok(d.body.attention.some((a) => a.type === 'reservation_awaiting_payment'));
});

test('payments: 503 without keys; checkout-complete only reaches processing', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  const { reservations } = await reserve(token, ev, [['photography', 'demo_pho_01']]);

  const saved = process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_KEY_SECRET;
  const r503 = await request(app).post(`/api/customer/events/${ev._id}/reservations/${reservations[0].id}/pay`).set(auth(token)).expect(503);
  assert.equal(r503.body.error, 'PAYMENT_NOT_CONFIGURED');
  process.env.RAZORPAY_KEY_SECRET = saved;

  const p1 = await startPayment(token, ev, reservations[0]);
  assert.equal(p1.checkout.amount, 60000 * 100);
  assert.equal(p1.checkout.key, 'rzp_test_key');
  const p2 = await startPayment(token, ev, reservations[0]);
  assert.equal(p2.checkout.orderId, p1.checkout.orderId, 'a pending order is reused');

  const cc = await request(app)
    .post(`/api/customer/events/${ev._id}/payments/${p1.payment.id}/checkout-complete`)
    .set(auth(token))
    .send({ razorpay_payment_id: 'pay_x', razorpay_signature: 'anything' })
    .expect(200);
  assert.equal(cc.body.payment.status, 'processing');
  assert.equal(await models.Booking.countDocuments({ event: ev._id }), 0, 'the browser is never proof of payment');
});

test('webhook: signature, verification, booking confirmation, idempotency', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  const { reservations } = await reserve(token, ev, [['photography', 'demo_pho_02']]);
  const { checkout, payment } = await startPayment(token, ev, reservations[0]);

  await webhook('payment.captured', { orderId: checkout.orderId, amountPaise: checkout.amount, signature: 'bad' }).expect(400);

  const ok = await webhook('payment.captured', { orderId: checkout.orderId, amountPaise: checkout.amount, eventId: 'evt_same' }).expect(200);
  assert.equal(ok.body.ok, true);
  const dup = await webhook('payment.captured', { orderId: checkout.orderId, amountPaise: checkout.amount, eventId: 'evt_same' }).expect(200);
  assert.equal(dup.body.duplicate, true);

  const b = await request(app).get(`/api/customer/events/${ev._id}/bookings`).set(auth(token)).expect(200);
  assert.equal(b.body.bookings.length, 1);
  assert.equal(b.body.bookings[0].status, 'confirmed');
  assert.equal(b.body.payments.find((p) => p.id === payment.id).status, 'verified');
  assert.equal(b.body.reservations[0].status, 'converted');
  const req = await models.EventRequirement.findOne({ event: ev._id, category: 'photography' }).lean();
  assert.equal(req.status, 'booked');
  const slot = await models.OptionAvailability.findOne({ optionId: 'demo_pho_02', date: ev.eventDate }).lean();
  assert.equal(slot.status, 'booked');
  const n = await request(app).get('/api/customer/notifications').set(auth(token)).expect(200);
  assert.ok(n.body.notifications.some((x) => x.title === 'Photography booked'));

  // Booked cost flows into the budget summary.
  const d = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  assert.equal(d.body.summary.budget.committedCost, 64000);
});

test('amount mismatch fails the payment; failed payments show up and can be retried', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  const { reservations } = await reserve(token, ev, [['catering', 'demo_cat_01']]);
  const { checkout, payment } = await startPayment(token, ev, reservations[0]);
  await webhook('payment.captured', { orderId: checkout.orderId, amountPaise: 100 }).expect(200);
  const p = await models.Payment.findById(payment.id).lean();
  assert.equal(p.status, 'failed');
  assert.equal(await models.Booking.countDocuments({ event: ev._id }), 0);
  const d = await request(app).get(`/api/customer/events/${ev._id}/dashboard`).set(auth(token)).expect(200);
  assert.ok(d.body.attention.some((a) => a.type === 'payment_failed'));

  const retry = await startPayment(token, ev, reservations[0]);
  assert.notEqual(retry.checkout.orderId, checkout.orderId, 'a new order after failure');
  await webhook('payment.failed', { orderId: retry.checkout.orderId, amountPaise: retry.checkout.amount }).expect(200);
  assert.equal((await models.Payment.findById(retry.payment.id).lean()).failureReason, 'Card declined');
});

test('ops verification needs the key and an operator', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  const { reservations } = await reserve(token, ev, [['sound', 'demo_sound_01']]);
  const { payment } = await startPayment(token, ev, reservations[0]);
  await request(app).post(`/api/internal/ops/payments/${payment.id}/verify`).send({ operator: 'ravi' }).expect(401);
  await request(app).post(`/api/internal/ops/payments/${payment.id}/verify`).set('x-internal-key', 'wrong').send({ operator: 'ravi' }).expect(401);
  await internal(`/ops/payments/${payment.id}/verify`).send({}).expect(400);
  const r = await internal(`/ops/payments/${payment.id}/verify`).send({ operator: 'ravi' }).expect(200);
  assert.equal(r.body.payment.status, 'verified');
  assert.equal(r.body.booking.status, 'confirmed');
  const again = await internal(`/ops/payments/${payment.id}/verify`).send({ operator: 'ravi' }).expect(200);
  assert.equal(again.body.booking.id, r.body.booking.id, 'idempotent');

  const hist = await request(app).get(`/api/customer/events/${ev._id}/history`).set(auth(token)).expect(200);
  assert.ok(!JSON.stringify(hist.body).includes('ravi'), 'operator names never reach customers');
  assert.ok(hist.body.history.some((h) => h.text === 'Sound booked with Beat Box Audio'));
});

test('double booking: the second payment waits under review', async () => {
  const date = uniqueDate();
  const a = await makeUser();
  const b = await makeUser();
  const evA = await planned(a.user, a.token, { eventDate: date });
  const evB = await planned(b.user, b.token, { eventDate: date });
  const ra = (await reserve(a.token, evA, [['makeup', 'demo_makeup_01']])).reservations[0];
  const rb = (await reserve(b.token, evB, [['makeup', 'demo_makeup_01']])).reservations[0];
  const pa = await startPayment(a.token, evA, ra);
  const pb = await startPayment(b.token, evB, rb);
  await internal(`/ops/payments/${pa.payment.id}/verify`).send({ operator: 'ops' }).expect(200);
  const second = await internal(`/ops/payments/${pb.payment.id}/verify`).send({ operator: 'ops' }).expect(200);
  assert.equal(second.body.booking.status, 'pending');
  const bView = await request(app).get(`/api/customer/events/${evB._id}/bookings`).set(auth(b.token)).expect(200);
  assert.ok(bView.body.bookings[0].underReviewReason);
  assert.equal((await models.EventRequirement.findOne({ event: evB._id, category: 'makeup' }).lean()).status, 'pending');
});

test('all essentials handled → event booked; vendor cancellation reopens', async () => {
  const { user, token } = await makeUser();
  const ev = await models.CustomerEvent.create({ customer: user._id, eventType: 'birthday', title: 'Bday', status: 'draft', eventDate: uniqueDate(), city: 'Kolkata' });
  await request(app).post(`/api/customer/events/${ev._id}/confirm`).set(auth(token)).expect(200);
  for (const c of ['venue', 'catering', 'decor']) {
    await request(app).patch(`/api/customer/events/${ev._id}/requirements/${c}`).set(auth(token)).send({ status: 'customer_provided', providedValue: 'Family' }).expect(200);
  }
  const { reservations } = await reserve(token, ev, [['cake', 'demo_cake_01']]);
  const { payment } = await startPayment(token, ev, reservations[0]);
  const v = await internal(`/ops/payments/${payment.id}/verify`).send({ operator: 'ops' }).expect(200);
  assert.equal((await models.CustomerEvent.findById(ev._id).lean()).status, 'booked');

  const c = await internal('/admin/simulate-vendor-cancellation').send({ bookingId: v.body.booking.id, operator: 'ops' }).expect(200);
  assert.equal(c.body.booking.status, 'cancelled');
  assert.equal((await models.CustomerEvent.findById(ev._id).lean()).status, 'planning');
  const req = await models.EventRequirement.findOne({ event: ev._id, category: 'cake' }).lean();
  assert.equal(req.status, 'pending');
  assert.equal(req.selectedOptionId, null);
  const opts = await request(app).get(`/api/customer/events/${ev._id}/services?category=cake`).set(auth(token)).expect(200);
  assert.equal(opts.body.options.find((o) => o.id === 'demo_cake_01').availability, 'unconfirmed', 'date released');
  const n = await request(app).get('/api/customer/notifications').set(auth(token)).expect(200);
  assert.ok(n.body.notifications.some((x) => x.type === 'cancellation'));

  await internal('/admin/reset').send({}).expect(410);
});

test('event day is forward-only and completion needs every service done', async () => {
  const { user, token } = await makeUser();
  const ev = await planned(user, token);
  const { reservations } = await reserve(token, ev, [['photography', 'demo_pho_01'], ['sound', 'demo_sound_01']]);
  const bookings = [];
  for (const r of reservations) {
    const { payment } = await startPayment(token, ev, r);
    bookings.push((await internal(`/ops/payments/${payment.id}/verify`).send({ operator: 'ops' }).expect(200)).body.booking);
  }
  const [b1, b2] = bookings;
  const exec = (b, body) => internal(`/ops/bookings/${b.id}/execution`).send({ operator: 'ops', ...body });

  await exec(b1, { status: 'checked_in' }).expect(200);
  assert.equal((await models.CustomerEvent.findById(ev._id).lean()).status, 'in_progress');
  assert.equal((await exec(b1, { status: 'checked_in' }).expect(409)).body.error, 'NOT_FORWARD');
  await exec(b1, { status: 'completed', evidence: { photoUrls: ['http://insecure.example/x.jpg'] } }).expect(400);
  await exec(b1, { status: 'completed', evidence: { note: 'Delivered 300 photos', photoUrls: ['https://cdn.example/x.jpg'] } }).expect(200);

  const early = await internal(`/ops/events/${ev._id}/complete`).send({ operator: 'ops' }).expect(409);
  assert.equal(early.body.error, 'INCOMPLETE_SERVICES');

  const day = await request(app).get(`/api/customer/events/${ev._id}/event-day`).set(auth(token)).expect(200);
  assert.equal(day.body.live, true);
  assert.equal(day.body.allCompleted, false);
  const s1 = day.body.services.find((s) => s.id === b1.id);
  assert.ok(s1.checkedInAt && s1.completedAt && !s1.startedAt, 'only recorded times, nothing assumed');
  assert.equal(s1.evidence.note, 'Delivered 300 photos');

  await exec(b2, { status: 'completed' }).expect(200);
  assert.equal((await models.CustomerEvent.findById(ev._id).lean()).status, 'completed');
  assert.equal((await models.EventRequirement.findOne({ event: ev._id, category: 'sound' }).lean()).status, 'completed');
});

test('Event Circle contexts, messages and updates', async () => {
  const { user, token } = await makeUser();
  const other = await makeUser();
  const ev = await planned(user, token);
  const { reservations } = await reserve(token, ev, [['decor', 'demo_dec_01']]);
  const { payment } = await startPayment(token, ev, reservations[0]);
  const booking = (await internal(`/ops/payments/${payment.id}/verify`).send({ operator: 'ops' }).expect(200)).body.booking;

  const circle = await request(app).get(`/api/customer/events/${ev._id}/circle`).set(auth(token)).expect(200);
  const ctx = circle.body.contexts.find((c) => c.bookingId === booking.id);
  assert.deepEqual(ctx.path.slice(0, 3), ['My wedding', 'Decoration', 'Royal Decor Co.']);
  assert.match(ctx.path[3], /^Booking #/);

  await request(app).post(`/api/customer/events/${ev._id}/messages`).set(auth(token)).send({ body: 'Can we add marigolds?', bookingId: booking.id }).expect(201);
  await request(app).post(`/api/customer/events/${ev._id}/messages`).set(auth(token)).send({ body: '' }).expect(400);
  await request(app).post(`/api/customer/events/${ev._id}/messages`).set(auth(other.token)).send({ body: 'hi' }).expect(404);
  await internal(`/ops/events/${ev._id}/messages`).send({ operator: 'ops', senderType: 'vendor', body: 'Yes, marigolds added.', bookingId: booking.id }).expect(201);
  await internal(`/ops/events/${ev._id}/messages`).send({ operator: 'ops', senderType: 'vendor', body: 'No booking' }).expect(400);

  const thread = await request(app).get(`/api/customer/events/${ev._id}/messages?bookingId=${booking.id}`).set(auth(token)).expect(200);
  assert.deepEqual(thread.body.messages.map((m) => m.senderName), ['You', 'Royal Decor Co.']);
  const whole = await request(app).get(`/api/customer/events/${ev._id}/messages`).set(auth(token)).expect(200);
  assert.equal(whole.body.messages.length, 0, 'booking threads stay in their context');

  const u = await request(app).get('/api/customer/updates').set(auth(token)).expect(200);
  assert.ok(u.body.unread >= 2);
  assert.equal(u.body.vendorMessages[0].body, 'Yes, marigolds added.');
  const home1 = await request(app).get('/api/customer/home').set(auth(token)).expect(200);
  assert.equal(home1.body.unreadUpdates, u.body.unread);
  await request(app).post('/api/customer/notifications/read-all').set(auth(token)).expect(200);
  const home2 = await request(app).get('/api/customer/home').set(auth(token)).expect(200);
  assert.equal(home2.body.unreadUpdates, 0);
});

test('manual form validates everything before writing', async () => {
  const { user, token } = await makeUser();
  const before = await models.CustomerEvent.countDocuments({ customer: user._id });
  const base = { eventType: 'birthday', eventDate: uniqueDate(), city: 'Pune', guestCount: 40, budgetRange: 'o_50k_1l' };
  await request(app).post('/api/customer/events').set(auth(token)).send({ ...base, services: [{ category: 'cake', status: 'customer_provided' }] }).expect(400);
  await request(app).post('/api/customer/events').set(auth(token)).send({ ...base, services: [{ category: 'spaceship', status: 'pending' }] }).expect(400);
  await request(app).post('/api/customer/events').set(auth(token)).send({ ...base, city: '' }).expect(400);
  assert.equal(await models.CustomerEvent.countDocuments({ customer: user._id }), before, 'no half-created events');

  const r = await request(app)
    .post('/api/customer/events')
    .set(auth(token))
    .send({ ...base, services: [{ category: 'venue', status: 'customer_provided', providedValue: 'Our terrace' }, { category: 'photographer', status: 'pending' }] })
    .expect(201);
  assert.equal(r.body.event.status, 'planning');
  assert.equal(r.body.event.budgetRangeLabel, '₹50K–1 Lakh');
  assert.equal(r.body.requirements.find((x) => x.category === 'venue').providedValue, 'Our terrace');
  assert.equal(r.body.requirements.find((x) => x.category === 'photography').status, 'pending');
  assert.ok(r.body.requirements.find((x) => x.category === 'cake'), 'template rows added');
});

test('Aura+ sees bookings and payment STATUS; past events are the customer\'s own', async () => {
  const a = await makeUser();
  const b = await makeUser();
  await models.CustomerEvent.create({ customer: a.user._id, eventType: 'puja', title: 'Secret Puja of A', status: 'planning', city: 'Kolkata' });
  const evB = await planned(b.user, b.token);
  await models.CustomerEvent.create({ customer: b.user._id, eventType: 'birthday', title: 'B old birthday', status: 'completed', city: 'Kolkata' });
  const { reservations } = await reserve(b.token, evB, [['photography', 'demo_pho_01']]);
  await startPayment(b.token, evB, reservations[0]);

  const llm = scriptLlm([{ text: 'ok', extracted: {} }]);
  await request(app).post('/api/aura/chat').set(auth(b.token)).send({ sessionId: sid(), eventId: String(evB._id), message: 'Is everything on track?' }).expect(200);
  const prompt = llm.calls[0].systemPrompt;
  assert.match(prompt, /"paymentStatus":\{"awaitingPayment":1/);
  assert.match(prompt, /B old birthday/);
  assert.ok(!prompt.includes('Secret Puja of A'));
});
