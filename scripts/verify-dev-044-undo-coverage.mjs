import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });
const includesAll = (source, needles) => needles.every((needle) => source.includes(needle));

const files = {
  types: 'src/types/index.ts',
  undoStore: 'src/store/useUndoStore.ts',
  wbsStore: 'src/store/useWbsStore.ts',
  boardStore: 'src/store/useBoardStore.ts',
  recordStore: 'src/store/useRecordStore.ts',
  boardView: 'src/components/BoardView.tsx',
  wbsListView: 'src/components/Wbs/WbsListView.tsx',
  sharedTaskSidebar: 'src/components/SharedTaskSidebar.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md',
  qa: 'ai-doc/qa/QA-DEV-044-undo-recovery-scope-expansion.md',
  documentationMap: 'ai-doc/documentation_map.md',
  devTask: 'ai-doc/dev_task.md',
  browserVerifier: 'scripts/verify-dev-044-undo-coverage-browser.pw.js',
};

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files)
  .filter(([, file]) => existsSync(resolve(file)))
  .map(([label, file]) => [label, read(file)]));

assert(
  'UndoCommand is async-aware and scoped',
  includesAll(source.types, [
    "scope?: 'task' | 'board' | 'workspace' | 'record' | 'filter' | 'batch';",
    'entityIds?: string[];',
    'mergeKey?: string;',
    'undo: () => void | Promise<void>;',
    'redo: () => void | Promise<void>;',
    'isApplying: boolean;',
  ]),
);

assert(
  'useUndoStore suppresses push while applying commands',
  includesAll(source.undoStore, [
    'isApplying: false',
    'if (state.isApplying) return state;',
    'Promise.resolve(command.undo())',
    'Promise.resolve(command.redo())',
    "console.error('[Undo] undo failed:'",
    "console.error('[Undo] redo failed:'",
    'canUndo: () => !get().isApplying',
    'canRedo: () => !get().isApplying',
  ]),
);

assert(
  'Phase 2 batch task updates register one scoped undo command',
  includesAll(source.wbsStore, [
    'export type BatchNodeUpdates = Record<string, Partial<TaskNode>>;',
    'batchUpdateNodes: (updatesById: BatchNodeUpdates, options?: BatchUpdateNodesOptions) => void;',
    'const beforePatches: BatchNodeUpdates = {};',
    'const afterPatches: BatchNodeUpdates = {};',
    'if (!wasApplying) useUndoStore.setState({ isApplying: true });',
    "scope: 'batch'",
    'entityIds,',
    'undo: () => get().batchUpdateNodes(beforePatches',
    'redo: () => get().batchUpdateNodes(afterPatches',
  ]),
);

assert(
  'Phase 2 drag and cross-view placement callers use batch undo',
  includesAll(source.boardView, [
    'const batchUpdateNodes = useWbsStore(s => s.batchUpdateNodes);',
    "batchUpdateNodes(updates, { label: '移動任務位置'",
    "batchUpdateNodes({ [draggedNode.id]: {",
    "label: '移到未歸位'",
    "label: '歸位任務'",
  ]) &&
    includesAll(source.wbsListView, [
      'batchUpdateNodes({',
      "label: '重排任務'",
      "label: '移動任務位置'",
    ]) &&
    includesAll(source.sharedTaskSidebar, [
      'const batchUpdateNodes = useWbsStore(s => s.batchUpdateNodes);',
      "label: '重排任務'",
      "label: '移動任務位置'",
    ]) &&
    !source.boardView.includes('Object.entries(updates).forEach(([nodeId, nodeUpdates]) => updateNode(nodeId, nodeUpdates))') &&
    !source.wbsListView.includes('updateNode(activeItem.id, { order: overItem.order })') &&
    !source.sharedTaskSidebar.includes('updateNode(activeItem.id, { order: overItem.order })'),
);

assert(
  'Board store registers workspace and board title undo',
  includesAll(source.boardStore, [
    "import useUndoStore from './useUndoStore';",
    "label: '修改工作區名稱'",
    "scope: 'workspace'",
    'undo: () => get().updateWorkspaceTitle(workspaceId, oldTitle)',
    "label: '修改看板名稱'",
    "scope: 'board'",
    'undo: () => get().updateBoardTitle(workspaceId, boardId, oldTitle)',
  ]),
);

assert(
  'Board create undo waits for stable backend board id',
  includesAll(source.boardStore, [
    'boardService.create(targetWorkspaceId, boardName)',
    "label: '新增看板'",
    'entityIds: [createdBoard.id]',
    'undo: () => removeCreatedBoard(command)',
    'redo: () => recreateCreatedBoard(command)',
    'command.entityIds = [recreatedBoard.id];',
  ]),
);

assert(
  'Filter/display undo is local-only snapshot based',
  includesAll(source.boardStore, [
    'cloneBoardTaskFilterSnapshot',
    'writeBoardTaskFilterSnapshot',
    'applyBoardTaskFilterSnapshot',
    'pushBoardTaskFilterUndo',
    "scope: 'filter'",
    "'修改篩選條件'",
    "'切換開始時間顯示'",
    "'修改負責人篩選'",
  ]) &&
    !source.boardStore.includes("label: '刪除工作區'") &&
    !source.boardStore.includes("scope: 'workspace_delete'"),
);

assert(
  'Record store registers save/archive snapshot undo',
  includesAll(source.recordStore, [
    "import useUndoStore from './useUndoStore';",
    'const toRecordInput = (record: KnowledgeRecord): KnowledgeRecordInput => ({',
    'const previousRecord = payload.id',
    'const savedInput = toRecordInput(saved);',
    "label: previousInput",
    "scope: 'record'",
    'undo: () => previousInput ? applyRecordInput(previousInput) : archiveSavedRecord()',
    'redo: () => applyRecordInput(savedInput)',
    'const archivedRecord = get().records.find(record => record.id === recordId);',
    "label: '封存紀錄'",
    'redo: () => get().archiveRecord(recordId)',
  ]),
);

assert(
  'Browser verifier covers record archive restore flow',
  includesAll(source.browserVerifier, [
    'QA-044-B03',
    'record archive undo restores saved record snapshot',
    '封存紀錄',
    '.record-list-row',
    'record-archive-undo.png',
  ]),
);

assert(
  'High-risk destructive recovery remains excluded from ordinary undo',
  includesAll(source.spec, [
    'Phase 1 不納入',
    'Workspace delete',
    '匯入覆蓋',
    '跨裝置、重新整理後仍可 undo',
    'Destructive Recovery',
  ]) &&
    includesAll(source.qa, [
      'QA-044-N-001',
      'QA-044-N-002',
      'QA-044-N-003',
      'QA-044-N-004',
      'QA-044-N-005',
    ]),
);

assert(
  'DEV-044 scripts and docs are registered',
  includesAll(source.packageJson, [
    '"verify:dev-044-undo-coverage"',
    '"verify:dev-044-undo-coverage-browser"',
  ]) &&
    source.documentationMap.includes('SPEC-044-undo-recovery-scope-expansion') &&
    source.devTask.includes('DEV-044 [交付點] [完成]') &&
    source.devTask.includes('QC-DEV-044'),
);

const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
