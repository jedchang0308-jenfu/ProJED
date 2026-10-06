import fs from 'node:fs';
import path from 'node:path';
import { readEnvFile } from './release/env-boundary.mjs';
import { PUBLIC_ENV_KEYS } from './release/production-contract.mjs';

const root = process.cwd();
const sourcePath = path.join(root, '.env.local');
const destinationPath = path.join(root, '.env.test.local');
const apply = process.argv.includes('--apply');

if (!fs.existsSync(sourcePath)) {
  console.log(JSON.stringify({ ok: true, action: 'noop', reason: '.env.local not found' }, null, 2));
  process.exit(0);
}

const source = readEnvFile(sourcePath);
const destination = readEnvFile(destinationPath);
const keys = PUBLIC_ENV_KEYS.filter(key => Object.hasOwn(source, key));
const conflicts = keys.filter(key => Object.hasOwn(destination, key) && destination[key] !== source[key]);
if (conflicts.length > 0) {
  console.error(JSON.stringify({ ok: false, action: 'stopped', conflicts }, null, 2));
  process.exit(1);
}

if (!apply) {
  console.log(JSON.stringify({ ok: true, action: 'dry-run', movableKeys: keys, destination: '.env.test.local', source: '.env.local', apply: 'add --apply after reviewing key-only output' }, null, 2));
  process.exit(0);
}

const destinationLines = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, 'utf8').split(/\r?\n/) : [];
const presentDestination = new Set();
const outputDestination = destinationLines.map(line => {
  const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (!match) return line;
  const key = match[1];
  if (keys.includes(key)) {
    presentDestination.add(key);
    return `${key}=${JSON.stringify(source[key])}`;
  }
  return line;
});
for (const key of keys) if (!presentDestination.has(key)) outputDestination.push(`${key}=${JSON.stringify(source[key])}`);
fs.writeFileSync(destinationPath, outputDestination.join('\n').replace(/\n*$/, '\n'), 'utf8');

const sourceLines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
const outputSource = sourceLines.filter(line => {
  const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return !match || !keys.includes(match[1]);
});
fs.writeFileSync(sourcePath, outputSource.join('\n').replace(/\n*$/, '\n'), 'utf8');
console.log(JSON.stringify({ ok: true, action: 'applied', movedKeys: keys, source: '.env.local', destination: '.env.test.local' }, null, 2));
