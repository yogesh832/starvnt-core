import { config } from "./config.js";
import { connectDB } from "./db/index.js";
import { createApp } from "./app.js";

function startProductionKeepAlive() {
  if (process.env.NODE_ENV !== "production" || !config.keepAliveUrl) {
    return;
  }

  const intervalMs = Math.max(10000, config.keepAliveIntervalMs);
  const healthUrl = `${config.keepAliveUrl.replace(/\/$/, "")}/api/health`;

  async function ping() {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.warn(`[keep-alive] ${healthUrl} returned ${res.status}`);
      }
    } catch (err) {
      console.warn(`[keep-alive] ${healthUrl} failed: ${err.message}`);
    }
  }

  setInterval(ping, intervalMs).unref();
  setTimeout(ping, 5000).unref();
  console.log(
    `[keep-alive] production self-ping enabled every ${intervalMs}ms`,
  );
}

async function main() {
  await connectDB();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(
      `[starvnt] unified server on :${config.port}\n` +
        `  external domain  → aud=${config.audience}   db=starvnt_external\n` +
        `  admin domain     → aud=${config.adminAudience} db=starvnt_admin`,
    );
    setInterval(() => {
      console.log(`[starvnt] server is running on :${config.port}`);
    }, 8000);
    startProductionKeepAlive();
  });
}

main().catch((err) => {
  console.error("[starvnt] failed to start:", err.message);
  process.exit(1);
});
