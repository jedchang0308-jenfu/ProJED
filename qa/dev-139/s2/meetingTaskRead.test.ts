import assert from 'node:assert/strict';
import test from 'node:test';
import type {QueryResult,QueryResultRow} from 'pg';

import type {ActorQueryPort} from '../../../server/actorTransaction.js';
import type {ScopedQuery} from '../../../server/db.js';
import {KernelError} from '../../../server/errors.js';
import {readMeetingTaskRagMatches,readMeetingTaskSources,scoreMeetingTaskLexical,
  type MeetingTaskRagSource} from '../../../server/meetingTaskRead.js';
import type {MeetingTaskCandidateScope,MeetingTaskCandidateSource} from '../../../server/meetingTaskCandidates.js';

const TENANT_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCOPE:MeetingTaskCandidateScope={tenantId:TENANT_ID,projectId:PROJECT_ID};
const HASH='a'.repeat(64);

type QueryHandler=(sql:string,values:readonly unknown[])=>readonly QueryResultRow[]|Promise<readonly QueryResultRow[]>;

function port(handler:QueryHandler):{port:ActorQueryPort;calls:Array<{sql:string;values:readonly unknown[]}>}{
  const calls:Array<{sql:string;values:readonly unknown[]}>=[];
  const query:ScopedQuery=async <R extends QueryResultRow=QueryResultRow>(sql:string,values:readonly unknown[]=[]):Promise<QueryResult<R>>=>{
    calls.push({sql,values});
    const rows=await handler(sql,values);
    return {rows:[...rows] as R[],rowCount:rows.length,command:'SELECT',oid:0,fields:[]};
  };
  return {port:{query} as ActorQueryPort,calls};
}

function task(taskId:string,overrides:Partial<MeetingTaskCandidateSource>={}):MeetingTaskCandidateSource{
  return {taskId,tenantId:TENANT_ID,projectId:PROJECT_ID,title:'防水 water pump',taskCode:'T-12',path:'工廠/泵浦',
    description:'保留原文🙂',status:'completed',updatedAt:'2026-10-29T08:00:00.000Z',sourceHash:'fnv1a32:1234abcd',
    nodeType:null,archived:false,...overrides};
}

function row(id:string,overrides:Partial<QueryResultRow>={}):QueryResultRow{
  return {id,parent_id:null,legacy_task_id:`task-${id.slice(-2)}`,title:'任務',description:null,detail_notes:[],
    status:'completed',start_date:null,end_date:null,node_type:'task',archived:false,
    updated_at:'2026-10-29T08:00:00.000Z',tag_names:[],task_state_hash:HASH,...overrides};
}

test('lexical ranking recognizes Chinese and English terms and normalizes full-width codes without mutating raw inputs',()=>{
  const chinese=task('11111111-1111-4111-8111-111111111111',{title:'防水泵浦',taskCode:'C-1'});
  const english=task('22222222-2222-4222-8222-222222222222',{title:'Water Pump Inspection',taskCode:'E-1'});
  const exactCode=task('33333333-3333-4333-8333-333333333333',{title:'另一個任務',taskCode:'T-12'});
  const longerCode=task('44444444-4444-4444-8444-444444444444',{title:'另一個任務',taskCode:'T-123'});
  const sources=[chinese,english,exactCode,longerCode];
  const before=structuredClone(sources);

  assert.ok(scoreMeetingTaskLexical('防水',sources).some(signal=>signal.taskId===chinese.taskId));
  assert.ok(scoreMeetingTaskLexical('water pump',sources).some(signal=>signal.taskId===english.taskId));
  const codeMatches=scoreMeetingTaskLexical('請查看 Ｔ－１２',sources);
  assert.ok(codeMatches.some(signal=>signal.taskId===exactCode.taskId));
  assert.equal(codeMatches.some(signal=>signal.taskId===longerCode.taskId),false);
  assert.deepEqual(sources,before);
});

test('authorized source read retains completed and NULL legacy tasks while excluding groups and archived rows',async()=>{
  const groupId='11111111-1111-4111-8111-111111111111';
  const completedId='22222222-2222-4222-8222-222222222222';
  const nullTypeId='33333333-3333-4333-8333-333333333333';
  const archivedId='44444444-4444-4444-8444-444444444444';
  const rows=[
    row(groupId,{title:'分組',node_type:'group'}),
    row(completedId,{parent_id:groupId,title:'已完成工作',status:'completed',node_type:'task'}),
    row(nullTypeId,{title:'舊格式工作',status:'todo',node_type:null}),
    row(archivedId,{title:'封存工作',archived:true}),
  ];
  const fake=port(sql=>sql.includes('actor_has_board_capability_v1')?[{allowed:true}]:rows);
  const result=await readMeetingTaskSources(fake.port,SCOPE);

  assert.deepEqual(result.tasks.map(item=>item.taskId),[completedId,nullTypeId]);
  assert.equal(result.tasks[0]?.status,'completed');
  assert.equal(result.tasks[1]?.nodeType,null);
  assert.equal(result.tasks[0]?.path,'分組 / 已完成工作');
  assert.deepEqual(result.ragSources.map(item=>item.taskId),[completedId,nullTypeId]);
  assert.deepEqual(fake.calls[0]?.values,[TENANT_ID,PROJECT_ID]);
  assert.deepEqual(fake.calls[1]?.values,[TENANT_ID,PROJECT_ID]);
});

test('invalid RAG vectors are rejected before any database read',async()=>{
  for(const vector of [
    Array<number>(3071).fill(1),
    Array<number>(3072).fill(0),
    Array<number>(3072).fill(1).map((value,index)=>index===7?Number.NaN:value),
    Array<number>(3072).fill(1).map((value,index)=>index===7?Number.MAX_VALUE:value),
  ]){
    const fake=port(()=>{throw new Error('invalid vector reached database');});
    await assert.rejects(readMeetingTaskRagMatches(fake.port,SCOPE,[],vector),error=>
      error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID');
    assert.equal(fake.calls.length,0);
  }
});

test('source and RAG reads stop at denied board authority before reading task data',async()=>{
  const denied=()=>port(sql=>{
    if(sql.includes('actor_has_board_capability_v1'))return [{allowed:false}];
    throw new Error('task data query crossed denied authority');
  });
  const sourcePort=denied();
  await assert.rejects(readMeetingTaskSources(sourcePort.port,SCOPE),error=>
    error instanceof KernelError&&error.code==='ACCESS_DENIED');
  assert.equal(sourcePort.calls.length,1);

  const source:MeetingTaskRagSource={taskId:'55555555-5555-4555-8555-555555555555',content:'current task',
    contentHash:'fnv1a32:1234abcd',taskStateHash:HASH,indexedContentLength:12};
  const ragPort=denied();
  const vector=Array<number>(3072).fill(0);vector[0]=1;
  await assert.rejects(readMeetingTaskRagMatches(ragPort.port,SCOPE,[source],vector),error=>
    error instanceof KernelError&&error.code==='ACCESS_DENIED');
  assert.equal(ragPort.calls.length,1);
});
