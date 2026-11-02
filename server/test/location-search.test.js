import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCustomerLocations } from '../src/customer/services/locationSearch.service.js';

test('location search corrects a town spelling through Google Places and returns canonical city coordinates', async () => {
  let requestBody;
  const fetchImpl = async (url, options) => {
    assert.equal(String(url), 'https://places.googleapis.com/v1/places:searchText');
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ places: [{
      id: 'place-kapkot',
      displayName: { text: 'Kapkot' },
      formattedAddress: 'Kapkot, Bageshwar, Uttarakhand, India',
      location: { latitude: 29.9458, longitude: 79.9042 },
      addressComponents: [
        { longText: 'Kapkot', types: ['locality'] },
        { longText: 'Bageshwar', types: ['administrative_area_level_2'] },
        { longText: 'Uttarakhand', types: ['administrative_area_level_1'] },
        { longText: 'India', types: ['country'] },
        { longText: '263632', types: ['postal_code'] },
      ],
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const places = await searchCustomerLocations('Kapkote, Bageshwar', { apiKey: 'test-key', fetchImpl });
  assert.equal(requestBody.textQuery, 'Kapkote, Bageshwar, India');
  assert.equal(requestBody.regionCode, 'in');
  assert.equal(places.length, 1);
  assert.equal(places[0].city, 'Kapkot');
  assert.equal(places[0].state, 'Uttarakhand');
  assert.deepEqual({ lat: places[0].lat, lng: places[0].lng }, { lat: 29.9458, lng: 79.9042 });
});

test('location search falls back to OpenStreetMap when Google Places is unavailable', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).startsWith('https://places.googleapis.com/')) return new Response('{}', { status: 503 });
    assert.match(String(url), /countrycodes=in/);
    return new Response(JSON.stringify([{
      place_id: 123,
      name: 'Bageshwar',
      display_name: 'Bageshwar, Uttarakhand, India',
      lat: '29.8398',
      lon: '79.7712',
      address: { city: 'Bageshwar', state: 'Uttarakhand', country: 'India', postcode: '263642' },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const places = await searchCustomerLocations('Bageshwar', { apiKey: 'test-key', fetchImpl });
  assert.equal(calls, 2);
  assert.equal(places[0].city, 'Bageshwar');
  assert.equal(places[0].state, 'Uttarakhand');
  assert.equal(places[0].pincode, '263642');
});

test('location search rejects oversized queries before calling a provider', async () => {
  let called = false;
  await assert.rejects(
    searchCustomerLocations('x'.repeat(121), { fetchImpl: async () => { called = true; } }),
    (error) => error.code === 'LOCATION_QUERY_TOO_LONG' && error.status === 400,
  );
  assert.equal(called, false);
});

test('location search does not mistake a venue name for a city when address components omit locality', async () => {
  const places = await searchCustomerLocations('Mountain View Lawn', {
    fetchImpl: async () => new Response(JSON.stringify([{
      place_id: 456,
      name: 'Mountain View Lawn',
      display_name: 'Mountain View Lawn, India',
      lat: '28.6',
      lon: '77.2',
      address: { country: 'India' },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  assert.deepEqual(places, []);
});
