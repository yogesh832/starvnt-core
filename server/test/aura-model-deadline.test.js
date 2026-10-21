import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

test('a timed-out model cannot start another full timeout after the overall turn budget expires', async () => {
  const previous = { ...process.env };
  let calls = 0;
  try {
    process.env.LLM_TIMEOUT_MS = '30'; process.env.LLM_ATTEMPTS = '1';
    process.env.GEMINI_API_KEY = 'unit-test-placeholder'; process.env.GEMINI_MODEL = 'fallback';
    process.env.AURA_MODEL_FALLBACKS = 'second-fallback';
    const module = { exports: {} };
    const code = transformSync(readFileSync(new URL('../src/customer/aura/geminiAdapter.js', import.meta.url), 'utf8'), { format: 'cjs' }).code;
    new Function('require', 'module', 'exports', code)(name => name === '@google/genai' ? { Type: {}, GoogleGenAI: class { models = { generateContent: () => { calls++; return new Promise(() => {}); } }; } } : { extractReplyChunk() {} }, module, module.exports);
    await assert.rejects(module.exports.createGeminiAdapter().chat({ message: 'Hello', model: 'primary' }), error => error.code === 'LLM_TIMEOUT');
    assert.equal(calls, 1, 'Fallback must not restart the expired turn budget');
  } finally {
    for (const key of ['LLM_TIMEOUT_MS', 'LLM_ATTEMPTS', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'AURA_MODEL_FALLBACKS']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
