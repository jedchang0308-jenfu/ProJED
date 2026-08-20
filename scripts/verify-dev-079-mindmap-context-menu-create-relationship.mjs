import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const types = read('src/interactions/task/types.ts');
const catalog = read('src/interactions/task/taskActionCatalog.ts');
const profiles = read('src/interactions/task/profiles.ts');
const menu = read('src/interactions/task/TaskActionMenu.tsx');
const interactions = read('src/utils/taskInteractions.ts');
const contextMenu = read('src/components/GlobalContextMenu.tsx');
const mindMap = read('src/components/MindMap/MindMapView.tsx');

const results = [
  {
    id: 'MINDMAP-079-001',
    label: 'task action contract includes 建立關聯線',
    ok: types.includes("'task.create-relationship'") &&
      catalog.includes("id: 'task.create-relationship'") &&
      catalog.includes("label: '建立關聯線'") &&
      catalog.includes("capability: 'edit'") &&
      catalog.includes("kind: 'transient'") &&
      catalog.includes("section: 'create'"),
  },
  {
    id: 'MINDMAP-079-002',
    label: 'only mindmap task menus expose the relationship action',
    ok: profiles.includes("include: ['task.open-details', 'task.create-relationship']") &&
      profiles.includes("exclude: ['task.create-relationship']") &&
      profiles.includes("'task.dependency-start', 'task.dependency-end', 'task.create-relationship'"),
  },
  {
    id: 'MINDMAP-079-003',
    label: 'task action menu renders stable selector, label, icon and guidance title',
    ok: menu.includes("'task.create-relationship': <Link2") &&
      menu.includes("'task.create-relationship': '建立關聯線'") &&
      menu.includes("'task.create-relationship': '以目前任務為起點選擇目標'") &&
      menu.includes('data-task-action-id={actionId}'),
  },
  {
    id: 'MINDMAP-079-004',
    label: 'context menu dispatches a mindmap relationship-start event and preserves selection',
    ok: interactions.includes("START_MINDMAP_RELATIONSHIP_EVENT = 'start-mindmap-relationship'") &&
      interactions.includes('requestMindMapRelationshipStart') &&
      contextMenu.includes("case 'task.create-relationship'") &&
      contextMenu.includes('requestMindMapRelationshipStart(contextMenuState.nodeId)') &&
      contextMenu.includes('closeContextMenu({ preserveTaskSelection: true })'),
  },
  {
    id: 'MINDMAP-079-005',
    label: 'mindmap receives the event and enters existing endpoint-selection flow',
    ok: mindMap.includes('START_MINDMAP_RELATIONSHIP_EVENT') &&
      mindMap.includes('document.addEventListener(START_MINDMAP_RELATIONSHIP_EVENT') &&
      mindMap.includes('beginRelationshipDraftSelectionWithCleanup(taskId)') &&
      mindMap.includes('setRelationshipToolActive(true)'),
  },
  {
    id: 'MINDMAP-079-006',
    label: 'edit capability guard remains enforced',
    ok: contextMenu.includes('if (contextMenuState?.kind !== \'task\' || !canEditTask) return;') &&
      catalog.includes("capability: 'edit'") &&
      mindMap.includes('if (!canEditTask || !taskId || !nodes[taskId]) return;'),
  },
];

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
