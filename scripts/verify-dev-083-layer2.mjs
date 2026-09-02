import fs from 'node:fs';
import path from 'node:path';
import { runLayer2Smoke } from './release/production-release.mjs';
import { releaseTaskSlug, resolveReleaseTaskId } from './release/production-contract.mjs';
import { releaseCapsulePath, updateReleaseCapsule } from './release/release-capsule.mjs';

const root = process.cwd();
const taskIndex = process.argv.indexOf('--task-id');
const manifestIndex = process.argv.indexOf('--manifest');
const taskId = resolveReleaseTaskId(taskIndex >= 0 ? process.argv[taskIndex + 1] : undefined);
const explicitManifestPath = manifestIndex >= 0 ? path.resolve(root, process.argv[manifestIndex + 1]) : null;
const releaseRoot = path.join(root, 'output', 'release', releaseTaskSlug(taskId));
const candidates = fs.existsSync(releaseRoot)
  ? fs.readdirSync(releaseRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('self-check-') && !entry.name.startsWith('dev096-') && !entry.name.startsWith('production-backup-'))
    .map(entry => {
      const releaseId = entry.name;
      const releaseDir = path.join(releaseRoot, releaseId);
      const manifestPath = path.join(releaseDir, 'manifest.json');
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.taskId !== taskId || typeof manifest.releaseId !== 'string' || !manifest.artifact?.distDir) return null;
        return { releaseId, manifestPath, manifest };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.releaseId.localeCompare(left.releaseId))
  : [];
let selected = candidates[0];
if (explicitManifestPath) {
  const manifest = JSON.parse(fs.readFileSync(explicitManifestPath, 'utf8'));
  selected = { releaseId: manifest.releaseId, manifestPath: explicitManifestPath, manifest };
}
if (!selected) throw new Error(`${taskId} Layer2 requires a sealed artifact manifest.`);
const { releaseId, manifestPath, manifest } = selected;
if (manifest.taskId !== taskId) throw new Error(`${taskId} Layer2 manifest task id mismatch.`);
const releaseDir = path.join(releaseRoot, releaseId);
const result = await runLayer2Smoke(manifest.artifact.distDir, manifest);
const evidencePath = path.join(releaseDir, 'layer2-evidence.json');
fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId, phase: 'prepare-layer2', releaseId, manifestPath, ...result }, null, 2)}\n`);
if (fs.existsSync(releaseCapsulePath(manifest))) {
  updateReleaseCapsule(manifest, { state: 'ARTIFACT_READY', evidence: { layer2: evidencePath } });
}
console.log(JSON.stringify({ ok: true, releaseId, evidencePath, ...result }, null, 2));
