import mongoose from 'mongoose';
import { config } from '../config.js';

/**
 * Two identity databases on ONE server process.
 *
 * externalConn → starvnt_external (Customers, Vendors, VendorOrganizations,
 *                ExternalSessions)
 * adminConn    → starvnt_admin    (AdminUsers, AdminSessions, Roles,
 *                AdminAuditLogs)
 *
 * Connections are created eagerly (disconnected) so models can register on
 * them at import time, then opened in connectDB().
 */
export const externalConn = mongoose.createConnection();
export const adminConn = mongoose.createConnection();

export async function connectDB() {
  if (!config.mongoUriExternal) {
    throw new Error(
      'MONGO_URI_EXTERNAL is not set. Add your MongoDB Atlas URI to server/.env'
    );
  }
  if (!config.mongoUriAdmin) {
    throw new Error(
      'MONGO_URI_ADMIN is not set. Add your MongoDB Atlas URI to server/.env'
    );
  }
  await Promise.all([
    externalConn.openUri(config.mongoUriExternal),
    adminConn.openUri(config.mongoUriAdmin),
  ]);
}

export async function disconnectDB() {
  await Promise.allSettled([externalConn.close(), adminConn.close()]);
}
