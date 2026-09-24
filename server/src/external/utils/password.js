import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string' || !hash) {
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/** Minimum policy for external accounts. */
export function passwordIssues(plain) {
  const issues = [];
  if (typeof plain !== 'string' || plain.length < 8) issues.push('Password must be at least 8 characters');
  if (!/[a-zA-Z]/.test(plain || '')) issues.push('Password must contain a letter');
  if (!/[0-9]/.test(plain || '')) issues.push('Password must contain a number');
  return issues;
}
