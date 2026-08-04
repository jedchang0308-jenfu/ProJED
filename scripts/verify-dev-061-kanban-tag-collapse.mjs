import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
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
  'tag chip exposes Trello-like expanded and collapsed states',
  tagChip.includes('collapsed?: boolean') &&
    tagChip.includes('onToggleCollapsed?: () => void') &&
    tagChip.includes('data-kanban-tag-chip="true"') &&
    tagChip.includes("data-tag-chip-collapsed={collapsed ? 'true' : 'false'}") &&
    tagChip.includes('data-kanban-tag-dot="true"') &&
    tagChip.includes('h-2.5 w-2.5 rounded-full') &&
    tagChip.includes('onPointerDown={(event) => event.stopPropagation()}'),
);

assert(
  'collapsed tag retains localized color and title hover disclosure',
  tagChip.includes('顏色：${colorLabel}，標題：「${tag.name}」') &&
    tagChip.includes('aria-pressed={!collapsed}') &&
    tagChip.includes('點擊${action}所有標籤名稱') &&
    tagUtils.includes('getTagColorLabel') &&
    tagUtils.includes("blue: '藍色'") &&
    tagUtils.includes("gray: '灰色'"),
);

assert(
  'kanban card and checklist share one global tag-name preference',
  kanbanCard.includes('const showTagNames = useBoardStore(s => s.showTagNames)') &&
    kanbanCard.includes('const toggleTagNames = useBoardStore(s => s.toggleTagNames)') &&
    kanbanCard.includes('collapsed={!showTagNames}') &&
    kanbanCard.includes('onToggleCollapsed={toggleTagNames}') &&
    kanbanChecklist.includes('const showTagNames = useBoardStore(s => s.showTagNames)') &&
    kanbanChecklist.includes('const toggleTagNames = useBoardStore(s => s.toggleTagNames)') &&
    kanbanChecklist.includes('collapsed={!showTagNames}') &&
    kanbanChecklist.includes('onToggleCollapsed={toggleTagNames}'),
);

assert(
  'tag-name visibility defaults expanded and persists through existing display preferences',
  filterTypes.includes('showTagNames: boolean') &&
    filterDefaults.includes('showTagNames: true') &&
    filterStorage.includes('showTagNames: legacy.showTagNames as boolean | undefined') &&
    filterStorage.includes('showTagNames: next.displaySettings.showTagNames') &&
    boardStore.includes('showTagNames: createDefaultTaskDisplaySettings().showTagNames') &&
    boardStore.includes('showTagNames: prefs.displaySettings.showTagNames') &&
    boardStore.includes("pushBoardTaskFilterUndo(set, '切換標籤名稱顯示', before, after)") &&
    boardTypes.includes('showTagNames: boolean') &&
    boardTypes.includes('toggleTagNames: () => void'),
);

assert(
  'DEV-061 browser verifier and product contract are registered',
  packageJson.includes('verify:dev-061-kanban-tag-collapse') &&
    packageJson.includes('verify:dev-061-kanban-tag-collapse-browser') &&
    devTask.includes('DEV-061') &&
    spec.includes('DEV-061 看板標籤 Trello 式收疊增補') &&
    qa.includes('QA-061-001') &&
    qa.includes('QA-061-008'),
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
