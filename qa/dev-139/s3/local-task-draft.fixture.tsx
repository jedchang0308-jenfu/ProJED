import { createRoot } from 'react-dom/client';
import { TaskDetailsModal } from '../../../src/components/TaskDetailsModal';
import useAuthStore from '../../../src/store/useAuthStore';
import useBoardStore from '../../../src/store/useBoardStore';
import { useMemberStore } from '../../../src/store/useMemberStore';
import { useWbsStore } from '../../../src/store/useWbsStore';
import { nodeService, recordService } from '../../../src/services/dataBackend';
import { areTaskNoteSnapshotsEqual, taskNoteSnapshotFromNode } from '../../../src/utils/taskNotePersistence';
import { TASK_PURPOSE_NOTE_ID } from '../../../src/utils/taskNoteRichContent';
import type { TaskNode } from '../../../src/types';
import { saveTaskDetailsLocalDraft } from '../../../src/services/taskDetailsLocalDraft';
import { taskDetailsFieldsFromNode } from '../../../src/components/taskDetailsDraft';
import { httpSessionService, httpTaskWorkbenchService } from '../../../src/services/httpApi/backend';
import { loadTaskWorkbenchUnplacedTasks, upsertTaskWorkbenchUnplacedTask, clearTaskWorkbenchUnplacedLocalCaches, claimUnboundTaskWorkbenchUnplacedTasks, readUnboundTaskWorkbenchUnplacedTasks } from '../../../src/features/taskWorkbench/placement';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../../../src/features/taskWorkbench/placementModel';

// Actual modal/stores; only the remote data seam is synthetic. No real backend.
let canonical: TaskNode = {
  id: 'local-notes-task', workspaceId: 'local-notes-workspace', boardId: 'local-notes-board',
  title: '記事恢復測試任務', parentId: null, status: 'todo', order: 0,
  description: '雲端原文', detailNotes: [{ id: TASK_PURPOSE_NOTE_ID, title: '目的', content: '雲端原文' }],
};
let writes = 0;
let reads = 0;
let failUnplaced = false;
const root = createRoot(document.querySelector('#task-draft-fixture')!);
nodeService.listByProject = async () => { reads += 1; return [structuredClone(canonical)]; };
httpSessionService.verifyBoundActor = async accountId => {
  if (useAuthStore.getState().user?.uid !== accountId) throw new Error('ACTOR_CHANGED');
  return { accountId, contextId: 'synthetic-modal-context' };
};
httpTaskWorkbenchService.list = async actor => {
  if (useAuthStore.getState().user?.uid !== actor.accountId) throw new Error('ACTOR_CHANGED');
  reads += 1;
  return [structuredClone(canonical)];
};
httpTaskWorkbenchService.upsert = async (task, actor) => {
  if (useAuthStore.getState().user?.uid !== actor.accountId) throw new Error('ACTOR_CHANGED');
  if (failUnplaced) throw new Error('SYNTHETIC_UPSERT_UNAVAILABLE');
  writes += 1;
  canonical = structuredClone(task);
  return structuredClone(canonical);
};
recordService.listByNode = async () => [];
useWbsStore.setState({ nodes: { [canonical.id]: structuredClone(canonical) }, dependencies: [],
  commitTaskNotes: async (_id, expected, submitted) => {
    writes += 1;
    const latest = taskNoteSnapshotFromNode(canonical);
    if (!areTaskNoteSnapshotsEqual(expected, latest) && !areTaskNoteSnapshotsEqual(submitted, latest)) {
      return { status: 'conflict', snapshot: latest };
    }
    canonical = { ...canonical, detailNotes: submitted.detailNotes, description: submitted.description ?? '' };
    return { status: 'persisted', snapshot: taskNoteSnapshotFromNode(canonical) };
  },
});
useBoardStore.setState({ activeWorkspaceId: canonical.workspaceId, activeBoardId: canonical.boardId,
  workspaces: [{ id: canonical.workspaceId, title: '本機測試工作區', boards: [{ id: canonical.boardId, title: '本機測試看板', dependencies: [] }] }],
});
useMemberStore.setState({ loading: false, boardMembers: [], currentBoardAccess: {
  workspaceId: canonical.workspaceId, boardId: canonical.boardId,
  boardRole: 'owner', capabilities: ['read_board', 'create_task', 'edit_task', 'assign_task'],
} });
const mount = (accountId: string) => {
  useAuthStore.setState({ user: { uid: accountId, displayName: '本機測試', email: null }, loading: false });
  root.render(<TaskDetailsModal key={accountId} nodeId={canonical.id} onClose={() => root.render(null)} />);
};
const fixture = {
  counters: () => ({ writes, reads }),
  remoteMetadataEdit() { canonical = { ...canonical, tagIds: ['other-device-tag'] }; },
  remoteTags: () => canonical.tagIds,
  async claimConflictingUnbound() {
    upsertTaskWorkbenchUnplacedTask({ ...canonical, title: 'unbound-input-to-retain' }, null);
    const before = writes;
    await claimUnboundTaskWorkbenchUnplacedTasks(useAuthStore.getState().user!.uid);
    const result = writes === before && readUnboundTaskWorkbenchUnplacedTasks().some(task => task.title === 'unbound-input-to-retain');
    clearTaskWorkbenchUnplacedLocalCaches(null);
    return result;
  },
  async recoverLocalFallback() {
    const accountId = useAuthStore.getState().user!.uid;
    const original = structuredClone(canonical);
    upsertTaskWorkbenchUnplacedTask({ ...canonical, title: 'different-device-local-edit', updatedAt: Date.now() + 10000 }, accountId);
    const before = writes;
    const loaded = await loadTaskWorkbenchUnplacedTasks(accountId);
    const result = { noWrite: writes === before, remoteUnchanged: canonical.title === original.title,
      localRetained: loaded.some(task => task.title === 'different-device-local-edit') };
    clearTaskWorkbenchUnplacedLocalCaches(accountId);
    return result;
  },
  failUnplacedWrite(value: boolean) { failUnplaced = value; },
  useUnplaced() {
    canonical = { ...canonical, boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID };
    useWbsStore.setState({ nodes: { [canonical.id]: structuredClone(canonical) } });
  },
  changeRemoteNotes(content: string) {
    canonical = { ...canonical, description: content, detailNotes: [{ id: TASK_PURPOSE_NOTE_ID, title: '目的', content }] };
  },
  mount,
  unmount: () => root.render(null),
  seedUnknownSaved(accountId: string) {
    const snapshot = taskNoteSnapshotFromNode(canonical);
    return saveTaskDetailsLocalDraft({ accountId, workspaceId: canonical.workspaceId, boardId: canonical.boardId,
      taskId: canonical.id, key: 'fixture-unknown-saved', schemaVersion: 1, savedAt: Date.now(),
      fields: { baseline: taskDetailsFieldsFromNode(canonical), draft: {} },
      notes: { baseline: { detailNotes: [{ id: TASK_PURPOSE_NOTE_ID, title: '目的', content: '原版本' }], description: '原版本' },
        draft: snapshot.detailNotes }, unknown: true,
      submitted: { detailNotes: snapshot.detailNotes, description: snapshot.description ?? '' } });
  },
};
Object.assign(window, { __DEV139_TASK_DRAFT: fixture });
mount('local-notes-owner');
