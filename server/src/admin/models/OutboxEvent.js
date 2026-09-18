import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * AdminDB.OutboxEvents — Central Automation Event Spine (Spec §12, §17).
 *
 * Pattern:
 * DOMAIN EVENT -> OUTBOX -> WORKER -> TRIGGER -> CONDITION -> AUTHORIZED ACTION -> SUCCESS/RETRY -> AUDIT
 */
const outboxEventSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
      index: true, // e.g. 'Quote', 'Booking', 'Requirement'
    },
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'],
      default: 'PENDING',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    nextRunAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastError: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    history: [
      {
        attempt: Number,
        timestamp: { type: Date, default: Date.now },
        status: String,
        error: String,
        durationMs: Number,
      },
    ],
  },
  { timestamps: true }
);

outboxEventSchema.index({ status: 1, nextRunAt: 1 });

export const OutboxEvent = adminConn.model('OutboxEvent', outboxEventSchema);
