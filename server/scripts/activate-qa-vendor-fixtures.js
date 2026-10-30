import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(serverRoot, '.env.test.local');
if (!fs.existsSync(envPath)) throw new Error('QA activation requires server/.env.test.local.');
const qaEnv = dotenv.parse(fs.readFileSync(envPath));
for (const [key, database] of [['MONGO_URI_EXTERNAL', 'starvnt_test_external'], ['MONGO_URI_ADMIN', 'starvnt_test_admin']]) {
  let parsed;
  try { parsed = new URL(qaEnv[key]); } catch { throw new Error(`${key} is missing or invalid in server/.env.test.local.`); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.pathname !== `/${database}` || (!local && qaEnv.QA_ALLOW_REMOTE_DATABASE !== 'true')) {
    throw new Error(`${key} must point to the dedicated ${database} QA database.`);
  }
}
Object.assign(process.env, qaEnv, { NODE_ENV: 'test', STARVNT_ENV_FILE: envPath });

const [{ connectDB, disconnectDB }, { ExternalUser }, { VendorOrganization }, { VendorFinancialProfile }, { AdminUser }, { evaluateVendorActivation }, { REAL_VENDORS }] = await Promise.all([
  import('../src/db/index.js'),
  import('../src/external/models/ExternalUser.js'),
  import('../src/external/models/VendorOrganization.js'),
  import('../src/external/models/VendorFinancialProfile.js'),
  import('../src/admin/models/AdminUser.js'),
  import('../src/external/services/vendorActivation.service.js'),
  import('./seed-real-vendors.js'),
]);

await connectDB();
try {
  const admin = await AdminUser.findOne({ email: 'admin@starvnt.com' }).select('_id');
  if (!admin) throw new Error('The synthetic QA admin fixture is missing.');
  let activated = 0;
  for (const fixture of REAL_VENDORS) {
    const owner = await ExternalUser.findOne({ email: fixture.owner.email }).select('_id fullName');
    const org = owner && await VendorOrganization.findOne({ owner: owner._id });
    if (!org) continue;
    if (org.status === 'SUSPENDED' || org.status === 'REJECTED' || org.activationReview?.status === 'REJECTED') {
      console.warn(`[qa-seed] Skipped restricted fixture: ${org.businessName}`);
      continue;
    }
    const readiness = await evaluateVendorActivation(org._id);
    if (readiness.completionPercentage !== 100) {
      console.warn(`[qa-seed] Skipped incomplete fixture (${readiness.completionPercentage}%): ${org.businessName}`);
      continue;
    }
    const now = new Date();
    org.status = 'ACTIVE';
    org.activationState = 'ACTIVE';
    org.isCommerciallyActive = true;
    org.isProfileCompleted = true;
    org.verification = { isVerified: true, verifiedAt: now };
    org.activationReview = {
      status: 'APPROVED',
      reason: 'Approved synthetic QA fixture for end-to-end customer catalogue testing.',
      requestedAt: org.activationReview?.requestedAt || now,
      reviewedAt: now,
      reviewedBy: admin._id,
    };
    await org.save();
    await VendorFinancialProfile.findOneAndUpdate(
      { vendor: org._id },
      { $set: {
        'pan.legalName': owner.fullName || org.businessName,
        'pan.verificationStatus': 'VERIFIED',
        'pan.verifiedAt': now,
        'bankAccount.verificationStatus': 'VERIFIED',
        'bankAccount.nameMatchStatus': 'EXACT',
        'bankAccount.lastVerifiedAt': now,
        isSettlementEligible: false,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    activated++;
  }
  console.log(`[qa-seed] Approved ${activated} complete synthetic vendor fixtures in the isolated QA database.`);
} finally {
  await disconnectDB();
}
