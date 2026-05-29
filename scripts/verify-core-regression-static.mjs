import { readFileSync } from 'node:fs';

const read = file => readFileSync(file, 'utf8');
const includes = (file, text) => read(file).includes(text);
const matches = (file, pattern) => pattern.test(read(file));

const checks = [
  {
    name: 'touch drag requires 250ms long press',
    ok: matches('src/hooks/useDragSensors.ts', /delay:\s*250/) &&
      matches('src/hooks/useDragSensors.ts', /tolerance:\s*8/),
  },
  {
    name: 'keyboard dnd is blocked for form and contenteditable targets',
    ok: includes('src/hooks/useDragSensors.ts', 'isInteractiveEditingTarget') &&
      includes('src/hooks/useDragSensors.ts', 'target.isContentEditable') &&
      includes('src/hooks/useDragSensors.ts', 'nativeEvent.isComposing'),
  },
  {
    name: 'mobile/coarse pointer gantt schedule dragging is disabled',
    ok: includes('src/components/Gantt/GanttTaskBar.tsx', "window.matchMedia('(pointer: coarse)'") &&
      includes('src/components/Gantt/GanttTaskBar.tsx', 'canEditTask && canMoveTask && !isCoarsePointer'),
  },
  {
    name: 'gantt drag only persists on mouseup, not during preview',
    ok: matches(
      'src/components/Gantt/GanttTaskBar.tsx',
      /const handleMouseMove[\s\S]*setSimulatedDates[\s\S]*const handleMouseUp[\s\S]*updateNode\(itm\.id/
    ),
  },
  {
    name: 'inline editing handlers ignore IME composition before submit/cancel shortcuts',
    ok: [
      'src/components/Wbs/KanbanCard.tsx',
      'src/components/Wbs/KanbanChecklist.tsx',
      'src/components/Wbs/KanbanColumn.tsx',
      'src/components/Wbs/WbsNodeItem.tsx',
      'src/components/Tags/TagPicker.tsx',
      'src/components/Rag/RagSidebar.tsx',
    ].every(file => includes(file, 'nativeEvent.isComposing')) &&
      includes('src/components/GlobalDialog.tsx', 'e.isComposing'),
  },
  {
    name: 'context menu clamps to viewport and listens to visual viewport resize',
    ok: includes('src/components/GlobalContextMenu.tsx', 'window.visualViewport') &&
      includes('src/components/GlobalContextMenu.tsx', 'Math.max(VIEWPORT_PADDING') &&
      includes('src/components/GlobalContextMenu.tsx', 'Math.min('),
  },
  {
    name: 'toast is non-blocking above dialogs/menus',
    ok: includes('src/components/ui/ToastContainer.tsx', 'pointer-events-none') &&
      includes('src/components/ui/ToastContainer.tsx', 'z-[9999]') &&
      includes('src/components/ui/ToastContainer.tsx', 'pointer-events-auto'),
  },
  {
    name: 'task model keeps parent/order/kanban stage mutations auditable',
    ok: includes('src/store/useWbsStore.ts', "'parentId' in updates || 'order' in updates || 'kanbanStageId' in updates") &&
      includes('src/store/useWbsStore.ts', 'parentId: newNode.parentId') &&
      includes('src/store/useWbsStore.ts', 'kanbanStageId: newNode.kanbanStageId ?? null'),
  },
  {
    name: 'date boundary guards reject invalid parent/child ranges',
    ok: includes('src/components/Wbs/WbsNodeItem.tsx', 'validateDateBoundary') &&
      includes('src/components/Wbs/WbsNodeItem.tsx', '結束日期不得早於開始日期') &&
      includes('src/components/Wbs/WbsNodeItem.tsx', '下層任務的日期不得超出上層任務的範圍'),
  },
  {
    name: 'shared task sidebar guards missing node level before style calculations',
    ok: includes('src/components/SharedTaskSidebar.tsx', 'Number.isFinite(item.level) ? item.level : 0') &&
      includes('src/components/SharedTaskSidebar.tsx', 'paddingLeft: Math.max(12, 12 + (level * 16))'),
  },
];

const failed = checks.filter(check => !check.ok);

if (failed.length > 0) {
  console.error('Core regression static verification failed:');
  for (const check of failed) console.error(`- ${check.name}`);
  process.exit(1);
}

console.log(`Core regression static verification passed: ${checks.length} checks.`);
