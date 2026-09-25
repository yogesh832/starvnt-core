import { createGeminiAdapter } from './geminiAdapter.js';

/**
 * Provider-agnostic LLM boundary.
 * An adapter is `{ chat({ systemPrompt, history, message }) → { text, extracted } }`.
 * Tests register a scripted adapter; production lazily uses Gemini.
 */
let registered = null;
let gemini = null;

export function registerLlmAdapter(adapter) {
  registered = adapter;
}

export function getLlmAdapter() {
  if (registered) return registered;
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (provider !== 'gemini') throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  gemini ||= createGeminiAdapter();
  return gemini;
}
