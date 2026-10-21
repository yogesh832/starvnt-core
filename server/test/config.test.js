import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('optional AI routes load without provider credentials', () => {
  const route = new URL('../src/external/routes/ai.routes.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(route)});`], {
    env: { ...process.env, GEMINI_API_KEY: '', OPENAI_API_KEY: '', OPENAI_ADMIN_KEY: '' },
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(child.status, 0, child.stderr);
});

test('server env loads from outside its directory and never overrides injected settings', () => {
  const root = mkdtempSync(fileURLToPath(new URL('.config-test-', import.meta.url)));
  try {
    mkdirSync(join(root, 'src'));
    copyFileSync(fileURLToPath(new URL('../src/config.js', import.meta.url)), join(root, 'src/config.mjs'));
    writeFileSync(join(root, '.env'), 'GEMINI_API_KEY=fixture-key\nGEMINI_MODEL=fixture-model\n');
    const env = { ...process.env };
    delete env.GEMINI_API_KEY;
    delete env.GEMINI_MODEL;
    delete env.DOTENV_CONFIG_PATH;
    delete env.STARVNT_ENV_FILE;
    const code = "import {config} from './config.mjs'; console.log(JSON.stringify({key:config.geminiApiKey,model:config.geminiModel}));";
    const run = (overrides = {}) => {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: join(root, 'src'), env: { ...env, ...overrides }, encoding: 'utf8',
      });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout.trim());
    };
    assert.deepEqual(run(), { key: 'fixture-key', model: 'fixture-model' });
    writeFileSync(join(root, '.env.qa'), 'GEMINI_MODEL=isolated-qa-model\n');
    assert.deepEqual(run({ STARVNT_ENV_FILE: join(root, '.env.qa') }), { key: '', model: 'isolated-qa-model' });
    assert.deepEqual(run({ GEMINI_API_KEY: 'injected-key', GEMINI_MODEL: 'injected-model' }), {
      key: 'injected-key', model: 'injected-model',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
