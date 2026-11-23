export const externalWizardSteps = ['Customer', 'Event', 'Resources', 'Financial', 'Documents', 'Confirm'];
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function validateExternalWizardStep(form, step) {
  const b = form.externalBooking || {};
  if (step === 0 && form.external?.customerPhone && !/^\+[1-9]\d{7,14}$/.test(form.external.customerPhone.replace(/[\s()-]/g, ''))) return 'Use an international phone number with country code, or leave it blank.';
  if (step === 1) {
    if (!validDay(form.date) || !validDay(form.endDate || form.date) || (form.endDate || form.date) < form.date) return 'Choose valid start and end dates.';
    if (form.allDay === false && (![form.startTime, form.endTime].every(time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')) || ((form.endDate || form.date) === form.date && form.endTime <= form.startTime))) return 'End time must follow start time. For overnight work, select the next-day end date.';
    try { new Intl.DateTimeFormat('en', { timeZone: form.timezone }); } catch { return 'Choose a valid event timezone.'; }
    if (b.guestCount != null && (!Number.isInteger(b.guestCount) || b.guestCount < 1 || b.guestCount > 1000000)) return 'Guest count must be a positive whole number.';
  }
  if (step === 2) {
    if (form.scope === 'SERVICE' && !form.vendorService) return 'Choose the service whose capacity this booking uses.';
    if (form.scope === 'RESOURCE' && !b.allocations?.length) return 'Assign at least one team member or equipment resource.';
    if ((b.lineItems || []).some(line => !String(line.name || '').trim() || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) return 'Complete every service line with its name, whole quantity and non-negative unit price.';
    if (Object.values(b.buffers || {}).some(value => !Number.isInteger(value) || value < 0 || value > 1440)) return 'Setup, pack-up and travel buffers must be whole minutes from 0 to 1440.';
  }
  if (step === 3 && (!Number.isFinite(Number(b.totalAmount)) || Number(b.totalAmount) < 0 || Number(b.totalAmount) > 1e10 || Math.abs(Number(b.totalAmount) * 100 - Math.round(Number(b.totalAmount) * 100)) > 0.00001)) return 'Enter a non-negative contract value with at most two decimal places.';
  if (step === 5 && b.lifecycle === 'ON_HOLD' && (!b.holdExpiresAt || !Number.isFinite(Date.parse(b.holdExpiresAt)) || new Date(b.holdExpiresAt) <= new Date())) return 'A tentative hold needs a future expiry date and time.';
  return '';
}
