import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(join(root, path), 'utf8');

const paths = {
  packageJson: 'package.json',
  productionSmokeExecutor: 'scripts/verify-dev-011-012-production-ui-smoke.mjs',
  existingProductionAuthSmoke: 'scripts/verify-dev-040-production-auth-ui-smoke.mjs',
  localAiBrowserSmoke: 'scripts/verify-dev-024-ai-synthesis-preserve-human-draft-browser.pw.js',
  projedService: 'src/services/supabase/projedService.ts',
  qa011: 'ai-doc/qa/QA-DEV-011-ai-meeting-record-synthesis.md',
  qa012: 'ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md',
  qc: 'ai-doc/qc/QC-DEV-011-012-production-ai-smoke.md',
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
  'package exposes DEV-011/012 production UI smoke readiness gate',
  packageScripts['verify:dev-011-012-production-ui-smoke-readiness'] ===
    'node scripts/verify-dev-011-012-production-ui-smoke-readiness.mjs',
);

add(
  'package exposes guarded DEV-011/012 production UI smoke executor as self-check by default',
  packageScripts['verify:dev-011-012-production-ui-smoke'] ===
    'node scripts/verify-dev-011-012-production-ui-smoke.mjs',
);

const packageScriptCommands = Object.entries(packageScripts)
  .map(([name, command]) => `${name}: ${command}`)
  .join('\n');

add(
  'readiness package script does not deploy or mutate production by itself',
  !/verify:dev-011-012-production-ui-smoke-readiness:[^\n]*(firebase|supabase|psql|playwright-cli)/i.test(packageScriptCommands),
);

add(
  'guarded executor requires explicit production fixture opt-in and contains cleanup',
  includesAll(contents.productionSmokeExecutor, [
    'DEV011012_ALLOW_PRODUCTION_FIXTURE',
    '--run-production-fixture',
    "process.env[ALLOW_ENV] !== '1'",
    'mutates_database: false',
    'mutates_database: true',
    "admin.from('tenants').delete()",
    'admin.auth.admin.deleteUser',
  ]),
);

add(
  'guarded executor covers the full DEV-011/012 production UI smoke path',
  includesAll(contents.productionSmokeExecutor, [
    '[data-record-composer-shell]',
    '[data-meeting-workflow-step="ai_suggestion"]',
    '[data-meeting-workflow-step="published"]',
    'AI整理完成，請確認後發布',
    'data-meeting-synthesis-contract',
    'data-meeting-synthesis-run-id',
    "synthesisProof.provider !== 'gemini'",
    "synthesisProof.quality !== 'passed'",
    '會議紀錄已發布',
    'knowledge_records',
    'record_task_links',
    'data-sidebar-records-button',
    'data-task-details-modal',
    '歷史資訊',
  ]),
);

add(
  'existing authenticated production UI smoke has temporary auth-session injection with cleanup',
  includesAll(contents.existingProductionAuthSmoke, [
    'admin.auth.admin.createUser',
    'signInWithPassword',
    'localStorage.setItem(key, JSON.stringify(session))',
    "admin.from('tenants').delete()",
    'admin.auth.admin.deleteUser',
  ]),
);

add(
  'local browser ROT covers meeting composer, AI整理, review/save, project-change import, and record persistence',
  includesAll(contents.localAiBrowserSmoke, [
    '[data-record-composer-shell]',
    '[data-meeting-workflow-step="ai_suggestion"]',
    '規則整理完成，請確認後發布',
    'data-meeting-synthesis-contract',
    'data-meeting-synthesis-run-id',
    'record.metadata?.meetingSynthesis?.quality?.passed === true',
    '[data-record-meeting-save-draft]',
    'projed-local-test.knowledgeRecords',
    '[data-project-change-import-panel]',
  ]),
);

const mirrorBackReferenceIndex = contents.projedService.indexOf('source_document_id: savedDocumentId');
const ragSyncJobInsertIndex = contents.projedService.indexOf(".from('rag_sync_jobs')");

add(
  'record RAG mirror writes source_document_id before browser client enqueues rag_sync_jobs',
  mirrorBackReferenceIndex !== -1 &&
    ragSyncJobInsertIndex !== -1 &&
    mirrorBackReferenceIndex < ragSyncJobInsertIndex &&
    includesAll(contents.projedService, [
      'Browser clients must establish the record -> document back-reference before RLS allows job enqueue.',
      'source_document_id: savedDocumentId',
      "status: 'pending'",
    ]),
  {
    mirrorBackReferenceIndex,
    ragSyncJobInsertIndex,
  },
);

add(
  'QA-DEV-011 references this readiness gate and records the deployed production smoke pass',
  includesAll(contents.qa011, [
    'verify:dev-011-012-production-ui-smoke-readiness',
    'Done / Production Release Deployed / Production UI Smoke Passed',
    'codex/dev011012-rag-order-hotfix',
    '7704e2f',
    'assets/index-BkwGqGCZ.js',
    'published_record_found=true',
  ]),
);

add(
  'QA-DEV-012 separates historical v1 evidence from the pending contract v2 production gate',
  includesAll(contents.qa012, [
    'verify:dev-011-012-production-ui-smoke-readiness',
    'Reopened / Contract v2 Local QA + Browser QC Passed / Production v2 Effectiveness Pending',
    'meeting-synthesis-v2',
    'Production v2 Stop-Ship Gate',
    'codex/dev011012-rag-order-hotfix',
    '7704e2f',
    'published_record_found=true',
  ]),
);

add(
  'QC report preserves v1 evidence and marks contract v2 production effectiveness pending',
  includesAll(contents.qc, [
    'Historical v1 Production Pass / DEV-012 Contract v2 Reopened / Local QC Passed / Production v2 Not Executed',
    'Production v2 Release Gate（Pending）',
    'meeting-synthesis-v2',
    'verify:dev-011-012-production-ui-smoke-readiness',
    'verify:dev-011-012-production-ui-smoke',
    'Hotfix release',
    'codex/dev011012-rag-order-hotfix',
    '7704e2f',
    'assets/index-BkwGqGCZ.js',
    'Production UI smoke guarded executor actual fixture：Pass',
    'DB proof：Pass',
    'published_record_found=true',
    'tenantDeleted=true',
    'userDeleted=true',
    'mutates_database=false',
  ]),
);

add(
  'dev_task keeps DEV-011 historical closure and reopens DEV-012 until production v2 evidence exists',
  includesAll(contents.devTask, [
    'DEV-011 [交付點] [完成] [P1] [正式環境已交付]',
    'DEV-012 [交付點] [驗證中] [P1] [Contract v2 本機 QA/QC 通過／正式環境待驗證]',
    'meeting-synthesis-v2',
    'production v2',
  ]),
);

add(
  'documentation map reflects contract v2 local proof and production pending boundary',
  includesAll(contents.documentationMap, [
    'meeting-synthesis-v2',
    'Browser QC 5/5 passed',
    'Contract v2 source updated / not deployed',
    'production effectiveness pending',
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
