export function schedulingError(code, message, statusCode = 400, conflicts = []) {
  return Object.assign(new Error(message), { code, statusCode, conflicts });
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function interval(row) {
  if (row.startAt && row.endAt) return [new Date(row.startAt).getTime(), new Date(row.endAt).getTime()];
  const day = row.date || row.eventDate;
  const start = Date.parse(`${day}T${row.allDay === false ? row.startTime || '00:00' : '00:00'}:00Z`);
  let end = Date.parse(`${row.endDate || day}T${row.allDay === false ? row.endTime || '23:59' : '00:00'}:00Z`);
  if (row.allDay !== false || end <= start) end += 86400000;
  return [start, end];
}
export function overlaps(a, b) { return a[0] < b[1] && b[0] < a[1]; }
export function scopeApplies(row, request) {
  if (!row.scope || row.scope === 'BUSINESS') return true;
  if (row.scope === 'SERVICE') return !request.vendorServiceId || String(row.vendorService) === String(request.vendorServiceId) || (row.kind === 'EXTERNAL_COMMITMENT' && (row.resourceIds || []).some(id => (request.requestedResources || []).map(String).includes(String(id))));
  if (row.scope === 'RESOURCE') return (!request.vendorServiceId && !request.requestedResources?.length) || (row.resourceIds || []).some(id => (request.requestedResources || []).map(String).includes(String(id)));
  return true;
}
export function normaliseCommitment(input = {}) {
  const date = input.date;
  const endDate = input.endDate || date;
  if (!validDate(date) || !validDate(endDate) || endDate < date) throw schedulingError('INVALID_DATE_RANGE', 'Choose valid start and end dates.');
  const allDay = input.allDay !== false;
  const startTime = allDay ? '00:00' : input.startTime;
  const endTime = allDay ? '23:59' : input.endTime;
  if (![startTime, endTime].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t || ''))) throw schedulingError('INVALID_TIME', 'Use valid HH:mm times.');
  const recordType = input.recordType || 'VENDOR_BLOCK';
  if (!['VENDOR_BLOCK', 'EXTERNAL_COMMITMENT'].includes(recordType)) throw schedulingError('INVALID_RECORD_TYPE', 'Select a block or external commitment.');
  const scope = input.scope || 'BUSINESS';
  if (!['BUSINESS', 'SERVICE', 'RESOURCE'].includes(scope)) throw schedulingError('INVALID_SCOPE', 'Select a valid scope.');
  const resourceIds = [...new Set((input.resourceIds || []).map(String))];
  if (scope === 'SERVICE' && !input.vendorService) throw schedulingError('SERVICE_REQUIRED', 'Choose a service.');
  if (scope === 'RESOURCE' && !resourceIds.length) throw schedulingError('RESOURCE_REQUIRED', 'Choose at least one resource.');
  const external = recordType === 'EXTERNAL_COMMITMENT' ? {
    customerName: String(input.external?.customerName || '').trim().slice(0, 160),
    customerPhone: String(input.external?.customerPhone || '').replace(/[\s()-]/g, ''),
    eventType: String(input.external?.eventType || '').trim().slice(0, 100),
    location: String(input.external?.location || '').trim().slice(0, 500),
    notes: String(input.external?.notes || '').slice(0, 1000),
    reference: String(input.external?.reference || '').slice(0, 160),
  } : undefined;
  const serviceLocation = recordType === 'EXTERNAL_COMMITMENT' ? {
    address: String(input.serviceLocation?.address || external.location || '').slice(0, 500),
    city: String(input.serviceLocation?.city || '').slice(0, 100),
    locality: String(input.serviceLocation?.locality || '').slice(0, 100),
  } : null;
  if (serviceLocation && input.serviceLocation?.coordinates) {
    const { lat, lng } = input.serviceLocation.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw schedulingError('INVALID_COORDINATES', 'Use valid event coordinates.');
    serviceLocation.coordinates = { lat, lng };
  }
  if (external && external.customerPhone && !/^\+[1-9]\d{7,14}$/.test(external.customerPhone)) throw schedulingError('INVALID_EXTERNAL_PHONE', 'Use a valid international phone number when providing one.');
  const timezone = input.timezone || 'Asia/Kolkata';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw schedulingError('INVALID_TIMEZONE', 'Choose a valid timezone.'); }
  // Date/time fields represent the vendor's local wall clock. Convert using Intl,
  // rejecting nonexistent wall-clock times instead of silently changing the input.
  const toUTC = (day, time) => {
    const wall = Date.parse(`${day}T${time}:00Z`);
    let utc = wall;
    const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 3; i++) utc += wall - Date.parse(`${fmt.format(new Date(utc)).replace(' ', 'T')}Z`);
    if (fmt.format(new Date(utc)).slice(0, 16) !== `${day} ${time}`) throw schedulingError('INVALID_LOCAL_TIME', 'This local time does not exist in the selected timezone.');
    if ([-3600000, 3600000].some(offset => fmt.format(new Date(utc + offset)).slice(0, 16) === `${day} ${time}`)) throw schedulingError('AMBIGUOUS_LOCAL_TIME', 'This time occurs twice because of daylight saving. Choose a time outside the repeated hour.');
    return new Date(utc);
  };
  const startAt = toUTC(date, startTime);
  const endDay = allDay || (endDate === date && endTime <= startTime) ? new Date(Date.parse(`${endDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : endDate;
  const endAt = toUTC(endDay, allDay ? '00:00' : endTime);
  if (endAt <= startAt || endAt - startAt > 366 * 86400000) throw schedulingError('INVALID_INTERVAL', 'The interval must be positive and at most one year.');
  return { date, endDate: allDay ? endDate : endDay, allDay, startTime, endTime, startAt, endAt, timezone, recordType, scope, vendorService: scope === 'SERVICE' ? input.vendorService : null, resourceIds: scope === 'RESOURCE' ? resourceIds : [], reason: String(input.reason || 'Other').trim().slice(0, 500), serviceLocation, external: external || null };
}
