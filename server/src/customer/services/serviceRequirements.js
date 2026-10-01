import { CATEGORY_DEFINITIONS } from '../../external/utils/categoryWorkspaces.js';
import { badRequest } from '../utils/http.js';

/**
 * Service-specific requirements (Event Type + Service Category → relevant fields).
 *
 * The option lists come from the canonical Vendor OS taxonomy
 * (external/utils/categoryWorkspaces.js) wherever it defines them, so the
 * customer asks for the same styles vendors publish. No second taxonomy:
 * this file only maps customer plan categories onto those definitions and
 * adds the few customer-side questions vendors need to quote.
 */

// Customer plan category → Vendor OS category key.
export const VENDOR_CATEGORY = {
  photography: 'Photography',
  makeup: 'Makeup',
  venue: 'Venue',
  catering: 'Catering',
  decor: 'Decoration',
  sound: 'DJ_Production',
  entertainment: 'DJ_Production',
  transport: 'Transport',
  accommodation: 'Hotel',
};

const styles = (category) => CATEGORY_DEFINITIONS[VENDOR_CATEGORY[category]]?.defaultStyles || [];
const YES_NO = ['Yes', 'No'];

/**
 * Field types: text | number | select | multiselect.
 * `forTypes` limits a field or option to some event types.
 */
function definitions(category, eventType) {
  const wedding = eventType === 'wedding';
  switch (category) {
    case 'photography':
      return [
        { key: 'deliverables', label: 'Photo / video', type: 'select', options: ['Photos', 'Video', 'Photos + Video'] },
        { key: 'coverageHours', label: 'Coverage (hours)', type: 'number', min: 1, max: 72 },
        { key: 'photographers', label: 'Number of photographers', type: 'number', min: 1, max: 20 },
        { key: 'styles', label: 'Style', type: 'multiselect', options: styles('photography').filter((s) => wedding || s !== 'Pre-wedding') },
        { key: 'multipleLocations', label: 'Coverage at more than one location?', type: 'select', options: YES_NO },
      ];
    case 'catering':
      return [
        { key: 'cuisines', label: 'Cuisine', type: 'multiselect', options: styles('catering') },
        { key: 'diet', label: 'Veg / non-veg', type: 'select', options: ['Veg only', 'Non-veg', 'Both'] },
        { key: 'guestCount', label: 'Guests to serve', type: 'number', min: 1, max: 100000 },
        { key: 'serviceStyle', label: 'Service style', type: 'select', options: ['Buffet', 'Plated', 'Live counters', 'Mixed'] },
        { key: 'menuPreference', label: 'Menu preference', type: 'text', max: 300 },
      ];
    case 'decor':
      return [
        { key: 'theme', label: 'Theme', type: 'select', options: styles('decor') },
        { key: 'scope', label: 'What to decorate', type: 'multiselect', options: ['Stage', 'Backdrop', 'Floral', 'Lighting', 'Entrance', 'Seating area'] },
        { key: 'area', label: 'Area / scope details', type: 'text', max: 200 },
      ];
    case 'makeup':
      return [
        { key: 'makeupFor', label: 'Makeup for', type: 'select', options: wedding ? ['Bride', 'Groom', 'Bride + family', 'Party'] : ['Party', 'Individual'] },
        { key: 'people', label: 'Number of people', type: 'number', min: 1, max: 100 },
        { key: 'durationHours', label: 'Duration (hours)', type: 'number', min: 1, max: 24 },
        { key: 'styles', label: 'Style', type: 'multiselect', options: styles('makeup').filter((s) => wedding || !/Bridal|Draping/.test(s)) },
      ];
    case 'venue':
      return [
        { key: 'venueType', label: 'Venue type', type: 'select', options: styles('venue') },
        { key: 'capacity', label: 'Capacity needed', type: 'number', min: 1, max: 100000 },
        { key: 'setting', label: 'Indoor / outdoor', type: 'select', options: ['Indoor', 'Outdoor', 'Both'] },
        { key: 'parking', label: 'Parking needed', type: 'select', options: YES_NO },
        { key: 'accessibility', label: 'Wheelchair access needed', type: 'select', options: YES_NO },
      ];
    case 'transport':
      return [
        { key: 'vehicleType', label: 'Vehicle type', type: 'select', options: styles('transport').filter((s) => wedding || s !== 'Vintage Bridal Car') },
        { key: 'vehicles', label: 'Number of vehicles', type: 'number', min: 1, max: 200 },
        { key: 'passengers', label: 'Passengers', type: 'number', min: 1, max: 10000 },
      ];
    case 'accommodation':
      return [
        { key: 'roomType', label: 'Room type', type: 'select', options: styles('accommodation') },
        { key: 'rooms', label: 'Rooms', type: 'number', min: 1, max: 1000 },
        { key: 'nights', label: 'Nights', type: 'number', min: 1, max: 60 },
      ];
    case 'sound':
    case 'entertainment':
      return [
        { key: 'genres', label: 'Music', type: 'multiselect', options: styles(category) },
        { key: 'durationHours', label: 'Duration (hours)', type: 'number', min: 1, max: 24 },
      ];
    default:
      return [];
  }
}

export function serviceFields(category, eventType) {
  return definitions(category, eventType);
}

/**
 * Services whose location commonly differs from the event venue: the
 * customer is asked about these; for others the event location is a sensible
 * choice but is never assumed.
 */
export const LOCATION_SENSITIVE = ['makeup', 'transport', 'accommodation', 'ceremony', 'photography'];
export const ROUTE_CATEGORIES = ['transport'];

/**
 * Validate service details against the category's fields. Unknown keys and
 * wrong types are rejected. `null` clears a key.
 */
export function validateDetails(category, eventType, details) {
  if (details == null) return {};
  if (typeof details !== 'object' || Array.isArray(details)) throw badRequest('INVALID_DETAILS', 'Service details must be an object');
  const fields = new Map(definitions(category, eventType).map((f) => [f.key, f]));
  const out = {};
  const errors = {};
  for (const [key, raw] of Object.entries(details)) {
    const f = fields.get(key);
    if (!f) {
      errors[key] = 'Not a detail for this service';
      continue;
    }
    if (raw === null || raw === '') {
      out[key] = null;
      continue;
    }
    if (f.type === 'number') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 1e9)) errors[key] = `${f.label}: enter a whole number${f.max ? ` up to ${f.max}` : ''}`;
      else out[key] = n;
    } else if (f.type === 'select') {
      if (!f.options.includes(raw)) errors[key] = `${f.label}: choose one of the options`;
      else out[key] = raw;
    } else if (f.type === 'multiselect') {
      const list = Array.isArray(raw) ? raw : [raw];
      if (!list.every((v) => f.options.includes(v))) errors[key] = `${f.label}: choose from the options`;
      else out[key] = [...new Set(list)];
    } else {
      const s = String(raw).trim();
      if (s.length > (f.max || 300)) errors[key] = `${f.label}: too long`;
      else out[key] = s;
    }
  }
  if (Object.keys(errors).length) throw badRequest('VALIDATION_FAILED', 'Please check the service details', { fields: errors });
  return out;
}

const clip = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);

/**
 * Validate a service location. mode: unspecified | event | custom.
 * `custom` needs a place, or (for transport) a pickup and/or drop.
 */
export function validateServiceLocation(category, loc) {
  if (loc == null) return null;
  if (typeof loc !== 'object') throw badRequest('INVALID_LOCATION', 'Service location must be an object');
  const mode = loc.mode || 'unspecified';
  if (!['unspecified', 'event', 'custom'].includes(mode)) throw badRequest('INVALID_LOCATION', 'Location must be the event location, a different location, or not specified');
  const empty = { place: null, address: null, locality: null, city: null, pickup: null, drop: null, dropIsEventLocation: false, notes: null };
  if (mode !== 'custom') return { ...empty, mode, notes: clip(loc.notes, 300) };
  const out = {
    mode,
    place: clip(loc.place, 200),
    address: clip(loc.address, 300),
    locality: clip(loc.locality, 80),
    city: clip(loc.city, 80),
    pickup: clip(loc.pickup, 200),
    drop: clip(loc.drop, 200),
    dropIsEventLocation: Boolean(loc.dropIsEventLocation),
    notes: clip(loc.notes, 300),
  };
  if (out.dropIsEventLocation) out.drop = null;
  const hasRoute = out.pickup || out.drop || out.dropIsEventLocation;
  if (!out.place && !out.address && !hasRoute) {
    throw badRequest('LOCATION_REQUIRED', ROUTE_CATEGORIES.includes(category) ? 'Add a pickup or drop location' : 'Tell us where this service will be');
  }
  return out;
}
