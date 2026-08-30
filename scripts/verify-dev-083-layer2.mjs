import fs from 'node:fs';
import path from 'node:path';
import { runLayer2Smoke } from './release/production-release.mjs';

const root = process.cwd();
const releaseRoot = path.join(root, 'output', 'release', 'dev-083');
const candidates = fs.existsSync(releaseRoot)
  ? fs.readdirSync(releaseRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('self-check-') && !entry.name.startsWith('dev096-') && !entry.name.startsWith('production-backup-'))
    .map(entry => {
      const releaseId = entry.name;
      const releaseDir = path.join(releaseRoot, releaseId);
      const manifestPath = path.join(releaseDir, 'manifest.json');
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.taskId !== 'DEV-083' || typeof manifest.releaseId !== 'string' || !manifest.artifact?.distDir) return null;
        return { releaseId, manifestPath, manifest };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.releaseId.localeCompare(left.releaseId))
  : [];
const selected = candidates[0];
if (!selected) throw new Error('DEV-083 Layer2 requires a sealed artifact manifest.');
const { releaseId, manifestPath, manifest } = selected;
const releaseDir = path.join(releaseRoot, releaseId);
const result = await runLayer2Smoke(manifest.artifact.distDir, manifest);
const evidencePath = path.join(releaseDir, 'layer2-evidence.json');
fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId: 'DEV-083', phase: 'prepare-layer2', releaseId, manifestPath, ...result }, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, releaseId, evidencePath, ...result }, null, 2));
