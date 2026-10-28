// Exercises the disposable preview with an isolated, headless browser profile.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4187';
const output = path.resolve('tmp/unified-acceptance');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'starvnt-unified-browser-'));
const browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browserClient, page;
const failures = [];
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let sequence = 0;
    const pending = new Map();
    socket.onopen = () => resolve({ socket, send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); } });
    socket.onerror = reject;
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (!message.id) return;
      const listener = pending.get(message.id); pending.delete(message.id);
      if (message.error) listener?.reject(new Error(message.error.message)); else listener?.resolve(message.result);
    };
  });
}
const evaluate = async expression => {
  const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) { try { if (await evaluate(expression)) return; } catch {} await pause(150); }
  throw new Error(`UI condition timed out: ${expression}`);
}
const navigate = async pathname => { await page.send('Page.navigate', { url: `${base}${pathname}` }); };
const screenshot = async name => { const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64')); };
async function viewport(width, height) { await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); } }
  assert.ok(port, 'Headless browser started');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  browserClient = await connect(version.webSocketDebuggerUrl);
  const target = await browserClient.send('Target.createTarget', { url: 'about:blank' });
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  page = await connect(tabs.find(tab => tab.id === target.targetId).webSocketDebuggerUrl);
  await page.send('Runtime.enable'); await page.send('Page.enable');
  await viewport(1366, 900);
  await navigate('/__acceptance/vendor');
  await waitFor(`document.body.innerText.includes('Profile Status') && !document.body.innerText.includes('Loading the current profile status') && document.body.innerText.includes('UNDER REVIEW')`);
  assert.equal(await evaluate(`document.body.innerText.includes('24 hours')`), false);
  assert.equal(await evaluate(`document.querySelector('a[href^="https://wa.me/"]')?.href.includes('919403891095')`), true);
  assert.equal(await evaluate(`document.querySelector('a[href^="tel:"]')?.getAttribute('href')`), 'tel:+919403891095');
  await screenshot('vendor-profile-desktop');
  await navigate('/vendor/calendar');
  await waitFor(`document.body.innerText.includes('Blocked Dates Registry')`);
  await viewport(390, 844);
  await screenshot('vendor-calendar-mobile');
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), 'Calendar fits a mobile viewport');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Block Date')).click()`);
  await waitFor(`!!document.querySelector('[role="dialog"]')`);
  await evaluate(`(() => { const inputs = [...document.querySelectorAll('[role="dialog"] input[type="date"]')]; for (const input of inputs) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2027-01-10'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await screenshot('vendor-commitment-form-mobile');
  await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent === 'Save record').click()`);
  await waitFor(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('2027-01-10')`);
  await viewport(1366, 900);
  await navigate('/__acceptance/admin');
  await waitFor(`document.body.innerText.includes('Availability & External Commitments') && document.body.innerText.includes('2027-01-10')`);
  assert.ok(await evaluate(`document.body.innerText.includes('Fixture Customer')`), 'Authorised Admin sees reported details');
  await screenshot('admin-availability-desktop');
  await navigate('/admin/product-outcomes');
  await waitFor(`document.body.innerText.includes('Calculation definitions and coverage')`);
  await screenshot('admin-product-outcomes');
  await navigate('/__acceptance/customer');
  await waitFor(`document.body.innerText.includes('Preview wedding') && document.body.innerText.includes('Confirm Aura suggestions')`);
  await screenshot('customer-dashboard-desktop');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Confirm this requirement').click()`);
  await waitFor(`!document.body.innerText.includes('Confirm Aura suggestions')`);
  await viewport(390, 844);
  await screenshot('customer-dashboard-mobile');
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), 'Customer dashboard fits a mobile viewport');
  assert.deepEqual(failures, [], 'No browser runtime exceptions');
  const report = { passed: true, checks: ['Backend profile status and support URLs', 'Mobile calendar layout', 'Create availability record through UI', 'Vendor record appears in Admin', 'Admin product metrics', 'Customer confirms inferred requirement', 'Mobile dashboard layout', 'No browser runtime exceptions'], screenshots: output, checkedAt: new Date().toISOString() };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page) { await screenshot('failure').catch(() => {}); console.error(await evaluate('JSON.stringify({url:location.href,text:document.body.innerText.slice(0,2500)})').catch(() => 'Page unavailable')); }
  console.error('Browser exceptions:', failures);
  throw error;
} finally {
  if (browserClient) await browserClient.send('Browser.close').catch(() => {});
  page?.socket.close(); browserClient?.socket.close();
  if (!browser.killed) browser.kill();
  // This path is generated above, never derived from browser/user content.
  const resolved = path.resolve(profile), root = path.resolve(tmpdir());
  if (resolved.startsWith(`${root}${path.sep}starvnt-unified-browser-`)) await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
