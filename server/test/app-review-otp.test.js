import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

function fixture({ reviewAccountExists = true } = {}) {
  const records = new Map();
  const config = {
    appReviewEmail: 'indus-review@starvnt.com',
    appReviewOtp: '74829163',
    resendApiKey: '',
    emailServerHost: 'smtp.test',
    emailServerPort: 587,
    emailServerUser: 'sender',
    emailServerPassword: 'password',
    emailFrom: 'sender@starvnt.com',
  };
  const OtpVerification = {
    async deleteMany({ phone }) { records.delete(phone); },
    async create(data) {
      const record = { ...data, _id: data.phone, async save() {} };
      records.set(data.phone, record);
      return record;
    },
    async findOne({ phone, expiresAt }) {
      const record = records.get(phone);
      return record && record.expiresAt > expiresAt.$gt ? record : null;
    },
    async deleteOne({ _id }) { records.delete(_id); },
  };
  const modules = {
    '../../config.js': { config },
    '../models/OtpVerification.js': { OtpVerification },
    '../models/ExternalUser.js': { ExternalUser: { exists: async ({ email }) => reviewAccountExists && email === config.appReviewEmail } },
    nodemailer: { createTransport: () => ({ sendMail: async ({ to }) => ({ accepted: [to], rejected: [] }) }) },
    resend: { Resend: class {} },
    'node:crypto': { randomInt: () => 345678 },
  };
  const source = readFileSync(new URL('../src/external/services/emailOtp.service.js', import.meta.url), 'utf8');
  const code = transformSync(source, { format: 'cjs', loader: 'js' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(modules[name], `Unexpected dependency: ${name}`);
    return modules[name];
  }, module, module.exports);
  return { ...module.exports, records };
}

test('review OTP requires a fresh challenge for the exact account and is never emailed', async () => {
  const f = fixture();
  assert.equal((await f.verifyEmailOtp('indus-review@starvnt.com', '74829163')).valid, false);
  const result = await f.sendEmailOtp('indus-review@starvnt.com');
  assert.equal(result.emailSent, false);
  assert.equal(result.delivery.provider, 'app-review');
  assert.equal(f.records.get('indus-review@starvnt.com').otp, '74829163');
  assert.equal((await f.verifyEmailOtp('indus-review@starvnt.com', '74829163')).valid, true);
});

test('review code and old master codes cannot verify another account', async () => {
  const f = fixture();
  await f.sendEmailOtp('customer@example.com');
  assert.equal(f.records.get('customer@example.com').otp, '345678');
  for (const otp of ['74829163', '123456', '999999']) {
    assert.equal((await f.verifyEmailOtp('customer@example.com', otp)).valid, false);
  }
  assert.equal((await f.verifyEmailOtp('customer@example.com', '345678')).valid, true);
});

test('matching email without a review-account marker still uses a normal emailed OTP', async () => {
  const f = fixture({ reviewAccountExists: false });
  const result = await f.sendEmailOtp('indus-review@starvnt.com');
  assert.equal(result.emailSent, true);
  assert.equal(result.delivery.provider, 'smtp');
  assert.equal(f.records.get('indus-review@starvnt.com').otp, '345678');
  assert.equal((await f.verifyEmailOtp('indus-review@starvnt.com', '74829163')).valid, false);
});

test('review challenge expires and incorrect codes cannot be consumed', async () => {
  const f = fixture();
  await f.sendEmailOtp('indus-review@starvnt.com');
  assert.equal((await f.consumeVerifiedEmailOtp('indus-review@starvnt.com', '123456')).valid, false);
  f.records.get('indus-review@starvnt.com').expiresAt = new Date(Date.now() - 1000);
  assert.equal((await f.verifyEmailOtp('indus-review@starvnt.com', '74829163')).valid, false);
});
