import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { Proposal, ProposalVersion } from './models.js';
import { evaluateGate } from './gate.service.js';
import { composeProposalHtml, footerTemplate, headerTemplate, PRELIMINARY_WATERMARK } from './composer.js';
import { recordRenderFailure, recordRenderResult } from './proposal.service.js';
import { proposalError } from './utils.js';
import { VisualAsset } from './models.js';
import { readAssetFile } from './assets.service.js';

/** Copies the snapshot with each approved image embedded as a data URI (the renderer has no network). */
export async function withImageData(snapshot) {
  const visuals = {};
  for (const [section, list] of Object.entries(snapshot.visuals || {})) {
    visuals[section] = [];
    for (const v of list) {
      const asset = await VisualAsset.findOne({ _id: v.assetId, status: 'APPROVED' }).lean();
      if (!asset) continue; // withdrawn after generation: QA will flag the missing image count
      const data = await readAssetFile(asset);
      visuals[section].push({ ...v, url: `data:image/jpeg;base64,${data.toString('base64')}` });
    }
  }
  return { ...snapshot, visuals };
}

const require = createRequire(import.meta.url);
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STORAGE_DIR = process.env.PROPOSAL_STORAGE_DIR || path.join(SERVER_ROOT, 'var', 'proposals');

// Keys that exist only on internal records. Their presence in customer output is a leak.
export const INTERNAL_KEYS = ['vendorTotal', 'directCosts', 'margin', 'unitPrice', 'costs', 'negotiation', 'createdByEmail', 'approvedByEmail'];

const BROWSER_CANDIDATES = [
  process.env.PROPOSAL_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function browserPath() {
  return BROWSER_CANDIDATES.find((p) => fsSync.existsSync(p)) || null;
}

let browserPromise = null;
async function browser() {
  if (!browserPromise) {
    const executablePath = browserPath();
    if (!executablePath) throw proposalError('PDF_BROWSER_UNAVAILABLE', 'No Chromium browser found. Set PROPOSAL_BROWSER_PATH.', 503);
    const { default: puppeteer } = await import('puppeteer-core');
    browserPromise = puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] })
      .catch((err) => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

export async function closeRenderer() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => null);
}

/** HTML → A4 PDF plus layout facts measured in the real browser. */
export async function renderPdf(html, meta, { preliminary }) {
  const page = await (await browser()).newPage();
  try {
    // Network is blocked except data: URIs and allow-listed image hosts, so a template can never fetch arbitrary URLs.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || /^https:\/\/res\.cloudinary\.com\//.test(url)) req.continue();
      else req.abort();
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const layout = await page.evaluate(() => {
      const overflow = [...document.querySelectorAll('td, th, .visual, .facts div')]
        .filter((el) => el.scrollWidth > el.clientWidth + 2).length;
      const images = [...document.images].map((img) => ({ ok: img.complete && img.naturalWidth > 0, labelled: Boolean(img.dataset.sourceLabel), w: img.naturalWidth, h: img.naturalHeight }));
      return { overflow, images };
    });
    const pdf = await page.pdf({
      format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: headerTemplate(meta), footerTemplate: footerTemplate(meta, preliminary),
    });
    return { pdf: Buffer.from(pdf), layout };
  } finally {
    await page.close().catch(() => null);
  }
}

export async function pdfText(buffer) {
  const parse = require('pdf-parse/lib/pdf-parse.js');
  const pages = [];
  const data = await parse(buffer, {
    pagerender: (pageData) => pageData.getTextContent().then((tc) => {
      const text = tc.items.map((i) => i.str).join(' ');
      pages.push(text);
      return text;
    }),
  });
  return { text: data.text, pages, numpages: data.numpages };
}

const normalizeSpace = (s) => String(s).replace(/\s+/g, ' ');

export function findKeys(value, keys, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => findKeys(v, keys, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (keys.includes(k)) found.add(k);
      findKeys(v, keys, found);
    }
  }
  return [...found];
}
const inrText = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** Automated checks before a version can be published. Critical failures block delivery. */
export function runQa({ snapshot, html, text, pages, layout, preliminary, forbiddenValues = [] }) {
  const checks = [];
  const add = (key, passed, critical, detail = '') => checks.push({ key, passed: Boolean(passed), critical, detail });
  const flat = normalizeSpace(text);
  const e = snapshot.event;

  add('event_city_present', !e.city || flat.includes(e.city), true, e.city);
  add('guest_count_present', !e.guestCount || flat.includes(String(e.guestCount)), true, String(e.guestCount ?? ''));
  if (snapshot.budget) {
    add('package_total_present', flat.includes(inrText(snapshot.budget.packageTotal).slice(1)), true, inrText(snapshot.budget.packageTotal));
    for (const p of snapshot.budget.paymentSchedule) add(`schedule_${p.label}`, flat.includes(inrText(p.amount).slice(1)), true, `${p.label} ${inrText(p.amount)}`);
  }
  for (const svc of snapshot.services) add(`service_${svc.category}`, flat.includes(svc.label) || flat.toLowerCase().includes(svc.category.replace(/_/g, ' ')), false, svc.label);

  // Ignore CSS and embedded image bytes; base64 can contain any letter sequence.
  const body = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/src="data:[^"]*"/g, 'src=""');
  const leakedKeys = [...new Set([
    ...findKeys(snapshot, INTERNAL_KEYS),
    ...INTERNAL_KEYS.filter((k) => /[A-Z]/.test(k) && body.includes(k)), // camelCase identifiers never occur in prose
  ])];
  add('no_internal_fields', leakedKeys.length === 0, true, leakedKeys.join(', '));
  const leakedValues = forbiddenValues.filter((v) => Number(v) > 0 && flat.includes(Math.round(v).toLocaleString('en-IN')));
  add('no_internal_values', leakedValues.length === 0, true, leakedValues.length ? `${leakedValues.length} internal amount(s) found` : '');

  const expectedImages = (snapshot.visuals?.cover?.length ? 1 : 0)
    + snapshot.services.reduce((n, s) => n + Math.min(4, snapshot.visuals?.[s.category]?.length || 0), 0);
  add('all_approved_images_present', layout.images.length === expectedImages, true, `${layout.images.length} of ${expectedImages}`);
  add('images_load', layout.images.every((i) => i.ok), true, `${layout.images.filter((i) => !i.ok).length} broken`);
  add('images_labelled', layout.images.every((i) => i.labelled), true, `${layout.images.filter((i) => !i.labelled).length} without source label`);
  add('no_text_overflow', layout.overflow === 0, true, `${layout.overflow} overflowing cell(s)`);
  const blank = pages.filter((p) => normalizeSpace(p).replace(/STARVNT.*?Page \d+ of \d+/g, '').trim().length < 15).length;
  add('no_blank_pages', blank === 0, true, `${blank} near-empty page(s)`);
  const numbered = pages.every((p, i) => normalizeSpace(p).includes(`Page ${i + 1} of ${pages.length}`));
  add('page_numbering', numbered, true, `${pages.length} page(s)`);
  if (preliminary) add('preliminary_watermark_every_page', pages.every((p) => normalizeSpace(p).includes(PRELIMINARY_WATERMARK)), true);
  else add('no_preliminary_marking', !flat.includes(PRELIMINARY_WATERMARK), true);

  return { passed: checks.every((c) => c.passed || !c.critical), checks };
}

async function storePdf(versionId, buffer) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storageKey = `${versionId}.pdf`;
  await fs.writeFile(path.join(STORAGE_DIR, storageKey), buffer, { flag: 'wx' }).catch(async (err) => {
    if (err.code !== 'EEXIST') throw err;
  });
  return storageKey;
}

export async function readStoredPdf(storageKey) {
  if (!/^[a-f0-9]{24}\.pdf$/.test(String(storageKey))) throw proposalError('PDF_NOT_FOUND', 'Document not found.', 404);
  return fs.readFile(path.join(STORAGE_DIR, storageKey));
}

export async function previewHtml(versionId) {
  const version = await ProposalVersion.findById(versionId).lean();
  if (!version) throw proposalError('PROPOSAL_VERSION_NOT_FOUND', 'Version not found.', 404);
  const proposal = await Proposal.findById(version.proposal).lean();
  const customer = await ExternalUser.findById(version.customer).select('fullName').lean();
  return composeProposalHtml(await withImageData(version.snapshot), { proposalNumber: proposal.proposalNumber, version: version.version, theme: version.theme, customerName: customer?.fullName });
}

/** Outbox consumer for PROPOSAL_GENERATION_REQUESTED. */
export async function renderProposalVersion(versionId, { forbiddenValues } = {}) {
  const version = await ProposalVersion.findById(versionId);
  if (!version) throw new Error('PROPOSAL_VERSION_NOT_FOUND');
  if (!['APPROVED_FOR_GENERATION', 'PRELIMINARY_PREVIEW', 'FAILED'].includes(version.status)) return { skipped: true, status: version.status };
  const preliminary = version.kind !== 'FINAL';

  try {
    let internalValues = forbiddenValues;
    if (!preliminary) {
      // Approvals can lapse between request and render (e.g. an agreement expires).
      const gate = await evaluateGate(version.event);
      if (!gate.ready || String(gate.commercial?._id) !== String(version.commercialApproval)) {
        await recordRenderFailure(versionId, new Error(`Gate no longer passes: ${gate.state}`));
        return { rendered: false, state: gate.state };
      }
      internalValues ||= [gate.commercial.costs.margin, gate.commercial.costs.vendorTotal, ...gate.agreements.map((a) => a.pricing.total)];
    }
    await ProposalVersion.updateOne({ _id: versionId }, { $inc: { 'generation.attempts': 1 } });

    const proposal = await Proposal.findById(version.proposal).lean();
    const customer = await ExternalUser.findById(version.customer).select('fullName').lean();
    const meta = { proposalNumber: proposal.proposalNumber, version: version.version, theme: version.theme, customerName: customer?.fullName };
    const html = composeProposalHtml(await withImageData(version.snapshot), meta);
    const { pdf, layout } = await renderPdf(html, meta, { preliminary });
    const { text, pages } = await pdfText(pdf);
    // Customer-facing amounts may legitimately equal an internal figure; only flag values absent from the snapshot.
    const allowed = new Set(JSON.stringify(version.snapshot).match(/\d+/g) || []);
    const qa = runQa({ snapshot: version.snapshot, html, text, pages, layout, preliminary, forbiddenValues: (internalValues || []).filter((v) => !allowed.has(String(Math.round(v)))) });
    const storageKey = await storePdf(String(version._id), pdf);
    const updated = await recordRenderResult(versionId, {
      pdf: { storageKey, bytes: pdf.length, pages: pages.length, sha256: crypto.createHash('sha256').update(pdf).digest('hex'), renderedAt: new Date() },
      qa,
    });
    return { rendered: true, status: updated.status, qaPassed: qa.passed };
  } catch (err) {
    await recordRenderFailure(versionId, err).catch(() => null);
    throw err;
  }
}
