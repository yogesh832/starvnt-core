import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, [
  fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)),
  '--mode', 'test', '--port', '5174', '--strictPort',
], {
  cwd: fileURLToPath(new URL('../../web/', import.meta.url)),
  stdio: 'inherit', windowsHide: true,
});
child.on('exit', (code) => { process.exitCode = code || 0; });
child.on('error', () => { console.error('Could not start the QA frontend.'); process.exitCode = 1; });
