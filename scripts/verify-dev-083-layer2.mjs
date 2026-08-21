import fs from 'node:fs';
import path from 'node:path';
import { runLayer2Smoke } from './release/production-release.mjs';

const root = process.cwd();
const releaseRoot = path.join(root, 'output', 'release', 'dev-083');
const dirs = fs.existsSync(releaseRoot)
  ? fs.readdirSync(releaseRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('self-check-')).map(entry => entry.name).sort().reverse()
  : [];
const releaseId = dirs[0];
if (!releaseId) throw new Error('DEV-083 Layer2 requires a sealed artifact manifest.');
const releaseDir = path.join(releaseRoot, releaseId);
const manifestPath = path.join(releaseDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const result = await runLayer2Smoke(manifest.artifact.distDir, manifest);
const evidencePath = path.join(releaseDir, 'layer2-evidence.json');
fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId: 'DEV-083', phase: 'prepare-layer2', releaseId, manifestPath, ...result }, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, releaseId, evidencePath, ...result }, null, 2));
