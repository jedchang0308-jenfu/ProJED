import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  boardMembersPanel: 'src/components/BoardMembersPanel.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  settingsView: 'src/components/SettingsView.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-026-trello-like-board-share-ui.md',
  qa: 'ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];

const assert = (name, ok, details = undefined) => {
  results.push({ name, ok, details });
};

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const panel = read(files.boardMembersPanel);
const mainLayout = read(files.mainLayout);
const settings = read(files.settingsView);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);

assert(
  'topbar exposes share button',
  mainLayout.includes('data-board-share-open') &&
    mainLayout.includes('BoardShareDialog') &&
    mainLayout.includes('setShareDialogOpen(true)'),
);

assert(
  'share dialog has Trello-like task surface',
  panel.includes('export const BoardShareDialog') &&
    panel.includes('data-board-share-dialog') &&
    panel.includes('分享看板') &&
    panel.includes('電子郵件地址或名稱') &&
    panel.includes('看板成員') &&
    panel.includes('加入要求'),
);

assert(
  'invite flow keeps existing invite token contract',
  panel.includes('generateBoardInviteToken') &&
    panel.includes('hashBoardInviteToken') &&
    panel.includes('buildBoardInviteUrl') &&
    panel.includes('boardInviteService.create') &&
    panel.includes('boardInviteService.revoke'),
);

assert(
  'settings keeps advanced permission matrix',
  settings.includes('BoardMembersPanel') &&
    panel.includes('data-board-permission-settings') &&
    panel.includes('角色權限矩陣') &&
    panel.includes('normalizeBoardRolePermissionMatrix'),
);

assert(
  'permission disabled reason is visible',
  panel.includes('你沒有管理看板成員的權限') &&
    panel.includes('disabled={!canManageBoardMembers') &&
    panel.includes('disabled={!canManage'),
);

assert(
  'member and pending invite regions have stable selectors',
  panel.includes('data-board-share-members') &&
    panel.includes('data-board-share-requests') &&
    panel.includes('data-board-share-submit'),
);

assert(
  'role labels use Maxima-friendly business terms without changing role keys',
  panel.includes("admin: '系統管理員'") &&
    panel.includes("project_manager: '專案負責人'") &&
    panel.includes("owner: '擁有者'") &&
    panel.includes("member: '成員'") &&
    panel.includes("viewer: '檢視者'"),
);

assert(
  'package exposes DEV-026 verifier',
  pkg.includes('"verify:dev-026-trello-like-board-share-ui"'),
);

assert(
  'PM docs define DEV-026 scope and QA',
  spec.includes('SPEC-026') &&
    spec.includes('Trello-like') &&
    spec.includes('不新增資料表') &&
    qa.includes('QA-DEV-026') &&
    qa.includes('Visible Error Sweep'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
