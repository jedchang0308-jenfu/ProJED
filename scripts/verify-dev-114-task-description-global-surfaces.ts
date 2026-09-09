import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const read = (path: string) => readFileSync(path, 'utf8');
const hash = (path: string) => createHash('sha256').update(read(path)).digest('hex').toUpperCase();

const hoverCard = read('src/components/TaskDescriptionHoverCard.tsx');
const mainLayout = read('src/components/MainLayout.tsx');
const indicator = read('src/components/TaskDescriptionIndicator.tsx');
const workbench = read('src/components/TaskWorkbenchPanel.tsx');
const recycle = read('src/components/RecycleBinView.tsx');
const recordSidebar = read('src/components/Records/RecordSidebar.tsx');
const mention = read('src/components/Records/TaskMentionNode.ts');
const citation = read('src/components/Rag/CitationCard.tsx');
const calendarPreview = read('src/components/CalendarSubscriptionBuilderPreview.tsx');
const taskDetails = read('src/components/TaskDetailsModal.tsx');
const mindMap = read('src/components/MindMap/MindMapNode.tsx');
const taskChecklist = read('src/components/Wbs/TaskChecklistTree.tsx');
const subtaskSection = read('src/components/TaskDetailsSubtaskSection.tsx');
const ragContract = read('src/services/rag/ragContract.ts');
const ragStore = read('src/store/useRagStore.ts');

assert('MainLayout mounts exactly one hover card', (mainLayout.match(/<TaskDescriptionHoverCard\s*\/>/g) || []).length === 1);
assert('hover delay remains 1000ms', hoverCard.includes('TASK_DESCRIPTION_HOVER_DELAY_MS = 1000'));
assert('fine-pointer gate remains active', hoverCard.includes("matchMedia('(hover: hover) and (pointer: fine)')"));
assert('controller uses a candidate snapshot with source kind', hoverCard.includes('type HoverCandidate') && hoverCard.includes('sourceKind: HoverSourceKind'));
assert('inline content has explicit precedence and empty-value semantics', hoverCard.includes("trigger.hasAttribute('data-task-description-hover-content')") && hoverCard.includes("sourceKind: 'inline'"));
assert('store content is resolved without hover-time fetch', hoverCard.includes('useWbsStore.getState().nodes[taskId]?.description?.trim()') && !hoverCard.includes('fetch('));
assert('timer revalidates trigger identity and source kind', hoverCard.includes('latestCandidate.taskId !== candidate.taskId') && hoverCard.includes('latestCandidate.sourceKind !== candidate.sourceKind'));
assert('visible card closes when trigger attributes change', hoverCard.includes('new MutationObserver') && hoverCard.includes('attributeFilter'));
assert('card is portal tooltip and plain React text', hoverCard.includes('createPortal(') && hoverCard.includes('role="tooltip"') && !hoverCard.includes('dangerouslySetInnerHTML'));
assert('viewport clamp, overlay layering and dismissal contracts remain', hoverCard.includes("maxWidth: 'min(380px, calc(100vw - 24px))") && hoverCard.includes('z-[10050]') && ['keydown', 'scroll', 'resize', 'blur', 'dragstart'].every(eventName => hoverCard.includes(`'${eventName}'`)));

assert('shared indicator contract is unchanged', indicator.includes('description?.trim()') && indicator.includes('<AlignLeft size={9}') && indicator.includes('h-[11px] w-[11px]') && indicator.includes('pointer-events-none') && indicator.includes('aria-hidden="true"'));
assert('workbench exposes both placed and unplaced task triggers', workbench.includes('data-task-description-hover-trigger="true"') && workbench.includes('data-task-workbench-placed-task-card'));
assert('workbench location title is removed while indicator remains', !workbench.includes('title={taskLocation}') && workbench.includes('<TaskDescriptionIndicator description={task.description}'));
assert('recycle identity zones and action tooltips are separated', recycle.includes('data-task-description-hover-trigger="true"') && recycle.includes('data-task-id={item.id}') && recycle.includes('title="還原至原處"') && recycle.includes('title="永久刪除"'));
assert('recycle name title is removed', !recycle.includes('title={item.title}'));
assert('record link identity zone is explicit and role select remains outside it', recordSidebar.includes('data-task-description-hover-trigger="true"') && recordSidebar.includes('data-task-id={link.nodeId}') && recordSidebar.includes('<select'));
assert('record duplicate name title is removed', !recordSidebar.includes('title={nodes[link.nodeId]?.title || link.nodeId}'));
assert('mention preserves serialized data-title but removes DOM title', mention.includes('span.dataset.title = this.__title') && mention.includes('dom.dataset.title = this.__title') && !mention.includes('span.title = this.__title') && !mention.includes('dom.title = this.__title'));
assert('mention carries canonical task trigger metadata', mention.includes("data-task-description-hover-trigger",) && mention.includes('dataset.taskId = this.__nodeId'));
assert('citation uses keyed task selector and no fallback source', citation.includes('state.nodes[citation.sourceId]') && citation.includes("citation.sourceTable === 'wbs_items'") && citation.includes('data-task-description-hover-trigger'));
assert('calendar preview uses app ID, inline content and preserves preview identity', calendarPreview.includes('data-task-id={event.node.id}') && calendarPreview.includes('data-task-description-hover-content={event.node.description || \'\'}') && calendarPreview.includes('data-preview-event-task-id={event.node.storageId ?? event.node.id}'));
assert('task details name and ancestor native titles are removed', !taskDetails.includes('title={node.title}') && !taskDetails.includes('title={ancestor.title || \'未命名任務\'}') && taskDetails.includes('title="回到上一階任務"'));
assert('task details ancestor breadcrumb exposes canonical hover trigger', taskDetails.includes('data-task-details-parent-link="true"') && taskDetails.includes('data-task-id={ancestor.id}') && taskDetails.includes("data-task-description-hover-trigger={ancestor.description?.trim() ? 'true' : undefined}"));
assert('mindmap task name native title is removed but action/date titles remain', !/\n\s+title=\{node\.title/.test(mindMap) && mindMap.includes('title={isExpanded ?'));

assert('protected RAG contract/store have no hover extension', !ragContract.includes('task-description-hover') && !ragStore.includes('task-description-hover'));
assert('protected subtask section remains free of DEV-114-specific wiring', !subtaskSection.includes('data-task-description-hover-content'));
assert('TaskChecklistTree remains the existing shared task-surface authority', taskChecklist.includes('data-task-surface-source') || taskChecklist.includes('data-task-description-hover-trigger'));
assert('Task Details checklist rows expose scoped hover trigger', taskChecklist.includes("hostAdapter.surfaceId === 'task-details.subtask-row'") && taskChecklist.includes('data-task-description-hover-trigger='));
assert('dirty protected baseline matches architecture review', hash('src/components/TaskDetailsSubtaskSection.tsx') === '87C33BDE68D565B3E3E7B6E8FED4DA8E22785DB2A909ACE548F786EBC105E4D5');

const artifact = {
  devId: 'DEV-114',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  environment: 'local-static',
  sourceRevision: 'working-tree',
  assertionCount: checks.length,
  checks,
  failures,
  protectedBaseline: {
    'src/components/TaskDetailsSubtaskSection.tsx': hash('src/components/TaskDetailsSubtaskSection.tsx'),
  },
  generatedAt: new Date().toISOString(),
};

const artifactDirectory = resolve('output/playwright/dev-114-task-description-global-surfaces');
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(resolve(artifactDirectory, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-114 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-114 static verification passed: ${checks.length} assertions.`);
