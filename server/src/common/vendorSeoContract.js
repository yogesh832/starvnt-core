// Shared product contract. Readiness measures saved evidence, never rankings.
export const SEO_FACTS = {
  businessName: 'Business name', category: 'Business category', subcategory: 'Subcategory',
  description: 'Business description', services: 'Services offered', serviceArea: 'Service locations',
  website: 'Business website', publicProfile: 'Public STARVNT profile URL', googleBusiness: 'Google Business Profile URL',
  social: 'Business social account', experience: 'Evidence of experience', portfolio: 'Authorized portfolio/project description',
  pricing: 'Public price range', hours: 'Confirmed operating hours', publicContact: 'Authorized public booking URL',
};
export const SEO_RECORDS = {
  research: 'Business identity research', keyword: 'Keyword research', competitor: 'Competitor comparison',
  technical: 'Technical SEO audit', local: 'Local SEO / Google Business Profile', geo: 'AI search visibility research',
  faq: 'Evidence-backed FAQ', portfolio: 'Portfolio image / project SEO', architecture: 'Platform architecture',
  automation: 'Automation requirement', marketing: 'Marketing content draft', action: '30 / 60 / 90-day action', measurement: 'KPI / monthly report',
};
export const SEO_DRAFT_FIELDS = {
  title: 'SEO title', metaDescription: 'Meta description', h1: 'H1 heading', headings: 'H2 / H3 structure',
  description: 'Optimized business description', services: 'Service-wise content', locations: 'Location-wise content',
  faqs: 'FAQs', imageAlt: 'Portfolio image alt text', internalLinks: 'Internal links and calls to action',
  canonical: 'Canonical URL recommendation', structuredData: 'Structured data draft',
};
export const SEO_PHASES = [
  { id: 'inventory', title: '1. Vendor profile audit', kind: 'research', checks: ['Identity and status', 'Category and subcategory', 'Services, pricing and experience', 'Primary and service locations', 'Portfolio and public URLs', 'Duplicate / seed / QA provenance', 'Missing information and profile completion'] },
  { id: 'research', title: '2. Individual business research', kind: 'research', checks: ['Search business name; record queries and dates', 'Verify website, social and Maps ownership', 'Check actual service coverage and portfolio', 'Record rejected or conflicting identity matches', 'Keep private owner contacts out of public content'] },
  { id: 'seo', title: '3. SEO research and content', kind: 'keyword', checks: ['Primary, secondary and category keywords', 'Local, long-tail and booking-intent queries', 'English, Bengali and relevant Hindi queries', 'Problem-based customer intent', 'SEO title, description, headings and service content', 'Alt text, FAQs, canonicals and internal links'] },
  { id: 'geo', title: '4. GEO readiness', kind: 'geo', checks: ['Consistent business entity and services', 'Evidence-backed service-area answers', 'Original portfolio and expertise descriptions', 'Research Google, Bing, ChatGPT Search, Gemini and Perplexity queries', 'Source URLs, observation dates and uncertainty', 'No fabricated recommendations, citations or authority'] },
  { id: 'local', title: '5. Local SEO and Google Business Profile', kind: 'local', checks: ['Eligibility and correct listing ownership', 'Name, address and public contact consistency', 'Primary / secondary categories and service areas', 'Description, services, hours and photographs', 'Reviews, response practices and duplicate listings', 'Separate authorization before external profile edits'] },
  { id: 'competitors', title: '6. Competitor intelligence', kind: 'competitor', checks: ['5–10 relevant competitors where available', 'Actual overlapping services and geography', 'Search visibility and keyword positioning', 'Website, content, Maps, reviews and portfolio', 'Trust signals, strengths, weaknesses and market gaps', 'Separate observed facts from estimates; no invented traffic'] },
  { id: 'pack', title: '7. Individual growth pack', kind: 'action', checks: ['Profile, SEO, GEO and local scorecards', 'Keywords, competitors and evidence-backed content', 'Service and location recommendations', 'Portfolio, structured data and GBP plans', 'Website and AI discovery improvements', '30 / 60 / 90-day plan and measurable KPIs'] },
  { id: 'architecture', title: '8. Platform SEO architecture', kind: 'architecture', checks: ['Stable public vendor URLs and reviewed slugs', 'Category, subcategory, service and location pages', 'Original portfolio and editorial pages', 'Internal links and breadcrumbs', 'Sitemap, canonical and indexing controls', 'Visible-fact Organization / LocalBusiness / Service / WebPage / WebSite / ImageObject schema', 'No thin city pages, fake locations or aggregate ratings'] },
  { id: 'automation', title: '9. Vendor OS automation', kind: 'automation', checks: ['Title, description and business content drafts', 'Keyword, alt-text and FAQ suggestions', 'Structured data and missing-field checks', 'SEO, GEO and local readiness checklists', 'Monthly reports and improvement recommendations', 'Human review against evidence before publishing'] },
  { id: 'reporting', title: '10. Reporting and commercial outcomes', kind: 'measurement', checks: ['Audited vendors and readiness percentages', 'Measured index coverage; do not infer from HTTP 200', 'Search Console impressions, clicks and CTR', 'Analytics organic enquiries and consent-aware attribution', 'Qualified leads and verified paid bookings', 'Vendor and platform totals kept separate', 'Source, date range and missing integrations disclosed'] },
];
export const SEO_GUIDANCE = [
  { title: 'Google Search and AI discovery', url: 'https://developers.google.com/search/docs/fundamentals/ai-optimization-guide' },
  { title: 'LocalBusiness structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/local-business' },
  { title: 'Google Business Profile guidelines', url: 'https://support.google.com/business/answer/3038177' },
];
export const SEO_PACK_SECTIONS = [
  ['profile', 'Vendor profile audit'], ['seo', 'SEO scorecard'], ['geo', 'GEO readiness scorecard'], ['local', 'Local SEO scorecard'],
  ['keyword', 'Keyword research'], ['competitor', 'Competitor analysis'], ['metadata', 'SEO title and meta description'],
  ['description', 'Optimized business description'], ['services', 'Service-wise SEO content'], ['locations', 'Location-wise recommendations'],
  ['faqs', 'FAQ content'], ['portfolio', 'Portfolio image SEO recommendations'], ['structuredData', 'Structured data recommendations'],
  ['gbp', 'Google Business Profile improvement plan'], ['technical', 'Website improvement plan'], ['geoResearch', 'AI search visibility strategy'],
  ['30', '30-day action plan'], ['60', '60-day growth plan'], ['90', '90-day growth plan'], ['measurement', 'Measurable KPIs'],
];
