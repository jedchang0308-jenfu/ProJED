import { createRoot } from 'react-dom/client';
import { useHttpSync } from '../../../src/hooks/useHttpSync';
import useAuthStore from '../../../src/store/useAuthStore';
import useBoardStore from '../../../src/store/useBoardStore';
import { useWbsStore } from '../../../src/store/useWbsStore';
import { useTagStore } from '../../../src/store/useTagStore';
import { useMemberStore } from '../../../src/store/useMemberStore';
import useRecordStore from '../../../src/store/useRecordStore';
import { httpApiClient, httpCollaborationService, httpDomainReadService, httpDomainWriteService } from '../../../src/services/httpApi/backend';
import type { TaskNode, Workspace } from '../../../src/types';

const boardId = 'same-legacy-board';
const workspace = (owner: string): Workspace => ({ id: `ws-${owner}`, title: `${owner}-private-workspace`, boards: [{ id: boardId, title: `${owner}-board`, dependencies: [] }] });
const task = (owner: string): TaskNode => ({ id: `${owner}-task`, workspaceId: `ws-${owner}`, boardId, title: `${owner}-private-task`, parentId: null, status: 'todo', order: 0 });
const tag = (owner: string) => ({ id: `${owner}-tag`, workspaceId: `ws-${owner}`, name: `${owner}-private-tag`, color: 'blue' as const, order: 0 });
const root = createRoot(document.querySelector('#fixture')!);
let releaseMembers!: () => void;
const slowOldMembers = new Promise<void>(resolve => { releaseMembers = resolve; });
let releaseIndex!: (rows: Workspace[]) => void;
const slowNewIndex = new Promise<Workspace[]>(resolve => { releaseIndex = resolve; });
let releaseTags!: (rows: ReturnType<typeof tag>[]) => void;
const slowOldTags = new Promise<ReturnType<typeof tag>[]>(resolve => { releaseTags = resolve; });
let deferOldTags = false;
let oldTasksRead = false;
let oldTaskReadCount = 0;
const indexContexts: string[] = [];
let scopeMembers: Promise<void> | null = null;
let releaseScopeMembers!: () => void;
let oldTagLoad: Promise<void> | null = null;
let rejectOldMutation!: (error: Error) => void;
const slowOldMutation = new Promise<never>((_resolve, reject) => { rejectOldMutation = reject; });
httpDomainWriteService.updateTag = async () => slowOldMutation;

// These service responses model already-parsed HTTP results waiting on other
// store loaders. The HTTP actor guard cannot retract such earlier results.
httpCollaborationService.listResourceRevisions = async () => [];
httpDomainReadService.listWorkspaces = async () => {
  const user = useAuthStore.getState().user;
  indexContexts.push(user && 'authContextId' in user ? String(user.authContextId) : 'unknown');
  return user?.uid === 'A' ? [workspace('A')] : slowNewIndex;
};
httpDomainReadService.listTasks = async workspaceId => {
  if (workspaceId === 'ws-A') { oldTasksRead = true; oldTaskReadCount += 1; }
  return [task(workspaceId === 'ws-A' ? 'A' : 'B')];
};
httpDomainReadService.listDependencies = async () => [];
httpDomainReadService.listTags = async workspaceId => workspaceId === 'ws-A' && deferOldTags
  ? slowOldTags : [tag(workspaceId === 'ws-A' ? 'A' : 'B')];
useMemberStore.setState({ loadMembers: async workspaceId => { if (workspaceId === 'ws-A') await (scopeMembers ?? slowOldMembers); } });
useRecordStore.setState({ loadRecords: async () => undefined });

function Probe() {
  useHttpSync();
  const workspaces = useBoardStore(state => state.workspaces);
  const nodes = useWbsStore(state => state.nodes);
  const tags = useTagStore(state => state.tags);
  return <pre data-private-read-probe>{JSON.stringify({ workspaces, nodes, tags })}</pre>;
}

const fixture = {
  setActor(uid: string, context = `context-${uid}`) {
    httpApiClient.bindExpectedActor({ accountId: uid, contextId: context });
    useAuthStore.setState({ user: Object.assign({ uid, displayName: uid, email: null }, { authContextId: context }), loading: false });
  },
  mount() {
    useBoardStore.setState({ workspaces: [workspace('A')], activeWorkspaceId: 'ws-A', activeBoardId: boardId });
    root.render(<Probe />);
  },
  publishEarlierARead() {
    useWbsStore.getState().setNodes([task('A')]);
    useTagStore.getState().setTags([tag('A')], 'ws-A');
  },
  publishB() {
    releaseIndex([workspace('B')]);
    useBoardStore.setState({ workspaces: [workspace('B')], activeWorkspaceId: 'ws-B', activeBoardId: boardId });
  },
  async releaseEarlierARead() { releaseMembers(); await new Promise(resolve => setTimeout(resolve, 0)); },
  snapshot() {
    return { workspaces: useBoardStore.getState().workspaces, nodes: Object.values(useWbsStore.getState().nodes), tags: useTagStore.getState().tags, oldTasksRead, oldTaskReadCount, indexContexts };
  },
  startOldTagLoad() { deferOldTags = true; oldTagLoad = useTagStore.getState().loadTags('ws-A'); },
  loadNewTags() { return useTagStore.getState().loadTags('ws-B'); },
  async releaseOldTags() { releaseTags([tag('A')]); await oldTagLoad; },
  startOldWorkspaceScope() {
    scopeMembers = new Promise(resolve => { releaseScopeMembers = resolve; });
    useBoardStore.setState({ workspaces: [workspace('A'), workspace('B')], activeWorkspaceId: 'ws-A', activeBoardId: boardId });
  },
  async releaseOldWorkspaceScope() { releaseScopeMembers(); await new Promise(resolve => setTimeout(resolve, 0)); },
  seedTags(owner: string) { useTagStore.getState().setTags([tag(owner)], `ws-${owner}`); },
  startOldMutation() { return useTagStore.getState().updateTag('ws-A', 'A-tag', { name: 'A-private-edited-tag' }); },
  rejectOldMutation() { rejectOldMutation(new Error('ACTOR_CHANGED')); },
  stop() { root.unmount(); },
};
Object.assign(window, { __DEV139_HTTP_STORE_FIXTURE: fixture });
