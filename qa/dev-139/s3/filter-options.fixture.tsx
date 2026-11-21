import { createRoot } from 'react-dom/client';
import { DndContext } from '@dnd-kit/core';
import '../../../src/index.css';
import TaskWorkbenchPanel from '../../../src/components/TaskWorkbenchPanel';
import CalendarSubscriptionsView from '../../../src/components/CalendarSubscriptionsView';
import useAuthStore from '../../../src/store/useAuthStore';
import useBoardStore from '../../../src/store/useBoardStore';
import { useTagStore } from '../../../src/store/useTagStore';
import { httpApiClient } from '../../../src/services/httpApi/backend';
import { writeTaskWorkbenchPanelPrefs } from '../../../src/features/taskWorkbench/preferences';

const root = createRoot(document.querySelector('#fixture')!);
const fixture = {
  setActor(accountId: string) {
    httpApiClient.bindExpectedActor({ accountId, contextId: `context-${accountId}` });
    useAuthStore.setState({ user: { uid: accountId, displayName: accountId, email: null }, loading: false });
    writeTaskWorkbenchPanelPrefs({ open: true, filtersOpen: false, width: 560, unplacedRatio: 0.5, showContainersInAllTasks: false, openPreferenceVersion: 1 }, accountId);
    useBoardStore.setState({ activeWorkspaceId: 'ws', activeBoardId: 'a', workspaces: [{ id: 'ws', title: 'Visible workspace',
      sessionCapabilities: ['read_workspace'], boards: ['a', 'b'].map(id => ({ id, title: id, dependencies: [], sessionCapabilities: ['read_board'] })) },
    { id: 'other-ws', title: 'Other workspace', sessionCapabilities: ['read_workspace'], boards: [{ id: 'c', title: 'c', dependencies: [], sessionCapabilities: ['read_board'] }] }] });
    useTagStore.getState().setTags([{ id: 'wrong-global-tag', workspaceId: 'unrelated', name: 'UNRELATED_GLOBAL_TAG', color: 'red', order: 0 }], 'unrelated');
  },
  mount(mode: 'workbench' | 'calendar') {
    root.render(<DndContext>{mode === 'workbench' ? <TaskWorkbenchPanel /> : <CalendarSubscriptionsView />}</DndContext>);
  },
  grantBoardManagement() {
    useBoardStore.setState(state => ({ workspaces: state.workspaces.map(workspace => ({ ...workspace,
      boards: workspace.boards.map(board => ({ ...board, sessionCapabilities: board.id === 'a' ? ['read_board', 'manage_board_members'] : ['read_board'] })),
    })) }));
  },
};
Object.assign(window, { __DEV139_FILTER_FIXTURE: fixture });
