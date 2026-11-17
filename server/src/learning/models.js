import { Schema } from 'mongoose';
import { adminConn, externalConn } from '../db/index.js';
import { readinessMetricKeys } from '../common/readinessMetrics.js';

export const learningCategories = [
  'Getting Started', 'Profile & Branding', 'Enquiry Management', 'Quotation & Sales',
  'Booking & Event Management', 'Marketing & Business Growth', 'Financial & Professional Management', 'Aura+ Assistance',
];

const history = new Schema({
  actor: String, action: String, at: Date, reason: String, revision: Number, requestHash: String,
  rightsReference: String, rightsExpiresAt: Date, publishAt: Date, contentVersion: Number, contentHash: String, videoId: String,
}, { _id: false });

const lesson = new Schema({
  title: { type: String, required: true, maxlength: 160 },
  category: { type: String, enum: learningCategories, required: true },
  objective: { type: String, required: true, maxlength: 400 },
  description: { type: String, default: '', maxlength: 1000 },
  difficulty: { type: String, default: '', maxlength: 80 },
  featured: { type: Boolean, default: false },
  needsTags: [{ type: String, enum: readinessMetricKeys }],
  content: { type: String, required: true, maxlength: 20000 },
  videoId: { type: String, default: '' },
  captions: { type: String, default: '' },
  durationSeconds: { type: Number, default: 0 },
  resources: { type: String, default: '' },
  rightsReference: { type: String, default: '' },
  rightsExpiresAt: Date,
  publishAt: Date,
  state: { type: String, enum: ['DRAFT', 'REVIEW', 'PUBLISHED', 'UNPUBLISHED'] },
  lastEditedBy: String,
  revision: { type: Number, default: 1 },
  contentVersion: { type: Number, default: 1 },
  contentVersions: { type: [new Schema({
    version: Number, hash: String, hashVersion: { type: Number, enum: [1, 2] }, actor: String, capturedAt: Date,
    provenance: { type: String, enum: ['CAPTURED_ON_SAVE', 'RECOVERED_CURRENT_ON_EDIT'] },
    content: { title: String, category: String, objective: String, content: String, resources: String, videoId: String, captions: String, durationSeconds: Number, description: String, difficulty: String, featured: Boolean, needsTags: { type: [String], default: undefined } },
  }, { _id: false })], select: false, default: undefined },
  createdBy: { type: String, required: true },
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  history: [history],
}, { timestamps: true });
lesson.index({ createdBy: 1, requestKey: 1 }, { unique: true });
lesson.index({ publishAt: -1, _id: -1 });

const progress = new Schema({
  vendor: { type: Schema.Types.ObjectId, required: true },
  lesson: { type: Schema.Types.ObjectId, required: true },
  contentVersion: { type: Number, required: true },
  positionSeconds: { type: Number, default: 0 },
  completedAt: Date,
}, { timestamps: true });
progress.index({ vendor: 1, lesson: 1, contentVersion: 1 }, { unique: true });

export const LearningLesson = adminConn.model('LearningLesson', lesson);
export const LearningProgress = externalConn.model('LearningProgress', progress);

const feedback = new Schema({
  vendor: { type: Schema.Types.ObjectId, required: true },
  lesson: { type: Schema.Types.ObjectId, required: true },
  contentVersion: { type: Number, required: true },
  actor: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, maxlength: 1500, default: '' },
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
feedback.index({ vendor: 1, lesson: 1, contentVersion: 1, requestKey: 1 }, { unique: true });
export const LearningFeedback = externalConn.model('LearningFeedback', feedback);
