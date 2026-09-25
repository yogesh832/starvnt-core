/**
 * Seed the 12 demo vendor packages for the Customer App (development only).
 * Safe to re-run: existing listings are left untouched.
 *
 *   npm run seed:customer-demo -w server
 */
import { connectDB, disconnectDB } from '../src/db/index.js';
import { seedDemoListings } from '../src/customer/seeds/demoListings.js';

try {
  await connectDB();
  const { inserted, total } = await seedDemoListings();
  console.log(`[seed] Demo listings: ${inserted} inserted, ${total - inserted} already present.`);
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
