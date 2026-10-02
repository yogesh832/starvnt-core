/**
 * Extract new incremental text tokens from an in-progress JSON string payload matching `"reply": "..."`.
 * Enables token-by-token text streaming to frontends while retaining full JSON extraction for facts and actions.
 */
export function extractReplyChunk(fullAccumulatedText, lastLength = 0) {
  if (!fullAccumulatedText) return { chunk: '', newLength: lastLength };

  const match = fullAccumulatedText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/s);
  if (!match) return { chunk: '', newLength: lastLength };

  const rawEscaped = match[1];
  let unescaped = '';
  try {
    unescaped = JSON.parse(`"${rawEscaped.replace(/"/g, '\\"')}"`);
  } catch {
    unescaped = rawEscaped.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  if (unescaped.length > lastLength) {
    const chunk = unescaped.slice(lastLength);
    return { chunk, newLength: unescaped.length };
  }
  return { chunk: '', newLength: lastLength };
}

/**
 * Performance metrics tracker for measuring Aura+ chat latencies.
 */
export function createPerformanceTracker() {
  const timings = {
    requestStart: Date.now(),
    contextRetrievalStart: 0,
    contextRetrievalEnd: 0,
    geminiRequestStart: 0,
    timeToFirstToken: 0,
    generationEnd: 0,
    totalResponseTime: 0,
  };

  return {
    markContextStart() {
      timings.contextRetrievalStart = Date.now();
    },
    markContextEnd() {
      timings.contextRetrievalEnd = Date.now();
    },
    markGeminiStart() {
      timings.geminiRequestStart = Date.now();
    },
    markFirstToken() {
      if (!timings.timeToFirstToken) {
        timings.timeToFirstToken = Date.now() - timings.requestStart;
      }
    },
    markGenerationEnd() {
      timings.generationEnd = Date.now();
      timings.totalResponseTime = timings.generationEnd - timings.requestStart;
    },
    getMetrics() {
      return {
        ...timings,
        contextDuration: timings.contextRetrievalEnd ? timings.contextRetrievalEnd - timings.contextRetrievalStart : 0,
        geminiDuration: timings.generationEnd && timings.geminiRequestStart ? timings.generationEnd - timings.geminiRequestStart : 0,
        ttfbMs: timings.timeToFirstToken || (timings.generationEnd ? timings.generationEnd - timings.requestStart : 0),
        totalMs: timings.totalResponseTime || (Date.now() - timings.requestStart),
      };
    },
  };
}
