import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { test } from 'node:test';
import ts from 'typescript';
import express from 'express';
import { createClient } from '../src/api/client.ts';
import { createVoiceRouter } from '../../server/src/external/routes/voice.routes.js';

// Exercise the installed SDK's actual multipart encoder and FormData patch.
// Substitute only the native File handle with its documented bytes interface.
const moduleUrl = (source: string) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const expo = new URL('../node_modules/expo/src/', import.meta.url);
const blobUtils = moduleUrl(await readFile(new URL('utils/blobUtils.ts', expo), 'utf8'));
const encoderSource = await readFile(new URL('winter/fetch/convertFormData.ts', expo), 'utf8');
const { convertFormDataAsync } = await import(moduleUrl(encoderSource.replace('../../utils/blobUtils', blobUtils)));
const { installFormDataPatch } = await import(moduleUrl(await readFile(new URL('winter/FormData.ts', expo), 'utf8')));
class NativeFormData { _parts: unknown[] = []; }
const ExpoFormData = installFormDataPatch(NativeFormData);

test('Expo 57 reproduces URI-only audio failure and sends File bytes through authenticated voice HTTP', async t => {
  const originalFormData = globalThis.FormData;
  globalThis.FormData = ExpoFormData;
  t.after(() => { globalThis.FormData = originalFormData; });
  const nativeFetch = fetch;
  const expoFetch = (async (url: string, init: RequestInit) => {
    const encoded = await convertFormDataAsync(init.body);
    return nativeFetch(url, { ...init, body: encoded.body, headers: {
      ...init.headers, 'Content-Type': `multipart/form-data; boundary=${encoded.boundary}`,
    } });
  }) as typeof fetch;
  const vault = () => ({ get: async () => null, set: async () => {}, clear: async () => {} });
  const api = createClient('http://unused.test/api', vault(), expoFetch);
  const legacy = new FormData();
  legacy.append('file', { uri: 'file:///recording.m4a', name: 'recording.m4a', type: 'audio/mp4' } as any);
  await assert.rejects(api.call('/ai/transcribe', 'POST', legacy), /file could not be prepared for upload/);

  const audio = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 52, 97]);
  let received = false;
  const app = express();
  app.use('/api/ai', createVoiceRouter({
    authenticate: (req: any, res: any, next: any) => req.get('Authorization') === 'Bearer test-access' ? next() : res.sendStatus(401),
    transcribe: async (file: any) => {
      received = true;
      assert.equal(file.mimetype, 'audio/mp4');
      assert.equal(file.originalname, 'recording.m4a');
      assert.deepEqual(new Uint8Array(file.buffer), audio);
      return { text: 'Plan a birthday in Delhi', language: 'eng' };
    },
  }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const connected = createClient(`http://127.0.0.1:${(server.address() as any).port}/api`, vault(), expoFetch);
  await connected.accept({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  const body = new FormData();
  body.append('file', { name: 'recording.m4a', type: 'audio/mp4', bytes: async () => audio } as any);
  assert.deepEqual(await connected.call('/ai/transcribe', 'POST', body), { text: 'Plan a birthday in Delhi', language: 'eng' });
  assert.equal(received, true);
});
