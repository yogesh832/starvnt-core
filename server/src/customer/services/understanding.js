import {
  EVENT_TYPE_LABELS,
  templateFor,
  tierOf,
  categoryLabel,
  budgetRangeLabel,
  budgetRangesFor,
} from './planCatalog.js';

/**
 * Pure functions that turn stored state into what the customer (and Aura+)
 * sees. Nothing here writes; nothing here invents.
 */

export const HANDLED_STATUSES = ['customer_provided', 'confirmed', 'booked', 'completed'];
const CONFIRMED_STATUSES = ['confirmed', 'booked', 'completed'];
const CONFIRM_REQUIRED = [
  ['eventType', 'Event type'],
  ['eventDate', 'Date'],
  ['city', 'Location'],
];

export function missingForConfirm(event) {
  return CONFIRM_REQUIRED.filter(([k]) => !event?.[k]).map(([k, label]) => ({ field: k, label }));
}

export function contextMap(contextRows) {
  const map = new Map();
  for (const row of contextRows || []) map.set(row.field, row);
  return map;
}

export function skippedTopics(contextRows) {
  return new Set(
    (contextRows || []).filter((r) => r.field.startsWith('skip:') && r.value).map((r) => r.field.slice(5))
  );
}

export function dateState(event, ctx) {
  if (!event?.eventDate) return { state: 'MISSING' };
  const note = ctx.get('event.date');
  if (note?.state === 'INFERRED' && note.value?.date === event.eventDate) {
    return { state: 'INFERRED', note: note.value.note || 'year assumed' };
  }
  return { state: 'KNOWN' };
}

export function serializeRequirement(eventType, r) {
  return {
    id: String(r._id),
    category: r.category,
    label: categoryLabel(r.category),
    tier: tierOf(eventType, r.category),
    status: r.status,
    source: r.source,
    providedValue: r.providedValue || null,
    preferences: r.preferences || {},
    selectedOptionId: r.selectedOptionId || null,
    selectedOption: r.selectedOptionId ? r.selectedOption : null,
    serviceLocation: serializeServiceLocation(r.serviceLocation),
    specialRequirements: r.specialRequirements || null,
  };
}

export function serializeServiceLocation(sl) {
  const mode = sl?.mode || 'unspecified';
  if (mode !== 'custom') return { mode, notes: sl?.notes || null };
  return {
    mode,
    place: sl.place || null,
    address: sl.address || null,
    locality: sl.locality || null,
    city: sl.city || null,
    pickup: sl.pickup || null,
    drop: sl.drop || null,
    dropIsEventLocation: Boolean(sl.dropIsEventLocation),
    notes: sl.notes || null,
  };
}

/** "Kisan Palace, New Town, Kolkata" — only the parts that are known. */
export function locationLabel(event) {
  const l = event?.location || {};
  return [l.venueName, l.locality, event?.city].filter(Boolean).join(', ') || null;
}

export function eventTypeLabelOf(event) {
  if (!event?.eventType) return null;
  if (event.eventType === 'other' && event.customType) return event.customType;
  return EVENT_TYPE_LABELS[event.eventType];
}

export function serializeLocation(event) {
  const l = event?.location || {};
  return {
    country: l.country || null,
    state: l.state || null,
    city: event?.city || null,
    locality: l.locality || null,
    venueName: l.venueName || null,
    address: l.address || null,
    pincode: l.pincode || null,
    landmark: l.landmark || null,
    notes: l.notes || null,
    coordinates: l.coordinates?.lat != null && l.coordinates?.lng != null ? { lat: l.coordinates.lat, lng: l.coordinates.lng } : null,
  };
}

export function serializeEvent(event) {
  if (!event) return null;
  return {
    id: String(event._id),
    title: event.title || '',
    eventType: event.eventType,
    eventTypeLabel: eventTypeLabelOf(event),
    customType: event.customType || null,
    eventDate: event.eventDate,
    city: event.city,
    location: serializeLocation(event),
    locationLabel: locationLabel(event),
    specialRequirements: event.specialRequirements || null,
    notes: event.notes || null,
    guestCount: event.guestCount,
    budget: event.budget,
    budgetMin: event.budgetMin,
    budgetMax: event.budgetMax,
    budgetRangeLabel: event.budget == null ? budgetRangeLabel(event.budgetMin, event.budgetMax) : null,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

/** Essentials handled / essentials. Only real rows count. */
export function progressOf(event, requirements) {
  const essentials = templateFor(event.eventType).essential;
  const byCat = new Map((requirements || []).map((r) => [r.category, r]));
  const handled = essentials.filter((c) => HANDLED_STATUSES.includes(byCat.get(c)?.status)).length;
  return {
    essentialsTotal: essentials.length,
    essentialsHandled: handled,
    progressPercent: essentials.length ? Math.round((handled / essentials.length) * 100) : 0,
  };
}

/** The "Here's what I understood" card (Blueprint §8). */
export function buildUnderstanding(event, requirements, contextRows) {
  if (!event) return null;
  const ctx = contextMap(contextRows);
  const d = dateState(event, ctx);
  const fact = (value, extra = {}) => ({ value: value ?? null, state: value == null || value === '' ? 'MISSING' : 'KNOWN', ...extra });

  const rangeLabel = event.budget == null ? budgetRangeLabel(event.budgetMin, event.budgetMax) : null;
  const budget =
    event.budget != null
      ? { value: event.budget, rangeLabel: null, state: 'KNOWN' }
      : rangeLabel
        ? { value: null, rangeLabel, state: 'KNOWN' }
        : { value: null, rangeLabel: null, state: 'MISSING' };

  const reqs = requirements || [];
  const byCat = new Map(reqs.map((r) => [r.category, r]));
  const missing = missingForConfirm(event);
  const loc = serializeLocation(event);
  const label = locationLabel(event);

  const needed = reqs
    .filter((r) => r.status === 'pending')
    .map((r) => ({ category: r.category, label: categoryLabel(r.category), location: serviceLocationText(r.serviceLocation, label) }));
  const provided = reqs
    .filter((r) => r.status === 'customer_provided')
    .map((r) => ({ category: r.category, label: categoryLabel(r.category), value: r.providedValue, location: serviceLocationText(r.serviceLocation, label) }));
  // Template suggestions the customer hasn't spoken about: RECOMMENDED, never required.
  const suggested = event.eventType
    ? templateFor(event.eventType)
        .essential.filter((c) => !byCat.get(c) || byCat.get(c).status === 'missing')
        .map((c) => ({ category: c, label: categoryLabel(c) }))
    : [];

  const locationsMissing = reqs
    .filter((r) => ['pending', 'customer_provided'].includes(r.status) && ASK_LOCATION.includes(r.category) && (r.serviceLocation?.mode || 'unspecified') === 'unspecified')
    .map((r) => categoryLabel(r.category));
  const missingInfo = [
    ...missing,
    ...(!event.guestCount ? [{ field: 'guestCount', label: 'Guest count' }] : []),
    ...(budget.state === 'MISSING' ? [{ field: 'budget', label: 'Budget' }] : []),
    ...(!loc.venueName && !HANDLED_STATUSES.includes(byCat.get('venue')?.status) ? [{ field: 'venue', label: 'Venue' }] : []),
    ...(locationsMissing.length ? [{ field: 'serviceLocations', label: `Service locations: ${locationsMissing.join(', ')}` }] : []),
  ];

  const inferred = [
    ...(d.state === 'INFERRED' ? [{ field: 'date', label: 'Date', note: d.note }] : []),
    ...(contextRows || [])
      .filter((r) => r.state === 'INFERRED' && r.field.startsWith('tentative:'))
      .map((r) => ({ field: r.field, label: categoryLabel(r.field.slice('tentative:'.length)), note: 'you mentioned maybe' })),
  ];

  return {
    eventId: String(event._id),
    status: event.status,
    confirmed: event.status !== 'draft',
    facts: {
      eventType: fact(event.eventType, { label: eventTypeLabelOf(event) }),
      date: { value: event.eventDate, ...d },
      city: fact(event.city),
      location: { value: label, ...loc, state: label ? 'KNOWN' : 'MISSING' },
      guestCount: fact(event.guestCount),
      budget,
    },
    services: { needed, provided, suggested },
    missingForConfirm: missing,
    missingInfo,
    inferred,
    canConfirm: event.status === 'draft' && missing.length === 0,
  };
}

/** Human text for a service location; null when not specified (honest). */
export function serviceLocationText(sl, eventLocationLabel) {
  const mode = sl?.mode || 'unspecified';
  if (mode === 'event') return eventLocationLabel ? `At the event location (${eventLocationLabel})` : 'At the event location';
  if (mode !== 'custom') return null;
  if (sl.pickup || sl.drop || sl.dropIsEventLocation) {
    const drop = sl.dropIsEventLocation ? 'event location' : sl.drop;
    return [sl.pickup && `from ${sl.pickup}`, drop && `to ${drop}`].filter(Boolean).join(' ');
  }
  return [sl.place, sl.locality, sl.city].filter(Boolean).join(', ') || sl.address || null;
}

// Services whose location Aura+ asks about (they often differ from the venue).
export const ASK_LOCATION = ['makeup', 'transport', 'accommodation', 'ceremony'];

/** Blueprint §8.4 context states, for Aura+'s prompt. */
export function buildContextStates(event, requirements, contextRows) {
  const states = {};
  if (!event) return states;
  const ctx = contextMap(contextRows);
  states['event.type'] = event.eventType ? 'KNOWN' : 'MISSING';
  states['event.date'] = dateState(event, ctx).state;
  states['event.city'] = event.city ? 'KNOWN' : 'MISSING';
  states['event.venue'] = event.location?.venueName ? 'KNOWN' : 'MISSING';
  states['event.area'] = event.location?.locality ? 'KNOWN' : 'MISSING';
  states['event.guest_count'] = event.guestCount ? 'KNOWN' : 'MISSING';
  for (const r of requirements || []) {
    if (!['pending', 'customer_provided'].includes(r.status)) continue;
    states[`location.${r.category}`] = (r.serviceLocation?.mode || 'unspecified') === 'unspecified' ? 'MISSING' : 'KNOWN';
  }
  states['event.budget'] = event.budget != null || event.budgetMin != null || event.budgetMax != null ? 'KNOWN' : 'MISSING';

  const byCat = new Map((requirements || []).map((r) => [r.category, r]));
  const t = templateFor(event.eventType);
  for (const c of [...t.essential, ...t.recommended, ...t.optional, ...byCat.keys()]) {
    const r = byCat.get(c);
    let s = 'RECOMMENDED';
    if (r && CONFIRMED_STATUSES.includes(r.status)) s = 'CONFIRMED';
    else if (r && ['customer_provided', 'pending'].includes(r.status)) s = 'KNOWN';
    states[`requirement.${c}`] = s;
  }
  // INFERRED notes fill gaps only; they never override stored state.
  for (const row of contextRows || []) {
    if (row.state !== 'INFERRED' || !row.field.startsWith('tentative:')) continue;
    const key = `requirement.${row.field.slice('tentative:'.length)}`;
    if (!states[key] || states[key] === 'RECOMMENDED') states[key] = 'INFERRED';
  }
  return states;
}

const SERVICE_CHIPS = (category, prefill) => [
  { label: 'Yes, I already have one', prefill },
  { label: 'Help me find one', message: `Please help me find ${category === 'venue' ? 'a venue' : `a ${categoryLabel(category).toLowerCase()} option`}` },
  { label: 'Skip for now', skipTopic: `requirement.${category}` },
];

const PREFILL = {
  venue: 'My venue is ',
  catering: 'My caterer is ',
  photography: 'My photographer is ',
  decor: 'My decorator is ',
  makeup: 'My makeup artist is ',
  sound: 'My sound provider is ',
  ceremony: 'Our purohit is ',
  cake: 'My cake is from ',
};

const LOCATION_QUESTION = {
  makeup: 'Where will the makeup be done?',
  transport: 'Where should guests be picked up from?',
  accommodation: 'Where will guests stay?',
  ceremony: 'Where will the ceremony take place?',
};
const LOCATION_PREFILL = {
  makeup: 'Makeup will be at ',
  transport: 'Guests will be picked up from ',
  accommodation: 'Guests will stay at ',
  ceremony: 'The ceremony will be at ',
};

/**
 * Smart clarification: exactly ONE next question, with chips.
 * Order: type → date → city → guests → venue → area → budget →
 * remaining essentials → where location-sensitive services happen.
 * Skipped topics are never re-asked.
 */
export function nextQuestion(event, requirements, contextRows) {
  if (!event || !event.eventType) {
    return {
      topic: 'event.type',
      question: 'What kind of event are you planning?',
      options: [
        { label: 'Wedding', message: "I'm planning a wedding" },
        { label: 'Birthday', message: "I'm planning a birthday" },
        { label: 'Corporate event', message: "I'm planning a corporate event" },
        { label: 'Puja', message: "I'm planning a puja" },
        { label: 'Anniversary', message: "I'm planning an anniversary" },
        { label: 'Something else', prefill: "I'm planning " },
      ],
    };
  }
  if (event.status !== 'draft' && event.status !== 'planning') return null;

  const skipped = skippedTopics(contextRows);
  const byCat = new Map((requirements || []).map((r) => [r.category, r]));
  const open = (c) => !byCat.get(c) || byCat.get(c).status === 'missing';

  const typeWord = (eventTypeLabelOf(event) || 'event').toLowerCase();
  if (!event.eventDate && !skipped.has('event.date')) {
    return { topic: 'event.date', question: `What date are you planning the ${typeWord}?`, options: [] };
  }
  if (!event.city && !skipped.has('event.city')) {
    return { topic: 'event.city', question: 'Which city will it be in?', options: [] };
  }
  if (!event.guestCount && !skipped.has('event.guest_count')) {
    return {
      topic: 'event.guest_count',
      question: 'Approximately how many guests?',
      options: [{ label: 'Skip for now', skipTopic: 'event.guest_count' }],
    };
  }
  if (open('venue') && !event.location?.venueName && !skipped.has('requirement.venue')) {
    return { topic: 'requirement.venue', question: 'Do you already have a venue?', options: SERVICE_CHIPS('venue', PREFILL.venue) };
  }
  if (event.location?.venueName && !event.location?.locality && !skipped.has('event.area')) {
    return {
      topic: 'event.area',
      question: `Which area of ${event.city || 'the city'} is ${event.location.venueName} in?`,
      options: [{ label: 'Skip for now', skipTopic: 'event.area' }],
    };
  }
  if (event.budget == null && event.budgetMin == null && event.budgetMax == null && !skipped.has('event.budget')) {
    return {
      topic: 'event.budget',
      question: "What's your approximate budget?",
      options: [
        ...budgetRangesFor(event.eventType).map((r) => ({ label: r.label, budgetRange: r.id })),
        { label: 'Set my own budget', prefill: 'My budget is ₹' },
        { label: 'Skip for now', skipTopic: 'event.budget' },
      ],
    };
  }
  for (const c of templateFor(event.eventType).essential) {
    if (c === 'venue') continue;
    if (open(c) && !skipped.has(`requirement.${c}`)) {
      return {
        topic: `requirement.${c}`,
        question: `Do you already have ${categoryLabel(c).toLowerCase()} arranged?`,
        options: SERVICE_CHIPS(c, PREFILL[c] || `My ${categoryLabel(c).toLowerCase()} is `),
      };
    }
  }
  // Event location ≠ service location: ask where these happen; never assume.
  for (const r of requirements || []) {
    if (!['pending', 'customer_provided'].includes(r.status) || !ASK_LOCATION.includes(r.category)) continue;
    if ((r.serviceLocation?.mode || 'unspecified') !== 'unspecified' || skipped.has(`location.${r.category}`)) continue;
    const options =
      r.category === 'transport'
        ? [
            { label: 'Enter pickup place', prefill: LOCATION_PREFILL.transport },
            { label: 'Not decided yet', skipTopic: `location.${r.category}` },
          ]
        : [
            { label: 'At the event venue', serviceLocation: { category: r.category, mode: 'event' } },
            { label: 'Somewhere else', prefill: LOCATION_PREFILL[r.category] },
            { label: 'Not decided yet', skipTopic: `location.${r.category}` },
          ];
    return { topic: `location.${r.category}`, question: LOCATION_QUESTION[r.category], options };
  }
  return null;
}
