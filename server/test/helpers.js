import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Test harness: an in-memory MongoDB (never Atlas), the real Express app,
 * and a scripted LLM adapter so tests never call real Gemini.
 */
let mongo;
let modules;

export async function setup() {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  // Must be set before config.js is imported (dotenv never overrides these).
  process.env.MONGO_URI_EXTERNAL = `${uri}starvnt_external_test`;
  process.env.MONGO_URI_ADMIN = `${uri}starvnt_admin_test`;
  process.env.NODE_ENV = 'test';
  // Some routes build an LLM client at import time; tests never call it (scripted adapter).
  process.env.GEMINI_API_KEY ||= 'test-key-never-used';

  const db = await import('../src/db/index.js');
  const { createApp } = await import('../src/app.js');
  const { ExternalUser } = await import('../src/external/models/ExternalUser.js');
  const { ExternalSession } = await import('../src/external/models/ExternalSession.js');
  const { signExternalAccessToken, generateRefreshToken, hashRefreshToken } = await import('../src/external/utils/tokens.js');
  const { registerLlmAdapter } = await import('../src/customer/aura/llmAdapter.js');
  const models = await import('../src/customer/models/index.js');

  const { config } = await import('../src/config.js');
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/.+_test$/.test(config.mongoUriExternal)) {
    throw new Error('Refusing to run tests against a non-test database');
  }
  await db.connectDB();
  await Promise.all(Object.values(models).filter((m) => m?.syncIndexes).map((m) => m.syncIndexes()));

  modules = { db, createApp, ExternalUser, ExternalSession, signExternalAccessToken, generateRefreshToken, hashRefreshToken, registerLlmAdapter, models };
  return { app: createApp(), models };
}

export async function teardown() {
  await modules?.db.disconnectDB();
  await mongo?.stop();
}

let counter = 0;

/** Create a user of the given type and return { user, token }. */
export async function makeUser(accountType = 'CUSTOMER') {
  const { ExternalUser, ExternalSession, signExternalAccessToken, generateRefreshToken, hashRefreshToken } = modules;
  counter += 1;
  const user = await ExternalUser.create({
    fullName: `Test ${accountType} ${counter}`,
    email: `t${counter}-${Date.now()}@example.com`,
    accountType,
  });
  const session = await ExternalSession.create({
    user: user._id,
    refreshTokenHash: hashRefreshToken(generateRefreshToken()),
    expiresAt: new Date(Date.now() + 86400000),
  });
  return { user, token: signExternalAccessToken(user, session._id) };
}

/**
 * Scripted LLM: each call pops the next scripted response
 * ({ text, extracted } or a function of the call, or an Error to throw).
 * `calls` records what the adapter received.
 */
export function scriptLlm(responses = []) {
  const queue = [...responses];
  const calls = [];
  modules.registerLlmAdapter({
    async chat(input) {
      calls.push(input);
      const next = queue.length ? queue.shift() : { text: 'OK', extracted: {} };
      const value = typeof next === 'function' ? next(input) : next;
      if (value instanceof Error) throw value;
      return value;
    },
  });
  return { calls, push: (...r) => queue.push(...r) };
}

export const sid = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** A far-future date so reruns never collide. */
export function uniqueDate() {
  const y = 2090 + Math.floor(Math.random() * 9);
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
