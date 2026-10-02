import { config } from '../config.js';

const COMPLEX_KEYWORDS_RE = /\b(recommend|suggest|compare|comparison|best|match|matching|pricing|cost|quote|quotation|conflict|risk|analysis|analyse|analyze|portfolio|opportunity|gaps?|which|why|difference|cheapest|package|calculate|itinerary)\b/i;
const COMPLEX_PHRASES_RE = /(which (vendor|photographer|venue|caterer|decor|service)|how much (would|will|does)|what is the difference|should i pick|who is best|can you analyze|give me options)/i;

/**
 * Lightweight deterministic request classifier for Aura+ request routing.
 * Routes fast path requests to Gemini 3.5 Flash-Lite (thinking=minimal)
 * and complex reasoning requests to Gemini 3.8 Flash (thinking=low).
 * 
 * @param {string} message - User chat message
 * @param {object} [context] - Optional conversation context / metadata
 * @returns {object} Router decision { model, thinkingLevel, isComplex, stage }
 */
export function classifyAuraRequest(message = '', context = {}) {
  const text = String(message || '').trim();
  
  let isComplex = false;

  // 1. Context hint (e.g. comparing options or vendor matching requested)
  if (context.forceComplex || context.intent === 'VENDOR_MATCH' || context.intent === 'COMPARE_OPTIONS') {
    isComplex = true;
  } 
  // 2. Keyword & phrase heuristics
  else if (text.length > 250 || COMPLEX_PHRASES_RE.test(text) || COMPLEX_KEYWORDS_RE.test(text)) {
    isComplex = true;
  }

  const model = isComplex ? config.auraReasoningModel : config.geminiModel;
  const thinkingLevel = isComplex ? config.auraReasoningLevel : config.geminiThinkingLevel;

  return {
    model,
    thinkingLevel,
    isComplex,
    stage: isComplex ? 'reasoning' : 'context_retrieval',
  };
}
