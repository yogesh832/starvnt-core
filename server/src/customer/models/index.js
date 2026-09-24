import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * Customer App collections (Blueprint §3, adapted from PostgreSQL to MongoDB).
 *
 * Core owns the truth: events and their requirements are business state.
 * Aura+ keeps its own memory in aura_context and can never promote an
 * INFERRED value into business state.
 */

export const EVENT_STATUSES = ['draft', 'planning', 'booked', 'in_progress', 'completed', 'cancelled'];
export const CLOSED_EVENT_STATUSES = ['completed', 'cancelled'];

const customerEventSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    eventType: { type: String, default: null },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    // Plain 'YYYY-MM-DD' string, so no timezone shift ever touches it.
    eventDate: { type: String, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
    guestCount: { type: Number, min: 1, default: null },
    budget: { type: Number, min: 0, default: null },
    budgetMin: { type: Number, min: 0, default: null },
    budgetMax: { type: Number, min: 0, default: null },
    status: { type: String, enum: EVENT_STATUSES, default: 'draft', index: true },
  },
  { timestamps: true, collection: 'customer_events' }
);

export const REQUIREMENT_STATUSES = ['missing', 'pending', 'customer_provided', 'confirmed', 'booked', 'completed'];
export const LOCKED_REQUIREMENT_STATUSES = ['confirmed', 'booked', 'completed'];

const eventRequirementSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    category: { type: String, required: true },
    status: { type: String, enum: REQUIREMENT_STATUSES, default: 'missing' },
    source: { type: String, enum: ['customer', 'aura_inferred', 'system'], default: 'system' },
    providedValue: { type: String, trim: true, maxlength: 200, default: null },
    // Merged key by key, never overwritten wholesale.
    preferences: { type: Schema.Types.Mixed, default: {} },
    // The customer's explicit choice: 'vs_<VendorService id>' or 'demo_<ref>'. Status stays 'pending'.
    selectedOptionId: { type: String, default: null },
    // What the customer saw when choosing (display only; quotes re-validate).
    selectedOption: {
      vendorName: { type: String, default: null },
      packageName: { type: String, default: null },
      price: { type: Number, default: null },
      isDemo: { type: Boolean, default: false },
    },
  },
  { timestamps: true, collection: 'customer_event_requirements', minimize: false }
);
eventRequirementSchema.index({ event: 1, category: 1 }, { unique: true });

// Append-only audit trail.
const eventHistorySchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    actorType: { type: String, enum: ['customer', 'aura', 'system', 'ops', 'webhook'], required: true },
    actorId: { type: String, default: null },
    action: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'customer_event_history' }
);

export const CONTEXT_STATES = ['KNOWN', 'CONFIRMED', 'INFERRED', 'MISSING', 'AMBIGUOUS', 'RECOMMENDED'];

// Aura+'s own memory. Never business truth.
const auraContextSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    field: { type: String, required: true },
    value: { type: Schema.Types.Mixed, default: null },
    state: { type: String, enum: CONTEXT_STATES, required: true },
    source: { type: String, default: 'aura' },
  },
  { timestamps: true, collection: 'customer_aura_context' }
);
auraContextSchema.index({ event: 1, field: 1 }, { unique: true });

const auraSessionSchema = new Schema(
  {
    _id: { type: String }, // client-generated session id
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', default: null },
  },
  { timestamps: true, collection: 'customer_aura_sessions' }
);

const auraMessageSchema = new Schema(
  {
    session: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'model'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'customer_aura_messages' }
);

// A quote snapshots the customer's selections: later price changes never alter it.
const quoteItemSchema = new Schema({
  requirement: { type: Schema.Types.ObjectId, ref: 'EventRequirement', required: true },
  category: { type: String, required: true },
  optionId: { type: String, required: true },
  vendorName: { type: String, required: true },
  packageName: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  costBreakdown: {
    base: { type: Number, default: null },
    travel: { type: Number, default: null },
    additional: { type: Number, default: null },
  },
  isDemo: { type: Boolean, default: false },
});

const customerQuoteSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    status: { type: String, enum: ['draft', 'accepted', 'cancelled', 'expired'], default: 'draft', index: true },
    items: { type: [quoteItemSchema], default: [] },
    total: { type: Number, required: true, min: 0 },
    validUntil: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'customer_quotes' }
);

// ── Reserve → pay → book (phases 9–12) ────────────────────────────────────
const reservationSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    quote: { type: Schema.Types.ObjectId, ref: 'CustomerQuote', required: true },
    quoteItem: { type: Schema.Types.ObjectId, required: true, unique: true },
    requirement: { type: Schema.Types.ObjectId, ref: 'EventRequirement', required: true },
    category: { type: String, required: true },
    optionId: { type: String, required: true },
    vendorName: { type: String, required: true },
    packageName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    isDemo: { type: Boolean, default: false },
    // A reservation is a 48 h hold. It is never a booking.
    status: { type: String, enum: ['pending_payment', 'held', 'expired', 'cancelled', 'converted'], default: 'pending_payment', index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'customer_reservations' }
);

const paymentSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    reservation: { type: Schema.Types.ObjectId, ref: 'CustomerReservation', required: true, index: true },
    amount: { type: Number, required: true, min: 0 }, // rupees
    currency: { type: String, default: 'INR' },
    // Only a webhook or an ops verification can make a payment "verified".
    status: { type: String, enum: ['pending', 'processing', 'paid', 'failed', 'verified'], default: 'pending', index: true },
    provider: { type: String, default: 'razorpay' },
    providerOrderId: { type: String, default: undefined },
    providerRef: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'customer_payments' }
);
paymentSchema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: 'string' } } });

const webhookEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    providerEventId: { type: String, required: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'customer_payment_webhook_events' }
);
webhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });

export const EXECUTION_STEPS = ['not_started', 'checked_in', 'started', 'completed'];

const bookingSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    requirement: { type: Schema.Types.ObjectId, ref: 'EventRequirement', required: true },
    category: { type: String, required: true },
    optionId: { type: String, required: true },
    vendorName: { type: String, required: true },
    packageName: { type: String, required: true },
    reservation: { type: Schema.Types.ObjectId, ref: 'CustomerReservation', required: true, unique: true },
    payment: { type: Schema.Types.ObjectId, ref: 'CustomerPayment', required: true },
    amount: { type: Number, required: true, min: 0 },
    isDemo: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending', index: true },
    reviewReason: { type: String, default: null },
    executionStatus: { type: String, enum: EXECUTION_STEPS, default: 'not_started' },
    checkedInAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completionEvidence: {
      note: { type: String, default: null },
      photoUrls: [{ type: String }],
    },
  },
  { timestamps: true, collection: 'customer_bookings' }
);

// One booked event per option per date. Released rows can be claimed again.
const optionAvailabilitySchema = new Schema(
  {
    optionId: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['booked', 'released'], required: true },
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', default: null },
  },
  { timestamps: true, collection: 'customer_option_availability' }
);
optionAvailabilitySchema.index({ optionId: 1, date: 1 }, { unique: true });

// Event Circle
const eventMessageSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    requirement: { type: Schema.Types.ObjectId, ref: 'EventRequirement', default: null },
    booking: { type: Schema.Types.ObjectId, ref: 'CustomerBooking', default: null },
    senderType: { type: String, enum: ['customer', 'vendor', 'team', 'system'], required: true },
    senderCustomer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', default: null },
    senderName: { type: String, default: null },
    body: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'customer_event_messages' }
);

const customerNotificationSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', default: null },
    type: { type: String, required: true }, // payment | booking | message | completion | cancellation
    title: { type: String, required: true },
    body: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'customer_notifications' }
);

// Development-only demo packages. Kept apart from Vendor OS collections so
// they never appear in vendor or admin views; never read in production.
const demoListingSchema = new Schema(
  {
    externalRef: { type: String, required: true, unique: true },
    vendorName: { type: String, required: true },
    category: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    description: { type: String, default: 'Demo listing for development – not a real vendor' },
    price: { type: Number, required: true, min: 0 }, // validated total = base + travel + additional
    costBreakdown: {
      base: { type: Number, default: 0 },
      travel: { type: Number, default: 0 },
      additional: { type: Number, default: 0 },
    },
    includes: [{ type: String }],
    isDemo: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'customer_demo_listings' }
);

export const CustomerEvent = externalConn.model('CustomerEvent', customerEventSchema);
export const EventRequirement = externalConn.model('EventRequirement', eventRequirementSchema);
export const EventHistory = externalConn.model('EventHistory', eventHistorySchema);
export const AuraContext = externalConn.model('AuraContext', auraContextSchema);
export const AuraSession = externalConn.model('AuraSession', auraSessionSchema);
export const AuraMessage = externalConn.model('AuraMessage', auraMessageSchema);
export const DemoListing = externalConn.model('CustomerDemoListing', demoListingSchema);
export const CustomerQuote = externalConn.model('CustomerQuote', customerQuoteSchema);
export const Reservation = externalConn.model('CustomerReservation', reservationSchema);
export const Payment = externalConn.model('CustomerPayment', paymentSchema);
export const PaymentWebhookEvent = externalConn.model('CustomerPaymentWebhookEvent', webhookEventSchema);
export const Booking = externalConn.model('CustomerBooking', bookingSchema);
export const OptionAvailability = externalConn.model('CustomerOptionAvailability', optionAvailabilitySchema);
export const EventMessage = externalConn.model('CustomerEventMessage', eventMessageSchema);
export const CustomerNotification = externalConn.model('CustomerNotification', customerNotificationSchema);
