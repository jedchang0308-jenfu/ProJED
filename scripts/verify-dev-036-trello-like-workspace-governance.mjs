import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  sidebar: 'src/components/Sidebar.tsx',
  globalContextMenu: 'src/components/GlobalContextMenu.tsx',
  homeView: 'src/components/HomeView.tsx',
  app: 'src/App.tsx',
  boardStore: 'src/store/useBoardStore.ts',
  localTestEnvironment: 'src/utils/localTestEnvironment.ts',
  types: 'src/types/index.ts',
  dataBackend: 'src/services/dataBackend.ts',
  supabaseService: 'src/services/supabase/projedService.ts',
  packageJson: 'package.json',
  browserVerifier: 'scripts/verify-dev-036-trello-like-workspace-governance-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-036-trello-like-workspace-governance.md',
  adr: 'ai-doc/decisions/ADR-036-trello-like-workspace-governance.md',
  qa: 'ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md',
  qc: 'ai-doc/qc/QC-DEV-036-trello-like-workspace-governance.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'addWorkspace has awaitable backend-success-first contract',
  source.types.includes('addWorkspace: (title?: string) => Promise<Workspace>') &&
    source.boardStore.includes('addWorkspace: async (title) =>') &&
    source.boardStore.includes('const createdWorkspace = await workspaceService.create(userId, workspaceTitle);') &&
    source.boardStore.includes("throw new Error('建立工作區失敗：後端未回傳工作區識別碼。')") &&
    source.boardStore.indexOf('const createdWorkspace = await workspaceService.create') < source.boardStore.indexOf('safeSetItem(WS_STORAGE_KEY, createdWorkspace.id)') &&
    source.boardStore.indexOf('const createdWorkspace = await workspaceService.create') < source.boardStore.indexOf('set((state) =>') &&
    !source.boardStore.includes("const tempId = 'ws_' + Date.now()"),
);

assert(
  'workspace create clears active board and keeps user on home after success',
  source.boardStore.includes('safeSetItem(BOARD_STORAGE_KEY, null)') &&
    source.boardStore.includes("safeSetItem(VIEW_STORAGE_KEY, 'home')") &&
    source.boardStore.includes('activeBoardId: null') &&
    source.boardStore.includes("currentView: 'home'") &&
    source.boardStore.includes('return createdWorkspace;'),
);

assert(
  'local-test seed preserves workspace overview with no active board',
  source.localTestEnvironment.includes("'home',") &&
    source.localTestEnvironment.includes('const shouldKeepWorkspaceOverview = nextView === \'home\' && Boolean(storedWorkspace) && !storedActiveBoardId;') &&
    source.localTestEnvironment.includes('const nextActiveBoardId = shouldKeepWorkspaceOverview') &&
    source.localTestEnvironment.includes("localStorage.removeItem('projed-last-board')"),
);

assert(
  'sidebar removes persistent create workspace button and exposes context-menu create flow',
  !source.sidebar.includes('data-sidebar-create-workspace-button="true"') &&
    source.sidebar.includes('data-sidebar-workspace-list="true"') &&
    source.sidebar.includes("kind: 'sidebar'") &&
    source.globalContextMenu.includes('data-context-menu-create-workspace="true"') &&
    source.globalContextMenu.includes('<span>新增工作區</span>') &&
    source.globalContextMenu.includes('requestCreateWorkspace()') &&
    source.boardStore.includes('pendingWorkspaceCreateRequestId') &&
    source.sidebar.includes('data-workspace-create-dialog="true"') &&
    source.sidebar.includes('工作區名稱') &&
    source.sidebar.includes('disabled={isCreatingWorkspace || !newWorkspaceTitle.trim()}') &&
    source.sidebar.includes('await addWorkspace(title)') &&
    source.sidebar.includes('toast.success(`已建立工作區') &&
    source.sidebar.includes('toast.error(message)'),
);

assert(
  'home view groups boards by workspace and keeps empty workspace board CTA',
  source.homeView.includes('工作區總覽') &&
    source.homeView.includes('data-home-workspace-section="true"') &&
    source.homeView.includes('data-empty-workspace-create-board="true"') &&
    source.homeView.includes('workspace.boards.map') &&
    source.homeView.includes('switchBoard(workspace.id, board.id)') &&
    !source.homeView.includes('workspaces.flatMap') &&
    !source.homeView.includes('<h2 className="text-2xl font-bold text-slate-800">我的工作區</h2>'),
);

assert(
  'first-run default workspace create is awaited with visible error path',
  source.app.includes("addWorkspace('我的工作區').catch") &&
    source.app.includes("toast.error(error instanceof Error ? error.message : '建立預設工作區失敗，請稍後再試。')"),
);

assert(
  'existing Supabase and data backend create path remains schema-neutral',
  source.dataBackend.includes('supabaseWorkspaceService.create(title)') &&
    source.supabaseService.includes("supabase.rpc('create_tenant_with_owner'") &&
    source.spec.includes('不新增 Workspace billing、seat、quota 或付費邏輯') &&
    source.qa.includes('若 Phase 1 僅改 UI / local-test，不必新增 migration'),
);

assert(
  'DEV-036 PM docs capture fixed decisions, scope, QA, and stop conditions',
    source.spec.includes('Workspace create 採 backend-success-first，不採 optimistic UI') &&
    source.spec.includes('First-run 預設 Workspace 名稱固定為 `我的工作區`') &&
    source.adr.includes('Workspace create 採 backend-success-first') &&
    source.qa.includes('Workspace Create Failure Modes') &&
    source.qa.includes('QA-036-F01') &&
    source.qa.includes('Workspace 清單不新增任何 local-only 項目') &&
    source.qc.includes('Local Automated QC Passed / DB unchanged') &&
    source.qc.includes('DEV-036 static') &&
    source.devTask.includes('Phase 1 RD acceptance') &&
    source.devTask.includes('若 Workspace create 無法做到 backend-success-first') &&
    source.documentationMap.includes('Local Automated QC Passed / DB unchanged'),
);

assert(
  'browser verifier and package scripts are registered',
  source.browserVerifier.includes('workspace-create-reload-persistence') &&
    source.browserVerifier.includes('second-workspace-create') &&
    source.browserVerifier.includes('mobile-viewport-smoke') &&
    source.packageJson.includes('"verify:dev-036-trello-like-workspace-governance"') &&
    source.packageJson.includes('"verify:dev-036-trello-like-workspace-governance-browser"'),
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
