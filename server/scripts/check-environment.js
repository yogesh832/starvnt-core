import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const qa = process.argv.includes('--qa');
const root = new URL('../', import.meta.url);
if (qa) process.env.STARVNT_ENV_FILE = fileURLToPath(new URL('.env.test.local', root));
const { config } = await import('../src/config.js');
const webEnvPath = new URL(qa ? '../../web/.env.test.local' : '../../web/.env', import.meta.url);
const web = existsSync(webEnvPath) ? dotenv.parse(readFileSync(webEnvPath)) : {};
const results = [];
function check(name, pass, detail) { results.push({ name, status: pass ? 'PASS' : 'FAIL', detail }); }
const database = (value) => { try { return new URL(value); } catch { return null; } };
const external = database(config.mongoUriExternal);
const admin = database(config.mongoUriAdmin);
check('Node runtime', Number(process.versions.node.split('.')[0]) >= 20, 'Node 20 or newer');
check('External database', Boolean(external), 'Connection string configured; credentials hidden');
check('Admin database', Boolean(admin), 'Connection string configured; credentials hidden');
check('Separate identity databases', Boolean(external && admin && (external.host !== admin.host || external.pathname !== admin.pathname)), 'Admin and external data must use different databases');
check('Separate token secrets', Boolean(config.jwtSecret && config.adminJwtSecret && config.jwtSecret !== config.adminJwtSecret), 'Admin/vendor token isolation');
const frontendPort = Number(web.VITE_DEV_PORT || (qa ? 5174 : 5173));
check('Frontend origin', config.clientOrigins.includes(`http://localhost:${frontendPort}`), 'CORS permits the local frontend');
check('Local cookie settings', !config.cookieSecure && !config.cookieDomain, 'HTTP localhost uses host-only, non-secure development cookies');
let apiMatches = true;
try { apiMatches = new URL(web.VITE_API_URL || 'http://localhost:4000').port === String(config.port); } catch { apiMatches = false; }
check('Frontend API target', apiMatches, 'Frontend and backend ports agree');
if (qa) {
  check('QA environment file', existsSync(process.env.STARVNT_ENV_FILE), 'Explicit QA file; no fallback to the development credentials');
  check('QA workers disabled', !config.outboxWorkerEnabled && !config.reservationExpiryWorkerEnabled, 'Workers cannot process unrelated queued business work');
  check('QA payment bypass off', !config.enableQaPaymentBypass, 'Payment state checks remain enforced');
  check('Dedicated QA databases', external?.pathname === '/starvnt_test_external' && admin?.pathname === '/starvnt_test_admin', 'QA database names cannot resolve to the normal development databases');
  check('Separate QA cookies', config.refreshCookieName === 'starvnt_qa_ext_rt' && config.adminRefreshCookieName === 'starvnt_qa_admin_rt', 'Normal development cookies are not overwritten');
}
for (const result of results) console.log(`${result.status} ${result.name}: ${result.detail}`);
if (!qa && (external && !['localhost', '127.0.0.1', '[::1]'].includes(external.hostname))) console.log('NOTE Development uses a remote database. Use the isolated QA environment for data-changing tests.');
if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
