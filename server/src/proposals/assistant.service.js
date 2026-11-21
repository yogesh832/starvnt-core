import { getLlmAdapter } from '../customer/aura/llmAdapter.js';
import { Proposal, ProposalVersion } from './models.js';
import { proposalError } from './utils.js';

/**
 * Aura+ proposal assistant. Answers ONLY from the published customer-safe
 * snapshot. Aura+ explains and drafts change requests; it cannot change
 * prices, agreements, approvals, payments or bookings.
 */

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const ANSWERABLE = ['SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED', 'CHANGE_REQUESTED', 'CUSTOMER_APPROVED', 'CUSTOMER_DECLINED'];

export function factsFromSnapshot(s) {
  const lines = [
    `Proposal kind: ${s.kind === 'FINAL' ? 'final approved proposal' : 'PRELIMINARY concept, not final'}`,
    `Event: ${s.event.typeLabel}${s.event.title ? ` — ${s.event.title}` : ''}, date ${s.event.date || 'to be confirmed'}, ${s.event.guestCount || '?'} guests, ${[s.event.venueName, s.event.city].filter(Boolean).join(', ')}`,
    ...s.services.map((x) => `Included service — ${x.label}: ${x.summary || ''}${x.items.length ? ` Items: ${x.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join('; ')}.` : ''}${x.deliverables.length ? ` Deliverables: ${x.deliverables.join('; ')}.` : ''}${x.exclusions.length ? ` Not included: ${x.exclusions.join('; ')}.` : ''}${x.confirmed ? '' : ' (vendor confirmation pending)'}`),
    ...(s.customerProvided.length ? [`Arranged by the customer: ${s.customerProvided.map((x) => x.label).join(', ')}`] : []),
    ...(s.pending.length ? [`Pending confirmations: ${s.pending.map((p) => p.item).join('; ')}`] : []),
    ...(s.budget ? [
      `Package total: ${inr(s.budget.packageTotal)}${s.budget.taxes.included ? ' (taxes included)' : ''}`,
      ...s.budget.allocations.map((a) => `Budget line — ${a.label}: ${inr(a.amount)} (${a.scopeSummary})`),
      ...s.budget.paymentSchedule.map((p) => `Payment — ${p.label}: ${p.percent}% = ${inr(p.amount)}, ${p.dueRule}`),
    ] : ['Pricing has not been approved yet.']),
    ...(s.exclusions.length ? [`Exclusions: ${s.exclusions.join('; ')}`] : []),
    ...(s.terms ? [`Terms — cancellation: ${s.terms.cancellation || 'n/a'}; postponement: ${s.terms.postponement || 'n/a'}; scope changes: ${s.terms.scopeChange || 'n/a'}`] : []),
    'Approving the proposal does not confirm a booking; booking is confirmed only after the booking payment is verified.',
  ];
  return lines.join('\n');
}

const CHANGE_INTENT = /\b(change|add|remove|replace|swap|upgrade|another|different|instead|modify|badal|jod|hata)\b/i;

/** Deterministic answer straight from the snapshot; also the fallback when the LLM is unavailable or unsafe. */
export function factualAnswer(s, question) {
  const q = question.toLowerCase();
  const service = s.services.find((x) => q.includes(x.category.replace(/_/g, ' ')) || q.includes(x.label.toLowerCase()) || (x.category === 'decor' && /decor|decoration|stage|entrance/.test(q)) || (x.category === 'catering' && /menu|food|catering|dish/.test(q)));
  if (/exclu|not included|excluded/.test(q)) return s.exclusions.length ? `These are not included: ${s.exclusions.join('; ')}.` : 'No exclusions are listed in your proposal.';
  if (/payment|schedule|instal|pay /.test(q)) return s.budget ? `Your payment schedule: ${s.budget.paymentSchedule.map((p) => `${p.label} — ${p.percent}% (${inr(p.amount)}), ${p.dueRule}`).join('; ')}.` : 'Your payment schedule will appear once pricing is approved.';
  if (/pending|confirm/.test(q)) {
    const pending = [...s.pending.map((p) => p.item), ...s.services.filter((x) => !x.confirmed).map((x) => `${x.label} vendor confirmation`)];
    return pending.length ? `Still pending: ${pending.join('; ')}.` : 'Everything in your proposal is confirmed.';
  }
  if (/budget|cost|price|total|kitna|amount/.test(q) && s.budget) return `Your package total is ${inr(s.budget.packageTotal)}. It is allocated as: ${s.budget.allocations.map((a) => `${a.label} ${inr(a.amount)}`).join('; ')}.`;
  if (service) return `${service.label}: ${service.summary || 'included in your plan'}${service.items.length ? `. Includes ${service.items.map((i) => i.name).join(', ')}` : ''}${service.deliverables.length ? `. Deliverables: ${service.deliverables.join(', ')}` : ''}.`;
  if (/include|package|what.*(get|have)/.test(q)) return `Your proposal includes: ${s.services.map((x) => x.label).join(', ')}${s.budget ? `, for a package total of ${inr(s.budget.packageTotal)}` : ''}.`;
  return `I can answer from your proposal: included services (${s.services.map((x) => x.label).join(', ')}), budget, payment schedule, exclusions and pending confirmations. What would you like to know?`;
}

/**
 * Every figure in an answer must already exist in the snapshot, however it is
 * written: ₹1,48,500 · Rs. 148500 · INR 1,48,500 · 1.485 lakh. Small numbers
 * (guest counts, percentages, days) are below the 4-digit threshold.
 */
export function answerIsGrounded(answer, snapshot) {
  const known = new Set((JSON.stringify(snapshot).match(/\d+/g) || []).map(String));
  const text = String(answer);
  const lakhs = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|lakhs|L)\b/gi)].map((m) => String(Math.round(Number(m[1]) * 100000)));
  const plain = [...text.replace(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|lakhs|L)\b/gi, ' ').matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => m[0].replace(/,/g, '').replace(/\.0+$/, ''))
    .filter((n) => n.replace(/\.\d+$/, '').length >= 4);
  return [...lakhs, ...plain].every((n) => known.has(n));
}

export async function askAboutProposal(customerId, proposalId, question) {
  const text = String(question || '').trim().slice(0, 500);
  if (!text) throw proposalError('QUESTION_REQUIRED', 'Ask a question about your proposal.', 400);
  const proposal = await Proposal.findOne({ _id: proposalId, customer: customerId }).lean();
  if (!proposal?.publishedVersion) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  const version = await ProposalVersion.findOne({ proposal: proposal._id, version: proposal.publishedVersion }).lean();
  if (!version || !ANSWERABLE.includes(version.status)) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  const s = version.snapshot;

  const suggestedChange = CHANGE_INTENT.test(text)
    ? { message: text, note: 'Aura+ can prepare this as a change request. STARVNT will check it with vendors and send you a new version; nothing changes until you approve it.' }
    : null;

  let answer = null, source = 'facts';
  try {
    const systemPrompt = [
      'You are Aura+, STARVNT\'s event proposal assistant. Answer the customer\'s question using ONLY the proposal facts below.',
      'If something is not in the facts, say it is not part of the approved proposal. Never invent prices, services, dates or vendor names.',
      'You cannot change prices, approve anything, confirm bookings or verify payments. For change requests, explain they will be reviewed and a new version will be sent.',
      'Reply in 1–4 short sentences, in the language the customer used.',
      '--- PROPOSAL FACTS ---',
      factsFromSnapshot(s),
    ].join('\n');
    const reply = await getLlmAdapter().chat({ systemPrompt, history: [], message: text });
    const candidate = String(reply?.text || '').trim();
    if (candidate && answerIsGrounded(candidate, s)) { answer = candidate; source = 'aura'; }
  } catch {
    // LLM unavailable: the factual answer below is always correct.
  }
  answer ||= factualAnswer(s, text);
  return { answer, source, version: version.version, suggestedChange };
}
