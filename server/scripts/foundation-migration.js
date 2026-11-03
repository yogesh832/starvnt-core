import { config } from '../src/config.js';
import { externalConn, adminConn, disconnectDB } from '../src/db/index.js';
import { foundationMigration } from '../src/foundation/migration.js';

const apply = process.argv.includes('--apply');
try {
  // Dry runs must not create collections or indexes as a side effect of connecting.
  await Promise.all([
    externalConn.openUri(config.mongoUriExternal, { autoIndex: false, autoCreate: false }),
    adminConn.openUri(config.mongoUriAdmin, { autoIndex: false, autoCreate: false }),
  ]);
  const report = await foundationMigration({ apply });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'READY') process.exitCode = 2;
} catch (err) {
  console.error(JSON.stringify({ error: err.code || err.name, message: 'Foundation migration failed. Inspect database state before retrying.' }));
  process.exitCode = 1;
} finally { await disconnectDB(); }
