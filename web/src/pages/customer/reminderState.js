export function deviceReminderTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number), at = new Date(value);
  return Number.isFinite(at.getTime()) && at.getFullYear() === year && at.getMonth() === month - 1 && at.getDate() === day && at.getHours() === hour && at.getMinutes() === minute ? at.toISOString() : null;
}
export const reminderStatus = status => ({ PENDING: 'Scheduled', PROCESSING: 'Processing', DELIVERED: 'Notification created', CANCELLED: 'Cancelled', SUPPRESSED: 'Not sent under notification rules' })[status] || 'Status unavailable';
export function reminderTimeLabel(value) {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }).format(at);
}
export const mergeReminders = (previous, incoming) => [...new Map([...previous, ...incoming].map(row => [row._id, row])).values()];
