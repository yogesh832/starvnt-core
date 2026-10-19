/** One ElevenLabs clip owns playback. Replaced/stopped requests cannot start late. */
export function createAuraSpeechPlayer({ request, createAudio, createUrl, revokeUrl, cancelLegacySpeech = () => {} }) {
  let current = null;
  function release(job) {
    clearTimeout(job.timeout);
    job.controller.abort();
    if (job.audio) {
      job.audio.onplay = job.audio.onended = job.audio.onerror = null;
      try { job.audio.pause(); job.audio.src = ''; } catch { /* already disposed */ }
    }
    if (job.url) { revokeUrl(job.url); job.url = null; }
    if (current === job) current = null;
  }
  function stop() {
    if (current) release(current);
    // Silence legacy speech left by a hot reload. Never synthesize device speech.
    try { cancelLegacySpeech(); } catch { /* legacy browser speech may be unavailable */ }
  }
  async function speak(value, { onStart, onEnd, onError } = {}) {
    stop();
    const text = typeof value === 'string' ? value.trim().replace(/https?:\/\/\S+/g, '').replace(/[*_#`>]/g, '').slice(0, 3000) : '';
    if (!text) { onEnd?.(); return; }
    const job = { controller: new AbortController(), audio: null, url: null, timeout: null };
    current = job;
    const fail = error => {
      if (current !== job) return;
      release(job);
      // Exactly one terminal callback: callers must not restart listening twice.
      onError?.(error instanceof Error ? error : new Error('ElevenLabs audio could not play. Your reply is saved in chat.'));
    };
    job.timeout = setTimeout(() => fail(new Error('ElevenLabs voice took too long to respond. Please try again.')), 35000);
    try {
      const response = await request('/ai/voice', { method: 'POST', body: { text }, signal: job.controller.signal });
      if (current !== job) return;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'ElevenLabs voice is unavailable. Your reply is saved in chat.');
      }
      const blob = await response.blob();
      if (current !== job) return;
      clearTimeout(job.timeout);
      job.url = createUrl(blob);
      const audio = createAudio(job.url);
      job.audio = audio;
      audio.onplay = () => { if (current === job) onStart?.(); };
      audio.onended = () => { if (current !== job) return; release(job); onEnd?.(); };
      audio.onerror = fail;
      await audio.play();
    } catch (error) { fail(error); }
  }
  return { speak, stop };
}
