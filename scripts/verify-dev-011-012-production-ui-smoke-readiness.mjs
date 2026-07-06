import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(join(root, path), 'utf8');

const paths = {
  packageJson: 'package.json',
  existingProductionAuthSmoke: 'scripts/verify-dev-040-production-auth-ui-smoke.mjs',
  localAiBrowserSmoke: 'scripts/verify-dev-024-ai-synthesis-preserve-human-draft-browser.pw.js',
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

const packageScriptCommands = Object.entries(packageScripts)
  .map(([name, command]) => `${name}: ${command}`)
  .join('\n');

add(
  'readiness package script does not deploy or mutate production by itself',
  !/verify:dev-011-012-production-ui-smoke-readiness:[^\n]*(firebase|supabase|psql|playwright-cli)/i.test(packageScriptCommands),
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
    'AI整理完成，請校稿後發布',
    '[data-meeting-workflow-step="review"]',
    'projed-local-test.knowledgeRecords',
    '[data-project-change-import-panel]',
  ]),
);

add(
  'QA-DEV-011 references this readiness gate and keeps production UI smoke pending',
  includesAll(contents.qa011, [
    'verify:dev-011-012-production-ui-smoke-readiness',
    'Production UI Smoke Readiness Gate Added',
    'Production UI Smoke Pending',
  ]),
);

add(
  'QA-DEV-012 references this readiness gate and keeps production UI smoke pending',
  includesAll(contents.qa012, [
    'verify:dev-011-012-production-ui-smoke-readiness',
    'Production UI Smoke Readiness Gate Added',
    'Production UI Smoke Pending',
  ]),
);

add(
  'QC report documents backend pass, readiness gate, and remaining explicit execution boundary',
  includesAll(contents.qc, [
    'Backend Pass / UI Readiness Gate Added / UI Pending',
    'verify:dev-011-012-production-ui-smoke-readiness',
    'production 臨時 user / tenant / board / record fixture',
    'mutates_database=false',
  ]),
);

add(
  'dev_task keeps DEV-011/012 in verification and records the remaining production UI smoke gate',
  includesAll(contents.devTask, [
    'Production UI Smoke Readiness Gate Added',
    'verify:dev-011-012-production-ui-smoke-readiness',
    'production UI smoke',
    'AI整理',
    '任務知識',
  ]),
);

add(
  'documentation map reflects readiness progress without closing DEV-011/012',
  includesAll(contents.documentationMap, [
    'DEV-011 / DEV-012',
    'Production UI Smoke Readiness Gate Added',
    'UI Pending',
    'meeting mode',
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
