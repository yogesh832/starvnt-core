import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foundationError as fail } from '../foundation/consent.service.js';

// Bounded, silent re-encoding removes metadata and audio. Staff must still
// inspect the entire output for visible identifiers and media rights.
export async function sanitizeDiscoveryVideo(buffer) {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') throw fail('INVALID_VIDEO', 'Upload a valid MP4 video.');
  const directory = await mkdtemp(join(tmpdir(), 'starvnt-discovery-'));
  const input = join(directory, 'input.mp4');
  try {
    await writeFile(input, buffer, { mode: 0o600, flag: 'wx' });
    return await new Promise((resolve, reject) => {
    let done = false, size = 0, stopped = null; const chunks = [];
    const child = spawn(process.env.DISCOVERY_FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-f', 'mp4', '-i', input, '-map', '0:v:0', '-an', '-map_metadata', '-1', '-map_chapters', '-1', '-t', '30', '-vf', "scale='min(960,iw)':-2", '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '400k', '-movflags', '+frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const finish = (err, value) => { if (done) return; done = true; clearTimeout(timer); if (err) reject(err); else resolve(value); };
    const timer = setTimeout(() => { stopped = fail('VIDEO_PROCESSING_TIMEOUT', 'Video processing timed out.', 503); child.kill(); }, 30000);
    child.on('error', () => finish(fail('VIDEO_PROCESSING_UNAVAILABLE', 'Video processing is unavailable.', 503)));
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 12 * 1024 * 1024) { stopped = fail('VIDEO_TOO_LARGE', 'Processed video is too large.'); child.kill(); } else chunks.push(chunk); });
    child.on('close', code => stopped ? finish(stopped) : code === 0 && size ? finish(null, Buffer.concat(chunks)) : finish(fail('INVALID_VIDEO', 'Video could not be processed.')));
    });
  } finally { await unlink(input).catch(() => {}); await rmdir(directory).catch(() => {}); }
}
