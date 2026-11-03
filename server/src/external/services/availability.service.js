import { VendorBlockout } from '../models/VendorBlockout.js';
import { externalReservesCapacity } from '../../common/externalBookingContract.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { VendorService } from '../models/VendorService.js';
import { VendorResource } from '../models/VendorResource.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { Booking, CustomerEvent, Reservation } from '../../customer/models/index.js';
import { interval, overlaps, scopeApplies, normaliseCommitment } from '../../common/scheduleRules.js';
import { estimateDistanceKm, estimateTravelDurationMinutes } from '../utils/geo.js';

function timeSpan(row) {
  const span = row.startAt && row.endAt ? interval(row) : interval(normaliseCommitment({ date: row.date || row.eventDate, endDate: row.endDate, allDay: row.allDay ?? !row.startTime, startTime: row.startTime, endTime: row.endTime, timezone: row.timezone }));
  const b = row.externalBooking?.buffers || {};
  return [span[0] - ((b.setupMinutes || 0) + (b.travelBeforeMinutes || 0)) * 60000, span[1] + ((b.teardownMinutes || 0) + (b.travelAfterMinutes || 0)) * 60000];
}

export async function loadSchedule(vendorId) {
  const [blocks, slots, core, services] = await Promise.all([
    VendorBlockout.find({ vendor: vendorId, status: { $ne: 'CANCELLED' } }).lean(),
    VendorBookingSlot.find({ vendor: vendorId, status: { $in: ['CONFIRMED', 'SCHEDULED', 'IN_PROGRESS'] } }).lean(),
    CoreBooking.find({ vendorId, bookingStatus: 'CONFIRMED' }).lean(),
    VendorService.find({ vendor: vendorId }).select('_id requiredResourceIds').lean(),
  ]);
  const serviceOptions = services.map(s => `vs_${s._id}`);
  const [customer, holds] = await Promise.all([
    Booking.find({ optionId: { $in: serviceOptions }, $or: [{ status: 'confirmed' }, { status: 'pending', 'coreSync.status': 'PENDING', 'coreSync.snapshot': { $ne: null } }] }).lean(),
    Reservation.find({ optionId: { $in: serviceOptions }, status: { $in: ['pending_payment', 'held'] }, expiresAt: { $gt: new Date() } }).lean(),
  ]);
  const reservations = customer.length ? await Reservation.find({ _id: { $in: customer.map(b => b.reservation) } }).lean() : [];
  const byReservation = new Map(reservations.map(r => [String(r._id), r]));
  const coreQuotes = new Set(core.map(b => String(b.quoteId)));
  const ownCustomer = customer.filter(b => !core.some(c => String(c.customerBookingId) === String(b._id) || String(c._id) === String(b.coreBooking)) && !coreQuotes.has(String(byReservation.get(String(b.reservation))?.quote)));
  const eventIds = [...ownCustomer, ...holds].map(b => b.event);
  const events = eventIds.length ? await CustomerEvent.find({ _id: { $in: eventIds } }).lean() : [];
  const byEvent = new Map(events.map(e => [String(e._id), e]));
  const serviceMap = new Map(services.map(s => [String(s._id), s]));
  return [
    ...blocks.filter(b => externalReservesCapacity(b)).map(b => ({ ...b, kind: b.recordType || 'VENDOR_BLOCK',
      serviceIds: (b.externalBooking?.lineItems || []).map(l => l.service).filter(Boolean), resourceUnits: Object.fromEntries((b.externalBooking?.allocations || []).map(a => [String(a.resource), a.units])),
      resourceIds: b.resourceIds?.length ? b.resourceIds : b.recordType === 'EXTERNAL_COMMITMENT' ? serviceMap.get(String(b.vendorService))?.requiredResourceIds || [] : [] })),
    ...slots.map(s => ({ ...s, kind: 'EXTERNAL_COMMITMENT', resourceIds: s.assignedResources?.length ? s.assignedResources : serviceMap.get(String(s.vendorService))?.requiredResourceIds || [] })),
    ...core.map(b => ({ ...b, kind: 'CONFIRMED_BOOKING', date: b.eventDate, scope: 'BUSINESS', allDay: true, resourceIds: b.assignedResources?.length ? b.assignedResources : serviceMap.get(String(b.vendorService))?.requiredResourceIds || [] })),
    ...ownCustomer.map(b => ({ ...b, kind: 'CONFIRMED_BOOKING', date: byEvent.get(String(b.event))?.eventDate, allDay: true, serviceLocation: byEvent.get(String(b.event))?.location, resourceIds: serviceMap.get(String(b.optionId).replace(/^vs_/, ''))?.requiredResourceIds || [] })),
    ...holds.filter(h => !customer.some(b => String(b.reservation) === String(h._id))).map(b => ({ ...b, kind: 'PENDING_COMMITMENT', date: byEvent.get(String(b.event))?.eventDate, allDay: true, serviceLocation: byEvent.get(String(b.event))?.location })),
  ].filter(r => r.date || r.startAt);
}

export function evaluateSchedule(request, rows, simultaneousLimit = 1) {
  const requested = timeSpan({ ...request, allDay: request.allDay ?? false, startTime: request.startTime || '00:00', endTime: request.endTime || '23:59' });
  const conflicts = [];
  const candidates = rows.filter(r => String(r._id) !== String(request.excludeId || '') && String(r._id) !== String(request.excludeBookingId || '') && !(r.kind === 'PENDING_COMMITMENT' && (String(r._id) === String(request.excludeReservationId || '') || String(r.event) === String(request.excludeEventId || ''))) && scopeApplies(r, request));
  const overlapping = [];
  const resourceUsage = new Map();
  for (const row of candidates) {
    const existing = timeSpan(row);
    const overlap = overlaps(requested, existing);
    const conflict = type => conflicts.push({ type, recordId: String(row._id), recordType: row.kind, date: row.date, detail: type.replaceAll('_', ' ').toLowerCase() });
    if (overlap) {
      if (row.kind === 'VENDOR_BLOCK' || request.blockAll) conflict('BLOCK_OR_BOOKING_OVERLAP');
      else if (!row.vendorService || !request.vendorServiceId || String(row.vendorService) === String(request.vendorServiceId) || row.serviceIds?.map(String).includes(String(request.vendorServiceId))) overlapping.push({ row, span: existing });
      const resources = row.resourceIds || row.assignedResources || [];
      for (const id of request.requestedResources || []) if (resources.map(String).includes(String(id))) {
        const key = String(id);
        if (!resourceUsage.has(key)) resourceUsage.set(key, []);
        resourceUsage.get(key).push({ span: existing, units: row.resourceUnits?.[key] || 1 });
      }
    } else if (request.serviceLocation && row.serviceLocation && row.kind !== 'VENDOR_BLOCK') {
      const gap = requested[0] >= existing[1] ? requested[0] - existing[1] : existing[0] - requested[1];
      const minutes = estimateTravelDurationMinutes(estimateDistanceKm(row.serviceLocation, request.serviceLocation)) + Number(request.setupMinutes ?? 45);
      if (gap < minutes * 60000 && (!request.requestedResources?.length || request.requestedResources.some(id => (row.resourceIds || []).map(String).includes(String(id))) || simultaneousLimit <= 1)) conflict('GEOGRAPHIC_TRAVEL_CONFLICT');
    }
  }
  const endpoints = overlapping.flatMap(({ span }) => [[Math.max(requested[0], span[0]), 1], [Math.min(requested[1], span[1]), -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let concurrent = 0, peak = 0;
  for (const [, delta] of endpoints) { concurrent += delta; peak = Math.max(peak, concurrent); }
  if (peak >= simultaneousLimit) conflicts.push({ type: 'SIMULTANEOUS_CAPACITY_EXCEEDED', detail: 'The concurrent job limit is reached.', recordIds: overlapping.map(x => String(x.row._id)) });
  for (const id of request.requestedResources || []) {
    const capacity = request.resourceCapacities?.[String(id)] ?? 1;
    const changes = (resourceUsage.get(String(id)) || []).flatMap(({ span, units }) => [[Math.max(requested[0], span[0]), units], [Math.min(requested[1], span[1]), -units]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let used = 0, maximum = 0;
    for (const [, delta] of changes) { used += delta; maximum = Math.max(maximum, used); }
    if (!request.blockAll && capacity < maximum + (request.requestedResourceUnits?.[String(id)] || 1)) conflicts.push({ type: 'RESOURCE_CAPACITY_EXCEEDED', resourceId: String(id), detail: 'Required resource quantity is unavailable.' });
  }
  return { feasible: !conflicts.length, conflicts, reason: conflicts[0]?.detail || null, capacityRemaining: Math.max(0, simultaneousLimit - peak) };
}

export async function checkTrueAvailability(request) {
  const [rows, capability, service] = await Promise.all([
    loadSchedule(request.vendorId),
    request.vendorServiceId ? VendorCapability.findOne({ vendor: request.vendorId, vendorService: request.vendorServiceId }).lean() : null,
    request.vendorServiceId ? VendorService.findOne({ _id: request.vendorServiceId, vendor: request.vendorId }).lean() : null,
  ]);
  const requestedResources = request.requestedResources?.length ? request.requestedResources : service?.requiredResourceIds || [];
  const resourceRows = requestedResources.length ? await VendorResource.find({ vendor: request.vendorId, _id: { $in: requestedResources } }).lean() : [];
  const resourceCapacities = Object.fromEntries(requestedResources.map(id => {
    const resource = resourceRows.find(r => String(r._id) === String(id));
    return [String(id), resource && !['RETIRED', 'MAINTENANCE'].includes(resource.status) ? resource.capacityUnits || 1 : 0];
  }));
  return evaluateSchedule({ ...request, setupMinutes: service?.setupBufferMinutes ?? 45, requestedResources, resourceCapacities }, rows, capability?.simultaneousEventLimit || 1);
}
