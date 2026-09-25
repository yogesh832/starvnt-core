import { GoogleGenAI, Type } from '@google/genai';

const TIMEOUT_MS = 12000;
const ATTEMPTS = 3;

const str = { type: Type.STRING, nullable: true };
const num = { type: Type.NUMBER, nullable: true };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    extracted: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        eventType: str,
        date: str,
        guestCount: num,
        budget: num,
        city: str,
        photographyStyle: str,
        cateringCuisine: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        decorTheme: str,
        newEventType: str,
        newEventDate: str,
        newEventGuestCount: num,
        newEventBudget: num,
        newEventCity: str,
        providedCategory: str,
        providedValue: str,
        needsHelpCategory: str,
        tentativeCategory: str,
        neededCategories: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
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
          return { text: String(parsed.reply || '').trim(), extracted: parsed.extracted || {} };
        } catch (err) {
          lastErr = err;
          console.warn(`[aura] Gemini attempt ${attempt} failed:`, err?.message || err);
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
