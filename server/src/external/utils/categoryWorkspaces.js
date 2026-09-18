/**
 * Category Workspaces — Shared Engine, Different Capability (Spec §10).
 *
 * "Do not create separate backends. Category-specific workspace modules
 * should configure capability and UX on top of the same domain model."
 */

export const CATEGORY_DEFINITIONS = {
  Photography: {
    label: 'Photography & Videography',
    capabilityFields: ['styles', 'deliverables', 'teamSize', 'equipment', 'cameraModels', 'droneIncluded'],
    defaultStyles: ['Candid', 'Traditional', 'Cinematic', 'Aerial/Drone', 'Pre-wedding'],
    criticalLogic: 'Team/resource allocation, venue/date coverage, multi-location schedule, portfolio evidence',
  },
  Makeup: {
    label: 'Makeup & Hair Artistry',
    capabilityFields: ['styles', 'servicesOffered', 'brandsUsed', 'clientSlotsPerDay', 'travelAvailable', 'assistantsCount'],
    defaultStyles: ['Bridal HD', 'Airbrush', 'Editorial', 'Hair Styling', 'Saree Draping'],
    criticalLogic: 'Client slot + travel + location + simultaneous client limits',
  },
  Venue: {
    label: 'Venues & Spaces',
    capabilityFields: ['venueType', 'seatedCapacity', 'floatingCapacity', 'roomsCount', 'parkingSpaces', 'cateringPolicy', 'alcoholPermitted'],
    defaultStyles: ['Banquet Hall', 'Lawn / Open Air', 'Heritage Palace', 'Resort', 'Poolside'],
    criticalLogic: 'Space-level inventory, booking period, venue compatibility',
  },
  Catering: {
    label: 'Catering & Food Production',
    capabilityFields: ['cuisines', 'servingStyles', 'minGuests', 'maxGuests', 'liveCounters', 'dietaryOptions', 'staffPerGuestRatio'],
    defaultStyles: ['North Indian', 'Bengali Traditional', 'Continental', 'Pan-Asian', 'Mughlai'],
    criticalLogic: 'Guest quantity + kitchen + menu + service logistics',
  },
  Decoration: {
    label: 'Decor & Theme Production',
    capabilityFields: ['themes', 'floralTypes', 'stageSetupTimeHours', 'lightingIncluded', 'furnitureInventory', 'powerRequirementsKw'],
    defaultStyles: ['Traditional Floral', 'Modern Minimalist', 'Boho Chic', 'Royal Palace', 'Fairytale Lights'],
    criticalLogic: 'Area + inventory + setup/dismantle team + access/power',
  },
  DJ_Production: {
    label: 'DJ, Sound & Stage Production',
    capabilityFields: ['genres', 'soundSystemWattage', 'stageSizeMeters', 'ledWallDimensions', 'lightingTrusses', 'generatorProvided'],
    defaultStyles: ['Bollywood', 'EDM / Commercial', 'Retro / Sufi', 'Live Band Sound', 'Acoustic'],
    criticalLogic: 'Venue technical compatibility + equipment logistics',
  },
  Transport: {
    label: 'Transport & Fleet Logistics',
    capabilityFields: ['vehicleTypes', 'fleetSize', 'passengerCapacity', 'driverIncluded', 'luggageCapacity', 'outstationAllowed'],
    defaultStyles: ['Luxury Sedan', 'Vintage Bridal Car', 'Tempo Traveller', 'Electric Fleet', 'SUVs'],
    criticalLogic: 'Origin -> destination + driver/vehicle + route/time feasibility',
  },
  Hotel: {
    label: 'Accommodation & Hospitality',
    capabilityFields: ['roomTypes', 'totalRooms', 'maxOccupancy', 'checkInTime', 'checkOutTime', 'breakfastIncluded'],
    defaultStyles: ['Deluxe Suite', 'Presidential Suite', 'Standard Double', 'Cottage Villa'],
    criticalLogic: 'Room inventory availability + property/location match',
  },
  Bridal_Wear: {
    label: 'Bridal Wear & Inventory Rental',
    capabilityFields: ['garmentTypes', 'sizes', 'rentalPeriodDays', 'depositRequired', 'alterationsIncluded', 'dispatchLeadTimeHours'],
    defaultStyles: ['Bridal Lehenga', 'Banarasi Saree', 'Sherwani', 'Indo-Western Tuxedo'],
    criticalLogic: 'Actual item availability, dispatch/return windows',
  },
};

/**
 * Validates and normalizes category capability attributes.
 */
export function validateCategoryCapability(category, attributes = {}) {
  const definition = CATEGORY_DEFINITIONS[category] || CATEGORY_DEFINITIONS.Photography;
  const filtered = {};

  for (const field of definition.capabilityFields) {
    if (attributes[field] !== undefined) {
      filtered[field] = attributes[field];
    }
  }

  return {
    category,
    isValid: true,
    definition,
    attributes: filtered,
  };
}
