import { GoogleGenAI, Type } from '@google/genai';
import { extractReplyChunk } from '../../common/streamUtils.js';

const TIMEOUT_MS = 15000;
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
        venueName: str,
        area: str,
        state: str,
        country: str,
        pincode: str,
        address: str,
        landmark: str,
        budgetMin: num,
        budgetMax: num,
        serviceLocations: {
          type: Type.ARRAY,
          nullable: true,
          items: {
            type: Type.OBJECT,
            properties: { category: str, place: str, pickup: str, drop: str, atEventVenue: { type: Type.BOOLEAN, nullable: true } },
          },
        },
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
  const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const defaultThinking = process.env.GEMINI_THINKING_LEVEL || 'minimal';

  if (!apiKey) {
    return {
      async chat() {
        throw Object.assign(new Error('GEMINI_API_KEY is not set'), { code: 'LLM_NOT_CONFIGURED' });
      },
    };
  }
  const ai = new GoogleGenAI({ apiKey });

  return {
    async chat({ systemPrompt, history = [], message, model, thinkingLevel, onChunk, onStatus }) {
      const selectedModel = model || defaultModel;
      const selectedThinking = thinkingLevel || defaultThinking;

      const contents = [
        ...history.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const genConfig = {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: {
          thinkingLevel: selectedThinking,
        },
      };

      let lastErr;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          if (typeof onChunk === 'function') {
            if (typeof onStatus === 'function') onStatus('generating');
            const streamRes = await ai.models.generateContentStream({
              model: selectedModel,
              contents,
              config: { ...genConfig, abortSignal: controller.signal },
            });

            let fullText = '';
            let lastStreamedLength = 0;

            for await (const chunk of streamRes) {
              const textChunk = chunk?.text || '';
              fullText += textChunk;

              const { chunk: incrementalText, newLength } = extractReplyChunk(fullText, lastStreamedLength);
              if (incrementalText) {
                lastStreamedLength = newLength;
                onChunk(incrementalText);
              }
            }

            let parsed = {};
            try {
              parsed = JSON.parse(fullText || '{}');
            } catch {
              const replyMatch = fullText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
              parsed = { reply: replyMatch ? replyMatch[1] : fullText, extracted: {} };
            }

            return {
              text: String(parsed.reply || '').trim(),
              extracted: parsed.extracted || {},
              model: selectedModel,
              thinkingLevel: selectedThinking,
            };
          } else {
            const res = await ai.models.generateContent({
              model: selectedModel,
              contents,
              config: { ...genConfig, abortSignal: controller.signal },
            });
            const parsed = JSON.parse(res.text || '{}');
            return {
              text: String(parsed.reply || '').trim(),
              extracted: parsed.extracted || {},
              model: selectedModel,
              thinkingLevel: selectedThinking,
            };
          }
        } catch (err) {
          lastErr = err;
          console.warn(`[aura] Gemini attempt ${attempt} (${selectedModel}) failed:`, err?.message || err);
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
