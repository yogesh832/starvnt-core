/** Shared web/native snapshot synchronizer. A read begun before a write cannot overwrite it. */
export function auraSnapshotKey(value: unknown): string {
  return JSON.stringify(value, (key, item) => key === 'checkedAt' ? undefined : item) ?? 'undefined';
}
export function sameAuraValue(a: unknown, b: unknown) { return auraSnapshotKey(a) === auraSnapshotKey(b); }
type Options<T> = {
  read: () => Promise<T>; apply: (snapshot: T) => void;
  onSuccess?: () => void; onError?: (error: unknown) => void; delay?: number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};
export function createAuraLive<T>({ read, apply, onSuccess, onError, delay = 2000, schedule = setTimeout, cancel = clearTimeout }: Options<T>) {
  let running = false, revision = 0, writes = 0, queued = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, inFlight: Promise<void> | null = null, lastKey: string | undefined;
  function clear() { if (timer !== undefined) cancel(timer); timer = undefined; }
  function later(wait: number) { clear(); if (running && !writes) timer = schedule(() => { timer = undefined; void refresh(); }, wait); }
  function refresh(): Promise<void> {
    clear();
    if (!running || writes) { queued = true; return Promise.resolve(); }
    if (inFlight) { queued = true; return inFlight; }
    queued = false;
    const expected = revision;
    const job = (async () => {
      try {
        const snapshot = await read();
        if (!running || writes || expected !== revision) return;
        const key = auraSnapshotKey(snapshot);
        if (key !== lastKey) { apply(snapshot); lastKey = key; }
        failures = 0; onSuccess?.();
      } catch (error) {
        if (running && !writes && expected === revision) { failures++; onError?.(error); }
      }
    })().finally(() => {
      if (inFlight === job) inFlight = null;
      if (running && !writes) later(queued ? 0 : Math.min(15000, delay * Math.max(1, failures)));
    });
    inFlight = job;
    return job;
  }
  return {
    start() { if (running) return; running = true; revision++; void refresh(); },
    stop() { running = false; revision++; queued = false; clear(); },
    refresh,
    beginWrite() { writes++; revision++; clear(); },
    endWrite() { writes = Math.max(0, writes - 1); revision++; if (running && !writes) void refresh(); },
    invalidate() { revision++; lastKey = undefined; },
  };
}
