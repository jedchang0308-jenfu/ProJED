import assert from 'node:assert/strict';
import test from 'node:test';
import { filterReadIdentity, loadBoardFilterOptions } from '../../../src/features/taskFilters/optionSource';
import { isCalendarAssigneeVisible } from '../../../src/features/calendarSubscriptions/memberScope';
import { createHttpCalendarAdapter } from '../../../src/services/httpApi/calendarAdapter';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';

const json = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } });
const board = (id: string) => ({ id: `storage-${id}`, appBoardId: id, name: id, workspaceId: 'storage-ws', appWorkspaceId: 'ws', workspaceName: 'Workspace', path: `Workspace / ${id}` });

test('guest and ordinary-member workbench reads retain Board members and tags without a management directory', async () => {
  const paths: string[] = [];
  const client = new HttpApiClient(async input => {
    const path = String(input); paths.push(path);
    if (path.endsWith('/boards/a/members')) return json([{ workspaceId: 'ws', boardId: 'a', userId: 'u-a', role: 'member', profile: { id: 'u-a', email: null, displayName: 'A' }, createdAt: 1, updatedAt: 1 }]);
    if (path.endsWith('/tags')) return json([{ id: 'tag-a', storageId: 'stored-tag', workspaceId: 'ws', name: 'Visible tag', color: 'blue', order: 0, createdAt: 1, updatedAt: 1 }]);
    throw new Error('WORKSPACE_MANAGEMENT_FORBIDDEN');
  });
  client.bindExpectedActor({ accountId: 'guest', contextId: 'session' });
  const reads = createHttpDomainReadAdapter(client);
  const result = await loadBoardFilterOptions('ws', 'a', { listBoardMembers: reads.listBoardMembers, listTags: reads.listTags });
  assert.equal(result.workspaceMembers.length, 0);
  assert.equal(result.boardMembers[0]?.profile?.displayName, 'A');
  assert.equal(result.tags[0]?.name, 'Visible tag');
  assert.deepEqual(paths, ['/api/v1/workspaces/ws/boards/a/members', '/api/v1/workspaces/ws/tags']);
});

test('calendar directory reads only selected visible Board aliases and never the workspace administration route', async () => {
  const requested: string[] = [];
  const client = new HttpApiClient(async () => json({ workspaces: [], boards: [board('a'), board('b')] }));
  const reads = createHttpDomainReadAdapter(client);
  reads.listWorkspaceMembers = async () => { throw new Error('WORKSPACE_MANAGEMENT_FORBIDDEN'); };
  reads.listBoardMembers = async (workspaceId, boardId) => {
    requested.push(boardId);
    return [{ workspaceId, boardId, userId: `user-${boardId}`, role: 'member', profile: { id: `user-${boardId}`, email: null, displayName: boardId } }];
  };
  const members = await createHttpCalendarAdapter(client, reads).listWorkspaceMembers(['storage-ws', 'ws'], ['storage-a']);
  assert.deepEqual(requested, ['a']);
  assert.deepEqual(members.map(member => [member.userId, member.boardIds]), [['user-a', ['storage-a', 'a']]]);
  assert.equal(isCalendarAssigneeVisible(members[0]!, ['b', 'storage-b'], ['ws']), false);
  assert.equal(isCalendarAssigneeVisible(members[0]!, ['a'], ['ws']), true);
  assert.equal(isCalendarAssigneeVisible({ boardIds: [], workspaceIds: ['ws'] }, ['a'], ['ws']), false);
  assert.equal(isCalendarAssigneeVisible({ workspaceIds: ['ws'] }, ['a'], ['ws']), true);
});

test('calendar references from an old in-flight Session are never reused by another actor', async () => {
  let finishOld!: (response: Response) => void;
  const actors: string[] = [];
  const client = new HttpApiClient(async (_input, init) => {
    const actor = new Headers(init?.headers).get('x-projed-expected-account-id')!; actors.push(actor);
    if (actor === 'old') return new Promise<Response>(resolve => { finishOld = resolve; });
    return json({ workspaces: [], boards: [board('new')] });
  });
  const adapter = createHttpCalendarAdapter(client, createHttpDomainReadAdapter(client));
  client.bindExpectedActor({ accountId: 'old', contextId: 'old-session' });
  const old = adapter.listBoardRefs();
  client.bindExpectedActor({ accountId: 'new', contextId: 'new-session' });
  assert.equal((await adapter.listBoardRefs())[0]?.appBoardId, 'new');
  finishOld(json({ workspaces: [], boards: [board('old')] }));
  await old;
  assert.deepEqual(actors, ['old', 'new']);
  assert.notEqual(filterReadIdentity({ uid: 'old' }), filterReadIdentity({ uid: 'new' }));
  assert.notEqual(filterReadIdentity(Object.assign({ uid: 'same' }, { authContextId: 'one' })), filterReadIdentity(Object.assign({ uid: 'same' }, { authContextId: 'two' })));
});
