import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { estimateDistanceKm, estimateTravelDurationMinutes } from '../utils/geo.js';

function parseTimeToMinutes(timeStr = '00:00') {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * True Availability & Operational Feasibility Calculator (Spec §5, §6).
 *
 * Formula:
 * DATE + TIME + LOCATION + TEAM + EQUIPMENT + CAPACITY = OPERATIONAL FEASIBILITY
 *
 * Golden Acceptance Test C:
 * Surfaces: "Calendar says available, but resource or travel constraints make this opportunity infeasible."
 */
export async function checkTrueAvailability({
  vendorId,
  vendorServiceId,
  date, // 'YYYY-MM-DD'
  startTime = '10:00', // 'HH:mm'
  endTime = '18:00', // 'HH:mm'
  serviceLocation, // { address, locality, city, coordinates }
  requestedResources = [], // array of Resource IDs
}) {
  const conflicts = [];
  const reqStartMins = parseTimeToMinutes(startTime);
  const reqEndMins = parseTimeToMinutes(endTime);

  // 1. Check explicit blockouts
  const blockout = await VendorBlockout.findOne({ vendor: vendorId, date });
  if (blockout) {
    if (blockout.allDay) {
      return {
        feasible: false,
        reason: `Vendor is unavailable on ${date}: ${blockout.reason}`,
        conflicts: [{ type: 'BLOCKOUT', detail: blockout.reason }],
      };
    }
    const bStart = parseTimeToMinutes(blockout.startTime);
    const bEnd = parseTimeToMinutes(blockout.endTime);
    if (!(reqEndMins <= bStart || reqStartMins >= bEnd)) {
      return {
        feasible: false,
        reason: `Time slot overlaps with blocked hours (${blockout.startTime} - ${blockout.endTime})`,
        conflicts: [{ type: 'BLOCKOUT', detail: blockout.reason }],
      };
    }
  }

  // 2. Load capability to inspect simultaneous capacity limits
  let simultaneousLimit = 1;
  if (vendorServiceId) {
    const capability = await VendorCapability.findOne({ vendor: vendorId, vendorService: vendorServiceId });
    if (capability && capability.simultaneousEventLimit) {
      simultaneousLimit = capability.simultaneousEventLimit;
    }
  }

  // 3. Find existing active bookings for that date
  const existingBookings = await VendorBookingSlot.find({
    vendor: vendorId,
    date,
    status: { $in: ['CONFIRMED', 'SCHEDULED', 'IN_PROGRESS'] },
  });

  // 3. Find concurrent bookings that directly overlap with requested time window
  const concurrentBookings = existingBookings.filter((bk) => {
    const bkStartMins = parseTimeToMinutes(bk.startTime);
    const bkEndMins = parseTimeToMinutes(bk.endTime);
    return !(reqEndMins <= bkStartMins || reqStartMins >= bkEndMins);
  });

  if (concurrentBookings.length >= simultaneousLimit) {
    return {
      feasible: false,
      reason: `Maximum simultaneous event capacity reached (${concurrentBookings.length}/${simultaneousLimit}) for this time window`,
      conflicts: [{ type: 'SIMULTANEOUS_CAPACITY_EXCEEDED', count: concurrentBookings.length }],
    };
  }

  // 4. Operational Geographic & Travel Feasibility Buffer
  // Check every existing booking on the same day for travel feasibility
  for (const bk of existingBookings) {
    const bkStartMins = parseTimeToMinutes(bk.startTime);
    const bkEndMins = parseTimeToMinutes(bk.endTime);

    // If time overlaps directly
    const directOverlap = !(reqEndMins <= bkStartMins || reqStartMins >= bkEndMins);
    if (directOverlap && simultaneousLimit <= 1) {
      conflicts.push({
        type: 'TIME_SLOT_COLLISION',
        detail: `Direct schedule collision with booking (${bk.startTime} - ${bk.endTime})`,
      });
      break;
    }

    // Even if calendar time has a gap, check travel buffer between locations:
    // Distance between existing booking location and new service location
    const distKm = estimateDistanceKm(bk.serviceLocation, serviceLocation);
    const travelMins = estimateTravelDurationMinutes(distKm);
    const setupBufferMins = 45; // mandatory setup/teardown turnaround buffer
    const totalRequiredTurnaround = travelMins + setupBufferMins;

    // Case A: Existing booking is earlier in the day
    if (bkEndMins <= reqStartMins) {
      const availableGap = reqStartMins - bkEndMins;
      if (availableGap < totalRequiredTurnaround) {
        conflicts.push({
          type: 'GEOGRAPHIC_TRAVEL_CONFLICT',
          detail: `Calendar says available, but resource or travel constraints make this opportunity infeasible. Required travel & setup: ${totalRequiredTurnaround} mins (${distKm} km from ${bk.serviceLocation?.locality || 'earlier venue'}), available gap is only ${availableGap} mins.`,
        });
      }
    }
    // Case B: Existing booking is later in the day
    else if (reqEndMins <= bkStartMins) {
      const availableGap = bkStartMins - reqEndMins;
      if (availableGap < totalRequiredTurnaround) {
        conflicts.push({
          type: 'GEOGRAPHIC_TRAVEL_CONFLICT',
          detail: `Calendar says available, but resource or travel constraints make this opportunity infeasible. Required travel & setup: ${totalRequiredTurnaround} mins (${distKm} km to ${bk.serviceLocation?.locality || 'next venue'}), available gap is only ${availableGap} mins.`,
        });
      }
    }

    // 5. Dedicated Resource Allocation Check
    if (requestedResources.length > 0 && bk.assignedResources?.length > 0) {
      const overlap = requestedResources.filter((rId) =>
        bk.assignedResources.some((ar) => String(ar) === String(rId))
      );
      if (overlap.length > 0) {
        conflicts.push({
          type: 'RESOURCE_ALLOCATED_ELSEWHERE',
          detail: `Required specialized team or equipment is already committed to another event on ${date}.`,
        });
      }
    }
  }

  const feasible = conflicts.length === 0;

  return {
    feasible,
    reason: feasible ? null : conflicts[0].detail || conflicts[0].type,
    conflicts,
    capacityRemaining: Math.max(0, simultaneousLimit - existingBookings.length),
  };
}
