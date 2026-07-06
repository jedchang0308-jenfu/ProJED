import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = path => readFileSync(join(root, path), 'utf8');

const paths = {
  packageJson: 'package.json',
  projectVerifier: 'scripts/verify-dev-025-project-workspace-transfer.mjs',
  fixtureReadiness: 'scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
  spec: 'ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md',
  qa: 'ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md',
  qc: 'ai-doc/qc/QC-DEV-025-controlled-project-workspace-transfer.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const contents = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, read(path)]),
);
const packageJson = JSON.parse(contents.packageJson);
const packageScripts = packageJson.scripts ?? {};

const checks = [];
const add = (name, pass, details = undefined) => checks.push({ name, pass, details });
const includesAll = (text, tokens) => tokens.every(token => text.includes(token));

add(
  'package exposes read-only fixture readiness script',
  packageScripts['verify:dev-025-mutating-qc-fixture-readiness'] ===
    'node scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
);

add(
  'package exposes mutating QC execution-readiness static gate',
  packageScripts['verify:dev-025-mutating-qc-readiness'] ===
    'node scripts/verify-dev-025-mutating-qc-readiness.mjs',
);

const packageScriptCommands = Object.entries(packageScripts)
  .map(([name, command]) => `${name}: ${command}`)
  .join('\n');

add(
  'package scripts do not directly execute the mutating move RPC',
  !packageScriptCommands.includes('move_project_to_workspace'),
);

add(
  'package scripts do not directly run remote Supabase schema changes for DEV-025',
  !/supabase\s+(db\s+(push|reset)|migration\s+up|functions\s+deploy)/i.test(packageScriptCommands),
);

add(
  'fixture readiness harness is explicitly read-only',
  includesAll(contents.fixtureReadiness, [
    'mutates_database: false',
    'script has no move RPC execution path',
    '--self-check',
    'DEV025_QC_SOURCE_TENANT_ID',
    'DEV025_QC_TARGET_TENANT_ID',
    'DEV025_QC_DENIED_TENANT_ID',
    'DEV025_QC_PROJECT_ID',
    'DEV025_QC_EXPECTED_PROJECT_NAME',
  ]),
);

add(
  'fixture readiness harness never calls the mutating move RPC',
  !contents.fixtureReadiness.includes("rpc('move_project_to_workspace'") &&
    !contents.fixtureReadiness.includes('rpc("move_project_to_workspace"'),
);

add(
  'project transfer verifier tracks both DEV-025 DB QC guard scripts',
  includesAll(contents.projectVerifier, [
    'verify-dev-025-mutating-qc-fixture-readiness.mjs',
    'verify-dev-025-mutating-qc-readiness.mjs',
    'verify:dev-025-mutating-qc-readiness',
  ]),
);

add(
  'SPEC records execution-readiness gate before mutating DB QC',
  includesAll(contents.spec, [
    'verify:dev-025-mutating-qc-readiness',
    'verify:dev-025-mutating-qc-fixture-readiness',
    'QC 必須先通過 execution-readiness',
  ]),
);

add(
  'QA requires fixture readiness before preview/move role-data QC',
  includesAll(contents.qa, [
    'verify:dev-025-mutating-qc-readiness',
    'verify:dev-025-mutating-qc-fixture-readiness',
    'preview_project_workspace_transfer',
    'move_project_to_workspace',
    'rollback/cleanup',
  ]),
);

add(
  'QC report keeps mutation pending and documents resume/cleanup boundaries',
  includesAll(contents.qc, [
    'Execution Readiness Static Gate Added',
    'Mutating Role-Data QC Pending',
    'rollback/cleanup',
    'RAG visibility',
    'no real customer board',
  ]),
);

add(
  'dev_task references the execution-readiness gate without marking mutation complete',
  includesAll(contents.devTask, [
    'verify:dev-025-mutating-qc-readiness',
    'Mutating QC Pending',
    '安全 fixture',
    'RAG visibility',
  ]),
);

add(
  'documentation map reflects readiness progress and remaining external fixture gate',
  includesAll(contents.documentationMap, [
    'DEV-025',
    'Execution Readiness Static Gate Added',
    'mutating role-data QC',
    '安全 fixture',
  ]),
);

const failures = checks.filter(check => !check.pass);
const payload = {
  ok: failures.length === 0,
  mutates_database: false,
  checks,
};

console.log(JSON.stringify(payload, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
