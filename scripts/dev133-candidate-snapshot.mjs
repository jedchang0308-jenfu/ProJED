import { cp, mkdir, readFile, readdir, lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Only public source/configuration from this canonical repo; never copy .env or credentials.
export async function freezeDev133Candidate(root, destination) {
  const targets = ['src', 'quick-task', 'public', 'index.html', 'vite.config.js', 'package.json',
    'tsconfig.json',
    'scripts/dev133-actor-probe.mjs', 'scripts/verify-dev-133-cross-account-browser.py'];
  const files = [];
  const canonicalRoot = await realpath(root);
  async function inventory(relative) {
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    const canonical = await realpath(absolute);
    if (stat.isSymbolicLink() || !canonical.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error('CANDIDATE_PATH_OUTSIDE_REPO');
    if (stat.isDirectory()) {
      for (const name of await readdir(absolute)) await inventory(path.join(relative, name));
    } else files.push(relative);
  }
  for (const target of targets) await inventory(target);
  const hashes = {};
  for (const file of files.sort()) hashes[file.replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  await mkdir(destination, { recursive: true });
  for (const target of targets) await cp(path.join(root, target), path.join(destination, target), { recursive: true });
  for (const file of files) {
    const key = file.replaceAll('\\', '/');
    const source = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    const copied = createHash('sha256').update(await readFile(path.join(destination, file))).digest('hex');
    if (source !== hashes[key] || copied !== hashes[key]) throw new Error('CANDIDATE_CHANGED_DURING_SNAPSHOT');
  }
  const digest = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  await writeFile(path.join(destination, 'source-manifest.json'), `${JSON.stringify({ digest, hashes }, null, 2)}\n`);
  return { path: path.relative(root, destination).replaceAll('\\', '/'), fileCount: files.length, digest };
}
