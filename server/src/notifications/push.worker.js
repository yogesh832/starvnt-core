import { config } from "../config.js";
import { runPushBatch } from "./push.service.js";
import {
  configureWorker,
  markWorkerError,
  markWorkerStarted,
  markWorkerSuccess,
} from "../workers/workerHealth.js";
export function startPushWorker() {
  const enabled = config.pushEnabled && !!config.pushProjectId;
  configureWorker("mobile-push", { enabled });
  if (!enabled) return;
  let busy = false;
  let retryAfter = 0;
  const run = async () => {
    if (busy || Date.now() < retryAfter) return;
    busy = true;
    const start = Date.now();
    markWorkerStarted("mobile-push");
    try {
      const result = await runPushBatch();
      if (result.configurationError)
        throw new Error("PUSH_PROVIDER_CREDENTIALS_INVALID");
      markWorkerSuccess("mobile-push", Date.now() - start);
    } catch (err) {
      if (err.message === "PUSH_PROVIDER_CREDENTIALS_INVALID")
        retryAfter = Date.now() + 300000;
      markWorkerError("mobile-push", err, Date.now() - start);
      console.warn("[worker:mobile-push]", err.message);
    } finally {
      busy = false;
    }
  };
  setInterval(run, config.pushWorkerIntervalMs).unref();
  setTimeout(run, 3000).unref();
}
