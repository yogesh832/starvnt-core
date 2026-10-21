const workers = new Map();

function baseState(name) {
  return {
    name,
    enabled: false,
    status: 'STOPPED',
    lastStartedAt: null,
    lastHeartbeatAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: '',
    lastRunMs: null,
    runs: 0,
  };
}

export function configureWorker(name, { enabled = false } = {}) {
  const current = workers.get(name) || baseState(name);
  current.enabled = Boolean(enabled);
  current.status = enabled ? 'IDLE' : 'DISABLED';
  workers.set(name, current);
  return current;
}

export function markWorkerStarted(name) {
  const current = workers.get(name) || baseState(name);
  current.enabled = true;
  current.status = 'RUNNING';
  current.lastStartedAt = new Date();
  current.lastHeartbeatAt = current.lastStartedAt;
  current.runs += 1;
  workers.set(name, current);
  return current;
}

export function markWorkerSuccess(name, durationMs = null) {
  const current = workers.get(name) || baseState(name);
  current.status = 'IDLE';
  current.lastHeartbeatAt = new Date();
  current.lastSuccessAt = current.lastHeartbeatAt;
  current.lastRunMs = durationMs;
  current.lastError = '';
  workers.set(name, current);
  return current;
}

export function markWorkerError(name, err, durationMs = null) {
  const current = workers.get(name) || baseState(name);
  current.status = 'ERROR';
  current.lastHeartbeatAt = new Date();
  current.lastErrorAt = current.lastHeartbeatAt;
  current.lastRunMs = durationMs;
  current.lastError = err?.message || String(err || 'Unknown worker error');
  workers.set(name, current);
  return current;
}

export function workerHealthSnapshot() {
  return [...workers.values()].map((worker) => ({
    ...worker,
    healthy: worker.enabled
      ? worker.status !== 'ERROR' && (!worker.lastHeartbeatAt || Date.now() - new Date(worker.lastHeartbeatAt).getTime() < 5 * 60 * 1000)
      : true,
  }));
}
