import { test } from 'node:test';
import assert from 'node:assert/strict';

function browser(t) {
  const previous = { window: globalThis.window, document: globalThis.document };
  const scripts = [];
  globalThis.window = {};
  globalThis.document = {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { append: script => scripts.push(script) },
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return scripts;
}

test('concurrent Google sign-in requests share one SDK load and never fetch phone OTP', async t => {
  const scripts = browser(t);
  const { loadAuthScript } = await import('../src/lib/authScripts.js?dedupe');
  const first = loadAuthScript('google');
  const second = loadAuthScript('google');
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://accounts.google.com/gsi/client');
  window.google = { accounts: { id: {} } };
  scripts[0].onload();
  await first;
  await loadAuthScript('google');
  assert.equal(scripts.length, 1, 'an initialized SDK is reused');
});

test('a failed OTP download is removed and the next attempt can recover', async t => {
  const scripts = browser(t);
  const { loadAuthScript } = await import('../src/lib/authScripts.js?retry');
  const failed = loadAuthScript('phone');
  scripts[0].onerror();
  await assert.rejects(failed, /could not load/);
  assert.equal(scripts[0].removed, true);
  const retry = loadAuthScript('phone');
  assert.equal(scripts.length, 2);
  window.initSendOTP = () => {};
  scripts[1].onload();
  await retry;
});

test('a response without an initialized SDK fails and does not poison later retries', async t => {
  const scripts = browser(t);
  const { loadAuthScript } = await import('../src/lib/authScripts.js?invalid');
  const failed = loadAuthScript('google');
  scripts[0].onload();
  await assert.rejects(failed, /could not load/);
  const retry = loadAuthScript('google');
  window.google = { accounts: { id: {} } };
  scripts[1].onload();
  await retry;
  await assert.rejects(loadAuthScript('unknown'), /Unsupported/);
});
