export function validBusinessCoordinates(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && (point.lat !== 0 || point.lng !== 0);
}
export function coverageConfigured(coverage, locations) {
  switch (coverage.coverageType) {
    case 'RADIUS': return Number.isFinite(coverage.radiusKm) && coverage.radiusKm > 0 && coverage.radiusKm <= 20000 && locations.some(l => validBusinessCoordinates(l.coordinates));
    case 'LOCALITY': case 'VENUE': return coverage.localities?.some(v => v.trim());
    case 'STATE': return Boolean(coverage.state?.trim());
    case 'DISTRICT': return Boolean(coverage.district?.trim() || coverage.city?.trim());
    case 'DESTINATION': return coverage.outstationAllowed === true;
    default: return coverage.coverageType === 'CITY' && Boolean(coverage.city?.trim());
  }
}
export function serviceMatchingEligible(readiness, serviceId) {
  return Boolean(readiness?.matchingEligible && readiness.serviceReadiness?.find(s => String(s.serviceId) === String(serviceId))?.operatingReady);
}
