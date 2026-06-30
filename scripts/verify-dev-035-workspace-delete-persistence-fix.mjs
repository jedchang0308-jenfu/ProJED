import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  migration: 'supabase/migrations/20260629113000_workspace_delete_rpc.sql',
  supabaseService: 'src/services/supabase/projedService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  boardStore: 'src/store/useBoardStore.ts',
  types: 'src/types/index.ts',
  contextMenu: 'src/components/GlobalContextMenu.tsx',
  packageJson: 'package.json',
  browserVerifier: 'scripts/verify-dev-035-workspace-delete-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md',
  qa: 'ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md',
  qc: 'ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md',
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
  'migration defines owner-only security definer RPC',
  source.migration.includes('create or replace function public.delete_workspace(target_tenant_id uuid)') &&
    source.migration.includes('security definer') &&
    source.migration.includes('set search_path = public') &&
    source.migration.includes("tm.role = 'owner'") &&
    source.migration.includes("tm.status = 'active'") &&
    source.migration.includes('tm.user_id = (select auth.uid())') &&
    source.migration.includes('delete from public.tenants') &&
    !/create\s+policy[\s\S]*tenants[\s\S]*for\s+delete/i.test(source.migration),
);

assert(
  'migration revokes public and anon execute and grants authenticated/service_role',
  source.migration.includes('revoke all on function public.delete_workspace(uuid) from public') &&
    source.migration.includes('revoke all on function public.delete_workspace(uuid) from anon') &&
    source.migration.includes('grant execute on function public.delete_workspace(uuid) to authenticated, service_role'),
);

assert(
  'supabase service deletes through RPC instead of direct tenants delete',
  source.supabaseService.includes("supabase.rpc('delete_workspace'") &&
    source.supabaseService.includes('target_tenant_id: tenantId') &&
    !/from\('tenants'\)\s*\.\s*delete\(\)/.test(source.supabaseService),
);

assert(
  'supabase database types expose delete_workspace',
  source.databaseTypes.includes('delete_workspace:') &&
    source.databaseTypes.includes('Args: { target_tenant_id: string }') &&
    source.databaseTypes.includes('Returns: void'),
);

assert(
  'board store removeWorkspace waits for backend before mutating state',
  source.types.includes('removeWorkspace: (wsId: string) => Promise<void>') &&
    source.boardStore.includes('removeWorkspace: async (wsId) =>') &&
    source.boardStore.includes('await workspaceService.delete(wsId);') &&
    source.boardStore.indexOf('await workspaceService.delete(wsId);') < source.boardStore.indexOf('workspaces: state.workspaces.filter') &&
    source.boardStore.includes('safeSetItem(WS_STORAGE_KEY, null)') &&
    source.boardStore.includes('safeSetItem(BOARD_STORAGE_KEY, null)') &&
    source.boardStore.includes("safeSetItem(VIEW_STORAGE_KEY, 'home')") &&
    source.boardStore.includes('safeSetItem(MODAL_STORAGE_KEY, null)') &&
    source.boardStore.includes("currentView: isActiveWorkspaceDeleted || isActiveBoardDeleted ? 'home'"),
);

assert(
  'context menu awaits delete and gives visible success/error feedback',
  source.contextMenu.includes('const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false)') &&
    source.contextMenu.includes('await removeWorkspace(workspaceId)') &&
    source.contextMenu.includes('toast.success(`已刪除工作區') &&
    source.contextMenu.includes('toast.error(error instanceof Error ? error.message') &&
    source.contextMenu.includes('disabled={isDeletingWorkspace || !canDeleteWorkspaceInWorkspace(contextMenuState.workspaceId)}') &&
    !source.contextMenu.includes('removeWorkspace(workspaceId);\n      showHome();'),
);

assert(
  'browser verifier covers cancel, reload persistence, active cleanup, and mobile smoke',
  source.browserVerifier.includes('workspace-delete-cancel-keeps-persistence') &&
  source.browserVerifier.includes('workspace-delete-reload-persistence') &&
    source.browserVerifier.includes('active-workspace-delete-cleanup') &&
    source.browserVerifier.includes('projed-local-test.workspaces') &&
    source.browserVerifier.includes('await page.reload({ waitUntil:') &&
    source.browserVerifier.includes('projed-last-board') &&
    source.browserVerifier.includes('dev-035-mobile-after-active-delete.png'),
);

assert(
  'package exposes DEV-035 gates',
  source.packageJson.includes('"verify:dev-035-workspace-delete-persistence-fix"') &&
    source.packageJson.includes('"verify:dev-035-workspace-delete-browser"'),
);

assert(
  'PM docs register SPEC and QA for DEV-035',
  source.spec.includes('SPEC-035') &&
    source.qa.includes('QA-DEV-035') &&
    source.qc.includes('QC-DEV-035') &&
    source.devTask.includes('### DEV-035: 工作區刪除持久化修正') &&
    source.devTask.includes('QA 驗證計畫') &&
    source.documentationMap.includes('SPEC-035-workspace-delete-persistence-fix.md') &&
    source.documentationMap.includes('QA-DEV-035-workspace-delete-persistence-fix.md') &&
    source.documentationMap.includes('QC-DEV-035-workspace-delete-persistence-fix.md'),
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
