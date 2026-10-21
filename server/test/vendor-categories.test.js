import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_VALUES, findVendorCategory, searchVendorCategories, customVendorServiceInput, customVendorService, vendorCategoryError } from '../src/common/vendorCategories.js';
import { CATEGORIES, categoriesMentioned, normalizeCategory } from '../src/customer/services/planCatalog.js';
import { CATEGORY_DEFINITIONS, validateCategoryCapability } from '../src/external/utils/categoryWorkspaces.js';
import { guardProfile } from '../src/external/aura/profileWriter.js';
import { serviceFields } from '../src/customer/services/serviceRequirements.js';

test('every selectable vendor category reaches Core discovery, capabilities and guarded Aura profile extraction', () => {
  assert.ok(VENDOR_CATEGORIES.length >= 26);
  assert.equal(new Set(VENDOR_CATEGORY_VALUES).size, VENDOR_CATEGORIES.length);
  assert.ok(VENDOR_CATEGORY_VALUES.includes('Other'));
  for (const category of VENDOR_CATEGORIES) {
    assert.equal(normalizeCategory(category.value), category.planKey, category.value);
    assert.ok(CATEGORIES.includes(category.planKey), category.value);
    assert.ok(CATEGORY_DEFINITIONS[category.key], category.key);
    assert.equal(validateCategoryCapability(category.value, {}).isValid, true, category.value);
    assert.equal(guardProfile({ category: category.value }, `My primary category is ${category.value}`).category, category.value === 'Other' ? undefined : category.value);
  }
});

test('all service distinctions explicitly named in directive part 02 remain separate', () => {
  for (const [left, right] of [['Catering', 'Decor & Styling'], ['Photography', 'Videography'], ['DJ & Music', 'Sound & Audio'], ['Venue', 'Accommodation & Hotels'], ['Event Planning', 'Event Coordination']]) {
    assert.notEqual(normalizeCategory(left), normalizeCategory(right));
    assert.notEqual(findVendorCategory(left).key, findVendorCategory(right).key);
  }
  assert.deepEqual(categoriesMentioned('I need a videographer'), ['videography']);
  assert.deepEqual(categoriesMentioned('I need a DJ'), ['dj']);
  assert.deepEqual(categoriesMentioned('What other details do you need?'), []);
  assert.notDeepEqual(serviceFields('dj', 'wedding'), serviceFields('sound', 'wedding'));
  assert.notDeepEqual(serviceFields('event_coordination', 'wedding'), serviceFields('event_planning', 'wedding'));
});

test('category search handles aliases and every word without allowing an unmatched arbitrary category', () => {
  assert.ok(searchVendorCategories('pandit').some(category => category.key === 'Religious_Services'));
  assert.deepEqual(searchVendorCategories('crowd security').map(category => category.key), ['Security']);
  assert.deepEqual(searchVendorCategories('not-a-real-service-zzzz'), []);
  assert.equal(searchVendorCategories('').length, VENDOR_CATEGORIES.length);
  assert.equal(findVendorCategory('Anchor_Host').value, 'Anchor & Host');
  assert.equal(validateCategoryCapability('Unknown made-up category', { cameraModels: ['invented'] }).isValid, false);
  assert.equal(validateCategoryCapability('Other', { cameraModels: ['invented'] }).attributes.cameraModels, undefined);
});

test('Aura never invents a selected primary category or conflates sound and DJ', () => {
  assert.equal(guardProfile({ category: 'Photography' }, 'I provide sound systems').category, undefined);
  assert.equal(guardProfile({}, 'I provide sound systems', { categoryMissing: true }).category, 'Sound & Audio');
  assert.equal(guardProfile({}, 'I am a DJ', { categoryMissing: true }).category, 'DJ & Music');
  assert.equal(guardProfile({}, 'Photography and Videography', { categoryMissing: true }).category, undefined);
});

test('Other requires an explicitly supplied service name and preserves it through Aura and discovery', () => {
  assert.match(vendorCategoryError('Other'), /enter the service/);
  assert.match(vendorCategoryError('Other:   '), /enter the service/);
  assert.equal(vendorCategoryError('Other: Pet care at events'), null);
  assert.equal(customVendorService('Other: Pet care at events'), 'Pet care at events');
  assert.equal(normalizeCategory('Other: Pet care at events'), 'other_service');
  assert.equal(guardProfile({category: 'Other: Pet care at events'}, 'I provide pet care at events').category, 'Other: Pet care at events');
  assert.equal(guardProfile({category: 'Other: Pet care at events'}, 'Other').category, undefined);
  assert.equal(guardProfile({category: 'Other'}, 'Other').category, undefined);
});

test('custom service typing preserves spaces while validation trims only the final value', () => {
  let category = 'Other';
  for (const character of 'Pet care at events ') category = `Other: ${customVendorServiceInput(category)}${character}`;
  assert.equal(customVendorServiceInput(category), 'Pet care at events ');
  assert.equal(customVendorService(category), 'Pet care at events');
  assert.equal(vendorCategoryError(category), null);
  assert.match(vendorCategoryError('Other:    '), /enter the service/);
});
