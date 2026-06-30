import dayjs from 'dayjs';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { localTestStorage } from '../services/localTestService';
import type { Board, TaskNode, ViewMode, Workspace } from '../types';

const LOCAL_TEST_WS_ID = 'local-test-workspace';
const LOCAL_TEST_BOARD_ID = 'local-test-mobile-ui-board';
const LOCAL_TEST_SEEDED_KEY = 'projed-local-test.seeded.v1';
const LOCAL_TEST_SIZE_KEY = 'projed-local-test.seeded.size';
const LOCAL_TEST_RESTORABLE_VIEWS = new Set<ViewMode>([
  'home',
  'list',
  'board',
  'gantt',
  'calendar',
  'calendar_subscriptions',
  'settings',
  'recycle_bin',
]);

type SeedOptions = {
  force?: boolean;
  taskCount?: number;
};

type LocalTestQcApi = {
  seed: (taskCount?: number) => { taskCount: number; nodeCount: number };
  reset: (taskCount?: number) => { taskCount: number; nodeCount: number };
  inspect: () => { nodeCount: number; rootCount: number; cycles: string[]; missingParents: string[] };
};

const getQcWindow = () => {
  if (typeof window === 'undefined') return undefined;
  return window as typeof window & { __PROJED_QC__?: LocalTestQcApi };
};

const clampTaskCount = (value?: number) => {
  if (!Number.isFinite(value) || !value) return 12;
  return Math.max(12, Math.min(1000, Math.floor(value)));
};

const getRequestedTaskCount = () => {
  if (typeof window === 'undefined') return undefined;
  const urlSize = Number(new URLSearchParams(window.location.search).get('qcSize'));
  return Number.isFinite(urlSize) && urlSize > 0 ? clampTaskCount(urlSize) : undefined;
};

const shouldForceSeedFromUrl = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('qcReset') === '1' || params.get('qcReset') === 'true';
};

const makeNode = (
  id: string,
  title: string,
  parentId: string | null,
  order: number,
  status: TaskNode['status'] = 'todo',
  daysFromNow?: number,
): TaskNode => ({
  id,
  workspaceId: LOCAL_TEST_WS_ID,
  boardId: LOCAL_TEST_BOARD_ID,
  parentId,
  title,
  status,
  nodeType: parentId ? 'task' : 'group',
  order,
  startDate: daysFromNow === undefined ? undefined : dayjs().add(daysFromNow, 'day').format('YYYY-MM-DD'),
  endDate: daysFromNow === undefined ? undefined : dayjs().add(daysFromNow + 2, 'day').format('YYYY-MM-DD'),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const makeBoard = (): Board => ({
  id: LOCAL_TEST_BOARD_ID,
  title: 'ProJED 品質驗證測試看板',
  dependencies: [],
  order: 1,
  createdAt: Date.now(),
});

const makeWorkspace = (board: Board): Workspace => ({
  id: LOCAL_TEST_WS_ID,
  title: 'ProJED 固定品質驗證帳號',
  boards: [board],
  ownerId: 'local-test-user',
  members: ['local-test-user'],
  order: 1,
  createdAt: Date.now(),
});

export const createLocalTestNodes = (requestedTaskCount = 12): TaskNode[] => {
  const taskCount = clampTaskCount(requestedTaskCount);
  const statuses: TaskNode['status'][] = ['todo', 'in_progress', 'completed', 'unsure', 'delayed', 'onhold'];
  const columnIds = ['local-col-todo', 'local-col-progress', 'local-col-done'];
  const nodes: TaskNode[] = [
    makeNode(columnIds[0], '待辦', null, 0, 'todo'),
    makeNode(columnIds[1], '進行中', null, 1, 'in_progress'),
    makeNode(columnIds[2], '已完成', null, 2, 'completed'),
  ];

  let createdTasks = 0;
  let cardOrder = 0;
  while (createdTasks < taskCount) {
    const cardIndex = cardOrder;
    const columnId = columnIds[cardIndex % columnIds.length];
    const cardId = `qc-card-${cardIndex + 1}`;
    nodes.push(makeNode(cardId, `品質驗證測試任務 ${cardIndex + 1}`, columnId, cardOrder, statuses[cardIndex % statuses.length], (cardIndex % 18) - 6));
    createdTasks += 1;

    const childCount = Math.min(3, taskCount - createdTasks);
    for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
      const childId = `qc-card-${cardIndex + 1}-child-${childIndex + 1}`;
      nodes.push(makeNode(childId, `品質驗證測試任務 ${cardIndex + 1}.${childIndex + 1}`, cardId, childIndex, statuses[(cardIndex + childIndex + 1) % statuses.length], (cardIndex % 18) - 5));
      createdTasks += 1;

      if (createdTasks < taskCount && childIndex === 0 && cardIndex % 2 === 0) {
        const grandchildId = `${childId}-deep-1`;
        nodes.push(makeNode(grandchildId, `品質驗證測試任務 ${cardIndex + 1}.${childIndex + 1}.1`, childId, 0, statuses[(cardIndex + 2) % statuses.length], (cardIndex % 18) - 4));
        createdTasks += 1;
      }
    }

    cardOrder += 1;
  }

  return nodes;
};

const getSeedData = (taskCount = 12) => {
  const board = makeBoard();
  const workspace = makeWorkspace(board);
  const nodes = createLocalTestNodes(taskCount);
  return { workspace, nodes, taskCount: clampTaskCount(taskCount) };
};

export const inspectLocalTestEnvironment = () => {
  const nodes = localTestStorage.readNodes();
  const cycles: string[] = [];
  const missingParents: string[] = [];

  Object.values(nodes).forEach(node => {
    const visited = new Set<string>([node.id]);
    let current = node.parentId;

    while (current) {
      const parent = nodes[current];
      if (!parent) {
        missingParents.push(node.id);
        return;
      }
      if (visited.has(current)) {
        cycles.push(node.id);
        return;
      }
      visited.add(current);
      current = parent.parentId;
    }
  });

  return {
    nodeCount: Object.keys(nodes).length,
    rootCount: Object.values(nodes).filter(node => !node.parentId).length,
    cycles,
    missingParents,
  };
};

export const seedLocalTestEnvironment = (options: SeedOptions = {}) => {
  const storedTaskCount = Number(localStorage.getItem(LOCAL_TEST_SIZE_KEY));
  const requestedTaskCount = options.taskCount ?? getRequestedTaskCount() ?? (Number.isFinite(storedTaskCount) && storedTaskCount > 0 ? storedTaskCount : 12);
  const taskCount = clampTaskCount(requestedTaskCount);
  const force = options.force || shouldForceSeedFromUrl() || localStorage.getItem(LOCAL_TEST_SIZE_KEY) !== String(taskCount);
  const existingWorkspaces = localTestStorage.readWorkspaces();
  const existingNodes = localTestStorage.readNodes();
  const hasSeed = existingWorkspaces.some(workspace => workspace.id === LOCAL_TEST_WS_ID);

  const { workspace, nodes } = getSeedData(taskCount);
  const nextWorkspaces = hasSeed
    ? existingWorkspaces.map(item => item.id === LOCAL_TEST_WS_ID ? workspace : item)
    : [workspace, ...existingWorkspaces];
  const nextNodes = force || !localStorage.getItem(LOCAL_TEST_SEEDED_KEY)
    ? Object.fromEntries(nodes.map(node => [node.id, node]))
    : existingNodes;
  const storedActiveWorkspaceId = force ? null : localStorage.getItem('projed-last-ws');
  const storedActiveBoardId = force ? null : localStorage.getItem('projed-last-board');
  const storedView = force ? null : localStorage.getItem('projed-last-view');
  const nextView: ViewMode = storedView && LOCAL_TEST_RESTORABLE_VIEWS.has(storedView as ViewMode)
    ? (storedView as ViewMode)
    : 'board';
  const workspaceWithStoredBoard = storedActiveBoardId
    ? nextWorkspaces.find(item => item.boards.some(board => board.id === storedActiveBoardId))
    : undefined;
  const storedWorkspace = storedActiveWorkspaceId
    ? nextWorkspaces.find(item => item.id === storedActiveWorkspaceId)
    : undefined;
  const storedWorkspaceBoard = storedWorkspace?.boards[0];
  const shouldKeepWorkspaceOverview = nextView === 'home' && Boolean(storedWorkspace) && !storedActiveBoardId;
  const nextActiveWorkspaceId = workspaceWithStoredBoard?.id ?? (storedWorkspace ? storedWorkspace.id : LOCAL_TEST_WS_ID);
  const nextActiveBoardId = shouldKeepWorkspaceOverview
    ? null
    : workspaceWithStoredBoard && storedActiveBoardId
    ? storedActiveBoardId
    : (storedWorkspaceBoard?.id ?? LOCAL_TEST_BOARD_ID);

  localTestStorage.writeWorkspaces(nextWorkspaces);
  localTestStorage.writeNodes(nextNodes);
  localTestStorage.writeDependencies(force ? [] : localTestStorage.readDependencies());
  if (force) localTestStorage.writeBoardMembers({});
  if (force) localTestStorage.writeBoardInvites({});
  localStorage.setItem(LOCAL_TEST_SEEDED_KEY, 'true');
  localStorage.setItem(LOCAL_TEST_SIZE_KEY, String(taskCount));
  localStorage.setItem('projed-last-ws', nextActiveWorkspaceId);
  if (nextActiveBoardId) {
    localStorage.setItem('projed-last-board', nextActiveBoardId);
  } else {
    localStorage.removeItem('projed-last-board');
  }
  localStorage.setItem('projed-last-view', nextView);

  useBoardStore.setState({
    workspaces: nextWorkspaces,
    activeWorkspaceId: nextActiveWorkspaceId,
    activeBoardId: nextActiveBoardId,
    currentView: nextView,
  });
  useWbsStore.getState().setNodes(Object.values(nextNodes));
  useWbsStore.setState({ dependencies: localTestStorage.readDependencies() });
  installLocalTestQcApi();

  return { taskCount, nodeCount: Object.keys(nextNodes).length };
};

export const resetLocalTestEnvironment = (taskCount?: number) => {
  localStorage.removeItem(LOCAL_TEST_SEEDED_KEY);
  localStorage.removeItem(LOCAL_TEST_SIZE_KEY);
  localTestStorage.writeWorkspaces([]);
  localTestStorage.writeNodes({});
  localTestStorage.writeDependencies([]);
  localTestStorage.writeBoardMembers({});
  localTestStorage.writeBoardInvites({});
  return seedLocalTestEnvironment({ force: true, taskCount });
};

function installLocalTestQcApi() {
  const qcWindow = getQcWindow();
  if (!qcWindow) return;

  qcWindow.__PROJED_QC__ = {
    seed: (taskCount?: number) => seedLocalTestEnvironment({ force: true, taskCount }),
    reset: (taskCount?: number) => resetLocalTestEnvironment(taskCount),
    inspect: inspectLocalTestEnvironment,
  };
}
