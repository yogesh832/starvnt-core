import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function dbNameFromUri(uri, fallback) {
  try {
    const parsed = new URL(uri);
    return parsed.pathname.replace(/^\//, '') || fallback;
  } catch {
    return fallback;
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function backupOne({ name, uri }) {
  if (!uri) {
    console.warn(`[backup] ${name}: skipped because URI is missing`);
    return;
  }
  const outDir = path.join(root, 'backups', `${name}-${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const db = dbNameFromUri(uri, name);
  console.log(`[backup] ${name}: writing ${db} to ${outDir}`);
  await run('mongodump', ['--uri', uri, '--db', db, '--out', outDir]);
}

await backupOne({ name: 'external', uri: process.env.MONGO_URI_EXTERNAL || '' });
await backupOne({ name: 'admin', uri: process.env.MONGO_URI_ADMIN || '' });
console.log('[backup] complete');
