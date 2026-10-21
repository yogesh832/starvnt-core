import { VENDOR_CATEGORIES, findVendorCategory } from '../../common/vendorCategories.js';
/**
 * Category Workspaces — Shared Engine, Different Capability (Spec §10).
 *
 * "Do not create separate backends. Category-specific workspace modules
 * should configure capability and UX on top of the same domain model."
 */

const LEGACY_DEFINITIONS = {
  Photography: {
    label: 'Photography',
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
  Religious_Services: {
    label: 'Religious & Spiritual Services',
    capabilityFields: ['traditions', 'ceremonyTypes', 'officiantRoles', 'languageSpoken', 'samagriProvided', 'outstationTravelAllowed'],
    defaultStyles: ['Hindu Purohit / Priest', 'Muslim Imam / Nikah Officiant', 'Christian Priest / Pastor', 'Sikh Granthi', 'Buddhist Monk', 'Jain Priest', 'Interfaith Officiant', 'Spiritual Ceremony Specialist'],
    criticalLogic: 'Tradition + ceremony type + language + samagri/ritual requirements',
  },
  Corporate_Production: {
    label: 'Corporate & Conference Production',
    capabilityFields: ['productionTypes', 'screenSizes', 'avEquipment', 'stageDesigns', 'printingBranding', 'simultaneousTranslators'],
    defaultStyles: ['Conference & Seminar', 'Product Launch', 'Exhibition & Trade Show', 'Corporate Annual Gala', 'Award Ceremony'],
    criticalLogic: 'Technical specifications + branding + stage/AV scale',
  },
  Anchor_Host: {
    label: 'Anchor, Emcee & Host Services',
    capabilityFields: ['languages', 'eventTypes', 'yearsExperience', 'scriptWritingIncluded', 'rehearsalIncluded'],
    defaultStyles: ['Corporate Emcee', 'Wedding / Sangeet Host', 'Concert / Festival Anchor', 'Bilingual Anchor'],
    criticalLogic: 'Language fluency + event format + crowd engagement style',
  },
  Bridal_Wear: {
    label: 'Bridal Wear & Inventory Rental',
    capabilityFields: ['garmentTypes', 'sizes', 'rentalPeriodDays', 'depositRequired', 'alterationsIncluded', 'dispatchLeadTimeHours'],
    defaultStyles: ['Bridal Lehenga', 'Banarasi Saree', 'Sherwani', 'Indo-Western Tuxedo'],
    criticalLogic: 'Actual item availability, dispatch/return windows',
  },
};

const SPECIAL_DEFINITIONS = {
  Videography: { capabilityFields: ['videoFormats', 'deliverables', 'teamSize', 'equipment', 'cameraModels', 'droneIncluded'], defaultStyles: ['Documentary', 'Traditional', 'Highlight video'] },
  Cinematic_Production: { capabilityFields: ['filmFormats', 'deliverables', 'teamSize', 'equipment', 'droneIncluded', 'editingIncluded'], defaultStyles: ['Cinematic', 'Documentary', 'Wedding film'] },
  DJ: { capabilityFields: ['genres', 'performanceHours', 'equipment', 'teamSize', 'soundIncluded'], defaultStyles: ['Bollywood', 'EDM', 'Retro', 'Sufi'] },
  Sound: { capabilityFields: ['soundSystemWattage', 'microphones', 'mixingConsole', 'equipment', 'teamSize', 'technicians'], defaultStyles: ['Speech / Conference', 'Live sound', 'Concert sound'] },
  Event_Planning: { capabilityFields: ['eventTypes', 'planningScope', 'teamSize', 'budgetManagement', 'vendorManagement'], defaultStyles: ['Full planning', 'Partial planning', 'Destination planning'] },
  Event_Coordination: { capabilityFields: ['eventTypes', 'coordinationHours', 'teamSize', 'guestCount', 'handoverLeadDays'], defaultStyles: ['Event-day coordination', 'Multi-day coordination', 'Guest coordination'] },
};

export const CATEGORY_DEFINITIONS = { ...LEGACY_DEFINITIONS };
for (const category of VENDOR_CATEGORIES) {
  const definition = {
    label: category.value,
    capabilityFields: ['styles', 'deliverables', 'teamSize', 'equipment', 'simultaneousEventLimit'],
    defaultStyles: ['Custom service'],
    criticalLogic: 'Declared scope + capability + capacity + resources + dated availability',
    ...(LEGACY_DEFINITIONS[category.key] || {}),
    ...(SPECIAL_DEFINITIONS[category.key] || {}),
  };
  CATEGORY_DEFINITIONS[category.key] = definition;
  CATEGORY_DEFINITIONS[category.value] = definition;
}

export function validateCategoryCapability(category, attributes = {}) {
  const known = findVendorCategory(category);
  const definition = CATEGORY_DEFINITIONS[known?.key || category];
  if (!definition) return { category, isValid: false, definition: null, attributes: {} };
  const filtered = {};
  for (const field of definition.capabilityFields) if (attributes[field] !== undefined) filtered[field] = attributes[field];
  return { category, isValid: true, definition, attributes: filtered };
}
