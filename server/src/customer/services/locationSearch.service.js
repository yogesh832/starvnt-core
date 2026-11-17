const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const SEARCH_TIMEOUT_MS = 8000;

function component(components = [], type) {
  return components.find((item) => item.types?.includes(type))?.longText || '';
}

function normalizedPlace({ id, name, address, lat, lng, components = [], source }) {
  const locality = component(components, 'sublocality_level_1') || component(components, 'sublocality') || component(components, 'neighborhood');
  const city = component(components, 'locality') || component(components, 'postal_town') || component(components, 'administrative_area_level_3') || component(components, 'administrative_area_level_2');
  return {
    id,
    name: String(name || city || address || '').trim(),
    address: String(address || '').trim(),
    locality,
    city: String(city || '').trim(),
    state: component(components, 'administrative_area_level_1'),
    country: component(components, 'country') || 'India',
    pincode: component(components, 'postal_code'),
    lat: Number(lat),
    lng: Number(lng),
    source,
  };
}

function validPlace(place) {
  return place.name && place.city && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180;
}

function indiaQuery(query) {
  return /\bindia\b/i.test(query) ? query : `${query}, India`;
}

async function googlePlaces(query, apiKey, fetchImpl) {
  const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
    },
    body: JSON.stringify({ textQuery: indiaQuery(query), regionCode: 'in', languageCode: 'en', maxResultCount: 6 }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.places || []).map((place) => normalizedPlace({
    id: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    components: place.addressComponents,
    source: 'GOOGLE_PLACES',
  })).filter(validPlace);
}

async function openStreetMapPlaces(query, fetchImpl) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'in', q: indiaQuery(query) }).toString();
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'starvnt-app/1.0', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data || []).map((place) => {
    const address = place.address || {};
    return normalizedPlace({
      id: `place_${place.place_id}`,
      name: place.name || place.display_name?.split(',')?.[0],
      address: place.display_name,
      lat: place.lat,
      lng: place.lon,
      components: [
        { longText: address.suburb || address.neighbourhood || address.locality || '', types: ['sublocality'] },
        { longText: address.city || address.town || address.village || address.municipality || '', types: ['locality'] },
        { longText: address.county || '', types: ['administrative_area_level_2'] },
        { longText: address.state || '', types: ['administrative_area_level_1'] },
        { longText: address.country || 'India', types: ['country'] },
        { longText: address.postcode || '', types: ['postal_code'] },
      ],
      source: 'OPENSTREETMAP',
    });
  }).filter(validPlace);
}

/** Search and normalize a user-entered place before it is saved to an event. */
export async function searchCustomerLocations(rawQuery, { apiKey = GOOGLE_PLACES_API_KEY, fetchImpl = fetch } = {}) {
  const query = String(rawQuery || '').trim().replace(/\s+/g, ' ');
  if (query.length < 2) return [];
  if (query.length > 120) {
    const error = new Error('Location search must be 120 characters or fewer.');
    error.status = 400;
    error.code = 'LOCATION_QUERY_TOO_LONG';
    throw error;
  }

  if (apiKey) {
    try {
      const places = await googlePlaces(query, apiKey, fetchImpl);
      if (places.length) return places;
    } catch (error) {
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.warn('[customer/location-search] Google Places lookup failed.');
      }
    }
  }

  try {
    return await openStreetMapPlaces(query, fetchImpl);
  } catch (error) {
    if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
      console.warn('[customer/location-search] OpenStreetMap lookup failed.');
    }
    return [];
  }
}
