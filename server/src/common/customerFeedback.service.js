import mongoose from 'mongoose';
import { CustomerFeedback } from './productObservability.js';
import { CustomerEvent, CustomerNotification } from '../customer/models/index.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { badRequest, notFound } from '../customer/utils/http.js';

export async function ownedFeedbackReference(customer, kind, reference) {
  if (!['EVENT', 'NOTIFICATION'].includes(kind) || !mongoose.isObjectIdOrHexString(reference)) {
    throw badRequest('INVALID_FEEDBACK', 'Choose a valid event or notification.');
  }
  const Model = kind === 'EVENT' ? CustomerEvent : CustomerNotification;
  if (!await Model.exists({ _id: reference, customer })) throw notFound('Record not found.');
  return { customer, kind, reference };
}

export async function readCustomerFeedback(customer, input) {
  const filter = await ownedFeedbackReference(customer, input.kind, input.reference);
  const row = await CustomerFeedback.findOne(filter).lean();
  return row ? { score: row.score, updatedAt: row.updatedAt } : null;
}

export async function saveCustomerFeedback(customer, input) {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw badRequest('INVALID_FEEDBACK', 'Choose a rating from 1 to 5.');
  }
  const filter = await ownedFeedbackReference(customer, input.kind, input.reference);
  const update = { $set: { score: input.score } };
  let row;
  try {
    row = await CustomerFeedback.findOneAndUpdate(filter, update, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await CustomerFeedback.findOneAndUpdate(filter, update, { new: true, runValidators: true });
  }
  return { score: row.score, updatedAt: row.updatedAt };
}

export async function listCustomerFeedback() {
  const [rows, total] = await Promise.all([
    CustomerFeedback.find().sort({ updatedAt: -1, _id: -1 }).limit(50).lean(),
    CustomerFeedback.countDocuments(),
  ]);
  const [customers, events, notifications] = await Promise.all([
    ExternalUser.find({ _id: { $in: rows.map(row => row.customer) } }).select('fullName').lean(),
    CustomerEvent.find({ _id: { $in: rows.filter(row => row.kind === 'EVENT').map(row => row.reference) } }).select('title').lean(),
    CustomerNotification.find({ _id: { $in: rows.filter(row => row.kind === 'NOTIFICATION').map(row => row.reference) } }).select('title').lean(),
  ]);
  const names = new Map(customers.map(row => [String(row._id), row.fullName]));
  const titles = new Map([...events, ...notifications].map(row => [String(row._id), row.title]));
  return { total, responses: rows.map(row => ({
    id: row._id, kind: row.kind, score: row.score, reference: row.reference,
    customerName: names.get(String(row.customer)) || 'Customer unavailable',
    referenceTitle: titles.get(String(row.reference)) || 'Record unavailable',
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  })) };
}
