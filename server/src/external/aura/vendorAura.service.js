import { VendorAuraSession, VendorAuraMessage } from '../models/VendorAura.js';
import { getLlmAdapter } from './llmAdapter.js';
import { buildVendorContext, PAGES, setupSummary, isAutoBusinessName } from './vendorContext.js';
import { applyProfileFromChat } from './profileWriter.js';
import { buildVendorSystemPrompt } from './vendorSystemPrompt.js';

/**
 * Vendor Aura+ chat. It answers from the vendor's own data and suggests pages.
 * Its only write is profile setup (brand name, category, city — see profileWriter.js);
 * quotes, bookings, payments and availability are never touched.
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

export async function getSession({ vendor, sessionId }) {
  if (!isValidSessionId(sessionId)) throw httpError(400, 'INVALID_SESSION_ID');
  const session = await ownedSession(sessionId, vendor._id);
  if (!session) return { sessionId, messages: [] };
  const messages = await VendorAuraMessage.find({ session: sessionId }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
  return { sessionId, messages: messages.map(serialize) };
}

export async function chat({ vendor, user, sessionId, message, page }) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) throw httpError(400, 'MESSAGE_REQUIRED');
  if (text.length > MAX_MESSAGE) throw httpError(400, 'MESSAGE_TOO_LONG');
  if (!isValidSessionId(sessionId)) throw httpError(400, 'INVALID_SESSION_ID');

  await ensureSession(sessionId, vendor._id, user._id);

  const [context, recent] = await Promise.all([
    buildVendorContext(vendor, { page: typeof page === 'string' ? page : null }),
    VendorAuraMessage.find({ session: sessionId }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY).lean(),
  ]);
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));

  let reply = FALLBACK_REPLY;
  let actions = [{ label: 'Open dashboard', to: '/vendor/dashboard' }];
  let fallback = true;
  let extractedProfile = {};
  try {
    const res = await getLlmAdapter().chat({ systemPrompt: buildVendorSystemPrompt(context), history, message: text });
    if (res?.text) {
      reply = res.text.slice(0, 4000);
      actions = cleanActions(res.actions);
      extractedProfile = res.profile || {};
      fallback = false;
    }
  } catch (err) {
    console.warn('[vendor-aura] LLM failed, using fallback:', err?.code || err?.message || err);
  }

  // Profile setup: save brand basics the vendor stated, then say exactly what was saved
  // (the server writes this line, so the reply never claims a save that didn't happen).
  let setup = null;
  const { saved, activation } = await applyProfileFromChat(vendor, extractedProfile, text).catch((err) => {
    console.warn('[vendor-aura] profile save failed:', err?.message || err);
    return { saved: [], activation: null };
  });
  if (saved.length) {
    setup = setupSummary(activation);
    // The model often re-asks for what was just saved; the app asks the next question itself.
    reply = `${withoutQuestions(reply) || 'Got it!'}\n\n✅ Saved to your profile — ${saved.map((s) => `${s.label}: ${s.value}`).join(' · ')}.`;
    const next = setup?.nextStep;
    if (next) {
      const missing = missingBrand(vendor);
      reply += next.auraCanFill
        ? missing.length
          ? `\nStill needed for your brand: ${missing.join(', ')}. What's your ${missing[0]}?`
          : '\nPlease review your brand details on the Profile page.'
        : `\nNext step: ${next.step}. You can do it on the page below, or ask me how.`;
      if (!next.auraCanFill) actions = [{ label: `Next: ${next.short}`, to: next.to }, ...actions].slice(0, MAX_ACTIONS);
    } else if (setup?.complete) {
      reply += '\n🎉 Your profile setup is complete.';
    }
    actions = dedupeActions(actions);
  }

  await VendorAuraMessage.insertMany([
    { session: sessionId, role: 'user', content: text },
    { session: sessionId, role: 'model', content: reply, actions },
  ]);
  await VendorAuraSession.updateOne({ _id: sessionId }, { $set: { updatedAt: new Date() } });

  return { reply, actions, fallback, profileUpdated: saved.length > 0, setup };
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
