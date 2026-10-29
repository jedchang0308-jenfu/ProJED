import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {KernelError} from '../../../server/errors.js';
import {createMeetingTaskCandidateSnapshot,selectMeetingTaskCandidates,
  type MeetingTaskCandidateScope, type MeetingTaskCandidateSignal, type MeetingTaskCandidateSource}
  from '../../../server/meetingTaskCandidates.js';

const TENANT_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_TENANT_ID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_PROJECT_ID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SOURCE_HASH='e'.repeat(64);
const SCOPE:MeetingTaskCandidateScope={tenantId:TENANT_ID,projectId:PROJECT_ID};

function taskId(index:number):string{return `00000000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`;}

function task(index:number,overrides:Partial<MeetingTaskCandidateSource>={}):MeetingTaskCandidateSource{
  return {taskId:taskId(index),tenantId:TENANT_ID,projectId:PROJECT_ID,title:`工作 ${index}`,taskCode:`T-${index}`,
    path:`專案/工作 ${index}`,description:`原始說明 ${index}`,status:'in_progress',updatedAt:'2026-10-29T08:00:00.000Z',
    sourceHash:SOURCE_HASH,nodeType:'task',archived:false,...overrides};
}

function signal(index:number,score:number):MeetingTaskCandidateSignal{return {taskId:taskId(index),score};}
function invalid(action:()=>unknown):void{
  assert.throws(action,error=>error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID');
}

test('snapshot preserves live Unicode fields and hashes the exact identity/version/source binding',()=>{
  const source=task(1,{title:'修復🙂水質',taskCode:'JED-水-17',path:'製程/驗收/前處理',
    description:`說明🙂${'長'.repeat(900)}`,status:'done'});
  const snapshot=createMeetingTaskCandidateSnapshot(source);
  assert.equal(snapshot.taskId,source.taskId);
  assert.equal(snapshot.updatedAt,source.updatedAt);
  assert.equal(snapshot.sourceHash,SOURCE_HASH);
  assert.ok(snapshot.text.includes('Title: 修復🙂水質'));
  assert.ok(snapshot.text.includes('Code: JED-水-17'));
  assert.ok(snapshot.text.includes('Status: done'));
  assert.equal(Array.from(snapshot.text).length,800);
  assert.equal(snapshot.snapshotHash,createHash('sha256').update(JSON.stringify({taskId:source.taskId,text:snapshot.text,
    updatedAt:source.updatedAt,sourceHash:SOURCE_HASH}),'utf8').digest('hex'));
  assert.equal(createMeetingTaskCandidateSnapshot({...source,sourceHash:'fnv1a32:deadbeef'}).sourceHash,'fnv1a32:deadbeef');
  assert.notEqual(createMeetingTaskCandidateSnapshot({...source,updatedAt:'2026-10-29T08:00:01.000Z'}).snapshotHash,
    snapshot.snapshotHash);
  assert.notEqual(createMeetingTaskCandidateSnapshot({...source,sourceHash:'f'.repeat(64)}).snapshotHash,snapshot.snapshotHash);
});

test('filters live scope, archived and non-task rows before merging; NULL legacy type and done tasks remain eligible',()=>{
  const live=[task(1),task(2,{nodeType:'milestone'}),task(3,{nodeType:null,status:'done'}),
    task(4,{archived:true}),task(5,{nodeType:'group'}),task(6,{projectId:OTHER_PROJECT_ID}),
    task(7,{tenantId:OTHER_TENANT_ID})];
  const result=selectMeetingTaskCandidates({scope:SCOPE,liveTasks:live,
    lexical:live.map((row,index)=>({taskId:row.taskId,score:1-index/10})),rag:[],pointer:[]});
  assert.deepEqual(result.map(candidate=>candidate.taskId),[taskId(1),taskId(2),taskId(3)]);
  assert.ok(result[2]?.text.includes('Status: done'));
});

test('applies source quotas, maxes duplicate signals, and fills overlap vacancies from unused text candidates',()=>{
  const live=Array.from({length:20},(_,index)=>task(index+1));
  const lexical=[signal(12,.25),signal(10,.55),signal(4,.7),signal(3,.8),signal(1,.2),signal(9,.6),
    signal(2,.9),signal(1,1),signal(11,.2)];
  const rag=[signal(8,.4),signal(6,.6),signal(3,.99),signal(5,.7),signal(7,.5),signal(4,.8),signal(11,.3),signal(12,.2)];
  const pointer=[signal(20,.3),signal(9,.4),signal(8,.5)];
  const result=selectMeetingTaskCandidates({scope:SCOPE,liveTasks:live,lexical,rag,pointer});
  assert.equal(result.length,12);
  assert.deepEqual(result.map(candidate=>candidate.taskId),Array.from({length:12},(_,index)=>taskId(index+1)));
  assert.deepEqual(result.find(candidate=>candidate.taskId===taskId(1)),{
    ...createMeetingTaskCandidateSnapshot(live[0]!),lexicalScore:1,ragScore:0,pointerFeature:0,
  });
  assert.equal(result.find(candidate=>candidate.taskId===taskId(3))?.lexicalScore,.8);
  assert.equal(result.find(candidate=>candidate.taskId===taskId(3))?.ragScore,.99);
  assert.equal(result.find(candidate=>candidate.taskId===taskId(8))?.pointerFeature,.5);
  assert.equal(result.find(candidate=>candidate.taskId===taskId(20)),undefined);
});

test('stable score ties use canonical UUID order and text fills all twelve slots without pointers',()=>{
  const live=Array.from({length:14},(_,index)=>task(index+1));
  const lexical=[...Array.from({length:8},(_,index)=>signal(index+1,.5))].reverse();
  const rag=Array.from({length:8},(_,index)=>signal(index+7,.25));
  const result=selectMeetingTaskCandidates({scope:SCOPE,liveTasks:live,lexical,rag,pointer:[]});
  assert.equal(result.length,12);
  assert.deepEqual(result.map(candidate=>candidate.taskId),[1,2,3,4,7,8,9,10,11,12,5,6].map(taskId));
  assert.ok(result.every(candidate=>candidate.pointerFeature===0));
});

test('rejects invalid positive-score domains and malformed snapshot bindings',()=>{
  const live=[task(1)];
  for(const bad of [Number.NaN,Number.POSITIVE_INFINITY,-.1,1.01]){
    invalid(()=>selectMeetingTaskCandidates({scope:SCOPE,liveTasks:live,lexical:[signal(1,bad)],rag:[],pointer:[]}));
  }
  invalid(()=>createMeetingTaskCandidateSnapshot(task(1,{sourceHash:''})));
  invalid(()=>createMeetingTaskCandidateSnapshot(task(1,{updatedAt:'not a timestamp'})));
});
