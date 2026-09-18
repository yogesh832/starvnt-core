import { config } from '../src/config.js';
import { connectDB, disconnectDB } from '../src/db/index.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { hashPassword, passwordIssues } from '../src/external/utils/password.js';

/**
 * Bootstrap the single SUPER_ADMIN account from environment variables.
 * Run:  npm run seed -w server
 * Requires SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD (+ Atlas URIs) in .env.
 * Idempotent: re-running updates name/password, never duplicates, and every
 * run is audit-logged.
 */
async function main() {
  if (!config.superAdminEmail || !config.superAdminPassword) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in server/.env'
    );
  }
  const issues = passwordIssues(config.superAdminPassword);
  if (issues.length) throw new Error(`Weak SUPER_ADMIN_PASSWORD: ${issues.join('; ')}`);

  await connectDB();

  const passwordHash = await hashPassword(config.superAdminPassword);
  const existing = await AdminUser.findOne({ email: config.superAdminEmail });

  if (existing) {
    existing.fullName = config.superAdminName;
    existing.passwordHash = passwordHash;
    existing.role = 'SUPER_ADMIN'; // re-assert, never downgrade via seed
    existing.status = 'ACTIVE';
    await existing.save();
    await AdminAuditLog.create({
      actor: existing._id,
      actorEmail: existing.email,
      action: 'SEED_SUPER_ADMIN_UPDATE',
      source: 'SEED',
      targetType: 'AdminUser',
      targetId: String(existing._id),
    });
    console.log(`[seed] SUPER_ADMIN updated: ${existing.email}`);
  } else {
    const admin = await AdminUser.create({
      fullName: config.superAdminName,
      email: config.superAdminEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
      permissions: [], // SUPER_ADMIN bypasses checks — role is recorded
      status: 'ACTIVE',
    });
    await AdminAuditLog.create({
      actor: admin._id,
      actorEmail: admin.email,
      action: 'SEED_SUPER_ADMIN_CREATE',
      source: 'SEED',
      targetType: 'AdminUser',
      targetId: String(admin._id),
    });
    console.log(`[seed] SUPER_ADMIN created: ${admin.email}`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
