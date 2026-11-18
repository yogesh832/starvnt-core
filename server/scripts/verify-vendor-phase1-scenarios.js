// Reused by the isolated Main17 browser harness; no live database/provider calls.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

export async function verifyVendorPhaseOne({ page, vendor, accessToken, checks, output }) {
  const [{ VendorService }, { VendorReview }] = await Promise.all([import('../src/external/models/VendorService.js'), import('../src/external/models/VendorReview.js')]);
  const site = 'http://127.0.0.1:5199';
  const readinessResponse = await fetch('http://127.0.0.1:4119/api/vendor/activation-status', { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(readinessResponse.status, 200);
  const { status } = await readinessResponse.json();
  assert.notEqual(status.profileCompletion, status.completionPercentage, 'Fixture must exercise distinct denominators');
  await page.goto(`${site}/vendor/dashboard`);
  const readiness = page.locator('section[aria-labelledby="business-readiness-title"]');
  await readiness.getByText(`${status.profileCompletion}%`, { exact: true }).waitFor();
  await readiness.getByText(`${status.completionPercentage}%`, { exact: true }).waitFor();
  const closeAura = page.getByRole('button', { name: 'Close Aura+', exact: true });
  if (await closeAura.isVisible()) await closeAura.click();
  checks.push('Phase 1 dashboard uses canonical business-profile and onboarding values with distinct denominators');

  await VendorService.create(Array.from({ length: 10 }, (_, index) => ({ vendor: vendor._id, name: `PhaseOne Search ${index}`, category: 'Photography', status: 'ARCHIVED', pricing: { basePrice: 0 } })));
  await page.getByLabel('Search Vendor OS', { exact: true }).fill('PhaseOne Search');
  const results = page.getByRole('region', { name: 'Vendor search results', exact: true });
  await results.getByLabel('Search category', { exact: true }).selectOption('services');
  await results.getByText('Page 1', { exact: true }).waitFor();
  assert.equal(await results.locator('a').count(), 8);
  const firstPage = await results.locator('a').evaluateAll(rows => rows.map(row => row.getAttribute('href')));
  await results.getByRole('button', { name: 'Next search page', exact: true }).click();
  await results.getByText('Page 2', { exact: true }).waitFor();
  assert.equal(await results.locator('a').count(), 2);
  const secondPage = await results.locator('a').evaluateAll(rows => rows.map(row => row.getAttribute('href')));
  assert.equal(new Set([...firstPage, ...secondPage]).size, 10);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#vendor-navigation')).visibility === 'hidden');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(output, 'phase1-search-mobile-web.png'), fullPage: true });
  await page.getByLabel('Search Vendor OS', { exact: true }).press('Escape');
  await results.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  const navigation = page.getByRole('dialog', { name: 'Vendor navigation', exact: true });
  await navigation.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Close menu');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await navigation.evaluate(panel => panel.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await navigation.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Open navigation menu', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push('Phase 1 authorized search pages ten records; mobile navigation contains keyboard focus and Escape restores its toggle');

  const quality = page.locator('section[aria-labelledby="business-quality-title"]');
  const snapshot = page.locator('section[aria-labelledby="business-health-title"]');
  const originalFind = VendorReview.find;
  try {
    VendorReview.find = () => { throw new Error('Synthetic phase-one review source failure'); };
    const response = page.waitForResponse(row => row.url().includes('/vendor/dashboard?') && row.request().method() === 'GET');
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    assert.equal((await response).status(), 200);
    await quality.getByRole('status').filter({ hasText: 'Partial data' }).waitFor();
    const rating = quality.locator('a').filter({ hasText: 'Verified STARVNT rating' });
    assert.ok((await rating.textContent()).includes('Unavailable'));
    assert.equal((await rating.textContent()).includes('No verified reviews yet.'), false);
    await snapshot.getByRole('status').filter({ hasText: 'Current source loaded.' }).waitFor();
  } finally { VendorReview.find = originalFind; }
  checks.push('Phase 1 real review-query failure is unavailable without a fake zero while unrelated widgets remain loaded');

  await page.route('**/api/vendor/dashboard?periodDays=*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic phase-one dashboard unavailable' }) }));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic phase-one dashboard unavailable' }).waitFor();
  await snapshot.getByRole('status').filter({ hasText: 'Saved data; current source unavailable.' }).waitFor();
  await readiness.getByText('Readiness unavailable. Retry to retrieve the authorized status.', { exact: true }).waitFor();
  await page.unroute('**/api/vendor/dashboard?periodDays=*');
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await quality.getByRole('status').filter({ hasText: 'Current source loaded.' }).waitFor();
  await page.screenshot({ path: resolve(output, 'phase1-dashboard-desktop.png'), fullPage: true });
  checks.push('Phase 1 dashboard retains explicitly stale read-only widgets on HTTP failure, withholds current eligibility and recovers after retry');

  await page.route('**/api/vendor/profile?skipGoogle=1', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic linked profile failure' }) }));
  await page.goto(`${site}/vendor/readiness`);
  await page.getByRole('heading', { name: 'Readiness metric definitions', exact: true }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Linked profile' }).waitFor();
  await page.getByText(`Business Profile Completion: ${status.profileCompletion}%`, { exact: true }).waitFor();
  await page.getByText(`Onboarding Completion: ${status.completionPercentage}%`, { exact: true }).waitFor();
  await page.unroute('**/api/vendor/profile?skipGoogle=1');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#vendor-navigation')).visibility === 'hidden');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(output, 'phase1-readiness-mobile-web.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push('Phase 1 readiness matches canonical dashboard metrics and survives an independent linked-profile API failure');
}
