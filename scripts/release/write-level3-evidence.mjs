import fs from 'node:fs';
import path from 'node:path';
import { resolveReleaseTaskId } from './production-contract.mjs';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Level 3 evidence may only be emitted by GitHub Actions.');

const taskId = resolveReleaseTaskId(process.env.PROJED_RELEASE_TASK_ID);
const sourceCommit = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/i.test(sourceCommit ?? '')) throw new Error('GitHub Actions source commit is missing or invalid.');

const evidence = {
  schemaVersion: 1,
  taskId,
  gate: 'layer3-hosted-ci',
  status: 'PASS',
  sourceCommit,
  sourceRef: process.env.GITHUB_REF ?? null,
  provider: 'github-actions',
  run: {
    id: process.env.GITHUB_RUN_ID ?? null,
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    repository: process.env.GITHUB_REPOSITORY ?? null,
  },
  checks: [
    'typescript-no-emit',
    'test-build',
    'dev-099-static-convergence',
    'dev-099-property',
    'production-release-adapter-contract',
    'production-candidate-fixture-contract',
  ],
  createdAt: new Date().toISOString(),
};

const outputPath = path.resolve('output', 'qa', taskId.toLowerCase(), 'level3-evidence.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outputPath, sourceCommit, taskId }, null, 2));
