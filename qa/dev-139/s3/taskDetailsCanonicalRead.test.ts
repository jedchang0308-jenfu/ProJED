import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaskNode } from '../../../src/types';
import { readTaskDetailsCanonical, type TaskDetailsCanonicalReadPorts } from '../../../src/services/taskDetailsCanonicalRead';
const source={id:'recovered-note',workspaceId:'original-workspace',boardId:'__task_workbench_unplaced__',title:'Cloud task'} as TaskNode;
const ports=(patch:Partial<TaskDetailsCanonicalReadPorts>={}):TaskDetailsCanonicalReadPorts=>({
 backend:'http',readLocalUnplaced:()=>[],listHttpUnplaced:async()=>[source],
 listSupabaseUnplaced:async()=>{throw Error('UNEXPECTED_SUPABASE');},listBoard:async()=>{throw Error('UNEXPECTED_BOARD');},...patch,
});
test('HTTP draft recovery reads the original cloud task after successful load cleared the local fallback',async()=>{
 let reads=0;
 const current=await readTaskDetailsCanonical(source,'original-account',ports({listHttpUnplaced:async account=>{
  assert.equal(account,'original-account');reads++;return [source];
 }}));
 assert.equal(current,source);assert.equal(reads,1);
});
test('an optimistic local unplaced value never proves an HTTP commit',async()=>{
 const local={...source,title:'Local optimistic edit'};
 assert.equal(await readTaskDetailsCanonical(local,'original-account',ports({readLocalUnplaced:()=>{throw Error('LOCAL_NOT_AUTHORITATIVE');}})),source);
 assert.equal(await readTaskDetailsCanonical(local,'original-account',ports({listHttpUnplaced:async()=>[]})),undefined);
});
test('expired or changed HTTP identity cannot fall back to local data or retry writes',async()=>{
 const failure=Error('ACTOR_CHANGED');
 await assert.rejects(()=>readTaskDetailsCanonical(source,'original-account',ports({listHttpUnplaced:async()=>{throw failure;},readLocalUnplaced:()=>[source]})),error=>error===failure);
 assert.equal(await readTaskDetailsCanonical(source,null,ports({listHttpUnplaced:async()=>{throw Error('NO_ACCOUNT_NO_REQUEST');}})),undefined);
});
test('board reads and the existing local/Supabase fallback remain compatible',async()=>{
 const board={...source,boardId:'original-board'};
 assert.equal(await readTaskDetailsCanonical(board,'original-account',ports({listBoard:async(workspace,boardId)=>{
  assert.equal(workspace,source.workspaceId);assert.equal(boardId,board.boardId);return [board];
 }})),board);
 assert.equal(await readTaskDetailsCanonical(source,'original-account',ports({backend:'local-test',readLocalUnplaced:()=>[source]})),source);
 assert.equal(await readTaskDetailsCanonical(source,'original-account',ports({backend:'supabase',listSupabaseUnplaced:async()=>[source]})),source);
});
