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
const normalizedCss = source.css.replace(/\r\n/g, '\n');

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
    source.mainLayout.includes("new Set<ViewMode>(['list', 'mindmap', 'gantt', 'calendar'])") &&
    source.mainLayout.includes("setView('board')") &&
    source.mainLayout.includes('{!isMobileBoardOnly ? (') &&
    source.mainLayout.includes('options={modeSwitcherOptions}'),
);

assert(
  'mobile nav removes redundant brand/share info and exposes task workbench entry',
  !source.mainLayout.includes('data-mobile-hidden-brand="true"') &&
    !source.mainLayout.includes('>ProJED<') &&
    !source.mainLayout.includes('Layout className=') &&
    source.mainLayout.includes('data-mobile-task-workbench-nav-entry="true"') &&
    source.mainLayout.includes('handleToggleMobileTaskWorkbench') &&
    source.mainLayout.includes('toggleTaskWorkbenchPanel') &&
    source.mainLayout.includes('ClipboardList') &&
    source.mainLayout.includes('whitespace-nowrap rounded') &&
    !source.mainLayout.includes('cursor-text truncate') &&
    source.mainLayout.includes('data-board-share-open') &&
    source.mainLayout.includes('btn-outline hidden h-7') &&
    source.mainLayout.includes('sm:flex sm:h-8'),
);

assert(
  'mobile CSS reduces major whitespace by about 30 percent',
  normalizedCss.includes('目標將主要留白壓到約 70%') &&
    normalizedCss.includes('.app-main-nav') &&
    normalizedCss.includes('height: 34px !important') &&
    normalizedCss.includes('.app-compact-toolbar') &&
    normalizedCss.includes('padding: 7px 8px !important') &&
    normalizedCss.includes('.app-compact-segmented-button') &&
    normalizedCss.includes('height: 26px !important') &&
    normalizedCss.includes('button {\n    min-height: 34px') &&
    normalizedCss.includes('.task-drag-hitbox') &&
    normalizedCss.includes('min-width: 44px'),
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
    source.browserVerifier.includes('assertMobileNavRedundantInfoHidden') &&
    source.browserVerifier.includes('brandNodeCount === 0') &&
    source.browserVerifier.includes('desktopBrandNodeCount === 0') &&
    source.browserVerifier.includes('data-mobile-task-workbench-nav-entry="true"') &&
    source.browserVerifier.includes('data-board-share-open') &&
    source.browserVerifier.includes('mobile should not render mode switcher controls') &&
    source.browserVerifier.includes('data-mode-switcher-value="board"') &&
    source.browserVerifier.includes('data-mode-switcher-value="list"') &&
    source.browserVerifier.includes('board density') &&
    source.browserVerifier.includes('desktop nav removes brand and shows full board title') &&
    source.browserVerifier.includes('textOverflow !==') &&
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
