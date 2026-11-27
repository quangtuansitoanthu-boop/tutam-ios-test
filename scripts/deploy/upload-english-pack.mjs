import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, 'static/offline-data/chapters-en');
const uploadAll = process.argv.includes('--all');
const files = (await readdir(directory)).filter(file => file.endsWith('.json'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

let remoteEntries = new Map();
if (!uploadAll) {
  try {
    const manifestRes = await fetch('https://media.quangtu.vn/offline-data/english-pack-manifest.json', {
      signal: AbortSignal.timeout(15_000),
    });
    if (manifestRes.ok) {
      const remoteManifest = await manifestRes.json();
      for (const entry of remoteManifest?.entries || []) {
        if (entry?.file && entry?.sha256) remoteEntries.set(entry.file, entry);
      }
    }
  } catch (err) {
    console.warn('Could not read remote manifest for delta check, uploading all files:', err?.message || err);
  }
}

const queue = [];
let skipped = 0;
for (const file of files) {
  const bytes = await readFile(path.join(directory, file));
  const rows = JSON.parse(bytes);
  if (!Array.isArray(rows) || !rows.length || !rows.every(row => typeof row?.noi_dung === 'string')) {
    throw new Error(`Invalid chapters: ${file}`);
  }
  const hash = digest(bytes);
  const remote = remoteEntries.get(file);
  if (remote && remote.sha256 === hash && remote.bytes === bytes.length) {
    skipped += 1;
    continue;
  }
  queue.push({ file, hash });
}
console.log(`English pack delta: ${queue.length} to upload, ${skipped} unchanged (skipped).`);

function upload(file, objectKey = `offline-data/chapters-en/${file}`, sourcePath = path.join(directory, file)) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'r2', 'object', 'put', `quangtu/${objectKey}`,
      '--remote', '--file', sourcePath,
      '--content-type', 'application/json; charset=utf-8',
      '--cache-control', 'public, max-age=3600',
      '--config', 'wrangler.sveltekit.jsonc', '--env', 'production',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
  });
}

let done = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const { file, hash } = queue.shift();
    await upload(file);
    const response = await fetch(`https://media.quangtu.vn/offline-data/chapters-en/${encodeURIComponent(file)}`, {
      headers: { Origin: 'https://localhost' }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== hash) {
      throw new Error(`Public verification failed: ${file} (${response.status})`);
    }
    const cors = response.headers.get('access-control-allow-origin');
    if (cors !== '*' && cors !== 'https://localhost') throw new Error(`Native CORS failed: ${file}`);
    done += 1;
    console.log(`Uploaded and verified ${done}: ${file}`);
  }
}));
console.log(`Completed: ${done} uploaded & verified (${skipped} unchanged skipped).`);

await upload('english-pack-manifest.json', 'offline-data/english-pack-manifest.json', path.join(root, 'static/offline-data/english-pack-manifest.json'));
console.log('Published English pack manifest after all books were verified.');
