import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditVendorIdentity } from '../src/common/vendorIdentityAudit.js';

export function auditArguments(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--confirm-read-only', '--include-ids'].includes(key)) { if (values[key]) throw new Error('DUPLICATE_ARGUMENT'); values[key] = true; }
    else if (['--uri-env', '--database', '--out', '--max-records'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--') && !values[key]) values[key] = args[++i];
    else throw new Error('INVALID_ARGUMENT');
  }
  if (!values['--confirm-read-only'] || !/^[A-Z][A-Z0-9_]*$/.test(values['--uri-env'] || '') || !/^[a-zA-Z0-9_-]+$/.test(values['--database'] || '') || !values['--out']) throw new Error('EXPLICIT_AUDIT_TARGET_REQUIRED');
  const maxRecords = Number(values['--max-records'] || 10000);
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 100000) throw new Error('INVALID_AUDIT_LIMIT');
  return { uriEnv: values['--uri-env'], database: values['--database'], out: resolve(values['--out']), maxRecords, includeIds: Boolean(values['--include-ids']) };
}

async function main() {
  let client;
  try {
    const options = auditArguments(process.argv.slice(2));
    const uri = process.env[options.uriEnv];
    if (!uri) throw new Error('AUDIT_TARGET_UNAVAILABLE');
    client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 10000, appName: 'STARVNT-identity-read-only-audit' });
    await client.connect();
    const report = await auditVendorIdentity(client.db(options.database), options);
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`Identity review report saved; complete=${report.complete}. No database corrections performed.\n`);
    if (!report.complete) process.exitCode = 2;
  } catch { process.stderr.write('Identity audit did not complete. Check explicit arguments, read-only access, target availability and a new output path.\n'); process.exitCode = 1; }
  finally { await client?.close().catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
