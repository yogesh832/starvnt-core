import { VendorBusinessGoal, VENDOR_GOAL_METRICS } from '../models/VendorBusinessGoal.js';
import { Quote } from '../models/Quote.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_GOALS = 3;

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

export function validateVendorGoalInput(input = {}) {
  const name = String(input.name || '').trim();
  const metric = String(input.metric || '').toUpperCase();
  const targetValue = Number(input.targetValue);
  const periodStart = dateOnly(input.startDate);
  const periodEndDate = dateOnly(input.endDate);
  if (name.length < 2 || name.length > 80) return { error: 'INVALID_GOAL_NAME' };
  if (!VENDOR_GOAL_METRICS.includes(metric)) return { error: 'UNSUPPORTED_GOAL_METRIC' };
  if (!Number.isSafeInteger(targetValue) || targetValue < 1 || targetValue > 1000000) return { error: 'INVALID_GOAL_TARGET' };
  if (!periodStart || !periodEndDate || periodStart > periodEndDate) return { error: 'INVALID_GOAL_PERIOD' };
  if (periodEndDate.getTime() - periodStart.getTime() > 366 * DAY_MS) return { error: 'GOAL_PERIOD_TOO_LONG' };
  return {
    value: {
      name,
      metric,
      targetValue,
      periodStart,
      periodEnd: new Date(periodEndDate.getTime() + DAY_MS), // End date is inclusive in the vendor UI.
    },
  };
}

export async function currentVendorGoalValue(vendorId, metric, start, end) {
  if (metric === 'SUBMITTED_QUOTES') {
    return Quote.countDocuments({
      vendor: vendorId,
      history: { $elemMatch: { toStatus: 'SUBMITTED', timestamp: { $gte: start, $lt: end } } },
    });
  }

  if (metric === 'CONFIRMED_BOOKINGS') {
    return CoreBooking.countDocuments({
      vendorId,
      bookingStatus: 'CONFIRMED',
      createdAt: { $gte: start, $lt: end },
    });
  }

  if (metric === 'COMPLETED_BOOKINGS') {
    return CoreBooking.countDocuments({
      vendorId,
      executionStatus: 'COMPLETION_VERIFIED',
      'validationAudit.verifiedAt': { $gte: start, $lt: end },
    });
  }

  throw Object.assign(new Error('Unsupported goal metric'), { code: 'UNSUPPORTED_GOAL_METRIC' });
}

function serializeGoal(goal, currentValue, measuredAt = new Date()) {
  const row = goal.toObject ? goal.toObject() : goal;
  const metricAvailable = Number.isFinite(currentValue) && currentValue >= 0;
  return {
    id: String(row._id),
    name: row.name,
    metric: row.metric,
    targetValue: row.targetValue,
    currentValue: metricAvailable ? currentValue : null,
    progressPercent: metricAvailable ? Math.min(100, Math.round((currentValue / row.targetValue) * 100)) : null,
    targetReached: metricAvailable && currentValue >= row.targetValue,
    metricAvailable,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: new Date(row.periodEnd.getTime() - DAY_MS).toISOString().slice(0, 10),
    status: row.status,
    updatedAt: row.updatedAt,
    measuredAt,
  };
}

export async function listVendorBusinessGoals(vendorId, now = new Date()) {
  const goals = await VendorBusinessGoal.find({ vendor: vendorId, deletedAt: null }).sort({ createdAt: -1 }).limit(100).lean();
  const result = await Promise.all(goals.map(async (goal) => {
    const end = goal.periodEnd > now ? now : goal.periodEnd;
    let currentValue = null;
    try {
      currentValue = end <= goal.periodStart ? 0 : await currentVendorGoalValue(vendorId, goal.metric, goal.periodStart, end);
    } catch {
      currentValue = null;
    }
    return serializeGoal(goal, currentValue, new Date());
  }));
  return result;
}

export async function createVendorBusinessGoal({ vendorId, userId, values }) {
  const activeCount = await VendorBusinessGoal.countDocuments({ vendor: vendorId, status: 'ACTIVE', deletedAt: null });
  if (activeCount >= MAX_ACTIVE_GOALS) throw Object.assign(new Error('A vendor can have at most three active goals.'), { code: 'ACTIVE_GOAL_LIMIT', statusCode: 409 });
  const snapshot = { ...values, periodStart: values.periodStart.toISOString(), periodEnd: values.periodEnd.toISOString() };
  const goal = await VendorBusinessGoal.create({
    vendor: vendorId,
    ...values,
    history: [{ action: 'CREATED', changedBy: userId, snapshot }],
  });
  const measurementEnd = new Date(Math.min(goal.periodEnd.getTime(), Date.now()));
  let currentValue = null;
  try { currentValue = measurementEnd <= goal.periodStart ? 0 : await currentVendorGoalValue(vendorId, goal.metric, goal.periodStart, measurementEnd); } catch { currentValue = null; }
  return serializeGoal(goal, currentValue);
}

export async function updateVendorBusinessGoal({ vendorId, userId, goalId, values, status }) {
  const goal = await VendorBusinessGoal.findOne({ _id: goalId, vendor: vendorId, deletedAt: null });
  if (!goal) return null;

  if (status !== undefined) {
    if (!['ACTIVE', 'COMPLETED', 'PAUSED'].includes(status)) throw Object.assign(new Error('Invalid goal status.'), { code: 'INVALID_GOAL_STATUS' });
    if (status === 'ACTIVE' && goal.status !== 'ACTIVE') {
      const activeCount = await VendorBusinessGoal.countDocuments({ vendor: vendorId, status: 'ACTIVE', deletedAt: null, _id: { $ne: goal._id } });
      if (activeCount >= MAX_ACTIVE_GOALS) throw Object.assign(new Error('A vendor can have at most three active goals.'), { code: 'ACTIVE_GOAL_LIMIT', statusCode: 409 });
    }
    goal.status = status;
  }

  if (values) {
    Object.assign(goal, values);
  }

  if (status === 'COMPLETED') {
    const measurementEnd = new Date(Math.min(goal.periodEnd.getTime(), Date.now()));
    const currentValue = measurementEnd <= goal.periodStart ? 0 : await currentVendorGoalValue(vendorId, goal.metric, goal.periodStart, measurementEnd);
    if (currentValue < goal.targetValue) throw Object.assign(new Error('The goal target has not been reached yet.'), { code: 'GOAL_TARGET_NOT_MET', statusCode: 409 });
  }

  const historyAction = values ? 'UPDATED' : 'STATUS_CHANGED';
  goal.history.push({
    action: historyAction,
    changedBy: userId,
    snapshot: {
      name: goal.name,
      metric: goal.metric,
      targetValue: goal.targetValue,
      periodStart: goal.periodStart.toISOString(),
      periodEnd: goal.periodEnd.toISOString(),
      status: goal.status,
    },
  });
  if (goal.history.length > 50) goal.history = goal.history.slice(-50);
  await goal.save();
  const measurementEnd = new Date(Math.min(goal.periodEnd.getTime(), Date.now()));
  let currentValue = null;
  try { currentValue = measurementEnd <= goal.periodStart ? 0 : await currentVendorGoalValue(vendorId, goal.metric, goal.periodStart, measurementEnd); } catch { currentValue = null; }
  return serializeGoal(goal, currentValue, new Date());
}

export async function deleteVendorBusinessGoal({ vendorId, userId, goalId }) {
  const goal = await VendorBusinessGoal.findOne({ _id: goalId, vendor: vendorId, deletedAt: null });
  if (!goal) return null;
  goal.history.push({
    action: 'DELETED',
    changedBy: userId,
    snapshot: { name: goal.name, metric: goal.metric, targetValue: goal.targetValue, status: goal.status },
  });
  if (goal.history.length > 50) goal.history = goal.history.slice(-50);
  goal.deletedAt = new Date();
  await goal.save();
  return goal;
}
