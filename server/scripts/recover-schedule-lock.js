import { connectDB, disconnectDB, externalConn } from '../src/db/index.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
await connectDB();
try {
  const collection = externalConn.collection('vendorschedulelocks');
  if (!args.includes('--release')) {
    const rows = await collection.find({ token: { $ne: null }, expiresAt: { $lt: new Date() } }).toArray();
    console.log(JSON.stringify(rows.map(row => ({ vendorId: row._id, token: row.token, expiredAt: row.expiresAt })), null, 2));
  } else {
    if (!args.includes('--writers-stopped') || !args.includes('--vendor') || !args.includes('--token') || !args.includes('--reason') || !args.includes('--operator')) throw new Error('Stop all writers first. Then supply --writers-stopped --vendor ID --token TOKEN --reason REASON --operator NAME.');
    const filter = { _id: value('--vendor'), token: value('--token'), expiresAt: { $lt: new Date() } };
    const before = await collection.findOne(filter);
    if (!before) throw new Error('No matching stale lock. No change made.');
    // Record intent before releasing; failure to audit keeps the lock closed.
    await AdminAuditLog.create({ action: 'SCHEDULE_LOCK_RECOVERY', source: 'SYSTEM', actorEmail: value('--operator'), targetType: 'VendorScheduleLock', targetId: before._id, reason: value('--reason'), fromState: { token: before.token, expiresAt: before.expiresAt }, toState: { token: null } });
    const result = await collection.updateOne(filter, { $set: { token: null, expiresAt: new Date(0) } });
    if (!result.modifiedCount) throw new Error('Lock changed during recovery. Nothing was released.');
    console.log('Stale schedule lock released. Reconcile the affected schedule before restarting writers.');
  }
} finally { await disconnectDB(); }
