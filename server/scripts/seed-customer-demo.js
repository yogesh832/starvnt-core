/**
 * Seed demo vendor packages for the Customer App (development only).
 * Safe to re-run: existing demo listings are reset to the current catalog.
 *
 *   npm run seed:customer-demo -w server
 */
import { connectDB, disconnectDB } from '../src/db/index.js';
import { seedDemoListings } from '../src/customer/seeds/demoListings.js';

try {
  await connectDB();
  const { inserted, removed, total } = await seedDemoListings();
  console.log(`[seed] Demo listings reset: ${removed} removed, ${inserted}/${total} inserted.`);
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
