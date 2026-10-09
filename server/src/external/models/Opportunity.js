import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.Opportunities — Structured pre-qualified opportunities (Spec §9, §10).
 *
 * "Vendor should not receive an unqualified raw customer message when STARVNT
 * already has enough context to create a structured opportunity."
 */
const opportunitySchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    vendorService: { type: Schema.Types.ObjectId, ref: 'VendorService', required: true },
    serviceName: { type: String, required: true },
    eventDate: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    serviceLocation: {
      address: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: 'Kolkata' },
      coordinates: { lat: Number, lng: Number },
    },
    guestCount: { type: Number, default: 100 },
    requiredCapability: { type: String, default: '' },
    estimatedTravel: { type: String, default: '' },
    travelCost: { type: Number, default: 0 },
    coverageStatus: {
      type: String,
      enum: ['STANDARD_COVERAGE', 'EXTENDED_SERVICE_REQUIRED'],
      default: 'STANDARD_COVERAGE',
      index: true,
    },
    extendedService: {
      label: { type: String, default: '' },
      distanceKm: { type: Number, default: null },
      configuredRadiusKm: { type: Number, default: null },
      fallbackLimitKm: { type: Number, default: null },
      note: { type: String, default: '' },
      requiresVendorConfirmation: { type: Boolean, default: false },
      normalEligibilityRule: { type: String, default: '' },
      fallbackFlow: [{ type: String }],
    },
    status: {
      type: String,
      enum: ['NEW', 'VIEWED', 'RESPONDED', 'DECLINED', 'EXPIRED'],
      default: 'NEW',
      index: true,
    },
    slaResponse: {
      type: String,
      enum: ['CAN_EXECUTE', 'NEED_CLARIFICATION', 'NOT_AVAILABLE', 'PENDING'],
      default: 'PENDING',
      index: true,
    },
    slaResponseTimeMs: { type: Number, default: null },
    slaExpiresAt: { type: Date, default: null },
    action: { type: String, default: 'Respond / Quote' },
  },
  { timestamps: true }
);

export const Opportunity = externalConn.model('Opportunity', opportunitySchema);
