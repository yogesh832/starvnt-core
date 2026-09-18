import { config } from './config.js';
import { connectDB } from './db/index.js';
import { createApp } from './app.js';

async function main() {
  await connectDB();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(
      `[starvnt] unified server on :${config.port}\n` +
        `  external domain  → aud=${config.audience}   db=starvnt_external\n` +
        `  admin domain     → aud=${config.adminAudience} db=starvnt_admin`
    );
  });
}

main().catch((err) => {
  console.error('[starvnt] failed to start:', err.message);
  process.exit(1);
});
