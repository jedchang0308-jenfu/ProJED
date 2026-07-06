import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const files = {
  migration: 'supabase/migrations/20260618120000_controlled_project_workspace_transfer.sql',
  types: 'src/types/index.ts',
  dataBackend: 'src/services/dataBackend.ts',
  supabaseService: 'src/services/supabase/projedService.ts',
  localTestService: 'src/services/localTestService.ts',
  mutatingQcFixtureReadiness: 'scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
  mutatingQcReadiness: 'scripts/verify-dev-025-mutating-qc-readiness.mjs',
  mutatingQcExecution: 'scripts/verify-dev-025-mutating-qc-execution.mjs',
  boardStore: 'src/store/useBoardStore.ts',
  permissions: 'src/hooks/useBoardPermissions.ts',
  contextMenu: 'src/components/GlobalContextMenu.tsx',
  spec: 'ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md',
  qa: 'ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  packageJson: 'package.json',
};

const contents = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, read(path)]),
);

const checks = [
  {
    name: 'Migration defines preview and move RPCs as SECURITY DEFINER with fixed search_path',
    pass:
      contents.migration.includes('create or replace function public.preview_project_workspace_transfer') &&
      contents.migration.includes('create or replace function public.move_project_to_workspace') &&
      (contents.migration.match(/security definer/g) || []).length >= 2 &&
      (contents.migration.match(/set search_path = public, private, extensions/g) || []).length >= 2,
  },
  {
    name: 'Migration revokes public/anon execute and grants authenticated/service_role',
    pass:
      contents.migration.includes('revoke all on function public.preview_project_workspace_transfer(uuid, uuid, uuid) from public') &&
      contents.migration.includes('revoke all on function public.preview_project_workspace_transfer(uuid, uuid, uuid) from anon') &&
      contents.migration.includes('revoke all on function public.move_project_to_workspace(uuid, uuid, uuid, text) from public') &&
      contents.migration.includes('revoke all on function public.move_project_to_workspace(uuid, uuid, uuid, text) from anon') &&
      contents.migration.includes('grant execute on function public.preview_project_workspace_transfer(uuid, uuid, uuid) to authenticated, service_role') &&
      contents.migration.includes('grant execute on function public.move_project_to_workspace(uuid, uuid, uuid, text) to authenticated, service_role'),
  },
  {
    name: 'Migration handles composite FK update cascade for project tenant changes',
    pass:
      contents.migration.includes('board_invites_project_tenant_fk') &&
      contents.migration.includes('board_role_permissions_tenant_id_project_id_fkey') &&
      (contents.migration.match(/on update cascade/g) || []).length >= 2,
  },
  {
    name: 'Migration enforces source manager, target workspace admin, lock, and name confirmation',
    pass:
      contents.migration.includes('private.current_user_can_manage_project') &&
      contents.migration.includes('private.current_user_is_workspace_admin') &&
      contents.migration.includes('transferLocked') &&
      contents.migration.includes('Project name confirmation does not match'),
  },
  {
    name: 'Migration remaps tags, revokes pending invites, logs activity/audit, and queues RAG jobs',
    pass:
      contents.migration.includes('project_workspace_transferred') &&
      contents.migration.includes('board_workspace_transferred') &&
      contents.migration.includes('pendingInvitesToRevoke') &&
      contents.migration.includes('project_workspace_transfer') &&
      contents.migration.includes('movedFromTagId'),
  },
  {
    name: 'Types expose transfer preview, capability, activity, audit, and store action',
    pass:
      (
        contents.types.includes('type BoardWorkspaceTransferPreview') ||
        contents.types.includes('interface BoardWorkspaceTransferPreview')
      ) &&
      contents.types.includes("'move_board_between_workspaces'") &&
      contents.types.includes("'project_workspace_transferred'") &&
      contents.types.includes("'board_workspace_transferred'") &&
      contents.types.includes('moveBoardToWorkspace:'),
  },
  {
    name: 'Data services expose preview and move for Supabase and local-test',
    pass:
      contents.dataBackend.includes('previewWorkspaceTransfer') &&
      contents.dataBackend.includes('moveToWorkspace') &&
      contents.supabaseService.includes("rpc('preview_project_workspace_transfer'") &&
      contents.supabaseService.includes("rpc('move_project_to_workspace'") &&
      contents.localTestService.includes('previewWorkspaceTransfer') &&
      contents.localTestService.includes('moveToWorkspace'),
  },
  {
    name: 'Store moves board to target workspace only after service success',
    pass:
      contents.boardStore.includes('moveBoardToWorkspace: async') &&
      contents.boardStore.includes('await boardService.moveToWorkspace') &&
      contents.boardStore.includes('activeWorkspaceId: targetWorkspaceId') &&
      contents.boardStore.includes('activeBoardId: boardId'),
  },
  {
    name: 'UI adds context-menu controlled transfer dialog and confirmation guard',
    pass:
      contents.contextMenu.includes('移動到工作區') &&
      contents.contextMenu.includes('BoardWorkspaceTransferDialog') &&
      contents.contextMenu.includes('boardService.previewWorkspaceTransfer') &&
      contents.contextMenu.includes('confirmTitle.trim() === boardTitle') &&
      contents.contextMenu.includes('canMoveBoardBetweenWorkspaces'),
  },
  {
    name: 'PM docs register SPEC, QA, and DEV-025 verifier',
    pass:
      contents.spec.includes('DEV-025') &&
      contents.qa.includes('QA-DEV-025') &&
      contents.devTask.includes('DEV-025') &&
      contents.documentationMap.includes('SPEC-025-controlled-project-workspace-transfer.md') &&
      contents.documentationMap.includes('QA-DEV-025-controlled-project-workspace-transfer.md') &&
      contents.packageJson.includes('verify:dev-025-project-workspace-transfer'),
  },
  {
    name: 'Mutating DB QC has guarded readiness gates before any move execution',
    pass:
      contents.mutatingQcFixtureReadiness.includes('DEV025_QC_SOURCE_TENANT_ID') &&
      contents.mutatingQcFixtureReadiness.includes('DEV025_QC_MUTATION_CONFIRM') === false &&
      contents.mutatingQcFixtureReadiness.includes('script has no move RPC execution path') &&
      contents.mutatingQcFixtureReadiness.includes('mutates_database: false') &&
      contents.mutatingQcReadiness.includes('mutates_database: false') &&
      contents.mutatingQcReadiness.includes('package scripts do not directly execute the mutating move RPC') &&
      contents.mutatingQcExecution.includes('mutates_database: mutationAttempted') &&
      contents.mutatingQcExecution.includes('--run-mutating-fixture') &&
      contents.mutatingQcExecution.includes('DEV025_ALLOW_MUTATING_QC') &&
      contents.mutatingQcExecution.includes('DEV025_QC_FIXTURE_DISPOSABLE') &&
      contents.packageJson.includes('verify:dev-025-mutating-qc-readiness') &&
      contents.packageJson.includes('verify:dev-025-mutating-qc-fixture-readiness') &&
      contents.packageJson.includes('verify:dev-025-mutating-qc-execution'),
  },
];

const failures = checks.filter((check) => !check.pass);

if (failures.length > 0) {
  console.error('DEV-025 project workspace transfer verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log(`DEV-025 project workspace transfer verification passed (${checks.length} checks).`);
