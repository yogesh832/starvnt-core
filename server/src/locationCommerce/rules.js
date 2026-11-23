export const defaultNearbyPolicy = Object.freeze({ radiusKm: 25, weights: { quality: 30, budget: 25, proximity: 20, availability: 15, reliability: 10 }, batchSize: 10, responseWindowMinutes: 60, responseTarget: 3, expiryHours: 48 });
export function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode, code: message }); }
export function coordinates(value) {
  if (value?.lat == null || value?.lng == null || value.lat === '' || value.lng === '') return null;
  const lat = Number(value.lat), lng = Number(value.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}
export const geoPoint = value => { const p = coordinates(value); return p ? { type: 'Point', coordinates: [p.lng, p.lat] } : undefined; };
export function straightLineKm(a, b) {
  const r = x => x * Math.PI / 180;
  const n = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, n)), Math.sqrt(Math.max(0, 1 - n)));
}
export function validatePolicy(input) {
  const p = { ...defaultNearbyPolicy, ...input, weights: { ...defaultNearbyPolicy.weights, ...input?.weights } };
  if (!Number.isFinite(p.radiusKm) || p.radiusKm < 1 || p.radiusKm > 500) fail('RADIUS_MUST_BE_1_TO_500_KM');
  if (Object.keys(p.weights).sort().join() !== Object.keys(defaultNearbyPolicy.weights).sort().join() || Object.values(p.weights).some(v => !Number.isFinite(v) || v < 0 || v > 100) || Math.abs(Object.values(p.weights).reduce((a,b) => a+b,0)-100) > .001) fail('RANKING_WEIGHTS_MUST_TOTAL_100');
  for (const [key,min,max] of [['batchSize',1,50],['responseWindowMinutes',1,1440],['responseTarget',1,50],['expiryHours',1,168]]) if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max) fail(`INVALID_${key}`);
  return Object.fromEntries(Object.keys(defaultNearbyPolicy).map(key => [key,p[key]]));
}
const place = s => String(s || '').normalize('NFKC').trim().toLowerCase();
export function coverageAllows(coverage, base, target, distanceKm) {
  if (coverage.coverageType === 'RADIUS') return Number.isFinite(coverage.radiusKm) && coverage.radiusKm > 0 && distanceKm <= coverage.radiusKm;
  const inCity = place(coverage.city) && place(coverage.city) === place(target.city);
  if (coverage.coverageType === 'CITY') return Boolean(inCity);
  if (['LOCALITY','VENUE','DESTINATION'].includes(coverage.coverageType)) return Boolean((!coverage.city || inCity) && coverage.localities?.some(s => place(s) === place(target.locality)));
  if (coverage.coverageType === 'DISTRICT') return Boolean(coverage.district && place(coverage.district) === place(target.district) && (!coverage.state || place(coverage.state) === place(target.state)));
  if (coverage.coverageType === 'STATE') return Boolean(coverage.state && place(coverage.state) === place(target.state));
  return false;
}
export function rankCandidate({ verifiedRating, reviewCount=0, estimatedTotal, budgetMax, distanceKm, radiusKm, responses=0, opportunities=0 }, weights) {
  const quality = ((reviewCount > 0 ? Number(verifiedRating) * reviewCount : 0) + 3.5 * 5) / (reviewCount + 5) / 5;
  const budget = budgetMax == null ? .5 : estimatedTotal <= budgetMax ? 1 : Math.max(0, 1 - (estimatedTotal - budgetMax) / Math.max(1,budgetMax));
  const factors = { quality, budget, proximity: Math.max(0,1-distanceKm/radiusKm), availability:1, reliability:(responses+2)/(opportunities+4) };
  return { score: Math.round(Object.entries(weights).reduce((sum,[key,w]) => sum+factors[key]*w,0)*100)/100, factors };
}
export function validateSearch(input, policy) {
  const p = coordinates(input?.location?.coordinates); if (!p) fail('EVENT_COORDINATES_REQUIRED');
  const date = String(input.date || ''), startTime = input.startTime || '10:00', endTime = input.endTime || '18:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) fail('VALID_EVENT_DATE_REQUIRED');
  if (![startTime,endTime].every(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || endTime <= startTime) fail('VALID_SAME_DAY_INTERVAL_REQUIRED');
  const radiusKm = input.radiusKm == null ? policy.radiusKm : Number(input.radiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > policy.radiusKm) fail('RADIUS_EXCEEDS_ADMIN_LIMIT');
  const guestCount = input.guestCount == null ? 1 : Number(input.guestCount);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 1000000) fail('INVALID_GUEST_COUNT');
  const out = { category:String(input.category || '').trim(), date,startTime,endTime,radiusKm,guestCount, specialization:String(input.specialization || '').trim().slice(0,100), eventType:String(input.eventType || '').slice(0,80), location: { coordinates:p } };
  if (!out.category || out.category.length > 100) fail('SERVICE_CATEGORY_REQUIRED');
  for(const key of ['address','locality','city','state','district','postalCode']) out.location[key] = String(input.location?.[key] || '').trim().slice(0,key==='address'?500:100);
  for(const key of ['budgetMin','budgetMax']) { out[key] = input[key] == null || input[key] === '' ? null : Number(input[key]); if(out[key] != null && (!Number.isFinite(out[key]) || out[key]<0 || out[key]>1e10)) fail('INVALID_BUDGET'); }
  if(out.budgetMin != null && out.budgetMax != null && out.budgetMin > out.budgetMax) fail('INVALID_BUDGET_RANGE');
  return out;
}
