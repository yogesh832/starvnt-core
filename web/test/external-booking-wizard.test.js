import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateExternalWizardStep as validate } from '../../shared/externalBookingWizard.js';

const record = () => ({ date: '2027-01-10', endDate: '2027-01-10', allDay: false, startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata', scope: 'BUSINESS', external: {}, externalBooking: { totalAmount: 0, lineItems: [], allocations: [], buffers: {} } });
test('external wizard requires an explicit end date for overnight work and rejects impossible dates', () => {
  const form = record(); form.startTime = '22:00'; form.endTime = '02:00';
  assert.match(validate(form, 1), /next-day/);
  form.endDate = '2027-01-11'; assert.equal(validate(form, 1), '');
  form.date = '2027-02-30'; assert.match(validate(form, 1), /valid/);
});
test('unnecessary contact data is optional but a supplied phone must be valid', () => {
  const form = record(); assert.equal(validate(form, 0), '');
  form.external.customerPhone = '+91 98765 43210'; assert.equal(validate(form, 0), '');
  form.external.customerPhone = '123'; assert.match(validate(form, 0), /country code/);
});
test('external contract precision and resource quantities cannot imply invalid financial or capacity truth', () => {
  const form = record(); form.externalBooking.totalAmount = '19.995'; assert.match(validate(form, 3), /decimal/);
  form.externalBooking.totalAmount = '19.99'; assert.equal(validate(form, 3), '');
  form.scope = 'RESOURCE'; assert.match(validate(form, 2), /Assign/);
  form.scope = 'BUSINESS'; form.externalBooking.buffers.setupMinutes = 1.5; assert.match(validate(form, 2), /whole minutes/);
});

test('tentative holds reject invalid or expired expiry values', () => {
  const form = record(); form.externalBooking.lifecycle = 'ON_HOLD';
  for (const expiry of ['', 'not-a-date', '2020-01-01T00:00:00Z']) {
    form.externalBooking.holdExpiresAt = expiry; assert.match(validate(form, 5), /future expiry/);
  }
  form.externalBooking.holdExpiresAt = new Date(Date.now() + 3600000).toISOString();
  assert.equal(validate(form, 5), '');
});
