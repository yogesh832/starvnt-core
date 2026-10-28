export const DEFAULT_NOTIFICATION_POLICY = { timezone: 'Asia/Kolkata', quietHours: { enabled: false, start: '22:00', end: '08:00' }, channels: { PUSH: true }, disabledTypes: [] };
export function validateNotificationPolicy(input) {
  const policy = { ...DEFAULT_NOTIFICATION_POLICY, ...input, quietHours: { ...DEFAULT_NOTIFICATION_POLICY.quietHours, ...input.quietHours }, channels: { PUSH: input.channels?.PUSH !== false } };
  try { new Intl.DateTimeFormat('en', { timeZone: policy.timezone }); } catch { throw new Error('Choose a valid timezone.'); }
  if (![policy.quietHours.start, policy.quietHours.end].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t || ''))) throw new Error('Quiet hours must use HH:mm.');
  if (!Array.isArray(policy.disabledTypes) || policy.disabledTypes.length > 30 || policy.disabledTypes.some(t => !/^[a-zA-Z_]{1,60}$/.test(t))) throw new Error('Invalid notification types.');
  return { timezone: policy.timezone, quietHours: { enabled: policy.quietHours.enabled === true, start: policy.quietHours.start, end: policy.quietHours.end }, channels: policy.channels, disabledTypes: [...new Set(policy.disabledTypes)] };
}
export function notificationDelivery(policy = DEFAULT_NOTIFICATION_POLICY, type = '', now = new Date()) {
  if (policy.disabledTypes?.map(t => t.toLowerCase()).includes(type.toLowerCase())) return { allowed: false, disabled: true };
  if (policy.channels?.PUSH === false) return { allowed: false, disabled: true };
  if (!policy.quietHours?.enabled) return { allowed: true };
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: policy.timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const { start, end } = policy.quietHours;
  const quiet = start === end || (start < end ? local >= start && local < end : local >= start || local < end);
  if (!quiet) return { allowed: true };
  // Re-evaluate at most every 15 minutes; handles timezone/DST changes and
  // preference edits without prematurely sending a deferred notification.
  return { allowed: false, nextAttemptAt: new Date(now.getTime() + 15 * 60000) };
}
