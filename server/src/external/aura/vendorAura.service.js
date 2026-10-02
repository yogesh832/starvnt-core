import { VendorAuraSession, VendorAuraMessage } from '../models/VendorAura.js';
import { VendorService } from '../models/VendorService.js';
import { getLlmAdapter } from './llmAdapter.js';
import { buildVendorContext, PAGES, CATEGORIES, setupSummary, isAutoBusinessName } from './vendorContext.js';
import { applyProfileFromChat } from './profileWriter.js';
import { validateAction, describeAction, executeAction, readConfirmation, dateIn, reasonFrom, isMessageRelevantToPending } from './setupActions.js';
import { buildVendorSystemPrompt } from './vendorSystemPrompt.js';
import { classifyAuraRequest } from '../../common/auraRouter.js';
import { createPerformanceTracker } from '../../common/streamUtils.js';

/**
 * Vendor Aura+ chat. It answers from the vendor's own data and suggests pages.
 * Its only writes are profile setup: brand basics (profileWriter.js) and — after
 * the vendor confirms — a service, team & gear, location or coverage
 * (setupActions.js). Quotes, bookings, payments and availability are never touched.
 */

export const MAX_MESSAGE = 2000;
const HISTORY = 12;
const SESSION_RE = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_ACTIONS = 3;

export const FALLBACK_REPLY = "Sorry, I can't answer right now. Please try again in a moment — your dashboard has the latest numbers.";

const httpError = (status, error) => Object.assign(new Error(error), { status, error });

export function isValidSessionId(sid) {
  return typeof sid === 'string' && SESSION_RE.test(sid);
}

/** Keep only well-formed links to known Vendor OS pages. */
export function cleanActions(actions) {
  if (!Array.isArray(actions)) return [];
  const seen = new Set();
  const out = [];
  for (const a of actions) {
    const label = typeof a?.label === 'string' ? a.label.trim().slice(0, 40) : '';
    const m = typeof a?.to === 'string' ? /^\/vendor\/([a-z]+)\/?$/.exec(a.to.trim()) : null;
    if (!label || !m || !PAGES.includes(m[1])) continue;
    const to = `/vendor/${m[1]}`;
    if (seen.has(to)) continue;
    seen.add(to);
    out.push({ label, to });
    if (out.length === MAX_ACTIONS) break;
  }
  return out;
}

async function ownedSession(sid, vendorId) {
  const session = await VendorAuraSession.findById(sid).lean();
  if (session && String(session.vendor) !== String(vendorId)) throw httpError(403, 'FORBIDDEN');
  return session;
}

async function ensureSession(sid, vendorId, userId) {
  const existing = await ownedSession(sid, vendorId);
  if (existing) return existing;
  try {
    return (await VendorAuraSession.create({ _id: sid, vendor: vendorId, user: userId })).toObject();
  } catch (err) {
    // Concurrent first message: somebody created it; re-check ownership.
    if (err?.code === 11000) return ownedSession(sid, vendorId);
    throw err;
  }
}

function serialize(m) {
  return { role: m.role, content: m.content, actions: m.actions || [], createdAt: m.createdAt };
}

const pendingView = (p) => (p ? { kind: p.kind, summary: describeAction(p), isUpdate: Boolean(p.isUpdate) } : null);

export async function getSession({ vendor, sessionId }) {
  if (!isValidSessionId(sessionId)) throw httpError(400, 'INVALID_SESSION_ID');
  const session = await ownedSession(sessionId, vendor._id);
  if (!session) return { sessionId, messages: [], pending: null };
  const messages = await VendorAuraMessage.find({ session: sessionId }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
  return { sessionId, messages: messages.map(serialize), pending: pendingView(session.pending) };
}

/** What Aura+ says after a setup step is saved: the next step, as a question it can act on. */
function nextStepText(activation, vendor) {
  const setup = setupSummary(activation);
  const next = setup?.nextStep;
  if (!setup) return { text: '', actions: [], setup };
  if (!next) {
    const verified = Boolean(activation.checklist?.verified);
    return {
      text: verified
        ? '\n🎉 Your profile setup is complete — you can now be matched with customers.'
        : '\n🎉 All 5 setup steps are done. The last check is STARVNT verification (KYC documents) before customers can be matched with you.',
      actions: verified ? [] : [{ label: 'KYC documents', to: '/vendor/documents' }],
      setup,
    };
  }
  const c = activation.checklist;
  const ask = {
    services: "Next: your first service. What service do you offer, and what's your base price?",
    capabilities: 'Next: team & equipment. How many people are in your team, and what main equipment do you use?',
    coverage: !c.locations
      ? 'Next: your studio / office location. Which area and city is it in?'
      : 'Next: coverage area. How far (in km) from your base do you travel for events?',
    portfolio: `Everything I can set up is done ✅. Only your portfolio is left — it needs photo/video uploads, so add it from the Portfolio page whenever you like.${contactQuestion(vendor)}`,
  }[next.key];
  if (next.key === 'profile') {
    return { text: `\n${brandQuestion(vendor)}`, actions: [], setup };
  }
  return {
    text: `\n${ask}`,
    actions: next.key === 'portfolio' ? [{ label: 'Add portfolio', to: next.to }] : [{ label: `${next.short} manually`, to: next.to }],
    setup,
  };
}

async function saveTurn(sessionId, text, reply, actions, pending) {
  await VendorAuraMessage.insertMany([
    { session: sessionId, role: 'user', content: text },
    { session: sessionId, role: 'model', content: reply, actions },
  ]);
  await VendorAuraSession.updateOne({ _id: sessionId }, { $set: { updatedAt: new Date(), pending: pending ?? null } });
}

export async function chat({ vendor, user, sessionId, message, page, confirm }, options = {}) {
  const tracker = createPerformanceTracker();
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) throw httpError(400, 'MESSAGE_REQUIRED');
  if (text.length > MAX_MESSAGE) throw httpError(400, 'MESSAGE_TOO_LONG');
  if (!isValidSessionId(sessionId)) throw httpError(400, 'INVALID_SESSION_ID');

  const session = await ensureSession(sessionId, vendor._id, user._id);

  // ── A setup action is waiting for "yes" / "no" (button or words/voice) ──────
  if (session.pending) {
    const answer = typeof confirm === 'boolean' ? confirm : readConfirmation(text);
    if (answer === true) {
      let reply;
      let actions = [];
      let setup = null;
      try {
        const result = await executeAction(vendor, session.pending);
        if (session.pending.kind === 'block_date') {
          const actionWord = result?.isUpdate || session.pending.isUpdate ? 'Updated' : 'Blocked';
          reply = `✅ ${actionWord} ${session.pending.blockout.date} on your calendar${session.pending.blockout.reason ? ` (Reason: ${session.pending.blockout.reason})` : ''}.`;
          actions = [
            { label: 'View Calendar', to: '/vendor/calendar' },
            { label: 'Availability', to: '/vendor/availability' },
          ];
        } else if (session.pending.kind === 'revise_quote') {
          reply = `✅ Revised offer sent for quote ${session.pending.quote.quoteRef || ''} (${session.pending.quote.customerName || 'customer'}) — Total ₹${Number(session.pending.quote.totalAmount).toLocaleString('en-IN')}.`;
          actions = [{ label: 'View Quotes', to: '/vendor/quotes' }];
        } else if (session.pending.kind === 'create_quote') {
          reply = `✅ Quotation sent to ${session.pending.quote.customerName || 'customer'} for ${session.pending.quote.serviceName} — Total ₹${Number(session.pending.quote.totalAmount).toLocaleString('en-IN')}.`;
          actions = [{ label: 'View Quotes', to: '/vendor/quotes' }];
        } else {
          const activation = result;
          const next = nextStepText(activation, vendor);
          setup = next.setup;
          reply = `✅ Saved — ${describeAction(session.pending)}.${next.text}`;
          actions = next.actions;
        }
      } catch (err) {
        console.warn('[vendor-aura] setup action failed:', err?.message || err);
        reply = "Sorry, I couldn't save that. Please try again, or do it from the page below.";
        if (session.pending.kind === 'block_date') {
          actions = [{ label: 'Availability', to: '/vendor/availability' }];
        } else if (session.pending.kind === 'revise_quote' || session.pending.kind === 'create_quote') {
          actions = [{ label: 'Quotes', to: '/vendor/quotes' }];
        } else {
          actions = [{ label: 'Open Services', to: '/vendor/services' }];
        }
      }
      await saveTurn(sessionId, text, reply, actions, null);
      return { reply, actions, fallback: false, profileUpdated: Boolean(setup), setup, pending: null };
    }
    if (answer === false) {
      const reply = "Okay, I didn't save it. Tell me what to change, or ask me anything else.";
      await saveTurn(sessionId, text, reply, [], null);
      return { reply, actions: [], fallback: false, profileUpdated: false, setup: null, pending: null };
    }
    if (!isMessageRelevantToPending(session.pending, text)) {
      session.pending = null;
      await VendorAuraSession.updateOne({ _id: sessionId }, { $set: { pending: null } });
    }
  }

  tracker.markContextStart();
  if (options.onStatus) options.onStatus('context_retrieval');
  const [context, recent] = await Promise.all([
    buildVendorContext(vendor, { page: typeof page === 'string' ? page : null }),
    VendorAuraMessage.find({ session: sessionId }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY).lean(),
  ]);
  context.waitingForConfirmation = session.pending ? describeAction(session.pending) : null;
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));
  tracker.markContextEnd();

  const route = classifyAuraRequest(text, { intent: 'VENDOR_ASSISTANT' });
  if (options.onStatus) options.onStatus(route.stage);

  let reply = FALLBACK_REPLY;
  let actions = [{ label: 'Open dashboard', to: '/vendor/dashboard' }];
  let fallback = true;
  let extractedProfile = {};
  let proposed = null;

  tracker.markGeminiStart();
  try {
    const res = await getLlmAdapter().chat({
      systemPrompt: buildVendorSystemPrompt(context),
      history,
      message: text,
      model: route.model,
      thinkingLevel: route.thinkingLevel,
      onChunk: options.onChunk ? (token) => {
        tracker.markFirstToken();
        options.onChunk(token);
      } : undefined,
      onStatus: options.onStatus,
    });
    if (res?.text) {
      reply = res.text.slice(0, 4000);
      actions = cleanActions(res.actions);
      if (/^\s*(talk\s*in|speak\s*in|speak|can\s*you\s*talk|can\s*you\s*speak|bangla|english|hindi|hello|hi|hey|good\s*morning|good\s*evening|thik\s*ache|theek\s*hai)\b/i.test(text)) {
        actions = [];
      }
      extractedProfile = res.profile || {};
      proposed = res.setupAction || null;
      fallback = false;
    }
  } catch (err) {
    console.warn('[vendor-aura] LLM failed, using fallback:', err?.code || err?.message || err);
  }
  tracker.markGenerationEnd();

  // Brand basics: save what the vendor stated, then say exactly what was saved
  // (the server writes this line, so the reply never claims a save that didn't happen).
  let setup = null;
  const lastAura = [...history].reverse().find((m) => m.role === 'model')?.content || '';
  const askedAbout = /about your work/i.test(lastAura);
  const { saved, activation } = await applyProfileFromChat(vendor, extractedProfile, text, { askedAbout }).catch((err) => {
    console.warn('[vendor-aura] profile save failed:', err?.message || err);
    return { saved: [], activation: null };
  });
  // Other setup steps: the model proposes, the server validates, the vendor confirms.
  let pending = session.pending || null;
  let proposal = null;
  let missingForProposal = null;

  // Fallback: If vendor asked to edit/change a blocked date reason but the model missed setupAction
  if (!proposed && /(?:reason|notes?)\s*(?:edit|change|badlo|badal|update|karo)|(?:edit|change|update)\s*(?:the\s*)?(?:reason|notes?)/i.test(text)) {
    const targetDate = dateIn(text) || (context?.blockedDates?.length ? context.blockedDates[context.blockedDates.length - 1]?.date : null);
    const newReason = reasonFrom(text);
    if (targetDate && newReason) {
      proposed = { kind: 'block_date', blockout: { date: targetDate, reason: newReason } };
      fallback = false;
    }
  }

  if (proposed?.kind && !fallback) {
    const said = [...history.filter((m) => m.role === 'user').slice(-6).map((m) => m.content), text].join('\n');
    const services = await VendorService.find({ vendor: vendor._id }).lean();
    const { action, error } = validateAction(proposed, { said, vendor, services, context });
    if (action) pending = proposal = action;
    else missingForProposal = error;
  }

  // When the app adds its own lines (saved / confirm / next question), the model's
  // questions and any "I saved it" claims are dropped — only the server reports saves.
  if (saved.length || proposal || missingForProposal) {
    const head = withoutClaims(withoutQuestions(reply));
    const parts = [head || (proposal ? 'Great, here is what I will do:' : 'Got it!')];
    if (saved.length) parts.push(`\n✅ Saved to your profile — ${saved.map((s) => `${s.label}: ${s.value}`).join(' · ')}.`);
    if (proposal) {
      if (proposal.kind === 'block_date') {
        const actionVerb = proposal.isUpdate ? 'update' : 'block';
        const confirmBtn = proposal.isUpdate ? '✓ Confirm Update' : '✓ Confirm Block';
        parts.push(`\n📝 ${describeAction(proposal)}\nShall I ${actionVerb} this date? Click “${confirmBtn}” or say “yes” to confirm, or “cancel”.`);
        actions = dedupeActions([{ label: 'Availability', to: '/vendor/availability' }, { label: 'Calendar', to: '/vendor/calendar' }, ...actions]).slice(0, MAX_ACTIONS);
      } else if (proposal.kind === 'revise_quote') {
        parts.push(`\n📝 ${describeAction(proposal)}\nShall I send this revised offer? Click “✓ Send Revised Offer” or say “yes” to confirm, or “cancel”.`);
        actions = dedupeActions([{ label: 'Quotes', to: '/vendor/quotes' }, ...actions]).slice(0, MAX_ACTIONS);
      } else if (proposal.kind === 'create_quote') {
        parts.push(`\n📝 ${describeAction(proposal)}\nShall I send this quotation? Click “✓ Send Quote” or say “yes” to confirm, or “cancel”.`);
        actions = dedupeActions([{ label: 'Quotes', to: '/vendor/quotes' }, ...actions]).slice(0, MAX_ACTIONS);
      } else {
        parts.push(`\n📝 ${describeAction(proposal)}\nShall I save this? Say “yes” to save or “no” to cancel.`);
      }
    } else if (missingForProposal) {
      parts.push(`I still need ${missingForProposal} — what is it?`);
    } else if (missingBrand(vendor).length) {
      parts.push(brandQuestion(vendor));
      setup = setupSummary(activation);
    } else {
      const next = nextStepText(activation, vendor);
      setup = next.setup;
      parts.push(next.text.trim());
      actions = dedupeActions([...next.actions, ...actions]).slice(0, MAX_ACTIONS);
    }
    if (saved.length && !setup) setup = setupSummary(activation);
    reply = parts.filter(Boolean).join('\n');
  }

  await saveTurn(sessionId, text, reply, actions, pending);
  return {
    reply,
    actions,
    fallback,
    profileUpdated: saved.length > 0,
    setup,
    pending: pendingView(pending),
    metrics: tracker.getMetrics(),
    model: route.model,
    thinkingLevel: route.thinkingLevel,
  };
}

/** Optional profile details still empty (phone, about) — asked once setup steps are done. */
function contactQuestion(vendor) {
  const want = [!vendor?.phone && 'your contact number', !vendor?.bio && 'a line about your work'].filter(Boolean);
  return want.length ? ` Meanwhile, tell me ${want.join(' and ')}, and I’ll add it to your profile.` : '';
}

/** Ask for exactly what the brand step still lacks (with the category choices when needed). */
function brandQuestion(vendor) {
  const missing = missingBrand(vendor);
  if (!missing.length) return 'Please check your brand details on the Profile page.';
  const ask = missing[0] === 'category' ? `What's your main category — ${CATEGORIES.join(', ')}?` : `What's your ${missing[0]}?`;
  return `Still needed for your brand: ${missing.join(', ')}. ${ask}`;
}

/** Drop sentences where the model claims something was saved — only the server says that. */
export function withoutClaims(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/\bsav(e|ed|ing)\b|\bupdat(e|ed|ing)\b|\badded\b|save kar|update kar|kar liya|kar li hai|kar diya|kar di hai|set kar (rahe|diya|di)/i.test(s))
    .join(' ')
    .trim();
}

function missingBrand(vendor) {
  const missing = [];
  if (isAutoBusinessName(vendor.businessName)) missing.push('business name');
  if (!vendor.category) missing.push('category');
  if (!vendor.location) missing.push('city');
  return missing;
}

/** Drop question sentences ("Which city are you in?") from the model's text. */
export function withoutQuestions(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !s.trim().endsWith('?'))
    .join(' ')
    .trim();
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((a) => (seen.has(a.to) ? false : seen.add(a.to)));
}
