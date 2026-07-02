import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  taskZoneView: 'src/components/TaskZoneView.tsx',
  boardView: 'src/components/BoardView.tsx',
  taskZoneStore: 'src/store/useTaskZoneStore.ts',
  wbsStore: 'src/store/useWbsStore.ts',
  dataBackend: 'src/services/dataBackend.ts',
  projedService: 'src/services/supabase/projedService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  types: 'src/types/index.ts',
  migration: 'supabase/migrations/20260702040000_dev_042_workbench_staging.sql',
  spec: 'ai-doc/specs/SPEC-042-task-workbench-cross-workspace-staging.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = (file) => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok: Boolean(ok), details });
const containsAll = (content, values) => values.every(value => content.includes(value));

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const packageJson = read(files.packageJson);
const taskZoneView = read(files.taskZoneView);
const boardView = read(files.boardView);
const taskZoneStore = read(files.taskZoneStore);
const wbsStore = read(files.wbsStore);
const dataBackend = read(files.dataBackend);
const projedService = read(files.projedService);
const databaseTypes = read(files.databaseTypes);
const types = read(files.types);
const migration = read(files.migration);
const spec = read(files.spec);
const devTask = read(files.devTask);
const documentationMap = read(files.documentationMap);

assert(
  'package exposes DEV-042 workbench staging verifier',
  containsAll(packageJson, [
    '"verify:dev-042-workbench-staging"',
    'verify-dev-042-workbench-staging.mjs',
  ]),
);

assert(
  'TaskZoneView exposes a first-class staging drop zone',
  containsAll(taskZoneView, [
    'TaskZoneStagingDropZone',
    'useDroppable',
    "id: 'task-zone-staging-drop'",
    "type: 'task-zone-staging-drop'",
    'data-task-zone-staging-drop="true"',
    'data-task-zone-staging-drop-active',
    '把已歸位任務拖到這裡',
  ]),
);

assert(
  'BoardView routes placed tasks into workbench staging before normal board moves',
  containsAll(boardView, [
    'getTaskZoneStageErrorMessage',
    "overData?.type === 'task-zone-staging-drop'",
    'stagePlacedTask',
    'removeNodeLocal(nodeId)',
    '已移回待歸位',
    'place_task_to_workbench_staging',
  ]),
);

assert(
  'stores provide non-persistent local removal and staged task insertion',
  containsAll(taskZoneStore, [
    'stagePlacedTask',
    "createClientMutationId('workbench_stage')",
    'nodeService.stageToWorkbench',
    'assignedTasks: sortTasks(state.assignedTasks.filter(task => task.id !== input.taskId))',
  ]) &&
  containsAll(wbsStore, [
    'removeNodeLocal',
    'idsToRemove',
    'delete updatedNodes[nodeId]',
    '_buildIndices(updatedNodes)',
  ]),
);

assert(
  'service layer exposes Supabase-only staging RPC contract',
  containsAll(dataBackend, [
    'TaskWorkbenchStageInput',
    'TaskWorkbenchStageResult',
    'stageToWorkbench',
    'supabaseNodeService.stageToWorkbench(input)',
  ]) &&
  containsAll(projedService, [
    'isMissingWorkbenchStagingRpcError',
    'stageToWorkbench',
    "rpc('place_task_to_workbench_staging'",
    'p_stage_client_mutation_id',
    '資料庫尚未載入 place_task_to_workbench_staging RPC',
  ]),
);

assert(
  'types and generated Supabase types include workbench staging contracts',
  containsAll(types, [
    'TaskWorkbenchStageInput',
    'TaskWorkbenchStageResult',
    "placementStatus?: 'placed' | 'unplaced' | 'staged'",
    'stagedFromWorkspaceId',
    'stagedFromBoardId',
  ]) &&
  containsAll(databaseTypes, [
    'place_task_to_workbench_staging',
    'p_stage_client_mutation_id',
    'source_tenant_id',
    'source_project_id',
  ]),
);

assert(
  'migration creates secured staging RPC and keeps re-placement compatible',
  containsAll(migration, [
    'create or replace function public.place_task_to_workbench_staging',
    'security definer',
    'set search_path = public, private, extensions',
    'private.current_user_can_write_project',
    'ensure_personal_task_zone',
    'staged_by_user_id',
    'staged_from_project_id',
    'Workbench staging requires a tag-transfer policy first',
    'create or replace function public.place_personal_task_on_board',
    "coalesce(v_task.metadata ->> 'staged_by_user_id', '') <> v_user_id::text",
    'revoke all on function public.place_task_to_workbench_staging',
    'grant execute on function public.place_task_to_workbench_staging',
    "notify pgrst, 'reload schema'",
  ]),
);

assert(
  'DEV-042 documents record Phase 2 implementation slice and validation boundary',
  containsAll(spec, [
    'Phase 2 Implementation Slice',
    'place_task_to_workbench_staging',
    'tag-transfer policy',
  ]) &&
  containsAll(devTask, [
    'DEV-042 Phase 2 RD implementation slice',
    'Validation status: Executed locally on 2026-07-02',
    'No production migration, deploy, push or git commit',
  ]) &&
  containsAll(documentationMap, [
    'scripts/verify-dev-042-workbench-staging.mjs',
    '20260702040000_dev_042_workbench_staging.sql',
  ]),
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
