import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const files = {
  spec: 'ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md',
  qa: 'ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md',
  qc: 'ai-doc/qc/QC-DEV-023-record-project-change-import-workflow-step.md',
  devTask: 'ai-doc/dev_task.md',
  backlog: 'ai-doc/backlog.md',
  documentationMap: 'ai-doc/documentation_map.md',
  pdca020: 'ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md',
  recordSidebar: 'src/components/Records/RecordSidebar.tsx',
  packageJson: 'package.json',
};

const contents = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, read(path)]),
);

const checks = [
  {
    name: 'SPEC-023 is attached to DEV-020 as an implemented dev point',
    pass:
      contents.spec.includes('對應 DEV: DEV-023') &&
      contents.spec.includes('父交付點: DEV-020') &&
      contents.spec.includes('節點類型: 開發點') &&
      contents.spec.includes('狀態: Implemented / Browser QC Passed') &&
      contents.spec.includes('是否計入產品交付完成: 否'),
  },
  {
    name: 'SPEC-023 defines meeting and work-log workflows with project import first',
    pass:
      contents.spec.includes('匯入 -> 速記 -> AI整理 -> 校稿 -> 發布') &&
      contents.spec.includes('匯入 -> 撰寫 -> 存草稿 -> 發布'),
  },
  {
    name: 'SPEC-023 requires collapsed import settings and workflow-contained panel',
    pass:
      contents.spec.includes('預設收合匯入設定') &&
      contents.spec.includes('data-project-change-import-panel') &&
      contents.spec.includes('workflow card 內') &&
      contents.spec.includes('不再作為 workflow 上方的獨立大卡片'),
  },
  {
    name: 'SPEC-023 preserves DEV-021 / DEV-022 guards',
    pass:
      contents.spec.includes('wrapProjectChangeImportContent') &&
      contents.spec.includes('DEV-021') &&
      contents.spec.includes('DEV-022') &&
      contents.spec.includes('不改資料庫 schema') &&
      contents.spec.includes('不改 record content persistence 格式'),
  },
  {
    name: 'SPEC-023 exposes stable workflow markers',
    pass:
      contents.spec.includes('data-record-composer-workflow') &&
      contents.spec.includes('data-meeting-workflow-step="project_import"') &&
      contents.spec.includes('data-work-log-workflow-step="project_import"') &&
      contents.spec.includes('data-project-change-import-panel'),
  },
  {
    name: 'QA-DEV-023 covers meeting, work-log, standalone-card removal, expand-on-click, empty/error, and viewport cases',
    pass:
      contents.qa.includes('TC-001') &&
      contents.qa.includes('TC-002') &&
      contents.qa.includes('TC-003') &&
      contents.qa.includes('TC-004') &&
      contents.qa.includes('TC-008') &&
      contents.qa.includes('TC-010') &&
      contents.qa.includes('workflow 上方不得出現獨立') &&
      contents.qa.includes('1024px') &&
      contents.qa.includes('1440px'),
  },
  {
    name: 'QA-DEV-023 includes real operation tests with evidence requirements',
    pass:
      contents.qa.includes('## 真實操作測試') &&
      contents.qa.includes('ROT-001') &&
      contents.qa.includes('ROT-002') &&
      contents.qa.includes('ROT-003') &&
      contents.qa.includes('ROT-004') &&
      contents.qa.includes('ROT-005') &&
      contents.qa.includes('ROT-006') &&
      contents.qa.includes('ROT-007') &&
      contents.qa.includes('browser 中實際點擊') &&
      contents.qa.includes('必留證據') &&
      contents.qa.includes('截圖') &&
      contents.qa.includes('viewport'),
  },
  {
    name: 'QA-DEV-023 includes FMEA, data needs, and failure evidence collection',
    pass:
      contents.qa.includes('## FMEA 風險表') &&
      contents.qa.includes('## 資料需求') &&
      contents.qa.includes('## 失敗時需收集的證據') &&
      contents.qa.includes('失效模式') &&
      contents.qa.includes('可能原因') &&
      contents.qa.includes('使用者影響') &&
      contents.qa.includes('偵測方式') &&
      contents.qa.includes('優先級'),
  },
  {
    name: 'QC-DEV-023 records browser QC evidence and DB unchanged boundary',
    pass:
      contents.qc.includes('Browser QC Passed / DB unchanged') &&
      contents.qc.includes('verify:dev-020-project-change-import-browser') &&
      contents.qc.includes('dev-020-record-workflow-1440.png') &&
      contents.qc.includes('不新增資料庫 schema'),
  },
  {
    name: 'QA-DEV-023 regression commands include DEV-020 / DEV-021 / DEV-022 gates',
    pass:
      contents.qa.includes('verify:dev-020-record-workflow-redesign') &&
      contents.qa.includes('verify:dev-020-project-change-import-browser') &&
      contents.qa.includes('verify:dev-021-project-change-ai-preserve') &&
      contents.qa.includes('verify:dev-022-project-change-single-record') &&
      contents.qa.includes('npm.cmd run dev:test:server') &&
      contents.qa.includes('npm.cmd exec tsc -- --noEmit') &&
      contents.qa.includes('npm.cmd run build'),
  },
  {
    name: 'PM dev_task registers DEV-023 as implemented with SPEC / QA / QC / verifier evidence',
    pass:
      contents.devTask.includes('DEV-023: 專案變化匯入整併為紀錄流程第一步') &&
      contents.devTask.includes('父交付點: DEV-020') &&
      contents.devTask.includes('狀態: Implemented / Browser QC Passed / DB unchanged') &&
      contents.devTask.includes('SPEC-023') &&
      contents.devTask.includes('QA-DEV-023') &&
      contents.devTask.includes('QC-DEV-023') &&
      contents.devTask.includes('verify:dev-023-record-project-change-import-workflow-step'),
  },
  {
    name: 'Backlog registers DEV-023 as P1 UX refinement under DEV-020',
    pass:
      contents.backlog.includes('DEV-023') &&
      contents.backlog.includes('Implemented / Browser QC Passed') &&
      contents.backlog.includes('DEV-020') &&
      contents.backlog.includes('P1 UX refinement') &&
      contents.backlog.includes('SPEC-023-record-project-change-import-workflow-step.md'),
  },
  {
    name: 'Documentation map registers SPEC / QA and supersedes PDCA DEV-020 residual UI risk',
    pass:
      contents.documentationMap.includes('SPEC-023-record-project-change-import-workflow-step.md') &&
      contents.documentationMap.includes('QA-DEV-023-record-project-change-import-workflow-step.md') &&
      contents.documentationMap.includes('QC-DEV-023-record-project-change-import-workflow-step.md') &&
      contents.documentationMap.includes('supersedes PDCA-DEV-020') &&
      contents.documentationMap.includes('專案變化匯入仍在流程上方'),
  },
  {
    name: 'PDCA DEV-020 contains DEV-023 follow-up note',
    pass:
      contents.pdca020.includes('DEV-023 follow-up') &&
      contents.pdca020.includes('先匯入專案變化') &&
      contents.pdca020.includes('流程 step'),
  },
  {
    name: 'package.json exposes DEV-023 docs verifier',
    pass: contents.packageJson.includes(
      '"verify:dev-023-record-project-change-import-workflow-step": "node scripts/verify-dev-023-record-project-change-import-workflow-step.mjs"',
    ),
  },
  {
    name: 'RecordSidebar implements project import as the first meeting workflow step',
    pass:
      contents.recordSidebar.includes("stage: 'project_import'") &&
      contents.recordSidebar.includes('data-meeting-workflow-step={step.stage}') &&
      contents.recordSidebar.includes('meetingWorkflowStepsWithImport') &&
      contents.recordSidebar.includes('projectImportMeetingStep') &&
      contents.recordSidebar.includes('onToggleProjectImport'),
  },
  {
    name: 'RecordSidebar implements project import as the first work-log workflow step',
    pass:
      contents.recordSidebar.includes("id: 'project_import'") &&
      contents.recordSidebar.includes('data-work-log-workflow-step={step.id}') &&
      contents.recordSidebar.includes('projectImportWorkLogStep') &&
      contents.recordSidebar.includes('匯入、撰寫、存草稿與發布在同一條流程上操作。'),
  },
  {
    name: 'RecordSidebar keeps project change import panel inside workflow cards and default-collapsed',
    pass:
      contents.recordSidebar.includes('isProjectImportExpanded') &&
      contents.recordSidebar.includes('setIsProjectImportExpanded(false)') &&
      contents.recordSidebar.includes('const shouldShowProjectChangeImport = Boolean(canUseProjectChangeImport && isProjectImportExpanded)') &&
      contents.recordSidebar.includes('{projectChangeImportPanel ? (') &&
      contents.recordSidebar.includes('data-project-change-import-panel'),
  },
  {
    name: 'RecordSidebar inserts project change preview into task discussion section',
    pass:
      contents.recordSidebar.includes('extractProjectChangeImportTaskDiscussionBody(projectChangeImport.previewContent)') &&
      contents.recordSidebar.includes('normalizeProjectChangeDraftContent') &&
      contents.recordSidebar.includes('stripProjectChangeImportBlocks(draft.content)') &&
      contents.recordSidebar.includes('appendLineToMarkdownSection(cleanedDraftContent, MEETING_RECORD_TASKS_HEADING, projectChangeBody)') &&
      contents.recordSidebar.includes("stepState: 'inserted'") &&
      contents.recordSidebar.includes("stepState: 'skipped'"),
  },
];

const failures = checks.filter((check) => !check.pass);

if (failures.length > 0) {
  console.error('DEV-023 documentation verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log(`DEV-023 documentation verification passed (${checks.length} checks).`);
