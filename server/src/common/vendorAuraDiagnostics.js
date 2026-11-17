// Operational diagnostics must never receive conversation/profile/provider text.
const events = new Set(['TURN', 'ACTION_CONFIRMED', 'ACTION_CANCELLED', 'ACTION_FAILED', 'MODEL_FALLBACK', 'PROFILE_SAVE_FAILED', 'NOTIFICATION_DEFERRED', 'THREAD_SYNC_DEFERRED', 'CONTEXT_SOURCE_UNAVAILABLE', 'GOOGLE_SOURCE_UNAVAILABLE', 'MODEL_ATTEMPT_FAILED']);
const kinds = new Set(['service', 'capability', 'location', 'coverage', 'block_date', 'revise_quote', 'create_quote']);
const duration = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
export function vendorAuraDiagnostic(event, fields = {}, write = line => console.info(line)) {
  if (!events.has(event)) return;
  const entry = {
    component: 'vendor-aura', event,
    actionKind: kinds.has(fields.actionKind) ? fields.actionKind : null,
    fallback: fields.fallback === true,
    savedFieldCount: Number.isInteger(fields.savedFieldCount) && fields.savedFieldCount >= 0 && fields.savedFieldCount <= 100 ? fields.savedFieldCount : 0,
    totalDurationMs: duration(fields.totalDurationMs), firstTokenMs: duration(fields.firstTokenMs),
  };
  write(JSON.stringify(entry));
}
