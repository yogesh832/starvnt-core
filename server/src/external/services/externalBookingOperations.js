import mongoose from 'mongoose';
import { VendorService } from '../models/VendorService.js';
import { VendorResource } from '../models/VendorResource.js';
import { checkTrueAvailability } from './availability.service.js';
import { schedulingError } from '../../common/scheduleRules.js';
import { externalReservesCapacity } from '../../common/externalBookingContract.js';

export async function prepareExternalOperations(vendorId, commercial, schedule) {
  const quantities = new Map(commercial.allocations.map(a => [String(a.resource), a.units]));
  const services = [];
  const required = new Map();
  for (const line of commercial.lineItems) {
    if (!line.service) continue;
    if (!mongoose.isValidObjectId(line.service)) throw schedulingError('SERVICE_NOT_OWNED', 'Select your own catalogue service.', 403);
    const service = await VendorService.findOne({ _id: line.service, vendor: vendorId, status: { $ne: 'ARCHIVED' } }).lean();
    if (!service) throw schedulingError('SERVICE_NOT_OWNED', 'Select your own non-archived service.', 403);
    line.name = service.name;
    services.push(String(service._id));
    for (const id of service.requiredResourceIds || []) required.set(String(id), (required.get(String(id)) || 0) + line.quantity);
  }
  for (const [id, units] of required) quantities.set(id, Math.max(quantities.get(id) || 0, units));
  for (const id of schedule.resourceIds || []) if (!quantities.has(String(id))) quantities.set(String(id), 1);
  for (const [id, units] of quantities) {
    if (!mongoose.isValidObjectId(id)) throw schedulingError('RESOURCE_NOT_OWNED', 'Select your own resources.', 403);
    const resource = await VendorResource.findOne({ _id: id, vendor: vendorId, status: { $in: ['AVAILABLE', 'ALLOCATED'] } }).lean();
    if (!resource) throw schedulingError('RESOURCE_NOT_AVAILABLE', 'A selected resource is missing, retired or under maintenance.', 409);
    if (units > resource.capacityUnits) throw schedulingError('RESOURCE_CAPACITY_EXCEEDED', 'A resource quantity exceeds its declared capacity.', 409);
  }
  commercial.allocations = [...quantities].map(([resource, units]) => ({ resource, units }));
  schedule.resourceIds = [...quantities.keys()];
  return [...new Set(services)];
}

export async function validateExternalFeasibility(vendorId, schedule, commercial, excludeId = null) {
  if (!externalReservesCapacity({ recordType: schedule.recordType, externalBooking: commercial })) return;
  const serviceIds = [...new Set(commercial.lineItems.map(l => l.service).filter(Boolean).map(String))];
  if (!serviceIds.length) serviceIds.push(schedule.vendorService || null);
  for (const vendorServiceId of serviceIds) {
    const result = await checkTrueAvailability({ vendorId, ...schedule, externalBooking: commercial, vendorServiceId,
      requestedResources: schedule.resourceIds, requestedResourceUnits: Object.fromEntries(commercial.allocations.map(a => [String(a.resource), a.units])), excludeId });
    if (!result.feasible) throw schedulingError('SCHEDULE_CONFLICT', 'This booking conflicts with the operational schedule.', 409, result.conflicts);
  }
}
