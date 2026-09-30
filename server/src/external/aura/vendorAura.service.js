import { VendorAuraSession, VendorAuraMessage } from '../models/VendorAura.js';
import { VendorService } from '../models/VendorService.js';
import { getLlmAdapter } from './llmAdapter.js';
import { buildVendorContext, PAGES, setupSummary, isAutoBusinessName } from './vendorContext.js';
import { applyProfileFromChat } from './profileWriter.js';
import { validateAction, describeAction, executeAction, readConfirmation } from './setupActions.js';
import { buildVendorSystemPrompt } from './vendorSystemPrompt.js';

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

const pendingView = (p) => (p ? { kind: p.kind, summary: describeAction(p) } : null);

export async function getSession({ vendor, sessionId }) {
  if (!isValidSessionId(sessionId)) throw httpError(400, 'INVALID_SESSION_ID');
  const session = await ownedSession(sessionId, vendor._id);
  if (!session) return { sessionId, messages: [], pending: null };
  const messages = await VendorAuraMessage.find({ session: sessionId }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
  return { sessionId, messages: messages.map(serialize), pending: pendingView(session.pending) };
}

/** What Aura+ says after a setup step is saved: the next step, as a question it can act on. */
function nextStepText(activation) {
  const setup = setupSummary(activation);
  const next = setup?.nextStep;
  if (!setup) return { text: '', actions: [], setup };
  if (!next) return { text: '\n🎉 Your profile setup is complete — customers can now find and book you.', actions: [], setup };
  const c = activation.checklist;
  const ask = {
    services: "Next: your first service. What service do you offer, and what's your base price?",
    capabilities: 'Next: team & equipment. How many people are in your team, and what main equipment do you use?',
    coverage: !c.locations
      ? 'Next: your studio / office location. Which area and city is it in?'
      : 'Next: coverage area. How far (in km) from your base do you travel for events?',
    portfolio: 'Last step: add a portfolio project with a few photos or videos — that needs an upload, so tap below.',
  }[next.key];
  if (next.key === 'profile') {
    return { text: '\nNext: your brand details — business name, category and city.', actions: [], setup };
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

export async function chat({ vendor, user, sessionId, message, page, confirm }) {
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
        const activation = await executeAction(vendor, session.pending);
        const next = nextStepText(activation);
        setup = next.setup;
        reply = `✅ Saved — ${describeAction(session.pending)}.${next.text}`;
        actions = next.actions;
      } catch (err) {
        console.warn('[vendor-aura] setup action failed:', err?.message || err);
        reply = "Sorry, I couldn't save that. Please try again, or do it from the page below.";
        actions = [{ label: 'Open Services', to: '/vendor/services' }];
      }
      await saveTurn(sessionId, text, reply, actions, null);
      return { reply, actions, fallback: false, profileUpdated: Boolean(setup), setup, pending: null };
    }
    if (answer === false) {
      const reply = "Okay, I didn't save it. Tell me what to change, or ask me anything else.";
      await saveTurn(sessionId, text, reply, [], null);
      return { reply, actions: [], fallback: false, profileUpdated: false, setup: null, pending: null };
    }
    // Anything else (e.g. "make it 30k") goes to the model, which can propose a corrected action.
  }

  const [context, recent] = await Promise.all([
    buildVendorContext(vendor, { page: typeof page === 'string' ? page : null }),
    VendorAuraMessage.find({ session: sessionId }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY).lean(),
  ]);
  context.waitingForConfirmation = session.pending ? describeAction(session.pending) : null;
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));

  let reply = FALLBACK_REPLY;
  let actions = [{ label: 'Open dashboard', to: '/vendor/dashboard' }];
  let fallback = true;
  let extractedProfile = {};
  let proposed = null;
  try {
    const res = await getLlmAdapter().chat({ systemPrompt: buildVendorSystemPrompt(context), history, message: text });
    if (res?.text) {
      reply = res.text.slice(0, 4000);
      actions = cleanActions(res.actions);
      extractedProfile = res.profile || {};
      proposed = res.setupAction || null;
      fallback = false;
    }
  } catch (err) {
    console.warn('[vendor-aura] LLM failed, using fallback:', err?.code || err?.message || err);
  }

  // Brand basics: save what the vendor stated, then say exactly what was saved
  // (the server writes this line, so the reply never claims a save that didn't happen).
  let setup = null;
  const { saved, activation } = await applyProfileFromChat(vendor, extractedProfile, text).catch((err) => {
    console.warn('[vendor-aura] profile save failed:', err?.message || err);
    return { saved: [], activation: null };
  });
  if (saved.length) {
    // The model often re-asks for what was just saved; the app asks the next question itself.
    reply = `${withoutQuestions(reply) || 'Got it!'}\n\n✅ Saved to your profile — ${saved.map((s) => `${s.label}: ${s.value}`).join(' · ')}.`;
    const missing = missingBrand(vendor);
    if (missing.length) {
      reply += `\nStill needed for your brand: ${missing.join(', ')}. What's your ${missing[0]}?`;
      setup = setupSummary(activation);
    } else {
      const next = nextStepText(activation);
      setup = next.setup;
      reply += next.text;
      actions = dedupeActions([...next.actions, ...actions]).slice(0, MAX_ACTIONS);
    }
  }

  // Other setup steps: the model proposes, the server validates, the vendor confirms.
  let pending = session.pending || null;
  if (proposed?.kind && !fallback) {
    const said = [...history.filter((m) => m.role === 'user').slice(-6).map((m) => m.content), text].join('\n');
    const services = await VendorService.find({ vendor: vendor._id }).lean();
    const { action, error } = validateAction(proposed, { said, vendor, services });
    if (action) {
      pending = action;
      reply = `${withoutQuestions(reply) || 'Great, here is what I will save:'}\n\n📝 ${describeAction(action)}\nShall I save this? Say “yes” to save or “no” to cancel.`;
    } else if (error) {
      reply = `${withoutQuestions(reply) || 'Almost there.'} I still need ${error} — what is it?`;
    }
  }

  await saveTurn(sessionId, text, reply, actions, pending);
  return { reply, actions, fallback, profileUpdated: saved.length > 0, setup, pending: pendingView(pending) };
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
