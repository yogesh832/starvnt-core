import { createHash } from 'node:crypto';
import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { requireAdminAuth, requireAnyPermission, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { GrowthMeeting, MeetingParticipation } from './meetingModels.js';

export const adminMeetingRoutes = Router();
export const vendorMeetingRoutes = Router();
const h = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const text = (value, max, required = true) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw fail('INVALID_MEETING', 'Review the required fields and their length limits.');
  }
  return value.trim();
};
const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
const activeVendor = {
  status: 'ACTIVE',
  'activationReview.status': 'APPROVED',
  isRestricted: { $ne: true },
};
const denied = () => fail('MEETING_UNAVAILABLE', 'This meeting is unavailable.', 404);
const changed = () => fail('MEETING_CHANGED', 'The meeting changed. Reload and review the current schedule.', 409);

function vendorText(value, max, required = true) {
  const result = text(value, max, required);
  if (/meet\.google\.com/i.test(result)) {
    throw fail('MEET_LINK_IN_PUBLIC_TEXT', 'Keep Google Meet links in the restricted join field.');
  }
  return result;
}

function getId(id) {
  if (!isObjectIdOrHexString(id)) throw denied();
  return id;
}

function dateTime(value) {
  const parts = typeof value === 'string' && /^(\d{4}-\d\d-\d\d)T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts) {
    throw fail('INVALID_MEETING_DATE', 'Supply a date and time with a timezone offset.');
  }
  const result = new Date(value);
  const calendar = new Date(`${parts[1]}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== parts[1]) {
    throw fail('INVALID_MEETING_DATE', 'Supply a valid date and time.');
  }
  return result;
}

async function scheduleFields(body) {
  const startsAt = dateTime(body.startsAt);
  const endsAt = dateTime(body.endsAt);
  if (startsAt <= Date.now() || endsAt <= startsAt || endsAt - startsAt > 4 * 60 * 60 * 1000) {
    throw fail('INVALID_MEETING_WINDOW', 'Choose a future start and an end within four hours.');
  }
  const timezone = text(body.timezone, 64);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { throw fail('INVALID_TIMEZONE', 'Choose a valid IANA timezone.'); }
  const meetUrl = text(body.meetUrl, 100);
  if (!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(meetUrl)) {
    throw fail('INVALID_MEET_LINK', 'Use a direct Google Meet link.');
  }
  const audience = body.audience;
  if (!['ACTIVE', 'INVITED'].includes(audience)) throw fail('INVALID_AUDIENCE', 'Choose a meeting audience.');
  const invitees = body.invitees ?? [];
  if (!Array.isArray(invitees) || invitees.length > 100 || invitees.some(id => typeof id !== 'string' || !isObjectIdOrHexString(id))) {
    throw fail('INVALID_INVITEES', 'Supply up to 100 vendor organization IDs.');
  }
  const unique = [...new Set(invitees.map(id => id.toLowerCase()))].sort();
  if ((audience === 'INVITED' && !unique.length) || (audience === 'ACTIVE' && unique.length)) {
    throw fail('INVALID_INVITEES', 'An invite-only meeting needs an invite list.');
  }
  if (unique.length && await VendorOrganization.countDocuments({ _id: { $in: unique }, ...activeVendor }) !== unique.length) {
    throw fail('INVALID_INVITEES', 'Every invitee must be an approved active vendor.');
  }
  return { title: vendorText(body.title, 160), agenda: vendorText(body.agenda, 4000), startsAt, endsAt, timezone, meetUrl, audience, invitees: unique };
}

function view(row) {
  return {
    id: String(row._id), title: row.title, agenda: row.agenda, startsAt: row.startsAt, endsAt: row.endsAt,
    timezone: row.timezone, status: row.status, revision: row.revision, scheduleVersion: row.scheduleVersion,
    cancellationReason: row.cancellationReason,
    summary: row.summary, resources: row.resources,
  };
}

function staffView(row, canSchedule) {
  return {
    ...view(row), audience: row.audience, invitees: row.invitees, history: row.history,
    ...(canSchedule ? { meetUrl: row.meetUrl } : {}),
  };
}

function vendorAudience(req) {
  if (req.vendor.status !== 'ACTIVE' || req.vendor.activationReview?.status !== 'APPROVED' ||
      req.vendor.isRestricted || req.externalUser.isRestricted) {
    throw fail('MEETING_ACCESS_RESTRICTED', 'Meetings are available to approved active vendors.', 403);
  }
  return { $or: [{ audience: 'ACTIVE' }, { audience: 'INVITED', invitees: req.vendorId }] };
}

async function visibleMeeting(req) {
  const row = await GrowthMeeting.findOne({ _id: getId(req.params.id), ...vendorAudience(req) }).select('-history').lean();
  if (!row) throw denied();
  return row;
}

function participationKey(row, vendor) {
  return { meeting: row._id, scheduleVersion: row.scheduleVersion, vendor };
}

async function saveParticipation(filter, fields) {
  try {
    return await MeetingParticipation.findOneAndUpdate(filter, { $set: fields }, { new: true, upsert: true }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return MeetingParticipation.findOneAndUpdate(filter, { $set: fields }, { new: true }).lean();
  }
}

adminMeetingRoutes.use(requireAdminAuth, noStore);
const schedulePermission = requirePermission('growthMeetings.schedule');
const runPermission = requirePermission('growthMeetings.run');
const viewPermission = requireAnyPermission('growthMeetings.read', 'growthMeetings.schedule', 'growthMeetings.run');

adminMeetingRoutes.get('/', viewPermission, h(async (req, res) => {
  const canSchedule = req.admin.role === 'SUPER_ADMIN' || req.admin.permissions.includes('growthMeetings.schedule');
  const meetings = await GrowthMeeting.find().sort({ startsAt: -1 }).limit(101).lean();
  res.json({ meetings: meetings.slice(0, 100).map(row => staffView(row, canSchedule)), truncated: meetings.length > 100 });
}));

adminMeetingRoutes.get('/invitees', schedulePermission, h(async (req, res) => {
  const search = text(req.query.q, 80);
  if (search.length < 2) throw fail('SEARCH_TOO_SHORT', 'Enter at least two characters of a business name.');
  const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const rows = await VendorOrganization.find({
    ...activeVendor, $or: [{ businessName: pattern }, { brandName: pattern }],
  }).select('businessName brandName').sort({ businessName: 1, _id: 1 }).limit(20).lean();
  res.json({ vendors: rows.map(row => ({ id: String(row._id), name: row.brandName || row.businessName })) });
}));

adminMeetingRoutes.post('/', schedulePermission, h(async (req, res) => {
  const fields = await scheduleFields(req.body || {});
  const requestKey = text(req.body.requestKey, 80);
  const reason = text(req.body.reason, 500);
  const createdBy = String(req.admin._id);
  const requestHash = createHash('sha256').update(JSON.stringify({ fields, reason })).digest('hex');
  const filter = { createdBy, requestKey };
  let row;
  try {
    row = await GrowthMeeting.findOneAndUpdate(filter, { $setOnInsert: {
      ...fields, requestHash, history: [{
        actor: createdBy, action: 'SCHEDULED', reason, at: new Date(), revision: 1, scheduleVersion: 1,
        startsAt: fields.startsAt, endsAt: fields.endsAt, timezone: fields.timezone,
      }],
    } }, { new: true, upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await GrowthMeeting.findOne(filter);
  }
  if (!row || row.requestHash !== requestHash) throw changed();
  res.status(201).json({ meeting: staffView(row, true) });
}));

async function updateMeeting(req, constraints, set, action, scheduleChange = false) {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw changed();
  const audit = { actor: String(req.admin._id), action, reason: text(req.body.reason, 500), at: new Date(), revision: revision + 1 };
  if (scheduleChange) Object.assign(audit, { startsAt: set.startsAt, endsAt: set.endsAt, timezone: set.timezone, scheduleVersion: req.body.scheduleVersion + 1 });
  const filter = { _id: getId(req.params.id), revision, status: 'SCHEDULED', ...constraints };
  const row = await GrowthMeeting.findOneAndUpdate(filter, {
    $set: set, $inc: { revision: 1, ...(scheduleChange ? { scheduleVersion: 1 } : {}) }, $push: { history: audit },
  }, { new: true, runValidators: true });
  if (!row) throw changed();
  return row;
}

adminMeetingRoutes.put('/:id/schedule', schedulePermission, h(async (req, res) => {
  const fields = await scheduleFields(req.body || {});
  const scheduleVersion = req.body.scheduleVersion;
  if (!Number.isSafeInteger(scheduleVersion) || scheduleVersion < 1) throw changed();
  const row = await updateMeeting(req, { startsAt: { $gt: new Date() }, scheduleVersion }, fields, 'RESCHEDULED', true);
  res.json({ meeting: staffView(row, true) });
}));

adminMeetingRoutes.post('/:id/cancel', schedulePermission, h(async (req, res) => {
  const cancellationReason = vendorText(req.body?.reason, 500);
  const row = await updateMeeting(req, { endsAt: { $gt: new Date() } }, { status: 'CANCELLED', cancellationReason }, 'CANCELLED');
  res.json({ meeting: staffView(row, true) });
}));

adminMeetingRoutes.put('/:id/summary', runPermission, h(async (req, res) => {
  const fields = { summary: vendorText(req.body?.summary, 6000), resources: vendorText(req.body?.resources, 6000, false) };
  const row = await updateMeeting(req, { endsAt: { $lte: new Date() } }, fields, 'SUMMARY_SAVED');
  res.json({ meeting: staffView(row, false) });
}));

adminMeetingRoutes.get('/:id/participation', runPermission, h(async (req, res) => {
  const row = await GrowthMeeting.findById(getId(req.params.id)).lean();
  if (!row) throw denied();
  const records = await MeetingParticipation.find({ meeting: row._id, scheduleVersion: row.scheduleVersion })
    .select('vendor rsvp attended attendanceAt feedback').sort({ updatedAt: -1 }).limit(201).lean();
  const names = await VendorOrganization.find({ _id: { $in: records.slice(0, 200).map(record => record.vendor) } })
    .select('businessName brandName').lean();
  const byId = new Map(names.map(vendor => [String(vendor._id), vendor.brandName || vendor.businessName]));
  res.json({
    participants: records.slice(0, 200).map(record => ({
      vendorId: String(record.vendor), name: byId.get(String(record.vendor)) || 'Vendor unavailable',
      rsvp: record.rsvp, attended: record.attended, attendanceAt: record.attendanceAt, feedback: record.feedback,
    })),
    truncated: records.length > 200,
  });
}));

adminMeetingRoutes.put('/:id/attendance', runPermission, h(async (req, res) => {
  const { vendorId, attended, scheduleVersion } = req.body || {};
  if (!isObjectIdOrHexString(vendorId) || typeof attended !== 'boolean' || !Number.isSafeInteger(scheduleVersion)) {
    throw fail('INVALID_ATTENDANCE', 'Select a vendor and attendance status.');
  }
  const row = await GrowthMeeting.findOne({
    _id: getId(req.params.id), status: 'SCHEDULED', endsAt: { $lte: new Date() }, scheduleVersion,
  }).lean();
  if (!row) throw changed();
  const filter = participationKey(row, vendorId);
  const existing = await MeetingParticipation.exists(filter);
  if (!existing && ((row.audience === 'INVITED' && !row.invitees.some(id => String(id) === String(vendorId).toLowerCase())) ||
      !await VendorOrganization.exists({ _id: vendorId, ...activeVendor }))) {
    throw fail('VENDOR_NOT_ELIGIBLE', 'This vendor was not eligible for the meeting.', 403);
  }
  const participant = await saveParticipation(filter, {
    attended, attendanceActor: String(req.admin._id), attendanceAt: new Date(),
  });
  res.json({ attended: participant.attended });
}));

vendorMeetingRoutes.use(noStore);
vendorMeetingRoutes.get('/next', h(async (req, res) => {
  const row = await GrowthMeeting.findOne({
    ...vendorAudience(req), status: 'SCHEDULED', endsAt: { $gt: new Date() },
  }).select('title startsAt endsAt timezone').sort({ startsAt: 1, _id: 1 }).lean();
  res.json({
    meeting: row ? { id: String(row._id), title: row.title, startsAt: row.startsAt, endsAt: row.endsAt, timezone: row.timezone } : null,
  });
}));

vendorMeetingRoutes.get('/', h(async (req, res) => {
  const audience = vendorAudience(req);
  const now = new Date();
  const fields = '-meetUrl -history -invitees -createdBy -requestKey -requestHash';
  const [upcoming, past] = await Promise.all([
    GrowthMeeting.find({ ...audience, endsAt: { $gt: now } }).select(fields).sort({ startsAt: 1 }).limit(51).lean(),
    GrowthMeeting.find({ ...audience, endsAt: { $lte: now } }).select(fields).sort({ startsAt: -1 }).limit(51).lean(),
  ]);
  const rows = [...upcoming.slice(0, 50), ...past.slice(0, 50)];
  const participation = await MeetingParticipation.find({
    vendor: req.vendorId, meeting: { $in: rows.map(row => row._id) },
  }).select('meeting scheduleVersion rsvp attended feedback').lean();
  const byVersion = new Map(participation.map(row => [`${row.meeting}:${row.scheduleVersion}`, row]));
  res.json({
    meetings: rows.map(row => {
      const record = byVersion.get(`${row._id}:${row.scheduleVersion}`);
      return {
        ...view(row), rsvp: record?.rsvp || null, attended: record?.attended ?? null,
        feedback: record?.feedback || '', canJoin: joinOpen(row, now.getTime()),
      };
    }),
    truncated: upcoming.length > 50 || past.length > 50,
  });
}));

vendorMeetingRoutes.put('/:id/rsvp', h(async (req, res) => {
  const row = await visibleMeeting(req);
  const { rsvp, scheduleVersion } = req.body || {};
  if (row.status !== 'SCHEDULED' || row.endsAt <= new Date() || scheduleVersion !== row.scheduleVersion) throw changed();
  if (!['GOING', 'NOT_GOING'].includes(rsvp)) throw fail('INVALID_RSVP', 'Choose an RSVP response.');
  const saved = await saveParticipation(participationKey(row, req.vendorId), { rsvp });
  if (!await GrowthMeeting.exists({ _id: row._id, scheduleVersion, status: 'SCHEDULED' })) throw changed();
  res.json({ rsvp: saved.rsvp });
}));

function joinOpen(row, now) {
  return row.status === 'SCHEDULED' && now >= row.startsAt.getTime() - 15 * 60000 && now < row.endsAt.getTime();
}

vendorMeetingRoutes.post('/:id/join', h(async (req, res) => {
  const row = await visibleMeeting(req);
  if (row.scheduleVersion !== req.body?.scheduleVersion) throw changed();
  if (!joinOpen(row, Date.now())) throw fail('JOIN_UNAVAILABLE', 'The link opens 15 minutes before the meeting and closes when it ends.', 409);
  res.json({ url: row.meetUrl });
}));

vendorMeetingRoutes.put('/:id/feedback', h(async (req, res) => {
  const row = await visibleMeeting(req);
  if (row.status !== 'SCHEDULED' || row.endsAt > new Date() || req.body?.scheduleVersion !== row.scheduleVersion) throw changed();
  const feedback = text(req.body.feedback, 1500);
  const saved = await MeetingParticipation.findOneAndUpdate({
    ...participationKey(row, req.vendorId), attended: true,
  }, { $set: { feedback } }, { new: true });
  if (!saved) throw fail('ATTENDANCE_REQUIRED', 'Feedback is available after staff record your attendance.', 403);
  res.json({ feedback: saved.feedback });
}));
