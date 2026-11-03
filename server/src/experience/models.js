import mongoose from 'mongoose';
import { externalConn } from '../db/index.js';
const { Schema } = mongoose;
const history = new Schema({ actor: String, action: String, at: { type: Date, default: Date.now }, reason: String, key: String, hash: String }, { _id: false });
const experience = new Schema({
  bookingKey: { type: String, required: true, unique: true }, booking: { type: Schema.Types.ObjectId, required: true },
  source: { type: String, enum: ['STARVNT', 'VENDOR_PRIVATE'], required: true, immutable: true },
  vendor: { type: Schema.Types.ObjectId, required: true, index: true }, event: Schema.Types.ObjectId,
  tokenHash: { type: String, unique: true }, sealedToken: String, recipientDigest: String,
  expiresAt: Date, revokedAt: Date, history: [history], revision: { type: Number, default: 0 },
}, { timestamps: true });
export const Experience = externalConn.model('Experience', experience);
const access = new Schema({ experience: { type: Schema.Types.ObjectId, required: true, index: true }, proofHash: { type: String, unique: true }, phoneDigest: String, expiresAt: Date, tokenHash: String }, { timestamps: true });
access.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const FeedbackAccess = externalConn.model('FeedbackAccess', access);
const support = new Schema({ experience: { type: Schema.Types.ObjectId, required: true }, message: { type: String, maxlength: 2000 }, status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' }, history: [history], requestKey: String }, { timestamps: true });
support.index({ experience: 1, requestKey: 1 }, { unique: true });
export const ExperienceSupport = externalConn.model('ExperienceSupport', support);
const deliveryRequest = new Schema({ experience: { type: Schema.Types.ObjectId, unique: true }, address: { type: String, maxlength: 500 }, consentVersion: String, consentAt: Date, status: { type: String, enum: ['REQUESTED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'], default: 'REQUESTED' }, carrier: String, tracking: String, history: [history] }, { timestamps: true });
export const ExperienceDelivery = externalConn.model('ExperienceDelivery', deliveryRequest);
const interest = new Schema({ customer: { type: Schema.Types.ObjectId, required: true, unique: true }, interests: [{ eventType: String, city: String, month: String }], preferredChannel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'NONE'], default: 'NONE' }, revision: { type: Number, default: 0 }, history: [history] }, { timestamps: true });
export const CustomerInterests = externalConn.model('CustomerInterests', interest);
const referral = new Schema({ owner: { type: Schema.Types.ObjectId, unique: true }, code: { type: String, unique: true } }, { timestamps: true });
export const ReferralCode = externalConn.model('ReferralCode', referral);
const attribution = new Schema({ customer: { type: Schema.Types.ObjectId, unique: true }, referrer: { type: Schema.Types.ObjectId, required: true }, code: String, history: [history] }, { timestamps: true });
export const ReferralAttribution = externalConn.model('ReferralAttribution', attribution);
const rule = new Schema({ version: { type: String, unique: true }, pointsPerCompletion: { type: Number, min: 0, max: 10000 }, active: { type: Boolean, default: false }, history: [history] }, { timestamps: true });
export const LoyaltyRule = externalConn.model('LoyaltyRule', rule);
const award = new Schema({ booking: { type: Schema.Types.ObjectId, unique: true }, customer: { type: Schema.Types.ObjectId, index: true }, ruleVersion: String, points: Number, status: { type: String, enum: ['EARNED', 'REVERSED'] }, history: [history] }, { timestamps: true });
export const LoyaltyAward = externalConn.model('LoyaltyAward', award);
const campaign = new Schema({ vendor: { type: Schema.Types.ObjectId, required: true, index: true }, title: String, body: String, state: { type: String, enum: ['DRAFT', 'PUBLISHED', 'STOPPED'], default: 'DRAFT' }, revision: { type: Number, default: 0 }, requestKey: String, requestHash: String, history: [history] }, { timestamps: true });
campaign.index({ vendor: 1, requestKey: 1 }, { unique: true });
export const GrowthCampaign = externalConn.model('GrowthCampaign', campaign);
const delivery = new Schema({ campaign: Schema.Types.ObjectId, customer: Schema.Types.ObjectId, state: { type: String, enum: ['RESERVED', 'DELIVERED', 'SKIPPED'], default: 'RESERVED' }, reason: String, helpful: { type: Boolean, default: null } }, { timestamps: true });
delivery.index({ campaign: 1, customer: 1 }, { unique: true });
export const CampaignDelivery = externalConn.model('CampaignDelivery', delivery);
const frequency = new Schema({ customer: { type: Schema.Types.ObjectId, unique: true }, lastSentAt: Date, campaign: Schema.Types.ObjectId }, { timestamps: true });
export const CampaignFrequency = externalConn.model('CampaignFrequency', frequency);
