export type GoalForm = { name: string; metric: string; targetValue: string; startDate: string; endDate: string };
export const goalMetrics: Record<string, string> = {
  SUBMITTED_QUOTES: 'Quotations submitted',
  CONFIRMED_BOOKINGS: 'Core confirmed bookings',
  COMPLETED_BOOKINGS: 'Verified completed bookings',
};
export const emptyGoal = (): GoalForm => ({ name: '', metric: 'SUBMITTED_QUOTES', targetValue: '', startDate: '', endDate: '' });
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function goalPayload(form: GoalForm) {
  const targetValue = Number(form.targetValue);
  if (form.name.trim().length < 2 || form.name.trim().length > 80) throw new Error('Use a goal name between 2 and 80 characters.');
  if (!Object.hasOwn(goalMetrics, form.metric)) throw new Error('Choose a supported goal metric.');
  if (!Number.isSafeInteger(targetValue) || targetValue < 1 || targetValue > 1000000) throw new Error('Enter a whole-number target between 1 and 1,000,000.');
  if (!validDate(form.startDate) || !validDate(form.endDate) || form.endDate < form.startDate) throw new Error('Enter valid dates as YYYY-MM-DD, with the end on or after the start.');
  if (Date.parse(form.endDate) - Date.parse(form.startDate) > 366 * 86400000) throw new Error('Choose a period no longer than 366 days.');
  return { ...form, name: form.name.trim(), targetValue };
}
export const metricNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-IN') : 'Unavailable';
export const metricMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'Unavailable';
export const metricDuration = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value / 60000).toLocaleString('en-IN')} min` : 'Insufficient data';
export const istDay = (value: string | number | Date) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
export const istTimestamp = (value: string | number | Date) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
export const metricPeriod = (period: { start: string; end: string }) => `${istDay(period.start)} – ${istDay(new Date(new Date(period.end).getTime() - 1))} IST`;
