import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from './Icon.jsx';

// SVG Google Maps-style Pin Marker
const pinIcon = L.divIcon({
  className: 'starvnt-map-pin',
  html: `
    <div style="position: relative; width: 34px; height: 42px; transform: translate(-50%, -100%); cursor: grab;">
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.611 0 0 7.611 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.611 26.389 0 17 0Z" fill="#EA4335"/>
        <path d="M17 0C7.611 0 0 7.611 0 17C0 22.13 2.76 27.27 6.43 31.84C10.1 36.41 14.86 40.54 17 42C19.14 40.54 23.9 36.41 27.57 31.84C31.24 27.27 34 22.13 34 17C34 7.611 26.389 0 17 0Z" fill="url(#gpin_grad)"/>
        <circle cx="17" cy="16" r="6" fill="white"/>
        <circle cx="17" cy="16" r="3" fill="#EA4335"/>
        <defs>
          <linearGradient id="gpin_grad" x1="17" y1="0" x2="17" y2="42" gradientUnits="userSpaceOnUse">
            <stop stop-color="#EA4335"/>
            <stop offset="1" stop-color="#C5221F"/>
          </linearGradient>
        </defs>
      </svg>
      <div style="position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); width: 14px; height: 4px; background: rgba(0,0,0,0.35); border-radius: 50%; filter: blur(1px);"></div>
    </div>
  `,
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

/**
 * Universal Interactive Google Maps Pointer with In-Map Search and Geocoding
 */
export default function MapLocationPicker({
  value = { lat: 22.5726, lng: 88.3639 },
  onChange,
  height = '340px',
  readOnly = false,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const tileLayerRef = useRef(null);

  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite'
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  const initialLat = Number(value?.lat) && Number(value?.lat) !== 0 ? Number(value.lat) : 19.076; // Default to Mumbai/India if 0
  const initialLng = Number(value?.lng) && Number(value?.lng) !== 0 ? Number(value.lng) : 72.8777;

  // Reverse geocode coordinates to structured address
  const reverseGeocode = useCallback(
    async (lat, lng) => {
      if (readOnly) return;
      try {
        setReverseLoading(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const road = addr.road || addr.pedestrian || addr.street || '';
          const locality =
            addr.suburb ||
            addr.neighbourhood ||
            addr.residential ||
            addr.locality ||
            addr.subdistrict ||
            '';
          const city =
            addr.city ||
            addr.town ||
            addr.village ||
            addr.municipality ||
            addr.county ||
            '';
          const state = addr.state || '';
          const postalCode = addr.postcode || '';

          // Format clean street address
          const formattedAddress = data.display_name || [road, locality, city].filter(Boolean).join(', ');

          if (onChange) {
            onChange({
              lat: Number(lat),
              lng: Number(lng),
              address: formattedAddress,
              locality,
              city,
              state,
              postalCode,
              displayName: data.display_name,
            });
          }
        }
      } catch (err) {
        console.warn('[MapLocationPicker] Reverse geocode error:', err.message);
      } finally {
        setReverseLoading(false);
      }
    },
    [onChange, readOnly]
  );

  // Initialize Leaflet Map with Google Maps Tiles
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: false,
      });

      // Add Zoom control in bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Google Maps Tile Layer (official tile server)
      const tileUrl =
        mapType === 'satellite'
          ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}' // Hybrid (satellite + road labels)
          : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'; // Roadmap

      const tiles = L.tileLayer(tileUrl, {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps',
      }).addTo(map);

      tileLayerRef.current = tiles;

      // Add draggable Pin Marker
      const marker = L.marker([initialLat, initialLng], {
        icon: pinIcon,
        draggable: !readOnly,
      }).addTo(map);

      markerRef.current = marker;

      // Marker Drag Event
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        reverseGeocode(pos.lat, pos.lng);
      });

      // Map Click Event to drop/move pin
      if (!readOnly) {
        map.on('click', (e) => {
          marker.setLatLng(e.latlng);
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });
      }

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Mount once

  // Sync external coordinates changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current) return;
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom());
      }
    }
  }, [value?.lat, value?.lng]);

  // Handle Map Type Toggle (Roadmap vs Satellite)
  function handleToggleMapType(newType) {
    setMapType(newType);
    if (tileLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
      const tileUrl =
        newType === 'satellite'
          ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
          : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
      tileLayerRef.current = L.tileLayer(tileUrl, {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps',
      }).addTo(mapInstanceRef.current);
    }
  }

  // Handle Search Input Debounce
  function handleSearchChange(e) {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!val || val.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(
            val
          )}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (err) {
        console.warn('[MapLocationPicker] Search error:', err.message);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  // Select a place from search suggestions
  function handleSelectSuggestion(item) {
    setShowSuggestions(false);
    setSearchQuery(item.display_name);

    const lat = Number(item.lat);
    const lng = Number(item.lon);

    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
      markerRef.current.setLatLng([lat, lng]);
    }

    const addr = item.address || {};
    const road = addr.road || addr.pedestrian || addr.street || '';
    const locality =
      addr.suburb || addr.neighbourhood || addr.residential || addr.locality || '';
    const city =
      addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const state = addr.state || '';
    const postalCode = addr.postcode || '';
    const formattedAddress = item.display_name || [road, locality, city].filter(Boolean).join(', ');

    if (onChange) {
      onChange({
        lat,
        lng,
        address: formattedAddress,
        locality,
        city,
        state,
        postalCode,
        displayName: item.display_name,
      });
    }
  }

  // Geolocation button: Use device GPS
  const handleUseCurrentLocation = useCallback((silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) alert('Geolocation is not supported by your browser.');
      return;
    }
    setReverseLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
          markerRef.current.setLatLng([lat, lng]);
        }
        reverseGeocode(lat, lng);
      },
      (err) => {
        setReverseLoading(false);
        if (!silent) alert(`Location access denied or unavailable: ${err.message}. Please search or drop the pin manually.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [reverseGeocode]);

  // Auto-detect location on mount if no existing coordinates are passed
  useEffect(() => {
    if (!readOnly && (!value?.lat || !value?.lng)) {
      handleUseCurrentLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200/90 shadow-sm bg-lavender/30">
      {/* Floating In-Map Search Bar */}
      {!readOnly && (
        <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center gap-2">
          <div className="relative flex-1">
            <div className="flex items-center bg-white rounded-xl shadow-lg border border-gray-200/90 px-3 py-2">
              <svg className="w-4 h-4 text-muted shrink-0 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Search area, landmark, or street (e.g. Bandra West, Mumbai)..."
                className="w-full text-xs font-semibold text-navy placeholder:text-muted/70 outline-none bg-transparent"
              />
              {searching && <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin ml-2 shrink-0" />}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }}
                  className="text-muted hover:text-navy p-1 transition"
                  aria-label="Clear search"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 max-h-56 overflow-y-auto z-[1010] divide-y divide-gray-50 animate-fade">
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full p-2.5 text-left text-xs hover:bg-lavender/60 transition flex items-start gap-2.5 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-navy truncate">
                        {item.name || item.display_name.split(',')[0]}
                      </div>
                      <div className="text-[10px] text-muted truncate">{item.display_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current GPS Location Button */}
          <button
            type="button"
            onClick={() => handleUseCurrentLocation(false)}
            title="Locate my current position"
            className="h-9 px-3 rounded-xl bg-white hover:bg-lavender text-navy text-xs font-bold shadow-lg border border-gray-200/90 flex items-center gap-1.5 shrink-0 transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">My GPS</span>
          </button>

          {/* Layer Toggle (Map / Satellite) */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/90 p-0.5 flex shrink-0 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => handleToggleMapType('roadmap')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                mapType === 'roadmap' ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-navy'
              }`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => handleToggleMapType('satellite')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                mapType === 'satellite' ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-navy'
              }`}
            >
              Satellite
            </button>
          </div>
        </div>
      )}

      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} style={{ height }} className="w-full z-0 cursor-crosshair" />

      {/* Floating Bottom Pin Guidance Strip */}
      <div className="absolute bottom-2 left-3 right-14 z-[990] flex items-center justify-between gap-2 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-gray-200/80 shadow-md text-[11px] text-navy font-semibold flex items-center gap-2 pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-ping" />
          <span>
            {reverseLoading
              ? 'Detecting address…'
              : 'Drag or click pointer to pin exact studio entrance'}
          </span>
          <span className="text-[10px] text-muted font-mono pl-1 border-l border-gray-200">
            {Number(value?.lat || initialLat).toFixed(4)}, {Number(value?.lng || initialLng).toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
