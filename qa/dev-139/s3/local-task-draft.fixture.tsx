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

// Actual modal/stores; only the remote data seam is synthetic. No real backend.
let canonical: TaskNode = {
  id: 'local-notes-task', workspaceId: 'local-notes-workspace', boardId: 'local-notes-board',
  title: '記事恢復測試任務', parentId: null, status: 'todo', order: 0,
  description: '雲端原文', detailNotes: [{ id: TASK_PURPOSE_NOTE_ID, title: '目的', content: '雲端原文' }],
};
let writes = 0;
let reads = 0;
const root = createRoot(document.querySelector('#task-draft-fixture')!);
nodeService.listByProject = async () => { reads += 1; return [structuredClone(canonical)]; };
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
  root.render(<TaskDetailsModal key={accountId} nodeId={canonical.id} onClose={() => undefined} />);
};
const fixture = {
  counters: () => ({ writes, reads }),
  changeRemoteNotes(content: string) {
    canonical = { ...canonical, description: content, detailNotes: [{ id: TASK_PURPOSE_NOTE_ID, title: '目的', content }] };
  },
  mount,
};
Object.assign(window, { __DEV139_TASK_DRAFT: fixture });
mount('local-notes-owner');
