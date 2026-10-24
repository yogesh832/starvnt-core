import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

let sent;
globalThis.__testExternalApi = { call: async (path, options) => { sent = { path, ...options }; return { ok: true }; } };
const source = (await readFile(new URL('../src/pages/customer/customerApi.js', import.meta.url), 'utf8'))
  .replace("import { externalApi } from '../../lib/api.js';", 'const externalApi = globalThis.__testExternalApi;');
const { customerApi } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('customer media uploads use the POST route with a multipart file', async () => {
  const file = new Blob(['sample'], { type: 'video/mp4' });
  await customerApi.uploadMedia(file, 'clip.mp4');
  assert.equal(sent.path, '/media/upload');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.body.get('file').name, 'clip.mp4');
  assert.equal(sent.body.get('mediaType'), 'VIDEO');
});

test('customer data URL uploads use the POST JSON route', async () => {
  await customerApi.uploadMedia('data:image/png;base64,YQ==', 'photo.png');
  assert.equal(sent.path, '/media/upload');
  assert.equal(sent.method, 'POST');
  assert.deepEqual(sent.body, { file: 'data:image/png;base64,YQ==', filename: 'photo.png', mediaType: 'IMAGE' });
});
