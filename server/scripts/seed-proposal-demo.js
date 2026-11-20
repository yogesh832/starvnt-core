/**
 * Proposal Studio demo data (development only). Safe to re-run: it resets
 * only events the demo itself created.
 *
 *   npm run seed:proposal-demo -w server
 *   npm run seed:proposal-demo -w server -- --email=you@example.com   (attach to an existing customer, e.g. an OTP login)
 */
import { connectDB, disconnectDB } from '../src/db/index.js';
import { seedProposalDemo } from '../src/proposals/demo.js';
import { closeRenderer } from '../src/proposals/render.service.js';

const emailArg = process.argv.find((a) => a.startsWith('--email='));
const customerEmail = emailArg ? emailArg.slice('--email='.length) : null;

try {
  await connectDB();
  const result = await seedProposalDemo({ customerEmail, log: (line) => console.log(`[proposal-demo] ${line}`) });
  console.log('\n[proposal-demo] Done.');
  console.log(result.customerIsDemoAccount
    ? `  Customer (web /login, password ${result.password}): ${result.accounts.customer}`
    : `  Customer: ${result.accounts.customer} — sign in as usual (OTP) and open Home`);
  console.log(`  Admin maker   (web /admin/login, password ${result.password}): ${result.accounts.maker}`);
  console.log(`  Admin checker (web /admin/login, password ${result.password}): ${result.accounts.checker}`);
  console.log('  Event IDs for Proposal Studio → "Open event by ID":');
  for (const [name, id] of Object.entries(result.events)) console.log(`    ${name.padEnd(10)} ${id}`);
} catch (err) {
  console.error('[proposal-demo] failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeRenderer();
  await disconnectDB();
}
