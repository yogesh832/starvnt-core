import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptMfaSecret, encryptMfaSecret, generateMfaSecret, otpauthUrl } from '../src/admin/utils/mfa.js';

test('MFA secrets are generated, encrypted, and exposed as an otpauth URL', () => {
  const secret = generateMfaSecret();
  const encrypted = encryptMfaSecret(secret);
  const admin = { email: 'admin@example.com' };

  assert.match(secret, /^[A-Z2-7]+$/);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted), secret);
  assert.match(otpauthUrl(admin, secret), /^otpauth:\/\/totp\//);
  assert.match(otpauthUrl(admin, secret), /secret=/);
});
