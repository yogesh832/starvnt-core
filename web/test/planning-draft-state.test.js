import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceChanges, draftResumeUrl, eventDateChange } from '../src/pages/customer/planningDraftState.js';
import { resolveCurrentEvent } from '../src/pages/customer/eventContext.js';
import { nextHomeAction } from '../src/pages/customer/homeActions.js';

test('resuming an inferred service does not silently turn it into a customer declaration', () => {
  const previous = [{ category: 'venue', status: 'customer_provided', source: 'aura_inferred', providedValue: 'Shortlisted hall', preferences: {}, serviceLocation: { mode: 'unspecified', notes: null } }];
  assert.deepEqual(serviceChanges({ venue: { status: 'customer_provided', providedValue: 'Shortlisted hall', details: {}, serviceLocation: { mode: 'unspecified', place: '', dropIsEventLocation: false } } }, previous), []);
});
test('explicit service changes include resets without changing other saved services', () => {
  const previous = [{ category: 'venue', status: 'pending' }, { category: 'photography', status: 'pending' }];
  assert.deepEqual(serviceChanges({ venue: { status: 'missing' }, photography: { status: 'pending' } }, previous).map(row => [row.category, row.status]), [['venue', 'missing']]);
});
test('an explicit manual declaration can confirm an otherwise unchanged Aura suggestion', () => {
  const prior = [{ category: 'venue', status: 'customer_provided', providedValue: 'Hall', source: 'aura_inferred' }];
  assert.equal(serviceChanges({ venue: { ...prior[0], source: 'customer' } }, prior).length, 1);
});
test('service changes preserve custom service locations and requirements', () => {
  const changes = serviceChanges({ catering: { status: 'pending', serviceLocation: { mode: 'custom', address: 'Separate venue', city: 'Kolkata' }, details: { guests: 250 }, specialRequirements: 'Vegetarian menu' } });
  assert.equal(changes[0].serviceLocation.address, 'Separate venue');
  assert.equal(changes[0].details.guests, 250);
  assert.equal(changes[0].specialRequirements, 'Vegetarian menu');
});
test('a saved draft resume link keeps event context across manual and Aura modes', () => {
  assert.equal(draftResumeUrl('saved-id'), '/customer/events/new?draft=saved-id');
  assert.equal(resolveCurrentEvent([{ id: 'saved-id', status: 'draft' }], null, '/customer/events/new', '?draft=saved-id').id, 'saved-id');
  assert.equal(nextHomeAction({ id: 'saved-id', status: 'draft' }, [{ type: 'draft_to_confirm' }]).to, draftResumeUrl('saved-id'));
});
test('autosaving unrelated details does not confirm an unchanged inferred date', () => {
  assert.deepEqual(eventDateChange('2028-10-20', { eventDate: '2028-10-20' }), {});
  assert.deepEqual(eventDateChange('', { eventDate: '2028-10-20' }), { eventDate: null });
  assert.deepEqual(eventDateChange('2028-11-20', { eventDate: null }), { eventDate: '2028-11-20' });
});
