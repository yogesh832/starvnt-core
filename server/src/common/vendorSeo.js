import { createHash } from 'node:crypto';
import { SEO_FACTS, SEO_RECORDS, SEO_DRAFT_FIELDS, SEO_PHASES, SEO_GUIDANCE, SEO_PACK_SECTIONS } from './vendorSeoContract.js';

const fail = message => { throw Object.assign(new Error(message), { statusCode: 400, code: 'INVALID_SEO_INPUT' }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Unexpected SEO fields. Refresh and retry.'); }
function text(value, max = 2000) { if (value === undefined) return ''; if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`Use text of at most ${max} characters.`); return value.trim(); }
function choice(value, values, fallback) { const result = value === undefined ? fallback : value; if (!values.includes(result)) fail('Choose a valid SEO option.'); return result; }
function bool(value) { if (value !== undefined && typeof value !== 'boolean') fail('Choose a valid confirmation.'); return value === true; }
export function seoUrl(value) {
  const raw = text(value, 1500); if (!raw) return '';
  let url; try { url = new URL(raw); } catch { fail('Use a complete public HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || /\.(local|internal)$/i.test(url.hostname)) fail('Use a public HTTPS URL without credentials.');
  return url.href;
}
function date(value, required = false) {
  const result = text(value, 10);
  if (!result && !required) return '';
  const parsed = new Date(result);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== result || result > new Date().toISOString().slice(0, 10)) fail('Use a valid observation date, today or earlier.');
  return result;
}
export function validateSeoWorkspace(body) {
  keys(body, ['revision', 'evidence', 'records', 'draft']);
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail('A saved revision is required.');
  if (!Array.isArray(body.evidence) || body.evidence.length > 100 || !Array.isArray(body.records) || body.records.length > 300) fail('Use at most 100 evidence entries and 300 research records.');
  const ids = new Set();
  function id(value) { const result = text(value, 80); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(result) || ids.has(result)) fail('Each record needs a unique ID.'); ids.add(result); return result; }
  const evidence = body.evidence.map(item => {
    keys(item, ['id', 'field', 'value', 'sourceUrl', 'observedAt', 'identityConfirmed', 'publicUseApproved']);
    const result = { id: id(item.id), field: choice(item.field, Object.keys(SEO_FACTS)), value: text(item.value), sourceUrl: seoUrl(item.sourceUrl), observedAt: date(item.observedAt, true), identityConfirmed: bool(item.identityConfirmed), publicUseApproved: bool(item.publicUseApproved) };
    if (!result.value) fail('Evidence needs a value.');
    if (result.publicUseApproved && (!result.identityConfirmed || !result.sourceUrl)) fail('Confirm the business identity and supply a source before allowing public use.');
    if (['website', 'publicProfile', 'googleBusiness', 'social', 'publicContact'].includes(result.field)) result.value = seoUrl(result.value);
    return result;
  });
  const records = body.records.map(item => {
    keys(item, ['id', 'kind', 'title', 'detail', 'sourceUrl', 'observedAt', 'language', 'location', 'basis', 'target', 'period', 'completed', 'metric', 'value', 'startDate', 'endDate']);
    const result = { id: id(item.id), kind: choice(item.kind, Object.keys(SEO_RECORDS)), title: text(item.title, 180), detail: text(item.detail, 8000), sourceUrl: seoUrl(item.sourceUrl), observedAt: date(item.observedAt, true), language: choice(item.language, ['', 'en', 'bn', 'hi', 'other'], ''), location: text(item.location, 200), basis: choice(item.basis, ['NEEDS_DATA', 'OBSERVATION', 'ESTIMATE', 'RECOMMENDATION'], 'NEEDS_DATA'), target: choice(item.target, ['STARVNT', 'VENDOR_WEBSITE', 'EXTERNAL_PROFILE'], 'STARVNT'), period: choice(item.period, ['', '30', '60', '90'], ''), completed: bool(item.completed), metric: text(item.metric, 100), startDate: date(item.startDate), endDate: date(item.endDate) };
    if (!result.title) fail('Research needs a title.');
    if (result.basis === 'OBSERVATION' && !result.sourceUrl) fail('Observed findings need a source URL.');
    if (item.value !== undefined && item.value !== null && item.value !== '') {
      if (typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0 || item.value > 1e12 || result.kind !== 'measurement' || result.basis !== 'OBSERVATION' || !result.metric || !result.startDate || !result.endDate) fail('Measured KPIs need a source, metric, value and date range.');
      result.value = item.value;
    }
    if (result.startDate && result.endDate && result.startDate > result.endDate) fail('The report end date must follow its start date.');
    return result;
  });
  keys(body.draft, Object.keys(SEO_DRAFT_FIELDS));
  const draft = Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(key => [key, text(body.draft[key], key === 'title' ? 120 : key === 'metaDescription' ? 320 : 12000)]));
  if (draft.canonical) draft.canonical = seoUrl(draft.canonical);
  if (draft.structuredData) {
    try { const parsed = JSON.parse(draft.structuredData); if (!object(parsed) || parsed['@context'] !== 'https://schema.org') fail('Use a JSON-LD object with https://schema.org context.'); }
    catch { fail('Structured data must be valid JSON-LD. It still needs validation against visible content before publication.'); }
  }
  if (JSON.stringify({ evidence, records, draft }).length > 250000) fail('This workspace is too large. Export and consolidate older research.');
  return { revision: body.revision, evidence, records, draft };
}
export function seoFingerprint(profile, workspace) {
  return createHash('sha256').update(JSON.stringify({ profile, evidence: workspace.evidence || [], records: workspace.records || [], draft: workspace.draft || {} })).digest('hex');
}
export function usableSeoEvidence(workspace, now = new Date()) {
  return (workspace.evidence || []).filter(item => item.identityConfirmed && item.publicUseApproved && item.sourceUrl && item.observedAt && (+now - +new Date(item.observedAt)) <= 180 * 86400000 && (+now >= +new Date(item.observedAt)));
}
export function generateSeoDraft(workspace) {
  const evidence = usableSeoEvidence(workspace);
  const fact = field => evidence.filter(item => item.field === field).map(item => item.value).join('; ');
  const name = fact('businessName'), category = fact('category'), area = fact('serviceArea'), services = fact('services');
  if (!name || !category || !area || !services) fail('Add current, identity-confirmed, public-use evidence for business name, category, services and service locations first.');
  const description = fact('description') || `${name} offers ${services} in ${area}.`;
  const draft = Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(key => [key, '']));
  return { ...draft, title: `${name} | ${category} in ${area}`.slice(0, 120), metaDescription: description.slice(0, 320), h1: `${name} — ${category}`, description, services, locations: area, internalLinks: fact('publicContact'), canonical: fact('publicProfile').split('; ')[0] || '', structuredData: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name, description, ...(fact('website') ? { url: fact('website').split('; ')[0] } : {}) }, null, 2) };
}
export function seoSummary(profile, workspace, now = new Date()) {
  const evidence = usableSeoEvidence(workspace, now), has = field => evidence.some(item => item.field === field);
  const records = workspace.records || [], observed = kind => records.some(item => item.kind === kind && item.basis === 'OBSERVATION' && item.sourceUrl && (+now - +new Date(item.observedAt)) <= 180 * 86400000);
  const check = (label, ready) => ({ label, ready: Boolean(ready) });
  const score = checks => ({ percent: Math.round(checks.filter(item => item.ready).length / checks.length * 100), checks });
  const core = ['businessName', 'category', 'services', 'serviceArea'];
  const blockers = core.filter(field => !has(field)).map(field => `Current confirmed public-use evidence needed: ${SEO_FACTS[field]}`);
  if (profile.status === 'SUSPENDED' || profile.status === 'REJECTED' || profile.flagged || profile.restricted) blockers.push('Business status requires STARVNT review.');
  const fingerprint = seoFingerprint(profile, workspace);
  const reviewed = Boolean(workspace.review?.at && workspace.review?.fingerprint === fingerprint && !blockers.length);
  return {
    status: blockers.length ? 'NEEDS_DATA' : reviewed ? 'REVIEWED_DRAFT' : 'NEEDS_REVIEW', blockers, reviewed,
    reviewedAt: reviewed ? workspace.review.at : null, fingerprint,
    scoreMeaning: 'Internal evidence checklist completion; vendor attestations are not independent verification, search rankings or AI endorsements.',
    seo: score([...core.map(field => check(SEO_FACTS[field], has(field))), check('Keyword research recorded', observed('keyword')), check('Technical audit recorded', observed('technical')), check('SEO title and description draft', workspace.draft?.title && workspace.draft?.metaDescription)]),
    geo: score([check('Business identity', has('businessName')), check('Service and area evidence', has('services') && has('serviceArea')), check('Original portfolio evidence', has('portfolio')), check('Experience evidence', has('experience')), check('FAQ research', observed('faq')), check('AI discovery research', observed('geo'))]),
    local: score([check('Business listing identity confirmed by vendor', has('googleBusiness')), check('Actual service areas', has('serviceArea')), check('Confirmed hours', has('hours')), check('Public booking URL', has('publicContact')), check('Local audit recorded', observed('local'))]),
    profileCompletion: { percent: Math.round([profile.businessName, profile.category, profile.location, profile.bio, profile.website, profile.serviceCount > 0, profile.portfolioCount > 0].filter(Boolean).length / 7 * 100), meaning: '7-field profile completeness; separate from verified evidence readiness.' },
    measurements: { connectionStatus: 'NOT_CONNECTED', message: 'Search Console and Analytics are not connected to this workspace. Saved measurements are manually sourced observations, not live provider data.', records: records.filter(item => item.kind === 'measurement') },
    phases: SEO_PHASES.map(phase => ({ ...phase, records: records.filter(item => item.kind === phase.kind).length })), guidance: SEO_GUIDANCE,
    staleEvidence: (workspace.evidence || []).filter(item => !evidence.includes(item)).length,
    publication: 'PRIVATE_WORKSPACE_ONLY',
  };
}
export function seoGrowthPack(profile, workspace, summary) {
  const records = workspace.records || [], byKind = kind => records.filter(item => item.kind === kind);
  const contents = {
    profile, seo: summary.seo, geo: summary.geo, local: summary.local,
    keyword: byKind('keyword'), competitor: byKind('competitor'),
    metadata: workspace.draft?.title && workspace.draft?.metaDescription ? { title: workspace.draft.title, metaDescription: workspace.draft.metaDescription } : null,
    description: workspace.draft?.description, services: workspace.draft?.services, locations: workspace.draft?.locations,
    faqs: workspace.draft?.faqs, portfolio: byKind('portfolio'), structuredData: workspace.draft?.structuredData,
    gbp: byKind('local'), technical: byKind('technical'), geoResearch: byKind('geo'),
    ...Object.fromEntries(['30', '60', '90'].map(period => [period, records.filter(item => item.kind === 'action' && item.period === period)])),
    measurement: byKind('measurement'),
  };
  return SEO_PACK_SECTIONS.map(([id, title]) => {
    const content = contents[id];
    return { id, title, status: !content || (Array.isArray(content) && !content.length) ? 'NEEDS_DATA' : 'RECORDED_REQUIRES_REVIEW', content: content || null };
  });
}
