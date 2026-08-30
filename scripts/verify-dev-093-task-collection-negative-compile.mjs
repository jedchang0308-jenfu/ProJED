import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const fixture = path.join(root, 'scripts', 'fixtures', 'dev093-negative-compile.ts');
const fixtureArg = path.join('scripts', 'fixtures', 'dev093-negative-compile.ts');
const args = [
  'tsc',
  '--noEmit',
  '--ignoreConfig',
  '--strict',
  '--skipLibCheck',
  '--target', 'ES2022',
  '--module', 'ESNext',
  '--moduleResolution', 'Bundler',
  '--jsx', 'react-jsx',
  fixtureArg,
];
const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npx';
const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', ['npx', ...args].join(' ')] : args;
const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', windowsHide: true });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
const passed = result.status === 0 && !result.error;
const checks = [
  {
    id: 'S01-negative-compile-input',
    status: passed ? 'PASS' : 'FAIL',
    expected: 'KnowledgeRecordInput rejects task_collection',
    actual: passed ? 'tsc accepted @ts-expect-error for task_collection input' : output || String(result.error ?? `tsc exit ${result.status ?? 'unknown'}`),
    evidence: [fixture],
  },
  {
    id: 'S01-negative-compile-editable',
    status: passed ? 'PASS' : 'FAIL',
    expected: 'EditableKnowledgeRecord rejects collection metadata',
    actual: passed ? 'tsc accepted @ts-expect-error for collectionOperationId on editable record' : output || String(result.error ?? `tsc exit ${result.status ?? 'unknown'}`),
    evidence: [fixture],
  },
];
const artifact = {
  devId: 'DEV-093',
  sourceRevision: 'working-tree',
  generatedAt: new Date().toISOString(),
  environment: 'local',
  provider: 'typescript',
  command: 'npm run verify:dev-093-task-collection-negative-compile',
  runtime: 'one-shot tsc fixture; no external runtime',
  cases: checks,
  summary: {
    PASS: checks.filter(item => item.status === 'PASS').length,
    FAIL: checks.filter(item => item.status === 'FAIL').length,
    NOT_RUN: 0,
    BLOCKED: 0,
  },
  passed,
};
mkdirSync(path.join(root, 'output', 'qa', 'dev-093'), { recursive: true });
writeFileSync(path.join(root, 'output', 'qa', 'dev-093', 'negative-compile-result.json'), JSON.stringify(artifact, null, 2));
if (!passed) {
  console.error('DEV-093 negative compile verification failed.');
  if (output) console.error(output);
  process.exit(result.status ?? 1);
}
console.log(`DEV-093 negative compile verification passed: ${checks.length} checks.`);
