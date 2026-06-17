import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const files = {
  spec: 'ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md',
  qa: 'ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md',
  devTask: 'ai-doc/dev_task.md',
  backlog: 'ai-doc/backlog.md',
  documentationMap: 'ai-doc/documentation_map.md',
  packageJson: 'package.json',
};

const contents = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, read(path)]),
);

const checks = [
  {
    name: 'SPEC-024 is Ready and attached to existing AI/record delivery points',
    pass:
      contents.spec.includes('對應 DEV: DEV-024') &&
      contents.spec.includes('父交付點: DEV-011 / DEV-012 / DEV-020') &&
      contents.spec.includes('關聯回歸: DEV-021 / DEV-022') &&
      contents.spec.includes('節點類型: 開發點') &&
      contents.spec.includes('狀態: Ready') &&
      contents.spec.includes('是否計入產品交付完成: 否'),
  },
  {
    name: 'SPEC-024 defines the real gap and forbids prompt-only fix',
    pass:
      contents.spec.includes('手寫內容') &&
      contents.spec.includes('章節結構') &&
      contents.spec.includes('deterministic human-draft merge guard') &&
      contents.spec.includes('不只靠 prompt') &&
      contents.spec.includes('Prompt 只能提高 AI 引用機率'),
  },
  {
    name: 'SPEC-024 defines merge algorithm and optimization constraints',
    pass:
      contents.spec.includes('mergeHumanDraftWithAiSynthesis') &&
      contents.spec.includes('Parse preserved draft') &&
      contents.spec.includes('Fingerprint comparison') &&
      contents.spec.includes('Deterministic fallback placement') &&
      contents.spec.includes('Idempotent cleanup') &&
      contents.spec.includes('fallback 補回只處理 AI 未涵蓋的最小必要段落'),
  },
  {
    name: 'SPEC-024 preserves DEV-021 / DEV-022 and single-record constraints',
    pass:
      contents.spec.includes('DEV-021') &&
      contents.spec.includes('DEV-022') &&
      contents.spec.includes('不新增第二份會議紀錄') &&
      contents.spec.includes('最後只能形成一份會議紀錄') &&
      contents.spec.includes('不改資料庫 schema') &&
      contents.spec.includes('不改 record content persistence 格式'),
  },
  {
    name: 'QA-DEV-024 covers required human-draft preserve cases',
    pass:
      contents.qa.includes('TC-001') &&
      contents.qa.includes('TC-002') &&
      contents.qa.includes('TC-003') &&
      contents.qa.includes('TC-004') &&
      contents.qa.includes('TC-005') &&
      contents.qa.includes('task mention') &&
      contents.qa.includes('idempotent'),
  },
  {
    name: 'QA-DEV-024 includes real operation tests and evidence',
    pass:
      contents.qa.includes('## 真實操作測試') &&
      contents.qa.includes('ROT-001') &&
      contents.qa.includes('ROT-002') &&
      contents.qa.includes('ROT-003') &&
      contents.qa.includes('ROT-004') &&
      contents.qa.includes('AI整理前後截圖') &&
      contents.qa.includes('內容節錄'),
  },
  {
    name: 'QA-DEV-024 includes FMEA and failure evidence collection',
    pass:
      contents.qa.includes('## FMEA 風險表') &&
      contents.qa.includes('## 失敗時需收集的證據') &&
      contents.qa.includes('失效模式') &&
      contents.qa.includes('可能原因') &&
      contents.qa.includes('使用者影響') &&
      contents.qa.includes('偵測方式'),
  },
  {
    name: 'QA-DEV-024 regression commands include DEV-021 / DEV-022 / DEV-011 / DEV-012 gates',
    pass:
      contents.qa.includes('verify:dev-024-ai-synthesis-preserve-human-draft') &&
      contents.qa.includes('verify:dev-021-project-change-ai-preserve') &&
      contents.qa.includes('verify:dev-022-project-change-single-record') &&
      contents.qa.includes('verify:dev-011-ai-meeting-synthesis') &&
      contents.qa.includes('verify:dev-012-meeting-record-quality') &&
      contents.qa.includes('npm.cmd exec tsc -- --noEmit') &&
      contents.qa.includes('npm.cmd run build'),
  },
  {
    name: 'PM dev_task registers DEV-024 as Ready',
    pass:
      contents.devTask.includes('DEV-024: AI整理保留手寫內容與章節結構') &&
      contents.devTask.includes('父交付點: DEV-011 / DEV-012 / DEV-020') &&
      contents.devTask.includes('狀態: Ready') &&
      contents.devTask.includes('SPEC-024') &&
      contents.devTask.includes('QA-DEV-024') &&
      contents.devTask.includes('verify:dev-024-ai-synthesis-preserve-human-draft'),
  },
  {
    name: 'Backlog registers DEV-024 as P1 AI synthesis guard',
    pass:
      contents.backlog.includes('DEV-024') &&
      contents.backlog.includes('Ready') &&
      contents.backlog.includes('P1 AI synthesis guard') &&
      contents.backlog.includes('SPEC-024-ai-synthesis-preserve-human-draft.md'),
  },
  {
    name: 'Documentation map registers SPEC / QA',
    pass:
      contents.documentationMap.includes('SPEC-024-ai-synthesis-preserve-human-draft.md') &&
      contents.documentationMap.includes('QA-DEV-024-ai-synthesis-preserve-human-draft.md') &&
      contents.documentationMap.includes('AI整理保留手寫內容與章節結構'),
  },
  {
    name: 'package.json exposes DEV-024 docs verifier',
    pass: contents.packageJson.includes(
      '"verify:dev-024-ai-synthesis-preserve-human-draft": "node scripts/verify-dev-024-ai-synthesis-preserve-human-draft.mjs"',
    ),
  },
];

const failures = checks.filter((check) => !check.pass);

if (failures.length > 0) {
  console.error('DEV-024 documentation verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log(`DEV-024 documentation verification passed (${checks.length} checks).`);
