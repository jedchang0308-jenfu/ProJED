import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assertIncludes = (label, content, expected) => {
  if (!content.includes(expected)) {
    throw new Error(`${label} missing expected text: ${expected}`);
  }
};
const assertNotIncludes = (label, content, forbidden) => {
  if (content.includes(forbidden)) {
    throw new Error(`${label} contains forbidden text: ${forbidden}`);
  }
};

const migration = read('supabase/migrations/20260630060610_cloud_quick_memo_inbox_items.sql');
assertIncludes('migration', migration, 'create table if not exists public.inbox_items');
assertIncludes('migration', migration, 'owner_id = (select auth.uid())');
assertIncludes('migration', migration, 'public.promote_inbox_item_to_task');
assertIncludes('migration', migration, 'for update');
assertIncludes('migration', migration, 'private.current_user_can_write_project');
assertIncludes('migration', migration, "notify pgrst, 'reload schema'");

const hardeningMigration = read('supabase/migrations/20260630060727_harden_quick_memo_inbox_items_privileges.sql');
assertIncludes('hardening migration', hardeningMigration, 'revoke all on table public.inbox_items from public');
assertIncludes('hardening migration', hardeningMigration, 'revoke all on table public.inbox_items from anon');
assertIncludes('hardening migration', hardeningMigration, 'grant select, insert, update, delete on table public.inbox_items to authenticated');
assertIncludes('hardening migration', hardeningMigration, "notify pgrst, 'reload schema'");

const store = read('src/store/useQuickCaptureStore.ts');
assertIncludes('quick memo store', store, 'OUTBOX_SCHEMA_VERSION = 2');
assertIncludes('quick memo store', store, 'requiresOwnershipConfirmation');
assertIncludes('quick memo store', store, 'claimAnonymousItems');
assertIncludes('quick memo store', store, 'syncWithCloud');
assertIncludes('quick memo store', store, 'promoteItem');
assertNotIncludes('quick memo store', store, 'openai');
assertNotIncludes('quick memo store', store, 'chat.completions');

const quickCapture = read('src/components/QuickCaptureShell.tsx');
assertIncludes('QuickCaptureShell', quickCapture, '快速備忘');
assertIncludes('QuickCaptureShell', quickCapture, '存入備忘錄');
assertIncludes('QuickCaptureShell', quickCapture, 'enableDragToTask');
assertIncludes('QuickCaptureShell', quickCapture, "type: 'quick-capture-item'");
assertIncludes('QuickCaptureShell', quickCapture, 'TaskDragHandle');
assertIncludes('QuickCaptureShell', quickCapture, '拖曳左側把手到看板位置，即可轉成正式任務。');
assertNotIncludes('QuickCaptureShell', quickCapture, '收件匣');
assertNotIncludes('QuickCaptureShell', quickCapture, 'Inbox');

const board = read('src/components/BoardView.tsx');
assertIncludes('BoardView', board, 'TaskZoneBoardPanel');
assertNotIncludes('BoardView', board, 'MemoTriageDrawer');
assertNotIncludes('BoardView', board, 'data-open-memo-triage');
assertIncludes('BoardView', board, 'personal-task-zone-item');
assertIncludes('BoardView', board, 'TaskDragOverlayPreview');
assertNotIncludes('BoardView', board, 'promoteMemoItem');
assertIncludes('BoardView', board, 'upsertNodeLocal');

const kanbanColumn = read('src/components/Wbs/KanbanColumn.tsx');
assertIncludes('KanbanColumn', kanbanColumn, "activeType === 'quick-capture-item'");
assertIncludes('KanbanColumn', kanbanColumn, 'canDropQuickMemo');
assertIncludes('KanbanColumn', kanbanColumn, 'canTargetCardLayer');

const kanbanCard = read('src/components/Wbs/KanbanCard.tsx');
assertIncludes('KanbanCard', kanbanCard, "activeType === 'quick-capture-item'");
assertIncludes('KanbanCard', kanbanCard, 'canDropActiveAsTask');
assertIncludes('KanbanCard', kanbanCard, "'wbs-column', 'wbs-card', 'quick-capture-item'");

const dragOverlay = read('src/components/Wbs/TaskDragOverlayPreview.tsx');
assertIncludes('TaskDragOverlayPreview', dragOverlay, 'task-title-text');
assertIncludes('TaskDragOverlayPreview', dragOverlay, 'border-primary/30');
assertIncludes('TaskDragOverlayPreview', dragOverlay, 'shadow-lg');

const app = read('src/App.tsx');
assertIncludes('App', app, "case 'task_zone'");
assertNotIncludes('App', app, '<QuickCaptureShell');

const dataBackend = read('src/services/dataBackend.ts');
assertIncludes('dataBackend', dataBackend, 'export const inboxService');
assertIncludes('dataBackend', dataBackend, 'supabaseInboxService.promote');

console.log('DEV-039 static verifier passed.');
