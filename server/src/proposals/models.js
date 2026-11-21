import mongoose from 'mongoose';
import { externalConn, adminConn } from '../db/index.js';

const { Schema } = mongoose;

/**
 * Proposal Studio collections.
 *
 * Customer-visible records live on externalConn next to the event they belong
 * to. Internal commercial data (vendor cost, margin) lives on adminConn and is
 * never serialized to a customer or vendor surface.
 *
 * Frozen/approved records are never edited in place: a change creates a new
 * version and the old one is marked SUPERSEDED.
 */

export const MANIFEST_STATUSES = ['DRAFT', 'FROZEN', 'SUPERSEDED'];
export const AGREEMENT_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'EXPIRED', 'SUPERSEDED'];
export const COMMERCIAL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED'];
export const PROPOSAL_VERSION_STATUSES = [
  'PRELIMINARY_PREVIEW',
  'APPROVED_FOR_GENERATION',
  'GENERATING',
  'QUALITY_REVIEW',
  'GENERATED',
  'SENT_TO_CUSTOMER',
  'CUSTOMER_VIEWED',
  'CHANGE_REQUESTED',
  'CUSTOMER_APPROVED',
  'CUSTOMER_DECLINED',
  'SUPERSEDED',
  'EXPIRED',
  'FAILED',
];
export const ASSET_SOURCE_TYPES = ['APPROVED_PORTFOLIO', 'VENDOR_REFERENCE', 'CUSTOMER_REFERENCE', 'AI_CONCEPT', 'ILLUSTRATIVE', 'STARVNT_PHOTO'];

const historyEntry = new Schema(
  { from: String, to: String, by: String, at: { type: Date, default: Date.now }, reason: String },
  { _id: false }
);

const eventManifestSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    version: { type: Number, required: true },
    eventInfo: {
      type: { type: String, default: null },
      title: { type: String, default: '' },
      date: { type: String, default: null },
      city: { type: String, default: null },
      venueName: { type: String, default: null },
      address: { type: String, default: null },
      guestCount: { type: Number, default: null },
      budgetMin: { type: Number, default: null },
      budgetMax: { type: Number, default: null },
      theme: { type: String, default: null },
      colourPalette: { type: [String], default: [] },
      specialRequirements: { type: String, default: null },
    },
    requirements: [
      {
        _id: false,
        category: { type: String, required: true },
        label: String,
        tier: String,
        // included: STARVNT delivers it · pending: still to confirm · customer_provided: customer arranges it
        status: { type: String, enum: ['included', 'pending', 'customer_provided'], required: true },
        mandatory: { type: Boolean, default: false },
        details: { type: Schema.Types.Mixed, default: {} },
        pendingItems: { type: [String], default: [] },
        specialRequirements: { type: String, default: null },
      },
    ],
    validation: {
      status: { type: String, enum: ['VALID', 'INVALID'], required: true },
      errors: [{ _id: false, code: String, field: String, message: String }],
      warnings: [{ _id: false, code: String, field: String, message: String }],
      validatedAt: Date,
    },
    status: { type: String, enum: MANIFEST_STATUSES, default: 'DRAFT', index: true },
    contentHash: { type: String, required: true },
    frozenAt: Date,
    frozenBy: String,
    supersededBy: { type: Schema.Types.ObjectId, default: null },
    createdBy: String,
  },
  { timestamps: true, collection: 'proposal_event_manifests', minimize: false }
);
eventManifestSchema.index({ event: 1, version: 1 }, { unique: true });

const vendorAgreementSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true },
    manifest: { type: Schema.Types.ObjectId, ref: 'EventManifest', required: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    quote: { type: Schema.Types.ObjectId, ref: 'Quote', required: true },
    category: { type: String, required: true },
    mandatory: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    supersedes: { type: Schema.Types.ObjectId, default: null },
    supersededBy: { type: Schema.Types.ObjectId, default: null },
    scope: {
      summary: { type: String, default: '' },
      lineItems: [{ _id: false, name: String, quantity: { type: Number, default: 1 }, unit: String, unitPrice: { type: Number, default: 0 }, notes: String }],
      deliverables: { type: [String], default: [] },
      exclusions: { type: [String], default: [] },
      setupRequirements: { type: String, default: '' },
    },
    // Vendor price: INTERNAL. Never part of a customer projection.
    pricing: {
      subtotal: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },
    terms: {
      paymentTerms: { type: String, default: '' },
      cancellation: { type: String, default: '' },
      validUntil: { type: Date, default: null },
    },
    status: { type: String, enum: AGREEMENT_STATUSES, default: 'DRAFT', index: true },
    sentAt: Date,
    vendorDecision: { by: String, at: Date, note: String },
    history: [historyEntry],
    createdBy: String,
  },
  { timestamps: true, collection: 'proposal_vendor_agreements' }
);
vendorAgreementSchema.index({ event: 1, category: 1, version: 1 });

const proposalSchema = new Schema(
  {
    proposalNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true, unique: true },
    versionCounter: { type: Number, default: 0 },
    publishedVersion: { type: Number, default: null },
    latestApprovedVersion: { type: Number, default: null },
  },
  { timestamps: true, collection: 'proposals' }
);

const proposalVersionSchema = new Schema(
  {
    proposal: { type: Schema.Types.ObjectId, ref: 'Proposal', required: true, index: true },
    event: { type: Schema.Types.ObjectId, ref: 'CustomerEvent', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    version: { type: Number, required: true },
    kind: { type: String, enum: ['PRELIMINARY', 'FINAL'], required: true },
    // Customer-safe projection only. Immutable once created.
    snapshot: { type: Schema.Types.Mixed, required: true },
    snapshotHash: { type: String, required: true },
    manifest: { type: Schema.Types.ObjectId, default: null },
    manifestVersion: { type: Number, default: null },
    agreementRefs: [{ _id: false, agreement: Schema.Types.ObjectId, version: Number, category: String }],
    commercialApproval: { type: Schema.Types.ObjectId, default: null },
    theme: { type: String, default: 'royal-luxury' },
    status: { type: String, enum: PROPOSAL_VERSION_STATUSES, required: true, index: true },
    pdf: { storageKey: String, url: String, bytes: Number, pages: Number, sha256: String, renderedAt: Date },
    qa: { passed: { type: Boolean, default: null }, checks: [{ _id: false, key: String, passed: Boolean, critical: Boolean, detail: String }], checkedAt: Date },
    generation: { idempotencyKey: String, attempts: { type: Number, default: 0 }, lastError: String },
    customerDecision: { decision: String, by: Schema.Types.ObjectId, at: Date, ip: String, userAgent: String, reason: String },
    viewedAt: Date,
    publishedAt: Date,
    publishedBy: String,
    supersededBy: { type: Number, default: null },
    history: [historyEntry],
    createdBy: String,
  },
  { timestamps: true, collection: 'proposal_versions', minimize: false }
);
proposalVersionSchema.index({ proposal: 1, version: 1 }, { unique: true });
proposalVersionSchema.pre('save', function guardSnapshot(next) {
  if (!this.isNew && (this.isModified('snapshot') || this.isModified('snapshotHash') || this.isModified('kind'))) {
    const err = new Error('A proposal version snapshot is immutable. Create a new version instead.');
    err.code = 'PROPOSAL_VERSION_IMMUTABLE';
    err.statusCode = 409;
    return next(err);
  }
  next();
});

const proposalChangeRequestSchema = new Schema(
  {
    proposal: { type: Schema.Types.ObjectId, ref: 'Proposal', required: true, index: true },
    version: { type: Number, required: true },
    event: { type: Schema.Types.ObjectId, required: true },
    customer: { type: Schema.Types.ObjectId, required: true, index: true },
    raisedBy: { type: { type: String, enum: ['customer', 'admin', 'aura'], required: true }, id: String },
    items: [{ _id: false, category: String, type: { type: String, enum: ['add', 'remove', 'modify'], default: 'modify' }, request: String }],
    message: { type: String, default: '' },
    status: { type: String, enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'], default: 'OPEN', index: true },
    resolutionVersion: { type: Number, default: null },
    resolutionNote: String,
    history: [historyEntry],
  },
  { timestamps: true, collection: 'proposal_change_requests' }
);

const visualAssetSchema = new Schema(
  {
    url: { type: String, default: '' }, // remote URL when not stored privately
    storageKey: String,
    width: Number,
    height: Number,
    mime: String,
    sourceType: { type: String, enum: ASSET_SOURCE_TYPES, required: true },
    label: { type: String, required: true },
    caption: { type: String, default: '' },
    uploadedBy: { type: { type: String }, id: String },
    decisionReason: String,
    license: { type: { type: String, default: '' }, holder: String, evidence: String },
    links: { vendor: Schema.Types.ObjectId, event: Schema.Types.ObjectId, portfolioItem: Schema.Types.ObjectId, customer: Schema.Types.ObjectId },
    tags: { eventType: String, category: String, theme: String, palette: [String] },
    ai: { provider: String, model: String, prompt: String },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
    approvedBy: String,
    approvedAt: Date,
  },
  { timestamps: true, collection: 'proposal_visual_assets' }
);

const commercialApprovalSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    manifest: { type: Schema.Types.ObjectId, required: true },
    manifestVersion: { type: Number, required: true },
    manifestHash: { type: String, required: true },
    agreementRefs: [{ _id: false, agreement: Schema.Types.ObjectId, version: Number, category: String, total: Number }],
    // INTERNAL ONLY.
    costs: {
      vendorTotal: { type: Number, default: 0 },
      directCosts: { type: Number, default: 0 },
      logistics: { type: Number, default: 0 },
      operational: { type: Number, default: 0 },
      contingency: { type: Number, default: 0 },
      margin: { type: Number, default: 0 },
    },
    // The only part that may be projected to the customer.
    customerFacing: {
      currency: { type: String, default: 'INR' },
      packageTotal: { type: Number, required: true },
      taxes: { included: { type: Boolean, default: true }, amount: { type: Number, default: 0 }, note: String },
      allocations: [{ _id: false, category: String, label: String, scopeSummary: String, quantity: String, amount: Number, deliverables: [String], exclusions: [String] }],
      unallocated: { amount: { type: Number, default: 0 }, explanation: { type: String, default: '' } },
      paymentSchedule: [{ _id: false, label: String, percent: Number, amount: Number, dueRule: String }],
      exclusions: { type: [String], default: [] },
      notes: { type: [String], default: [] },
      terms: {
        cancellation: String,
        postponement: String,
        scopeChange: String,
        customerResponsibilities: [String],
      },
    },
    status: { type: String, enum: COMMERCIAL_STATUSES, default: 'DRAFT', index: true },
    contentHash: String,
    submittedHash: String,
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdByEmail: String,
    submittedAt: Date,
    approvedBy: Schema.Types.ObjectId,
    approvedByEmail: String,
    approvedAt: Date,
    rejectedBy: Schema.Types.ObjectId,
    decisionReason: String,
    supersededBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, collection: 'proposal_commercial_approvals', minimize: false }
);

const proposalAccessLogSchema = new Schema(
  {
    proposal: { type: Schema.Types.ObjectId, required: true, index: true },
    version: Number,
    actorType: { type: String, enum: ['customer', 'admin', 'vendor', 'system'], required: true },
    actorId: String,
    action: { type: String, enum: ['VIEW', 'DOWNLOAD', 'SHARE', 'DENIED'], required: true },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'proposal_access_logs' }
);

export const EventManifest = externalConn.model('EventManifest', eventManifestSchema);
export const VendorAgreement = externalConn.model('VendorAgreement', vendorAgreementSchema);
export const Proposal = externalConn.model('Proposal', proposalSchema);
export const ProposalVersion = externalConn.model('ProposalVersion', proposalVersionSchema);
export const ProposalChangeRequest = externalConn.model('ProposalChangeRequest', proposalChangeRequestSchema);
export const VisualAsset = externalConn.model('VisualAsset', visualAssetSchema);
export const CommercialApproval = adminConn.model('CommercialApproval', commercialApprovalSchema);
export const ProposalAccessLog = adminConn.model('ProposalAccessLog', proposalAccessLogSchema);
