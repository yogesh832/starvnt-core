import { Schema } from 'mongoose';
import { adminConn, externalConn } from '../db/index.js';

const change = new Schema({
  actor: String, action: String, reason: String, at: Date, revision: Number,
  startsAt: Date, endsAt: Date, timezone: String, scheduleVersion: Number,
}, { _id: false });
const meeting = new Schema({
  title: { type: String, required: true },
  agenda: { type: String, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timezone: { type: String, required: true },
  meetUrl: { type: String, required: true },
  audience: { type: String, enum: ['ACTIVE', 'INVITED'], required: true },
  invitees: [Schema.Types.ObjectId],
  status: { type: String, enum: ['SCHEDULED', 'CANCELLED'], default: 'SCHEDULED' },
  cancellationReason: String,
  summary: String,
  resources: String,
  revision: { type: Number, default: 1 },
  scheduleVersion: { type: Number, default: 1 },
  createdBy: { type: String, required: true },
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  history: [change],
}, { timestamps: true });
meeting.index({ createdBy: 1, requestKey: 1 }, { unique: true });
meeting.index({ startsAt: -1 });

const participation = new Schema({
  vendor: { type: Schema.Types.ObjectId, required: true },
  meeting: { type: Schema.Types.ObjectId, required: true },
  scheduleVersion: { type: Number, required: true },
  rsvp: { type: String, enum: ['GOING', 'NOT_GOING'] },
  attended: Boolean,
  attendanceActor: String,
  attendanceAt: Date,
  feedback: String,
}, { timestamps: true });
participation.index({ meeting: 1, scheduleVersion: 1, vendor: 1 }, { unique: true });
participation.index({ vendor: 1, meeting: 1, scheduleVersion: 1 });

export const GrowthMeeting = adminConn.model('GrowthMeeting', meeting);
export const MeetingParticipation = externalConn.model('MeetingParticipation', participation);
