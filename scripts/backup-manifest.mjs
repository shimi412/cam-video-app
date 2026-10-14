import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const names = ['database.dump', 'media.tar.gz'];
async function fingerprint(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: (await stat(file)).size, sha256: hash.digest('hex') };
}
async function main() {
  const [command, directory] = process.argv.slice(2);
  if (!directory || !['create', 'verify'].includes(command)) throw new Error('Usage: backup-manifest.mjs create|verify DIRECTORY');
  const files = {};
  for (const name of names) {
    files[name] = await fingerprint(path.join(directory, name));
    if (!files[name].bytes) throw new Error('Backup file is empty.');
  }
  const target = path.join(directory, 'manifest.json');
  if (command === 'create') {
    await writeFile(target, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), mediaRoot: '/app/storage', files }, null, 2), { flag: 'wx', mode: 0o600 });
  } else {
    const manifest = JSON.parse(await readFile(target, 'utf8'));
    if (manifest.version !== 1 || manifest.mediaRoot !== '/app/storage') throw new Error('Unsupported backup.');
    for (const name of names) if (manifest.files?.[name]?.sha256 !== files[name].sha256 || manifest.files?.[name]?.bytes !== files[name].bytes) throw new Error('Backup is incomplete or changed.');
  }
  console.log(`Backup manifest ${command === 'create' ? 'created' : 'verified'}.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
