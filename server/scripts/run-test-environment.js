import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const envPath = resolve(serverRoot, '.env.test.local');
if (!existsSync(envPath)) {
  console.error('Create server/.env.test.local from server/.env.test.example before starting isolated QA.');
  process.exit(1);
}
const qaEnv = dotenv.parse(readFileSync(envPath));
for (const key of ['MONGO_URI_EXTERNAL', 'MONGO_URI_ADMIN']) {
  let safe = false;
  try {
    const uri = new URL(qaEnv[key]);
    const approvedHost = ['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname) || qaEnv.QA_ALLOW_REMOTE_DATABASE === 'true';
    safe = approvedHost && /^\/starvnt_test_(external|admin)$/.test(uri.pathname);
  } catch {}
  if (!safe) {
    console.error(`${key} must point to a dedicated starvnt_test_ database. Remote hosts require QA_ALLOW_REMOTE_DATABASE=true.`);
    process.exit(1);
  }
}
const child = spawn(process.execPath, ['--watch', 'src/index.js'], {
  cwd: serverRoot,
  env: { ...process.env, ...qaEnv, NODE_ENV: 'test', STARVNT_ENV_FILE: envPath },
  stdio: 'inherit', windowsHide: true,
});
child.on('exit', (code) => { process.exitCode = code || 0; });
child.on('error', () => { console.error('Could not start the QA server.'); process.exitCode = 1; });
