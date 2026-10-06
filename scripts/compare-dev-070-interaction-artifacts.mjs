import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'output/playwright/dev-070');
const baselinePath = join(root, 'baseline', 'interaction-matrix.json');
const afterPath = join(root, 'after', 'interaction-matrix.json');
const diffDirectory = join(root, 'diff');
const diffPath = join(diffDirectory, 'interaction-diff.json');

if (!existsSync(baselinePath) || !existsSync(afterPath)) {
  console.error(JSON.stringify({ ok: false, reason: 'baseline-or-after-artifact-missing', baselinePath, afterPath }));
  process.exit(1);
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const baseline = readJson(baselinePath);
const after = readJson(afterPath);
const normalize = value => JSON.stringify(value);
const diff = {
  schemaVersion: 1,
  fixtureId: baseline.fixtureId,
  baselinePhase: baseline.phase,
  afterPhase: after.phase,
  fixtureMatch: baseline.fixtureId === after.fixtureId,
  viewportDiff: [],
};

const withViewport = item => {
  if (Number.isInteger(item.width) && Number.isInteger(item.height)) return item;
  const match = /^(\d+)x(\d+)\.png$/i.exec(item.fileName || '');
  return match ? { ...item, width: Number(match[1]), height: Number(match[2]) } : item;
};
const baselineByViewport = new Map((baseline.artifacts || []).map(raw => {
  const item = withViewport(raw);
  return [`${item.width}x${item.height}`, item];
}));
for (const rawAfterArtifact of after.artifacts || []) {
  const afterArtifact = withViewport(rawAfterArtifact);
  const key = `${afterArtifact.width}x${afterArtifact.height}`;
  const baselineArtifact = baselineByViewport.get(key);
  diff.viewportDiff.push({
    viewport: key,
    baselinePresent: Boolean(baselineArtifact),
    equal: Boolean(baselineArtifact) && normalize({ ...baselineArtifact, screenshotPath: undefined }) === normalize({ ...afterArtifact, screenshotPath: undefined }),
  });
}

diff.ok = diff.fixtureMatch
  && diff.viewportDiff.length === (baseline.artifacts || []).length
  && diff.viewportDiff.every(item => item.baselinePresent && item.equal);

mkdirSync(diffDirectory, { recursive: true });
writeFileSync(diffPath, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...diff, diffPath }));
if (!diff.ok) process.exit(1);
