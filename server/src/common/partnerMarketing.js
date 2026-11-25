import { randomUUID } from 'node:crypto';
import { generateSeoDraft, usableSeoEvidence } from './vendorSeo.js';

// Adapts the prototype's growth-pack concept to the existing evidence contract.
// It does not import synthetic vendors, competitors, rankings or regional defaults.
export function partnerMarketingSuggestions(workspace, now = new Date()) {
  const draft = generateSeoDraft(workspace);
  const evidence = usableSeoEvidence(workspace, now);
  const value = field => evidence.filter(e => e.field === field).map(e => e.value).join('; ').slice(0, 800);
  const name = value('businessName'), services = value('services'), area = value('serviceArea');
  const source = evidence.find(e => e.field === 'businessName')?.sourceUrl || '';
  const sourceNote = `Based on vendor-confirmed public-use evidence (full source ledger retained in workspace): ${[...new Set(evidence.map(e => e.sourceUrl))].slice(0, 2).join(', ')}`;
  const record = (kind, title, detail, extra = {}) => ({ id: randomUUID(), kind, title, detail: `${detail}\n\n${sourceNote}`, sourceUrl: source, observedAt: now.toISOString().slice(0, 10), basis: 'RECOMMENDATION', target: 'STARVNT', language: 'en', location: area.slice(0, 200), period: '', completed: false, metric: '', startDate: '', endDate: '', ...extra });
  const booking = value('publicContact');
  return {
    method: 'EVIDENCE_TEMPLATES', published: false,
    notice: 'Private suggestions for review. Keyword demand, rankings and AI recommendations have not been measured. Review platform policies and permission before sending or publishing.',
    records: [
      record('keyword', `${services} in ${area}`.slice(0, 180), `Primary/local query candidate: ${services} in ${area}. Booking-intent candidate: request a quote for ${services} in ${area}. Validate demand and actual service geography before use; no search-volume claim is made.`),
      record('geo', `AI discovery questions for ${name}`.slice(0, 180), `Which providers offer ${services} in ${area}?\nWhat services does ${name} offer?\nWhich areas does ${name} serve?\nCheck Google/Bing, ChatGPT Search, Gemini and Perplexity separately; record dates and sources for any observed result.`),
      record('faq', `Services and coverage FAQ — ${name}`.slice(0, 180), `Q: What services does ${name} offer?\nDraft answer: ${services}.\nQ: Which areas does ${name} serve?\nDraft answer: ${area}.\nOther policies, experience and availability: NEEDS VERIFICATION.`),
      record('marketing', 'Business introduction · social / website', `${draft.description.slice(0, 2000)}${booking ? `\nRequest service details: ${booking}` : '\nCall to action: add an authorized public booking URL before publishing.'}\nDo not add unsupported superlatives, scarcity, prices, reviews or guaranteed results.`),
      record('marketing', 'Permissioned outreach · message draft', `Hello, we are ${name}. We offer ${services} in ${area}.${booking ? ` You can request details at ${booking}.` : ''}\nUse only for recipients with the appropriate communication permission; this workspace does not send messages.`),
      record('portfolio', 'Portfolio image and project SEO review', `Describe only the visible work and the vendor's evidenced role. Use an original project caption, descriptive filename and appropriately sized image. Confirm customer/media rights. ${value('portfolio') ? `Vendor-provided project evidence: ${value('portfolio')}` : 'Project-specific caption and alt text: NEEDS DATA. No image contents have been inferred.'}`),
      record('action', 'Verify sources and establish a measurement baseline', 'Confirm genuine identity, public-use rights, actual services and service locations. Review keyword candidates and collect authorized Search Console / Analytics access. Define qualified-enquiry and paid-booking attribution.', { period: '30' }),
      record('action', 'Review original content and technical SEO', 'Complete competitor research using real overlapping services and areas. Review unique service copy, FAQs, original project captions and visible-fact schema. Publish only through an authorized workflow; no thin city pages.', { period: '60' }),
      record('action', 'Measure enquiries and improve approved content', 'Use sourced impressions, clicks, indexed-page status and qualified enquiries. Link outcomes to verified bookings and report refunds/cancellations separately. Recheck stale sources before expanding.', { period: '90' }),
    ],
  };
}
