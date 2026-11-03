import crypto from 'node:crypto';
import { config } from '../config.js';
import { IdentityClaim } from './models.js';
import { ExternalUser } from '../external/models/ExternalUser.js';

export function identityDigest(kind, value) {
  const secret = process.env.IDENTITY_DIGEST_SECRET || config.jwtSecret;
  if (!secret) throw new Error('IDENTITY_DIGEST_KEY_NOT_CONFIGURED');
  return crypto.createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}
export const identityConflict = () => Object.assign(new Error('This identity needs an ownership review. Sign in with your existing method or contact support.'), { code: 'IDENTITY_REVIEW_REQUIRED', statusCode: 409 });
function exactPhonePattern(phone) {
  // Formatting-only equivalence is used to detect ambiguity, never to merge accounts.
  const digits = String(phone).replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(digits)) throw identityConflict();
  return new RegExp(`^\\+?[\\s()-]*${digits.split('').join('[\\s()-]*')}[\\s()-]*$`);
}

export async function findPhoneIdentity(phone) {
  const rows = await ExternalUser.find({ phone: exactPhonePattern(phone) }).limit(2);
  if (rows.length > 1) throw identityConflict();
  const claim = await IdentityClaim.findOne({ kind: 'PHONE', digest: identityDigest('PHONE', phone) }).lean();
  if (claim && (!rows[0] || String(claim.owner) !== String(rows[0]._id))) throw identityConflict();
  return rows[0] || null;
}

/** Call only with a provider-verified result, never a body field. */
export async function recordVerifiedIdentity(user, kind, value, method) {
  const digest = identityDigest(kind, value);
  const field = { EMAIL: 'email', PHONE: 'phone', GOOGLE: 'googleId' }[kind];
  if (!field || String(user[field]) !== String(value)) throw identityConflict();
  const others = await ExternalUser.exists({ [field]: kind === 'PHONE' ? exactPhonePattern(value) : value, _id: { $ne: user._id } });
  if (others) throw identityConflict();
  try {
    const row = await IdentityClaim.findOneAndUpdate({ kind, digest }, { $setOnInsert: { owner: user._id, method, verifiedAt: new Date() } }, { upsert: true, new: true });
    if (String(row.owner) !== String(user._id)) throw identityConflict();
  } catch (err) { if (err.code === 11000) throw identityConflict(); throw err; }
  user.set(`identityVerification.${field}`, { digest, method, verifiedAt: new Date() });
  await user.save();
}

export function verifiedContact(user, kind) {
  const field = kind === 'PHONE' ? 'phone' : 'email';
  const proof = user.identityVerification?.[field];
  return Boolean(user[field] && proof?.verifiedAt && !/DEVELOPMENT|TEST/.test(proof.method || '') && proof.digest === identityDigest(kind, user[field]));
}
