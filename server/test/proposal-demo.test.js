import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { registerLlmAdapter } from '../src/customer/aura/llmAdapter.js';
import { seedProposalDemo, DEMO_ACCOUNTS, DEMO_PASSWORD } from '../src/proposals/demo.js';
import { browserPath, closeRenderer } from '../src/proposals/render.service.js';
import { answerIsGrounded } from '../src/proposals/assistant.service.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { CustomerEvent } from '../src/customer/models/index.js';

let app, mongo, demo;
const HAS_BROWSER = Boolean(browserPath());

before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_demo')), adminConn.openUri(mongo.getUri('proposal_demo_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map((m) => m.init()));
  demo = await seedProposalDemo();
}, { timeout: 180000 });
after(async () => { registerLlmAdapter(null); await closeRenderer(); await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });

const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200)).body.accessToken;
const adminLogin = async (email) => (await request(app).post('/api/admin/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200)).body.accessToken;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

test('demo seed creates three journeys at the expected readiness stages and is re-runnable', { timeout: 180000 }, async () => {
  const maker = await adminLogin(DEMO_ACCOUNTS.maker);
  const state = async (id) => (await request(app).get(`/api/admin/proposal-studio/events/${id}/readiness`).set(auth(maker)).expect(200)).body.state;
  assert.equal(await state(demo.events.wedding), 'READY_FOR_GENERATION');
  assert.equal(await state(demo.events.birthday), 'VENDOR_APPROVAL_PENDING');
  assert.equal(await state(demo.events.corporate), 'COMMERCIAL_APPROVAL_PENDING');

  // Finance checker approves the corporate record through the real login + API.
  const checker = await adminLogin(DEMO_ACCOUNTS.checker);
  const records = (await request(app).get(`/api/admin/proposal-studio/events/${demo.events.corporate}/commercial`).set(auth(checker)).expect(200)).body.records;
  await request(app).post(`/api/admin/proposal-studio/commercial/${records[0]._id}/decision`).set(auth(checker)).send({ decision: 'APPROVE' }).expect(200);
  assert.equal(await state(demo.events.corporate), 'READY_FOR_GENERATION');
  // The maker cannot approve commercial records.
  await request(app).post(`/api/admin/proposal-studio/commercial/${records[0]._id}/decision`).set(auth(maker)).send({ decision: 'APPROVE' }).expect(403);

  const again = await seedProposalDemo();
  assert.notEqual(again.events.wedding, demo.events.wedding, 're-run replaces demo events');
  demo = again;
});

test('Aura+ answers proposal questions only from the published snapshot', { timeout: 120000, skip: !HAS_BROWSER && 'needs a local Chrome/Edge to publish the demo PDF' }, async () => {
  const customer = await login(DEMO_ACCOUNTS.customer);
  const list = (await request(app).get('/api/customer/proposals').set(auth(customer)).expect(200)).body.proposals;
  const wedding = list.find((p) => String(p.eventId) === demo.events.wedding);
  assert.equal(wedding.kind, 'FINAL');
  assert.equal(wedding.packageTotal, 495000);
  const birthday = list.find((p) => String(p.eventId) === demo.events.birthday);
  assert.equal(birthday.kind, 'PRELIMINARY');

  // No LLM configured: deterministic facts.
  registerLlmAdapter({ chat: async () => { throw new Error('offline'); } });
  const ask = async (question) => (await request(app).post(`/api/customer/proposals/${wedding.proposalId}/ask`).set(auth(customer)).send({ question }).expect(200)).body;
  const schedule = await ask('What is my payment schedule?');
  assert.equal(schedule.source, 'facts');
  assert.match(schedule.answer, /1,48,500/);
  assert.match((await ask('What is excluded?')).answer, /Venue/);
  assert.match((await ask('What is my approved menu?')).answer, /Fuchka/);
  const change = await ask('Can I add a live ice cream counter instead?');
  assert.ok(change.suggestedChange, 'change intent is offered as a change request, never applied');

  // An LLM that invents a price is rejected in favour of the facts.
  registerLlmAdapter({ chat: async () => ({ text: 'Your total is ₹3,99,999 including a free DJ.' }) });
  const guarded = await ask('What is my total?');
  assert.equal(guarded.source, 'facts');
  assert.match(guarded.answer, /4,95,000/);
  registerLlmAdapter({ chat: async () => ({ text: 'Your package total is ₹4,95,000.' }) });
  assert.equal((await ask('What is my total?')).source, 'aura');

  // Internal vendor prices never appear.
  for (const q of ['Explain the budget.', 'What is included in my package?']) {
    const a = (await ask(q)).answer;
    for (const leak of ['2,00,000', '52,000', '28,000', '1,40,000']) assert.ok(!a.includes(leak), `answer leaks ${leak}`);
  }
});

test('demo can be attached to an existing OTP customer without touching their own events', { timeout: 180000 }, async () => {
  const user = await ExternalUser.create({ fullName: 'Sourav Kumar', email: 'otp.customer@example.test', accountType: 'CUSTOMER' });
  const own = await CustomerEvent.create({ customer: user._id, eventType: 'wedding', title: 'My wedding', eventDate: '2026-11-27', city: 'Kolkata' });
  await assert.rejects(seedProposalDemo({ customerEmail: 'nobody@example.test', render: false }), /No account found/);

  const first = await seedProposalDemo({ customerEmail: 'OTP.Customer@example.test', render: false });
  assert.equal(first.accounts.customer, 'otp.customer@example.test');
  assert.equal(first.customerIsDemoAccount, false);
  await seedProposalDemo({ customerEmail: 'otp.customer@example.test', render: false });

  assert.ok(await CustomerEvent.exists({ _id: own._id }), "the customer's own event survives demo resets");
  assert.equal(await CustomerEvent.countDocuments({ customer: user._id }), 4, 'own event + exactly one set of three demo events');
  const fresh = await ExternalUser.findById(user._id).select('+passwordHash').lean();
  assert.equal(fresh.fullName, 'Sourav Kumar');
  assert.ok(!fresh.passwordHash, 'an OTP account is not given a password');
});

test('grounding check accepts snapshot amounts and rejects invented ones', () => {
  const snapshot = { budget: { packageTotal: 495000, allocations: [{ amount: 65000 }] } };
  assert.equal(answerIsGrounded('Total ₹4,95,000 and décor ₹65,000.', snapshot), true);
  assert.equal(answerIsGrounded('Total ₹5,00,000.', snapshot), false);
  assert.equal(answerIsGrounded('No amounts here.', snapshot), true);
  assert.equal(answerIsGrounded('Décor is Rs. 65,000 for 300 guests, 30% advance.', snapshot), true);
  assert.equal(answerIsGrounded('Total Rs. 3,99,999.', snapshot), false, 'Rs. prefix cannot bypass the check');
  assert.equal(answerIsGrounded('Total INR 399999.', snapshot), false);
  assert.equal(answerIsGrounded('About 4.95 lakh in total.', snapshot), true);
  assert.equal(answerIsGrounded('About 3.5 lakh in total.', snapshot), false, 'lakh wording cannot bypass the check');
});
