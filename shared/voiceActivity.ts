/** Reject brief ticks; finish after 650 ms of quiet following sustained speech. */
export function createVoiceActivity() {
  let noiseFloor = -60, candidateStart: number | null = null, samples = 0, lastSpeech: number | null = null, previous: number | null = null;
  return {
    reset() { candidateStart = null; samples = 0; lastSpeech = null; previous = null; },
    hasSpeech() { return lastSpeech !== null; },
    update(duration: number, level: number | undefined, now: number) {
      if (duration >= 60000) return lastSpeech === null ? 'noise' : 'limit';
      if (level == null || !Number.isFinite(level)) return null;
      const elapsed = previous === null ? 100 : Math.max(0, Math.min(250, now - previous));
      previous = now;
      const threshold = Math.max(-48, noiseFloor + 12);
      if (level > threshold) {
        candidateStart ??= now;
        samples++;
        if (samples >= 3 && now - candidateStart >= 180) lastSpeech = now;
        return null;
      }
      candidateStart = null; samples = 0;
      noiseFloor += (Math.max(-90, level) - noiseFloor) * (1 - Math.exp(-elapsed / 2000));
      return lastSpeech !== null && duration >= 650 && now - lastSpeech >= 650 ? 'pause' : null;
    },
  };
}
