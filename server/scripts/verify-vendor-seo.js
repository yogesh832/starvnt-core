import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { vendorPalette } from '../../shared/vendorTheme.js';

// Uses the caller's ephemeral database and real authenticated browser session.
export async function verifyVendorSeo({ page, output, report }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5197/vendor/seo', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'SEO & GEO growth', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Business evidence', exact: true }).click();
  for (const [field, value] of Object.entries({ businessName: 'QA Business Dashboard', category: 'Photography', services: 'QA Photography', serviceArea: 'Pune' })) {
    await page.getByRole('button', { name: 'Add business evidence', exact: true }).click();
    await page.getByLabel('Business fact', { exact: true }).selectOption(field);
    await page.getByLabel('Evidence value', { exact: true }).fill(value);
    await page.getByLabel('Public source URL', { exact: true }).fill('https://example.test/business');
    await page.getByLabel('I confirm this source and information belong to my business.', { exact: true }).check();
    await page.getByLabel('I authorize using this fact in public-content drafts and confirm the necessary rights.', { exact: true }).check();
    await page.getByRole('button', { name: 'Keep in workspace', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.getByText('Workspace saved. Any previous review has been cleared.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Content drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Replace draft from saved evidence', exact: true }).click();
  await page.getByText('A basic proposal replaced the local draft. Review and save it; nothing was published.', { exact: true }).waitFor();
  assert.match(await page.getByLabel('SEO title', { exact: true }).inputValue(), /QA Business Dashboard/);
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.getByText('Workspace saved. Any previous review has been cleared.', { exact: true }).waitFor();
  await page.getByLabel('I checked each claim against the source, confirmed public-use rights, and removed private information and unsupported claims.', { exact: true }).check();
  await page.getByRole('button', { name: 'Mark saved draft reviewed', exact: true }).click();
  await page.getByText('Private draft marked reviewed. Public publishing remains a separate step.', { exact: true }).waitFor();
  await page.reload();
  await page.getByText(/REVIEWED DRAFT/).waitFor();
  report.checks.push({ name: 'SEO evidence saved, draft generated, human review persisted across reload without publishing', passed: true });
  await page.getByRole('button', { name: 'Research & audits', exact: true }).click();
  await page.getByLabel('Research area', { exact: true }).selectOption('keyword');
  await page.getByRole('button', { name: 'Add keyword research', exact: true }).click();
  await page.getByLabel('Title / search query / task', { exact: true }).fill('Wedding photography in Pune');
  await page.getByLabel('Finding, comparison or recommendation', { exact: true }).fill('Candidate query. Demand not measured.');
  await page.getByLabel('Evidence basis', { exact: true }).selectOption('RECOMMENDATION');
  await page.getByLabel('Language', { exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Keep in workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await page.getByText('Workspace saved. Any previous review has been cleared.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByText('NOT CONNECTED', { exact: true }).first().waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download saved growth pack', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'starvnt-seo-geo-growth-pack.json');
  report.checks.push({ name: 'SEO research persists, edits revoke review, missing analytics remain explicit and saved growth pack exports', passed: true });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  for (const [theme, width, height] of [['light', 1440, 1000], ['dark', 390, 844], ['light', 320, 740]]) {
    await page.evaluate(mode => { localStorage.setItem('starvnt-theme', mode); }, theme);
    await page.setViewportSize({ width, height });
    await page.reload();
    await page.getByRole('heading', { name: 'SEO evidence', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), product: document.documentElement.dataset.productTheme, background: getComputedStyle(document.documentElement).getPropertyValue('--sv-bg').trim(), preference: localStorage.getItem('starvnt-theme') })), { dark: true, product: 'vendor', background: vendorPalette.bg, preference: theme });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const filename = `seo-${theme}-${width}.png`;
    await page.screenshot({ path: resolve(output, filename) }); report.screenshots.push(filename);
  }
  report.checks.push({ name: 'SEO workspace fits desktop and 320/390px phones with the locked Vendor palette while preserving user preferences', passed: true });
}
