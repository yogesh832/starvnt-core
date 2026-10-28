/** Serialize hardware operations and defer automatic listening until an
 * in-flight stop/transcribe/play operation has actually finished. */
export function createVoiceTurnGate() {
  let busy = false;
  let pending: (() => void) | null = null;
  let closed = false;
  return {
    enter() { if (busy || closed) return false; busy = true; return true; },
    leave() {
      busy = false;
      const next = pending; pending = null;
      if (!closed) next?.();
    },
    afterCurrent(action: () => void) {
      if (closed) return;
      if (busy) pending = action; else action();
    },
    close() { closed = true; pending = null; },
    open() { closed = false; },
  };
}
