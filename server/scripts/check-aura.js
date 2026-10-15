import { getLlmAdapter } from '../src/external/aura/llmAdapter.js';
import { buildVendorSystemPrompt } from '../src/external/aura/vendorSystemPrompt.js';
import { classifyAuraRequest } from '../src/common/auraRouter.js';

// No database access, profile changes, chat persistence, or credential output.
const message = 'Mera photography ka business hai';
const route = classifyAuraRequest(message, { intent: 'VENDOR_ASSISTANT' });
console.log(JSON.stringify({
  provider: process.env.LLM_PROVIDER || 'gemini',
  keyConfigured: Boolean(process.env.GEMINI_API_KEY),
  model: route.model,
}));

// SDK error messages can contain request URLs; show only known-safe codes.
console.warn = () => {};
try {
  const response = await getLlmAdapter().chat({
    systemPrompt: buildVendorSystemPrompt({
      business: { category: 'Photography', matchingEligible: false },
      profileSetup: { brand: { businessName: null, category: 'Photography', city: null } },
    }),
    message,
    model: route.model,
    thinkingLevel: route.thinkingLevel,
    onChunk: () => {},
  });
  console.log(JSON.stringify({ ok: true, model: response.model, reply: response.text }));
} catch (error) {
  const status = Number(error.status ?? error.code) || null;
  const code = ['LLM_NOT_CONFIGURED', 'LLM_TIMEOUT'].includes(error.code) ? error.code : 'PROVIDER_ERROR';
  console.error(JSON.stringify({ ok: false, status, code }));
  process.exitCode = 1;
}
