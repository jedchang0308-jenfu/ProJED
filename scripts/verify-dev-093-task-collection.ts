import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildTaskCollectionSnapshot } from '../src/features/taskCollection/snapshot';
import { canonicalJsonSha256, canonicalJsonStringify } from '../src/features/taskCollection/canonicalJson';
import { projectTaskCollectionContent } from '../src/features/taskCollection/contentProjection';
import type { TaskNode } from '../src/types';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const failures: string[] = [];
const caseResults: Array<{ id: string; status: 'PASS' | 'FAIL'; expected: string; actual: string; evidence: string[] }> = [];
const check = (name: string, condition: boolean) => {
  const status = condition ? 'PASS' : 'FAIL';
  caseResults.push({ id: name, status, expected: `${name} should pass`, actual: condition ? 'condition=true' : 'condition=false', evidence: ['static source/pure verifier'] });
  if (!condition) failures.push(name);
};

const nodes: TaskNode[] = [
  { id: 'root', workspaceId: 'ws', boardId: 'board', parentId: null, title: '根任務', status: 'in_progress', nodeType: 'task', order: 0, updatedAt: 100, createdAt: 1 },
  { id: 'child', workspaceId: 'ws', boardId: 'board', parentId: 'root', title: '子任務', status: 'completed', nodeType: 'task', order: 0, isArchived: true, updatedAt: 90, createdAt: 2 },
  { id: 'other', workspaceId: 'ws', boardId: 'board', parentId: null, title: '其他', status: 'todo', nodeType: 'task', order: 1, updatedAt: 80, createdAt: 3 },
];

const snapshot = buildTaskCollectionSnapshot({
  workspaceId: 'ws', boardId: 'board', boardTitle: '測試看板', rootItemId: 'root', collectedAt: 200,
  nodes,
  dependencies: [
    { id: 'internal', fromId: 'root', fromSide: 'end', toId: 'child', toSide: 'start', offset: 2 },
    { id: 'external', fromId: 'root', fromSide: 'end', toId: 'other', toSide: 'start' },
  ],
  activityEvents: [{ id: 'a1', workspaceId: 'ws', boardId: 'board', eventType: 'task_created', entityTable: 'wbs_items', entityId: 'child', payload: {}, createdAt: 50 }],
  linkedRecords: [],
});

check('subtree includes archived descendant', snapshot.nodes.length === 2 && snapshot.nodes.some(node => node.id === 'child' && node.isArchived));
check('boundary dependency preserved', snapshot.dependencies.length === 2 && snapshot.dependencies.some(dependency => dependency.kind === 'boundary'));
check('root parent normalized', snapshot.nodes.find(node => node.id === 'root')?.parentId === null && snapshot.nodes.find(node => node.id === 'root')?.parentStorageId === null);
check('activity dependency scope', snapshot.activityEvents.length === 1);
check('projection escapes untrusted text', projectTaskCollectionContent({ ...snapshot, nodes: snapshot.nodes.map(node => node.id === 'child' ? { ...node, title: '<unsafe>' } : node) }).includes('&lt;unsafe&gt;'));
check('cycle fails closed', (() => { try { buildTaskCollectionSnapshot({ workspaceId: 'ws', boardId: 'board', rootItemId: 'root', collectedAt: 1, nodes: nodes.map(node => node.id === 'root' ? { ...node, parentId: 'child' } : node), dependencies: [], activityEvents: [], linkedRecords: [] }); return false; } catch { return true; } })());
check('canonical key ordering', canonicalJsonStringify({ b: 1, a: 'x' }) === '{"a":"x","b":1}');
check('canonical arrays preserve order', canonicalJsonStringify({ values: [2, 1] }) === '{"values":[2,1]}');
check('unsafe integer rejected', (() => { try { canonicalJsonStringify(Number.MAX_SAFE_INTEGER + 1); return false; } catch { return true; } })());

const sourceChecks: Array<[string, string, string]> = [
  ['types', 'src/types/index.ts', "'task_collection'"],
  ['discriminated record union', 'src/types/index.ts', 'export type KnowledgeRecord = EditableKnowledgeRecord | TaskCollectionRecord;'],
  ['editable record store', 'src/store/useRecordStore.ts', 'records: EditableKnowledgeRecord[];'],
  ['collect capability', 'src/types/index.ts', "'collect_task'"],
  ['action catalog', 'src/interactions/task/taskActionCatalog.ts', "task.collect"],
  ['task service adapter', 'src/services/dataBackend.ts', 'taskCollectionService'],
  ['local transaction journal', 'src/features/taskCollection/localJournal.ts', 'prepared'],
  ['immutable dialog', 'src/components/TaskCollectionDialog.tsx', 'preview-loading'],
  ['dialog focus trap', 'src/components/TaskCollectionDialog.tsx', "event.key !== 'Tab'"],
  ['records section', 'src/components/Records/RecordsView.tsx', 'data-record-section="task-collections"'],
  ['records section controls', 'src/components/Records/RecordsView.tsx', 'data-record-section-controls="true"'],
  ['records tab semantics', 'src/components/Records/RecordsView.tsx', 'role="tab"'],
  ['records panel semantics', 'src/components/Records/RecordsView.tsx', 'role="tabpanel"'],
  ['collection detail tree', 'src/components/Records/TaskCollectionDetail.tsx', 'data-task-collection-tree'],
  ['collection detail dependencies', 'src/components/Records/TaskCollectionDetail.tsx', 'data-task-collection-dependencies'],
  ['collection detail history', 'src/components/Records/TaskCollectionDetail.tsx', 'data-task-collection-history'],
  ['collection detail related records', 'src/components/Records/TaskCollectionDetail.tsx', 'data-task-collection-related-records'],
  ['collection source entry', 'src/components/Records/TaskCollectionDetail.tsx', 'data-task-collection-open-source'],
  ['migration rpc', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'collect_task_subtree'],
  ['migration row security', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'security definer'],
  ['migration search index', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'knowledge_records_collection_search_idx'],
  ['migration cycle guard', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'task_collection_has_cycle'],
  ['migration recursive depth', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'parent.depth + 1 as depth'],
  ['migration board title fallback', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'p_project_id::text'],
  ['migration preview snake_case wire', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', "'task_count'"],
  ['migration collect snake_case wire', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', "'record_id'"],
  ['migration canonical json helper', 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql', 'canonical_json_v1'],
  ['supabase response-lost operation readback', 'src/services/supabase/projedService.ts', 'getOperationResult(workspaceId, boardId, operationId)'],
  ['local response-lost fault recovery', 'src/services/localTestService.ts', 'response-lost-once'],
  ['isolated db verifier', 'scripts/verify-dev-093-task-collection-db-isolated.ps1', 'TEMP_RUNTIME_CLEANED'],
  ['isolated db command', 'package.json', 'verify:dev-093-task-collection-db-isolated'],
  ['local Supabase db verifier', 'scripts/verify-dev-093-task-collection-db-local.ps1', 'TEMP_LOCAL_DB_CLEANED'],
  ['local Supabase db command', 'package.json', 'verify:dev-093-task-collection-db-local'],
  ['local Supabase dblink matrix branch', 'scripts/verify-dev-093-task-collection-db-matrix.sql', 'dev093_dblink_conninfo'],
  ['immutable source storage', 'src/services/localTestService.ts', 'sourceRootStorageId'],
  ['compact rail keeps four actions', 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx', "key: 'toggle-complete'"],
  ['compact rail keeps archive as fourth action', 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx', "key: 'archive'"],
  ['compact rail excludes collection action', 'src/components/Wbs/taskDrag/taskDragTypes.ts', "MobileTaskAction = 'toggle-complete' | 'add-sibling' | 'add-child' | 'archive'"],
];
for (const [name, path, snippet] of sourceChecks) check(`${name}: ${snippet}`, read(path).includes(snippet));

const hash = await canonicalJsonSha256(snapshot);
check('sha256 lowercase hex', /^[0-9a-f]{64}$/.test(hash));

const generatedAt = new Date().toISOString();
const result = {
  dev: 'DEV-093',
  devId: 'DEV-093',
  sourceRevision: 'working-tree',
  generatedAt,
  environment: 'local-test',
  provider: 'local-test',
  command: 'npm run verify:dev-093-task-collection',
  runtime: 'static source/pure verifier; no external runtime',
  cases: caseResults,
  summary: { PASS: caseResults.filter(item => item.status === 'PASS').length, FAIL: caseResults.filter(item => item.status === 'FAIL').length, NOT_RUN: 0, BLOCKED: 0 },
  passed: failures.length === 0,
  checks: caseResults.length,
  failures,
  hash,
};
mkdirSync(`${root}/output/qa/dev-093`, { recursive: true });
writeFileSync(`${root}/output/qa/dev-093/static-result.json`, JSON.stringify(result, null, 2));
if (failures.length) {
  console.error('DEV-093 static verification failed.');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`DEV-093 static verification passed: ${result.checks} checks.`);
