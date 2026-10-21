import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Supply Vite's compile-time env when exercising the actual browser API in Node.
const source = (await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')).replaceAll('import.meta.env', '({MODE:"development"})');
const { makeApi } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('stopping ElevenLabs playback aborts the underlying web API request', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }));
  };
  const api = makeApi('https://test.invalid/api', 'https://test.invalid/refresh');
  const request = api.raw('/ai/voice', { method: 'POST', body: { text: 'Hello' }, signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('voice cancellation survives a web session refresh and retry', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController(); let voices = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/refresh')) return new Response(JSON.stringify({ accessToken: 'new-test-token' }));
    assert.equal(options.signal, controller.signal);
    if (++voices === 1) return new Response('{}', { status: 401 });
    assert.equal(options.headers.Authorization, 'Bearer new-test-token');
    return new Response('audio');
  };
  const api = makeApi('https://test.invalid/api', 'https://test.invalid/refresh');
  const response = await api.raw('/ai/voice', { method: 'POST', body: { text: 'Hello' }, signal: controller.signal });
  assert.equal(await response.text(), 'audio'); assert.equal(voices, 2);
});

test('a refresh started before logout cannot restore its token', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let respond;
  globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
  const api = makeApi('https://test.invalid/api', 'https://test.invalid/refresh');
  api.setToken('old-token');
  const pending = api.refresh();
  api.setToken(null);
  respond(new Response(JSON.stringify({ accessToken: 'late-token' })));
  assert.equal(await pending, null);
  assert.equal(api.getToken(), null);
  assert.equal(await api.refresh(), null);
});

test('an old unauthorized request cannot clear a new sign-in or start a refresh after logout', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let respond, calls = 0;
  globalThis.fetch = () => { calls++; return new Promise(resolve => { respond = resolve; }); };
  const api = makeApi('https://test.invalid/api', 'https://test.invalid/refresh');
  api.setToken('old-token');
  const pending = api.raw('/customer/profile');
  api.setToken('new-token');
  respond(new Response('{}', { status: 401 }));
  await assert.rejects(pending);
  assert.equal(api.getToken(), 'new-token');
  assert.equal(calls, 1);
});
