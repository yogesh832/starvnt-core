/**
 * Geographic distance & travel time estimation utilities (Spec §4, §5, §8).
 * Uses the Haversine formula for coordinate-based spherical distance.
 */

// Earth radius in kilometers
const EARTH_RADIUS_KM = 6371;

/**
 * Calculates straight-line distance in kilometers between two { lat, lng } coordinates.
 */
export function calculateHaversineDistanceKm(coordA, coordB) {
  if (!coordA || !coordB || coordA.lat == null || coordB.lat == null) {
    return 0;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(coordB.lat - coordA.lat);
  const dLng = toRad(coordB.lng - coordA.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coordA.lat)) *
      Math.cos(toRad(coordB.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLine = EARTH_RADIUS_KM * c;

  // Road factor adjustment: real driving distance is roughly ~1.3x straight-line in metropolitan areas
  return Math.round(straightLine * 1.3 * 10) / 10;
}

/**
 * Known approximate distances between key localities in Kolkata / West Bengal
 * Used as high-reliability fallbacks when GPS coordinates are omitted.
 */
const LOCALITY_DISTANCE_MATRIX = {
  'barasat:new town': 18,
  'new town:barasat': 18,
  'barasat:salt lake': 21,
  'salt lake:barasat': 21,
  'barasat:em bypass': 24,
  'em bypass:barasat': 24,
  'barasat:howrah': 30,
  'howrah:barasat': 30,
  'new town:salt lake': 7,
  'salt lake:new town': 7,
  'new town:em bypass': 12,
  'em bypass:new town': 12,
  'new town:kisan palace': 3,
  'kisan palace:new town': 3,
  'barasat:kisan palace': 18,
  'kisan palace:barasat': 18,
  'kolkata:delhi': 1450,
  'delhi:kolkata': 1450,
};

/**
 * Estimates distance in kilometers between two localities or coordinate sets.
 */
export function estimateDistanceKm(origin, destination) {
  // If both have coordinates, calculate via Haversine
  if (origin?.coordinates?.lat && destination?.coordinates?.lat) {
    const dist = calculateHaversineDistanceKm(origin.coordinates, destination.coordinates);
    if (dist > 0) return dist;
  }

  // Fallback to locality lookup
  const from = (origin?.locality || origin?.city || '').toLowerCase().trim();
  const to = (destination?.locality || destination?.city || '').toLowerCase().trim();

  if (!from || !to || from === to) {
    return 5; // Default local inner-neighborhood buffer
  }

  const key = `${from}:${to}`;
  if (LOCALITY_DISTANCE_MATRIX[key]) {
    return LOCALITY_DISTANCE_MATRIX[key];
  }

  // Default cross-city or outstation estimate
  if (origin?.city && destination?.city && origin.city.toLowerCase() !== destination.city.toLowerCase()) {
    return 150; // default inter-city distance
  }

  return 15; // default urban radius
}

/**
 * Calculates estimated driving transit time in minutes given distance.
 * Assumes average metro transit speed of 30 km/h with 15 minutes congestion buffer.
 */
export function estimateTravelDurationMinutes(distanceKm) {
  const travelMinutes = (distanceKm / 30) * 60;
  return Math.round(travelMinutes + 15);
}
