/** Consume native playback events directly so React batching cannot drop a
 * short clip's playing event or complete the same voice turn twice. */
export function createVoicePlayback(onEnd: () => void, onError: () => void) {
  let started = false, settled = false;
  return {
    cancel() { settled = true; },
    update(status: { playing?: boolean; didJustFinish?: boolean; error?: unknown }) {
      if (settled) return;
      if (status.playing) started = true;
      if (status.error) { settled = true; onError(); }
      else if (status.didJustFinish && started) { settled = true; onEnd(); }
    },
  };
}
