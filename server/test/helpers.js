import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Boots the unified app against an in-memory MongoDB with two separate
 * databases (starvnt_external + starvnt_admin), mirroring production's
 * dual-database / single-server topology.
 */
export async function setupTestApp() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI_EXTERNAL = `${uri}starvnt_external`;
  process.env.MONGO_URI_ADMIN = `${uri}starvnt_admin`;
  process.env.JWT_EXTERNAL_SECRET = 'test-external-secret';
  process.env.JWT_ADMIN_SECRET = 'test-admin-secret-different';
  process.env.ADMIN_AUTH_RATE_LIMIT = '10000';
  process.env.CLIENT_ORIGINS = 'http://localhost:5173';

  // Import AFTER env is set — config reads process.env at load time.
  const { connectDB, disconnectDB } = await import('../src/db/index.js');
  const { createApp } = await import('../src/app.js');
  const models = {
    ExternalUser: (await import('../src/external/models/ExternalUser.js')).ExternalUser,
    VendorOrganization: (await import('../src/external/models/VendorOrganization.js'))
      .VendorOrganization,
    ExternalSession: (await import('../src/external/models/ExternalSession.js'))
      .ExternalSession,
    AdminUser: (await import('../src/admin/models/AdminUser.js')).AdminUser,
    AdminSession: (await import('../src/admin/models/AdminSession.js')).AdminSession,
    AdminAuditLog: (await import('../src/admin/models/AdminAuditLog.js')).AdminAuditLog,
    VendorReview: (await import('../src/external/models/VendorReview.js')).VendorReview,
  };

  await connectDB();
  return { app: createApp(), mongod, models, disconnectDB };
}
