import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../src/config.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
const base = option('--base', 'http://localhost:4000').replace(/\/$/, '');
const web = option('--web', 'http://localhost:5173').replace(/\/$/, '');
const devAuth = args.includes('--dev-auth');
if (devAuth && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Development quick sign-in smoke tests are limited to a local backend.');
}
const results = [];
async function request(path, { token, cookie, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  const cookies = response.headers.getSetCookie?.() || [];
  return { status: response.status, data, cookie: cookies.map((value) => value.split(';')[0]).join('; ') };
}
async function check(name, path, expected, options) {
  try {
    const response = await request(path, options);
    const pass = response.status === expected;
    results.push({ name, path, expected, actual: response.status, status: pass ? 'PASS' : 'FAIL', ...(response.data.error ? { error: response.data.error } : {}) });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status} (expected ${expected})`);
    return response;
  } catch {
    results.push({ name, path, status: 'FAIL', error: 'REQUEST_FAILED' });
    console.log(`FAIL ${name}: local request failed`);
    return null;
  }
}
await check('Backend health', '/api/health', 200);
await check('Anonymous admin dashboard API denied', '/api/admin/events?limit=1', 401);
await check('Anonymous vendor dashboard API denied', '/api/vendor/badge-counts', 401);
for (const path of ['/api/health', '/admin/dashboard', '/vendor/dashboard']) {
  try {
    const r = await fetch(`${web}${path}`, { signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    const pass = r.status === 200 && (path === '/api/health' ? JSON.parse(text).ok === true : text.includes('/src/main.jsx'));
    results.push({ name: `Frontend ${path}`, status: pass ? 'PASS' : 'FAIL', actual: r.status });
    console.log(`${pass ? 'PASS' : 'FAIL'} Frontend ${path}: HTTP ${r.status}`);
  } catch { results.push({ name: `Frontend ${path}`, status: 'FAIL', error: 'FRONTEND_UNAVAILABLE' }); }
}

const profiles = devAuth ? [
  { name: 'Super admin', email: 'admin@starvnt.com', admin: true },
  { name: 'Operations admin', email: 'ops@starvnt.com', admin: true },
  { name: 'Finance admin', email: 'finance@starvnt.com', admin: true },
  { name: 'Support admin', email: 'support@starvnt.com', admin: true },
  { name: 'Vendor', email: 'vendor@starvnt.com', admin: false },
] : [
  process.env.QA_ADMIN_EMAIL && process.env.QA_ADMIN_PASSWORD && { name: 'Admin', email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD, admin: true },
  process.env.QA_VENDOR_EMAIL && process.env.QA_VENDOR_PASSWORD && { name: 'Vendor', email: process.env.QA_VENDOR_EMAIL, password: process.env.QA_VENDOR_PASSWORD, admin: false },
].filter(Boolean);
if (!profiles.length) {
  results.push({ name: 'Authenticated admin/vendor checks', status: 'SKIP', reason: 'Provide QA credentials locally or use --dev-auth on the development server.' });
  console.log('SKIP Authenticated checks: supply QA credentials or use --dev-auth locally.');
}
for (const profile of profiles) {
  const prefix = profile.admin ? '/api/admin/auth' : '/api/auth';
  const login = await check(`${profile.name} sign-in`, `${prefix}/${devAuth ? 'dev-auth' : 'login'}`, 200, { body: devAuth ? { email: profile.email, accountType: 'VENDOR' } : { email: profile.email, password: profile.password } });
  if (!login?.data?.accessToken) continue;
  const token = login.data.accessToken;
  let cookie = login.cookie;
  try {
    if (profile.admin) {
      const admin = login.data.admin;
      const can = (...permissions) => admin.role === 'SUPER_ADMIN' || permissions.some((permission) => admin.permissions?.includes(permission));
      await check(`${profile.name} identity`, '/api/admin/auth/me', 200, { token });
      for (const [label, path, permissions] of [
        ['vendors', '/api/admin/external-users/organizations?limit=1', ['vendors.read']],
        ['events', '/api/admin/events?limit=1', ['events.read']],
        ['bookings', '/api/admin/operations/bookings?limit=1', ['bookings.read', 'operations.read']],
        ['payments', '/api/admin/operations/finance-summary?limit=1', ['payments.read', 'settlements.read']],
        ['audit', '/api/admin/audit?limit=1', ['audit.read']],
      ]) await check(`${profile.name}: ${label} permission`, path, can(...permissions) ? 200 : 403, { token });
      await check(`${profile.name} cannot use vendor identity`, '/api/vendor/me', 401, { token });
    } else {
      for (const path of ['/api/vendor/me', '/api/vendor/badge-counts', '/api/vendor/notifications', '/api/vendor/bookings', '/api/vendor/aura/sessions']) await check(`Vendor ${path}`, path, 200, { token });
      await check('Vendor token denied by admin domain', '/api/admin/auth/me', 401, { token });
      await check('Vendor token denied by customer role gate', '/api/customer/me', 403, { token });
    }
    const refreshed = await check(`${profile.name} cookie refresh`, `${prefix}/refresh`, 200, { cookie, body: {} });
    if (refreshed?.cookie) cookie = refreshed.cookie;
  } finally {
    await check(`${profile.name} logout`, `${prefix}/logout`, 200, { cookie, body: {} });
    await check(`${profile.name} session revoked`, profile.admin ? '/api/admin/auth/me' : '/api/vendor/me', 401, { token });
  }
}
const report = { createdAt: new Date().toISOString(), base, web, results, passed: results.filter((r) => r.status === 'PASS').length, failed: results.filter((r) => r.status === 'FAIL').length, skipped: results.filter((r) => r.status === 'SKIP').length };
const reportPath = resolve(fileURLToPath(new URL('../../', import.meta.url)), option('--report', 'tmp/qa/portal-smoke.json'));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Smoke checks: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped. Report: ${reportPath}`);
if (report.failed) process.exitCode = 1;
