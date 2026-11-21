import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { CollaborationWriteRepository } from '../../../server/collaborationWrite.js';
import { sha256, type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainReadRepository } from '../../../server/domainRead.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter.js';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient.js';
import type { BoardTaskOrderCommand } from '../../../src/features/taskCreation/boardTaskOrder.js';
import type { TaskNode, TaskNotePersistenceSnapshot } from '../../../src/types/index.js';

/** Owns a separate HTTP/pool and workspace inside the existing nonce CI database. */
export async function verifyTaskOrderNotesPostgres(
  config: RuntimeConfig, owner: ServerActorV1, reader: ServerActorV1, outsider: ServerActorV1,
): Promise<void> {
  assert.equal(config.profile.environment, 'disposable');
  const database = new RuntimeDatabase(config);
  const reads = new DomainReadRepository();
  const collaboration = new CollaborationWriteRepository(reads);
  const http = createKernelHttpServer({ ...config, host: '127.0.0.1', port: 0 }, database,
    config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) })), {
      resolveActor: async request => {
        const actor = [owner, reader, outsider].find(value => request.headers.cookie === `qa-order=${value.localUserId}`);
        if (!actor) throw new KernelError('ACTOR_INVALID', 'Fixture session unavailable', 401);
        return actor;
      },
    });
  const address = await http.listen();
  const origin = `http://${address.host}:${address.port}`;
  const clientFor = (actor: ServerActorV1, expected = actor, requestOrigin = origin) => {
    const client = new HttpApiClient(async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('cookie', `qa-order=${actor.localUserId}`);
      headers.set('origin', requestOrigin);
      return fetch(`${origin}${String(input)}`, { ...init, headers });
    });
    client.bindExpectedActor({ accountId: expected.localUserId, contextId: expected.contextId });
    return client;
  };
  const writer = createHttpDomainWriteAdapter(clientFor(owner));
  const reject = (promise: Promise<unknown>, status: number, code?: string) => assert.rejects(promise,
    (error: unknown) => error instanceof HttpApiError && error.status === status && (!code || error.code === code));
  let workspaceId: string | undefined;
  try {
    const workspace = await runActorTransaction(database, config, owner, port => collaboration.createWorkspace(port, { title: 'Atomic order CAS fixture' }));
    workspaceId = workspace.id;
    const board = await runActorTransaction(database, config, owner, port => collaboration.createBoard(port, workspace.id, { title: 'Order' }));
    const otherBoard = await runActorTransaction(database, config, owner, port => collaboration.createBoard(port, workspace.id, { title: 'Other' }));
    const ws = workspace.id;
    const task = (id: string, order = 0, parentId: string | null = null): TaskNode => ({
      id, workspaceId: ws, boardId: board.id, parentId, title: id, status: 'todo', order,
      detailNotes: [], isArchived: false,
    });
    const list = () => runActorTransaction(database, config, owner, port => reads.listTasks(port, ws, board.id));
    const create = (node: TaskNode, destination: BoardTaskOrderCommand['destination'], extra = {}) => writer.commitBoardOrder({
      kind: 'create', workspaceId: ws, boardId: board.id, node, destination, protectedTaskIds: [], ...extra,
    });
    const move = (taskId: string, sourceParentId: string | null, destination: BoardTaskOrderCommand['destination'], protectedTaskIds: string[] = []) => writer.commitBoardOrder({
      kind: 'move', workspaceId: ws, boardId: board.id, taskId, sourceParentId, destination, protectedTaskIds,
    });
    await writer.createTask(ws, board.id, task('rank-left', 7));
    await writer.createTask(ws, board.id, task('rank-right', 8));
    const between = task('rank-between');
    const inserted = await create(between, { parentId: null, position: 'before', anchorId: 'rank-right' });
    assert.deepEqual(inserted.nodes.map(node => [node.id, node.order]), [['rank-left', 0], ['rank-between', 1024], ['rank-right', 2048]]);
    assert.ok(inserted.nodes.every(node => node.storageId && Number.isSafeInteger(node.updatedAt)));
    await reject(create(between, { parentId: null, position: 'append' }), 409, 'REVISION_CONFLICT');
    await move('rank-left', null, { parentId: null, position: 'swap', anchorId: 'rank-right' });
    assert.deepEqual((await list()).sort((a,b) => a.order-b.order).map(node => node.id), ['rank-right','rank-between','rank-left']);
    const beforeProtected = await list();
    await reject(move('rank-left', null, { parentId: null, position: 'before', anchorId: 'rank-right' }, ['rank-left']), 409);
    assert.deepEqual(await list(), beforeProtected);
    const parent = await writer.createTask(ws, board.id, { ...task('done-parent', 4096), status: 'completed' });
    const child = await create(task('child', 0, parent.id), { parentId: parent.storageId!, position: 'append' }, { reopenParent: true });
    assert.equal(child.reopenedParent, true);
    assert.equal((await list()).find(node => node.id === parent.id)?.status, 'in_progress');
    await move('rank-between', null, { parentId: parent.id, position: 'after', anchorId: 'child' });
    await reject(move('rank-between', null, { parentId: null, position: 'append' }), 409);
    await reject(move(parent.id, null, { parentId: 'child', position: 'append' }), 409);
    const foreign = await writer.createTask(ws, otherBoard.id, { ...task('foreign'), boardId: otherBoard.id });
    await reject(move('rank-left', null, { parentId: null, position: 'before', anchorId: foreign.id }), 404);

    // Gap exhaustion updates the first sibling before the invalid tag is found.
    // A failure must roll back that rank, the inserted task and all revisions.
    await writer.updateTask(ws, board.id, 'rank-right', { order: 7 });
    await writer.updateTask(ws, board.id, 'rank-left', { order: 8 });
    const beforeRollback = await list();
    await reject(create({ ...task('rolled-back'), tagIds: ['missing-tag'] }, { parentId: null, position: 'before', anchorId: 'rank-left' }), 404);
    assert.deepEqual(await list(), beforeRollback);
    await Promise.all(['concurrent-a','concurrent-b'].map(id => create(task(id), { parentId: null, position: 'before', anchorId: 'rank-left' })));
    const roots = (await list()).filter(node => node.parentId === null).sort((a,b) => a.order-b.order);
    assert.equal(new Set(roots.map(node => node.order)).size, roots.length);
    assert.deepEqual(roots.slice(roots.findIndex(node => node.id === 'rank-left')-2, roots.findIndex(node => node.id === 'rank-left')).map(node => node.id).sort(), ['concurrent-a','concurrent-b']);

    const empty: TaskNotePersistenceSnapshot = { detailNotes: [], description: null };
    const note = (content: string): TaskNotePersistenceSnapshot => ({ detailNotes: [{ id: 'note', title: 'Title', content }], description: content });
    const outcomes = await Promise.all(['one','two'].map(content => writer.compareAndSetNotes(ws, board.id, 'child', empty, note(content))));
    assert.deepEqual(outcomes.map(value => value.status).sort(), ['conflict','persisted']);
    const winner = outcomes.find(value => value.status === 'persisted')!.snapshot;
    assert.deepEqual(outcomes.find(value => value.status === 'conflict')!.snapshot, winner);
    assert.equal((await writer.compareAndSetNotes(ws, board.id, 'child', empty, note('stale'))).status, 'conflict');
    await writer.updateTask(ws, board.id, 'child', { title: 'Unrelated title update' });
    const reordered = { ...winner, updatedAt: 0, detailNotes: winner.detailNotes.map(value => ({ content: value.content, title: value.title, id: value.id })) };
    const changed = await writer.compareAndSetNotes(ws, board.id, 'child', reordered, note('three'));
    assert.equal(changed.status, 'persisted', 'object key order and unrelated timestamps do not cause false conflicts');
    const twoNotes = { ...note('four'), detailNotes: [...note('four').detailNotes, { id: 'second', title: 'Two', content: 'Second' }] };
    assert.equal((await writer.compareAndSetNotes(ws, board.id, 'child', changed.snapshot, twoNotes)).status, 'persisted');
    assert.equal((await writer.compareAndSetNotes(ws, board.id, 'child', { ...twoNotes, detailNotes: [...twoNotes.detailNotes].reverse() }, empty)).status, 'conflict');
    assert.equal((await list()).find(value => value.id === 'child')?.title, 'Unrelated title update');
    await reject(writer.compareAndSetNotes(ws, board.id, 'missing', empty, empty), 404);
    await writer.updateTask(ws, board.id, 'child', { isArchived: true });
    await reject(writer.compareAndSetNotes(ws, board.id, 'child', twoNotes, empty), 404);

    const raw = clientFor(owner);
    const orderPath = `/api/v1/workspaces/${ws}/boards/${board.id}/tasks:commit-order`;
    const notesPath = `/api/v1/workspaces/${ws}/boards/${board.id}/tasks/rank-left/notes:compare-and-set`;
    await reject(raw.request(orderPath, { method: 'POST', body: { kind:'move', taskId:'rank-left', sourceParentId:null, destination:{parentId:null,position:'append'},protectedTaskIds:[],canEdit:true } }), 400);
    await reject(raw.request(notesPath, { method: 'POST', body: { expected:empty, next:{detailNotes:[{id:'bad'}],description:null} } }), 400);
    for (const path of [orderPath, notesPath]) {
      const body = path === orderPath ? { kind:'move',taskId:'rank-left',sourceParentId:null,destination:{parentId:null,position:'append'},protectedTaskIds:[] } : { expected:empty,next:note('unauthorized') };
      await reject(clientFor(outsider).request(path, { method:'POST',body }), 404);
      await reject(clientFor(owner,reader).request(path, { method:'POST',body }), 409, 'ACTOR_CHANGED');
      await reject(clientFor(owner,owner,'https://untrusted.invalid').request(path, { method:'POST',body }), 403);
    }
    const readOnly = createHttpDomainWriteAdapter(clientFor(reader));
    await reject(readOnly.commitBoardOrder({ kind:'move',workspaceId:'ws-b',boardId:'board-shared',taskId:'shared-parent',sourceParentId:null,destination:{parentId:null,position:'append'},protectedTaskIds:[] }), 403);
    await reject(readOnly.compareAndSetNotes('ws-b','board-shared','shared-parent',empty,empty), 403);
    assert.equal((await list()).find(value => value.id === 'rank-left')?.detailNotes.length, 0);

    const inviteToken = randomUUID();
    await runActorTransaction(database,config,owner,port => collaboration.createInvite(port,ws,otherBoard.id,{
      email:'a@example.invalid',tokenHash:createHash('sha256').update(inviteToken).digest('hex'),
      expiresAt:Date.now()+60_000,defaultRole:'member',
    }));
    await runActorTransaction(database,config,reader,port => collaboration.acceptInvite(port,inviteToken));
    await runActorTransaction(database,config,owner,async port => {
      const matrix = await reads.getBoardRolePermissions(port,ws,otherBoard.id);
      await collaboration.updateRolePermissions(port,ws,otherBoard.id,{...matrix,member:['read_board','create_task']});
    });
    for (const [id,order] of [['create-only-left',7],['create-only-right',8]] as const) {
      await writer.createTask(ws,otherBoard.id,{...task(id,order),boardId:otherBoard.id});
    }
    const createOnly = await readOnly.commitBoardOrder({kind:'create',workspaceId:ws,boardId:otherBoard.id,
      node:{...task('create-only-insert'),boardId:otherBoard.id},destination:{parentId:null,position:'before',anchorId:'create-only-right'},protectedTaskIds:[]});
    assert.equal(createOnly.nodes.find(value => value.id === 'create-only-insert')?.order,2048);
    await reject(readOnly.updateTask(ws,otherBoard.id,'create-only-left',{title:'Forbidden'}),403);
    await reject(readOnly.commitBoardOrder({kind:'move',workspaceId:ws,boardId:otherBoard.id,taskId:'create-only-left',sourceParentId:null,destination:{parentId:null,position:'append'},protectedTaskIds:[]}),403);
    await reject(readOnly.compareAndSetNotes(ws,otherBoard.id,'create-only-left',empty,empty),403);
    await writer.updateTask(ws,otherBoard.id,foreign.id,{status:'completed'});
    const noEdit = await readOnly.commitBoardOrder({kind:'create',workspaceId:ws,boardId:otherBoard.id,node:{...task('create-only-child',0,foreign.id),boardId:otherBoard.id},destination:{parentId:foreign.id,position:'append'},protectedTaskIds:[],reopenParent:true});
    assert.equal(noEdit.reopenedParent,false);
    await runActorTransaction(database,config,reader,async port => {
      const direct = await port.query("UPDATE projed_core.wbs_items SET sort_order=999 WHERE legacy_task_id='create-only-left'");
      assert.equal(direct.rowCount,0,'rank authority does not escape its bounded method');
      await assert.rejects(port.query("SELECT set_config('projed.task_order_reindex','forged',true)"),
        (error:unknown) => error instanceof KernelError && error.code === 'TRANSACTION_USAGE_INVALID');
    });
  } finally {
    try {
      if (workspaceId) await runActorTransaction(database, config, owner, port => collaboration.deleteWorkspace(port, workspaceId!));
    } finally { await http.shutdown(); }
  }
}
