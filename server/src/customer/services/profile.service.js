import * as customersRepo from '../repositories/customers.repo.js';
import { badRequest, notFound } from '../utils/http.js';

const EDITABLE = ['fullName', 'phone'];

export async function getProfile(customerId) {
  const user = await customersRepo.findCustomer(customerId);
  if (!user) throw notFound('Profile not found');
  return user.toSafeJSON();
}

export async function updateProfile(customerId, input = {}) {
  const errors = {};
  const fields = {};
  for (const key of Object.keys(input || {})) {
    if (!EDITABLE.includes(key)) errors[key] = 'This field cannot be changed here';
  }
  if (input.fullName !== undefined) {
    const n = String(input.fullName || '').trim();
    if (!n || n.length > 120) errors.fullName = 'Name must be 1–120 characters';
    else fields.fullName = n;
  }
  if (input.phone !== undefined) {
    const p = String(input.phone || '').trim();
    if (p && !/^\+?[\d\s-]{7,20}$/.test(p)) errors.phone = 'Enter a valid phone number';
    else fields.phone = p || undefined;
  }
  if (Object.keys(errors).length) throw badRequest('VALIDATION_FAILED', 'Please check your details', { fields: errors });
  const user = await customersRepo.updateCustomer(customerId, fields);
  if (!user) throw notFound('Profile not found');
  return user.toSafeJSON();
}
