import { GoogleGenAI, Type } from '@google/genai';

const TIMEOUT_MS = 12000;
const ATTEMPTS = 3;

// Vendor Aura+ answers and points at pages. During profile setup it may extract
// the brand basics and propose setup actions (both validated server-side; actions
// are only saved after the vendor confirms).
const str = { type: Type.STRING, nullable: true };
const num = { type: Type.NUMBER, nullable: true };
const strList = { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    profile: {
      type: Type.OBJECT,
      nullable: true,
      properties: { businessName: str, category: str, city: str },
    },
    setupAction: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        kind: str, // service | capability | location | coverage
        service: { type: Type.OBJECT, nullable: true, properties: { name: str, category: str, pricingType: str, basePrice: num } },
        capability: { type: Type.OBJECT, nullable: true, properties: { serviceName: str, teamSize: num, equipment: strList, styles: strList, format: str } },
        location: { type: Type.OBJECT, nullable: true, properties: { label: str, type: str, address: str, locality: str, city: str, state: str, postalCode: str } },
        coverage: { type: Type.OBJECT, nullable: true, properties: { serviceName: str, radiusKm: num, city: str, localities: strList, outstationAllowed: { type: Type.BOOLEAN, nullable: true } } },
      },
    },
    actions: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: { label: { type: Type.STRING }, to: { type: Type.STRING } },
        required: ['label', 'to'],
      },
    },
  },
  required: ['reply'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err) {
  const status = err?.status ?? err?.code;
  if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  return true;
}

export function createGeminiAdapter() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  if (!apiKey) {
    return {
      async chat() {
        throw Object.assign(new Error('GEMINI_API_KEY is not set'), { code: 'LLM_NOT_CONFIGURED' });
      },
    };
  }
  const ai = new GoogleGenAI({ apiKey });

  return {
    async chat({ systemPrompt, history = [], message }) {
      const contents = [
        ...history.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: message }] },
      ];
      let lastErr;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const res = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.3,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
              abortSignal: controller.signal,
            },
          });
          const parsed = JSON.parse(res.text || '{}');
          return {
            text: String(parsed.reply || '').trim(),
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {},
            setupAction: parsed.setupAction && typeof parsed.setupAction === 'object' ? parsed.setupAction : null,
          };
        } catch (err) {
          lastErr = err;
          console.warn(`[vendor-aura] Gemini attempt ${attempt} failed:`, err?.message || err);
          if (!isRetryable(err) || attempt === ATTEMPTS) break;
          await sleep(500 * 2 ** (attempt - 1));
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastErr;
    },
  };
}
