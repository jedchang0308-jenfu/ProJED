import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  sticker: 'src/components/Tags/KanbanTagSticker.tsx',
  tagChip: 'src/components/Tags/TagChip.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  boardStore: 'src/store/useBoardStore.ts',
  boardTypes: 'src/types/index.ts',
  filterTypes: 'src/features/taskFilters/types.ts',
  filterDefaults: 'src/features/taskFilters/defaults.ts',
  filterStorage: 'src/features/taskFilters/storage.ts',
  tagUtils: 'src/utils/tags.ts',
  packageJson: 'package.json',
  devTask: 'ai-doc/dev_task.md',
  spec: 'ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md',
  qa: 'ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const sticker = read(files.sticker);
const tagChip = read(files.tagChip);
const kanbanCard = read(files.kanbanCard);
const kanbanChecklist = read(files.kanbanChecklist);
const boardStore = read(files.boardStore);
const boardTypes = read(files.boardTypes);
const filterTypes = read(files.filterTypes);
const filterDefaults = read(files.filterDefaults);
const filterStorage = read(files.filterStorage);
const tagUtils = read(files.tagUtils);
const packageJson = read(files.packageJson);
const devTask = read(files.devTask);
const spec = read(files.spec);
const qa = read(files.qa);

assert(
  'kanban sticker exposes one-line physical stack and overflow count',
  sticker.includes('data-kanban-tag-sticker="true"') &&
    sticker.includes('data-tag-count={tags.length}') &&
    sticker.includes('const visibleLayers = tags.slice(1, 3)') &&
    sticker.includes("clipPath: 'polygon(") &&
    sticker.includes('+{tags.length - 1}') &&
    sticker.includes('h-[15px]') &&
    sticker.includes('max-w-[58px]') &&
    sticker.includes('max-w-[72px]'),
);

assert(
  'task-local portal discloses every tag without clipping',
  sticker.includes("import { createPortal } from 'react-dom'") &&
    sticker.includes('aria-haspopup="dialog"') &&
    sticker.includes('aria-expanded={isOpen}') &&
    sticker.includes('data-kanban-tag-popover="true"') &&
    sticker.includes('data-kanban-tag-popover-item="true"') &&
    sticker.includes('title={`標籤：${tagNames}`}') &&
    sticker.includes('window.innerWidth - VIEWPORT_GUTTER * 2') &&
    sticker.includes('document.body'),
);

assert(
  'sticker isolates click pointer keyboard and escape from task interactions',
  sticker.includes('data-task-interaction-control="true"') &&
    sticker.includes('event.stopPropagation()') &&
    sticker.includes("event.key === 'Enter' || event.key === ' '") &&
    sticker.includes("event.key !== 'Escape'") &&
    sticker.includes('triggerRef.current?.focus()') &&
    sticker.includes("document.addEventListener('mousedown', handlePointerDown)"),
);

assert(
  'L2 and L3 use one inline sticker and ignore the legacy global collapse preference',
  kanbanCard.includes("import { KanbanTagSticker } from '../Tags/KanbanTagSticker'") &&
    kanbanCard.includes('<KanbanTagSticker tags={nodeTags} />') &&
    kanbanChecklist.includes("import { KanbanTagSticker } from '../Tags/KanbanTagSticker'") &&
    kanbanChecklist.includes('<KanbanTagSticker tags={nodeTags} compact />') &&
    kanbanCard.includes('task-title-text relative min-w-0 flex-1 pr-2') &&
    kanbanChecklist.includes('task-title-text relative min-w-0 flex-1 pr-2') &&
    !kanbanCard.includes('showTagNames') &&
    !kanbanChecklist.includes('showTagNames') &&
    !kanbanCard.includes('<TagChip') &&
    !kanbanChecklist.includes('<TagChip'),
);

assert(
  'legacy preference remains schema compatible while board-specific dot behavior is removed',
  filterTypes.includes('showTagNames: boolean') &&
    filterDefaults.includes('showTagNames: true') &&
    filterStorage.includes('showTagNames: legacy.showTagNames as boolean | undefined') &&
    filterStorage.includes('showTagNames: next.displaySettings.showTagNames') &&
    boardStore.includes('showTagNames: createDefaultTaskDisplaySettings().showTagNames') &&
    boardStore.includes('showTagNames: prefs.displaySettings.showTagNames') &&
    boardStore.includes("pushBoardTaskFilterUndo(set, '切換標籤名稱顯示', before, after)") &&
    boardTypes.includes('showTagNames: boolean') &&
    boardTypes.includes('toggleTagNames: () => void') &&
    !tagChip.includes('collapsed?: boolean') &&
    !tagChip.includes('onToggleCollapsed?: () => void') &&
    !tagChip.includes('data-kanban-tag-dot="true"') &&
    tagUtils.includes('getNodeTags'),
);

assert(
  'DEV-061 sticker replacement verifier and product contract are registered',
  packageJson.includes('verify:dev-061-kanban-tag-collapse') &&
    packageJson.includes('verify:dev-061-kanban-tag-collapse-browser') &&
    devTask.includes('DEV-061') &&
    devTask.includes('看板標籤堆疊式尾標貼紙') &&
    spec.includes('DEV-061 看板標籤堆疊貼紙替代增補') &&
    spec.includes('Intentional replacement') &&
    qa.includes('QA-061-001') &&
    qa.includes('QA-061-008') &&
    qa.includes('堆疊貼紙 QA / QC 增補'),
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

if (failed.length > 0) process.exit(1);
