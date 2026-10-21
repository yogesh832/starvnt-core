import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });
import { connectDB, disconnectDB } from '../db/index.js';
import {
  CustomerEvent,
  EventRequirement,
  EventHistory,
  AuraContext,
  AuraSession,
  AuraMessage,
  CustomerQuote,
  Reservation,
  Payment,
  PaymentWebhookEvent,
  Booking,
  OptionAvailability,
  EventMessage,
  CustomerNotification,
} from '../customer/models/index.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { BusinessAuditLog } from '../admin/models/BusinessAuditLog.js';
import { IdempotencyKey } from '../admin/models/IdempotencyKey.js';
import { OutboxEvent } from '../admin/models/OutboxEvent.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { Quote } from '../external/models/Quote.js';
import { CustomerChatThread } from '../external/models/CustomerChatThread.js';
import { VendorMessageThread } from '../external/models/VendorMessageThread.js';
import { Notification } from '../external/models/Notification.js';
import { VendorActivity } from '../external/models/VendorActivity.js';
import { VendorBlockout } from '../external/models/VendorBlockout.js';
import { VendorBookingSlot } from '../external/models/VendorBookingSlot.js';

async function resetAllData() {
  console.log('Connecting to database...');
  await connectDB();

  console.log('Clearing all events, requirements, inquiries, quotes, reservations, payments & bookings...');

  const results = await Promise.allSettled([
    CustomerEvent.deleteMany({}),
    EventRequirement.deleteMany({}),
    EventHistory.deleteMany({}),
    AuraContext.deleteMany({}),
    AuraSession.deleteMany({}),
    AuraMessage.deleteMany({}),
    CustomerQuote.deleteMany({}),
    Reservation.deleteMany({}),
    Payment.deleteMany({}),
    PaymentWebhookEvent.deleteMany({}),
    Booking.deleteMany({}),
    OptionAvailability.deleteMany({}),
    EventMessage.deleteMany({}),
    CustomerNotification.deleteMany({}),
    CoreBooking.deleteMany({}),
    BusinessAuditLog.deleteMany({}),
    Opportunity.deleteMany({}),
    Quote.deleteMany({}),
    CustomerChatThread.deleteMany({}),
    VendorMessageThread.deleteMany({}),
    Notification.deleteMany({}),
    VendorActivity.deleteMany({}),
    VendorBlockout.deleteMany({}),
    VendorBookingSlot.deleteMany({}),
    IdempotencyKey.deleteMany({}),
    OutboxEvent.deleteMany({}),
  ]);

  console.log('Reset complete!');
  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      console.error(`Task ${idx} failed:`, r.reason);
    }
  });

  await disconnectDB();
  console.log('Database disconnected.');
}

resetAllData().catch((err) => {
  console.error('Reset error:', err);
  process.exit(1);
});
