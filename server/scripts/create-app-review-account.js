import { randomBytes } from 'node:crypto';
import { config } from '../src/config.js';
import { externalConn } from '../src/db/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { hashPassword } from '../src/external/utils/password.js';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.appReviewEmail) ||
    !/^[0-9]{8}$/.test(config.appReviewOtp)) {
  console.error('Set APP_REVIEW_EMAIL and an 8-digit APP_REVIEW_OTP before seeding.');
  process.exit(1);
}

const password = `${randomBytes(18).toString('base64url')}A1!`;

try {
  await externalConn.openUri(config.mongoUriExternal);
  if (await ExternalUser.exists({ email: config.appReviewEmail })) {
    throw new Error('Review email already belongs to an account; refusing to change it.');
  }
  await ExternalUser.create({
    fullName: 'Indus Appstore Reviewer',
    email: config.appReviewEmail,
    passwordHash: await hashPassword(password),
    accountType: 'CUSTOMER',
    roles: ['CUSTOMER'],
    authProvider: 'EMAIL',
    isAppReviewAccount: true,
    status: 'ACTIVE',
  });
  console.log(JSON.stringify({
    account: config.appReviewEmail,
    password,
    otp: config.appReviewOtp,
    note: 'Store these reviewer credentials securely. The OTP works only after requesting a challenge and only while the same values are configured on the backend.',
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await externalConn.close();
}
