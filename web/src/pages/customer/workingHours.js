export function workingHoursLabel(hours, day) {
  const entry = Object.entries(hours || {}).find(([key]) => key.toLowerCase() === day.toLowerCase())?.[1];
  if (entry?.isOpen === false) return 'Closed';
  if (entry?.isOpen === true) return entry.hours || 'Open';
  return 'Not provided';
}
