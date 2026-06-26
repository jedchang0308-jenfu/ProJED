import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  css: 'src/index.css',
  compactTokens: 'src/components/ui/compactTokens.ts',
  mainLayout: 'src/components/MainLayout.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  browserVerifier: 'scripts/verify-dev-031-mobile-density-browser.pw.js',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));

assert(
  'compact tokens expose stable mobile density classes',
  source.compactTokens.includes('app-compact-toolbar') &&
    source.compactTokens.includes('app-compact-canvas') &&
    source.compactTokens.includes('app-compact-segmented-button') &&
    source.compactTokens.includes('app-compact-icon-button') &&
    source.compactTokens.includes('app-compact-text-button'),
);

assert(
  'main layout exposes density hooks and mobile board-only routing',
  source.mainLayout.includes('data-mobile-density="compact"') &&
    source.mainLayout.includes('app-main-nav') &&
    source.mainLayout.includes('app-board-title') &&
    source.mainLayout.includes('useCoarsePointer()') &&
    source.mainLayout.includes("window.matchMedia('(max-width: 640px)'") &&
    source.mainLayout.includes('isMobileBoardOnly') &&
    source.mainLayout.includes("new Set<ViewMode>(['list', 'mindmap', 'gantt', 'calendar', 'records'])") &&
    source.mainLayout.includes("setView('board')") &&
    source.mainLayout.includes("modeSwitcherOptions.filter(option => option.value === 'board')"),
);

assert(
  'mobile CSS reduces major whitespace by about 30 percent',
  source.css.includes('目標將主要留白壓到約 70%') &&
    source.css.includes('.app-main-nav') &&
    source.css.includes('height: 34px !important') &&
    source.css.includes('.app-compact-toolbar') &&
    source.css.includes('padding: 7px 8px !important') &&
    source.css.includes('.app-compact-segmented-button') &&
    source.css.includes('height: 26px !important') &&
    source.css.includes('button {\n    min-height: 34px') &&
    source.css.includes('.task-drag-hitbox') &&
    source.css.includes('min-width: 44px'),
);

assert(
  'board surface receives mobile density treatment',
  source.css.includes('[data-mobile-pan-surface="board"]') &&
    source.kanbanColumn.includes('data-kanban-column="true"') &&
    source.kanbanColumn.includes('data-kanban-column-header="true"') &&
    source.css.includes('.kanban-task-card-body') &&
    source.kanbanColumn.includes('data-mobile-pan-rail="kanban-column"'),
);

assert(
  'browser verifier checks mobile board-only contract and board density',
  source.browserVerifier.includes('setCoarsePointer') &&
    source.browserVerifier.includes('mobile should only expose board mode') &&
    source.browserVerifier.includes('data-mode-switcher-value="board"') &&
    source.browserVerifier.includes('data-mode-switcher-value="list"') &&
    source.browserVerifier.includes('board density') &&
    source.browserVerifier.includes('assertNoVisibleErrors') &&
    source.browserVerifier.includes('visible task density'),
);

assert(
  'package exposes DEV-031 verifiers',
  source.packageJson.includes('"verify:dev-031-mobile-density"') &&
    source.packageJson.includes('"verify:dev-031-mobile-density-browser"'),
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
