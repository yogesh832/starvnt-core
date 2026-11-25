import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { VendorSeoWorkspace } from '../models/VendorSeoWorkspace.js';
import { VendorService } from '../models/VendorService.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { validateSeoWorkspace, generateSeoDraft, seoSummary, seoGrowthPack } from '../../common/vendorSeo.js';
import { SEO_FACTS, SEO_RECORDS, SEO_DRAFT_FIELDS } from '../../common/vendorSeoContract.js';
import { partnerMarketingSuggestions } from '../../common/partnerMarketing.js';

export const vendorSeoRoutes = Router();
vendorSeoRoutes.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
vendorSeoRoutes.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
const empty = () => ({ revision: 0, evidence: [], records: [], draft: Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(key => [key, ''])), review: null, history: [] });
async function profileFor(req) {
  const [services, portfolioCount, coverage] = await Promise.all([
    VendorService.find({ vendor: req.vendorId, status: 'ACTIVE' }).select('name category description').sort({ _id: 1 }).limit(101).lean(),
    PortfolioItem.countDocuments({ vendor: req.vendorId }),
    ServiceCoverage.find({ vendor: req.vendorId }).select('city district state localities confidence').sort({ _id: 1 }).limit(101).lean(),
  ]);
  const v = req.vendor;
  // Explicit allowlist: never serialize owner contacts, financials, documents or customer records.
  return { vendorId: String(req.vendorId), businessName: v.businessName, category: v.category, location: v.location, bio: v.bio, website: v.website, status: v.status, verificationStatus: v.verificationLadderLevel, flagged: Boolean(v.isFlagged), restricted: Boolean(v.isRestricted), serviceCount: services.length, services: services.slice(0, 100).map(s => ({ name: s.name, category: s.category, description: s.description })), portfolioCount, serviceAreas: coverage.slice(0, 100).map(c => ({ city: c.city, district: c.district, state: c.state, localities: c.localities, confidence: c.confidence })), partial: services.length > 100 || coverage.length > 100 };
}
function publicWorkspace(workspace) {
  const w = workspace || empty();
  return { revision: w.revision, evidence: w.evidence || [], records: w.records || [], draft: w.draft || empty().draft, review: w.review?.at ? { at: w.review.at, revision: w.review.revision, fingerprint: w.review.fingerprint } : null, history: (w.history || []).map(item => ({ at: item.at, action: item.action, revision: item.revision })) };
}
async function payload(req) {
  const [profile, raw] = await Promise.all([profileFor(req), VendorSeoWorkspace.findOne({ vendor: req.vendorId }).lean()]);
  const workspace = publicWorkspace(raw);
  const summary = seoSummary(profile, workspace);
  return { ok: true, generatedAt: new Date(), profile, workspace, summary, growthPack: seoGrowthPack(profile, workspace, summary), fields: { evidence: SEO_FACTS, records: SEO_RECORDS, draft: SEO_DRAFT_FIELDS } };
}
function conflict(res) { return res.status(409).json({ error: 'SEO_REVISION_CONFLICT', message: 'This workspace changed. Reload the latest revision before saving.' }); }
vendorSeoRoutes.get('/', h(async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await payload(req)); }));
vendorSeoRoutes.put('/', h(async (req, res) => {
  const input = validateSeoWorkspace(req.body);
  if (input.revision === 0) {
    try { await VendorSeoWorkspace.updateOne({ vendor: req.vendorId }, { $setOnInsert: { vendor: req.vendorId, ...empty() } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  const revision = input.revision + 1;
  const result = await VendorSeoWorkspace.updateOne({ vendor: req.vendorId, revision: input.revision }, { $set: { evidence: input.evidence, records: input.records, draft: input.draft, review: null, revision }, $push: { history: { $each: [{ at: new Date(), actor: req.externalUser._id, action: 'SAVED_DRAFT', revision }], $slice: -100 } } }, { runValidators: true });
  if (!result.matchedCount) return conflict(res);
  res.json(await payload(req));
}));
vendorSeoRoutes.post('/generate', h(async (req, res) => {
  // Returns a proposal only. Saving and human review remain explicit actions.
  const w = await VendorSeoWorkspace.findOne({ vendor: req.vendorId }).lean();
  if (!w || req.body?.revision !== w.revision) return conflict(res);
  res.json({ ok: true, draft: generateSeoDraft(w), method: 'EVIDENCE_TEMPLATE', published: false });
}));
vendorSeoRoutes.post('/suggestions', h(async (req, res) => {
  const workspace = await VendorSeoWorkspace.findOne({ vendor: req.vendorId }).lean();
  if (!workspace || req.body?.revision !== workspace.revision) return conflict(res);
  res.json(partnerMarketingSuggestions(workspace));
}));
vendorSeoRoutes.post('/review', h(async (req, res) => {
  const data = await payload(req);
  if (req.body?.revision !== data.workspace.revision || req.body?.fingerprint !== data.summary.fingerprint) return conflict(res);
  if (req.body?.confirmed !== true || data.summary.blockers.length || !data.workspace.draft.title || !data.workspace.draft.metaDescription) return res.status(400).json({ error: 'SEO_REVIEW_INCOMPLETE', message: 'Resolve evidence gaps, save a title and description, and confirm you checked every claim. This does not publish content.' });
  const revision = data.workspace.revision + 1;
  const result = await VendorSeoWorkspace.updateOne({ vendor: req.vendorId, revision: data.workspace.revision }, { $set: { revision, review: { at: new Date(), actor: req.externalUser._id, revision, fingerprint: data.summary.fingerprint } }, $push: { history: { $each: [{ at: new Date(), actor: req.externalUser._id, action: 'VENDOR_REVIEWED_PRIVATE_DRAFT', revision }], $slice: -100 } } });
  if (!result.matchedCount) return conflict(res);
  res.json(await payload(req));
}));
vendorSeoRoutes.get('/export', h(async (req, res) => {
  res.set('Cache-Control', 'no-store').attachment('starvnt-seo-geo-growth-pack.json');
  res.json({ ...(await payload(req)), exportNotice: 'Private vendor workspace. Sources and vendor attestations require independent review before publishing. Unavailable analytics are not zero. No external profiles were modified.' });
}));
