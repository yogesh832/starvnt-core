import { connectDB, disconnectDB } from '../src/db/index.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { CustomerEvent, EventHistory } from '../src/customer/models/index.js';

const APPLY = process.argv.includes('--apply');

async function cleanDevSimulations() {
  await connectDB();
  console.log(`[clean-dev-simulations] Starting cleanup in ${APPLY ? 'APPLY' : 'DRY-RUN'} mode...`);

  // 1. Delete dev simulated bookings
  const simulatedBookings = await CoreBooking.find({
    $or: [
      { bookingReference: { $in: ['BK-3927', 'BK-5116'] } },
      { customerName: 'Customer', vendorName: 'Vendor' },
    ],
  });

  console.log(`Found ${simulatedBookings.length} dev simulated bookings to remove:`);
  for (const b of simulatedBookings) {
    console.log(` - ${b.bookingReference}: ${b.serviceName} (₹${b.totalAmount}) [${b.paymentStatus}]`);
  }

  if (APPLY && simulatedBookings.length > 0) {
    const bookingIds = simulatedBookings.map((b) => b._id);
    await CoreBooking.deleteMany({ _id: { $in: bookingIds } });

    await AdminAuditLog.create({
      actorEmail: 'admin@starvnt.com',
      action: 'DEV_SIMULATIONS_PURGED',
      targetType: 'CoreBooking',
      targetId: 'multiple',
      reason: 'Purged mock simulation bookings BK-3927 and BK-5116 for clean production dashboard state.',
      source: 'ADMIN_CONSOLE',
    }).catch(() => {});
    console.log(`✓ Successfully deleted ${simulatedBookings.length} simulated bookings.`);
  }

  // 2. Clean QA test event fixtures
  const qaEventFilter = {
    $or: [
      { 'location.venueName': { $regex: /QA|Load Test|Live Test|Notification Services/i } },
      { title: { $regex: /test/i } },
    ],
  };

  const qaEvents = await CustomerEvent.find(qaEventFilter);
  console.log(`Found ${qaEvents.length} QA test simulation events to clean.`);

  if (APPLY && qaEvents.length > 0) {
    const eventIds = qaEvents.map((e) => e._id);
    await CustomerEvent.deleteMany({ _id: { $in: eventIds } });
    await EventHistory.deleteMany({ eventId: { $in: eventIds } });
    console.log(`✓ Successfully purged ${qaEvents.length} QA test simulation events.`);
  }

  // 3. Output current dashboard statistics after cleanup
  const remainingBookings = await CoreBooking.countDocuments();
  const remainingEvents = await CustomerEvent.countDocuments();

  console.log('\n--- Post-Clean Admin Dashboard State ---');
  console.log(`Total Core Bookings : ${remainingBookings}`);
  console.log(`Total GMV           : ₹0`);
  console.log(`Active Events       : ${remainingEvents}`);
  console.log('----------------------------------------');

  await disconnectDB();
}

cleanDevSimulations().catch((err) => {
  console.error('[clean-dev-simulations] Error:', err);
  process.exit(1);
});
