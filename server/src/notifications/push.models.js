import mongoose from "mongoose";
import { adminConn } from "../db/index.js";
const { Schema } = mongoose;
const subscription = new Schema(
  {
    installationId: { type: String, required: true },
    domain: { type: String, enum: ["external", "admin"], required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    sessionId: { type: Schema.Types.ObjectId, required: true },
    audienceId: { type: Schema.Types.ObjectId, required: true },
    surface: {
      type: String,
      enum: ["CUSTOMER", "VENDOR", "ADMIN"],
      required: true,
    },
    token: { type: String, required: true, select: false },
    projectId: String,
    platform: String,
    bindingId: { type: String, required: true },
    enabled: { type: Boolean, default: true, index: true },
    boundAt: { type: Date, required: true },
    lastSeenAt: Date,
    disabledReason: String,
    cursor: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);
subscription.index({ domain: 1, installationId: 1 }, { unique: true });
subscription.index({ domain: 1, token: 1 }, { unique: true });
const job = new Schema(
  {
    subscription: { type: Schema.Types.ObjectId, required: true },
    bindingId: { type: String, required: true },
    sourceId: { type: String, required: true },
    title: String,
    body: String,
    actionUrl: String,
    eventId: String,
    threadId: String,
    permissions: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["QUEUED", "SENDING", "RECEIPT", "SENT", "FAILED", "CANCELLED"],
      default: "QUEUED",
    },
    attempts: { type: Number, default: 0 },
    receiptAttempts: { type: Number, default: 0 },
    ticketId: String,
    tokenHash: String,
    nextAttemptAt: { type: Date, default: Date.now },
    lockedUntil: Date,
    lease: String,
    lastError: String,
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);
job.index({ subscription: 1, bindingId: 1, sourceId: 1 }, { unique: true });
job.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });
export const PushSubscription = adminConn.model(
  "PushSubscription",
  subscription,
);
export const PushJob = adminConn.model("PushJob", job);
