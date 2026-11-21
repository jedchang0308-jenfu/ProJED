import assert from 'node:assert/strict';
import test from 'node:test';

import type {ServerActorV1} from '../../../server/actorTransaction.js';
import {KernelError} from '../../../server/errors.js';
import {runMeetingDiscussionHost,
  type MeetingDiscussionHostDependencies,type MeetingDiscussionScannedWork}
  from '../../../server/meetingDiscussionHost.js';
import type {MeetingDiscussionUnitResult} from '../../../server/meetingDiscussionWorker.js';

const RUN_1='11111111-1111-4111-8111-111111111111';
const RUN_2='12121212-1212-4121-8121-121212121212';
const RUN_3='13131313-1313-4131-8131-131313131313';
const RUN_4='14141414-1414-4141-8141-141414141414';
const RUN_5='15151515-1515-4151-8151-151515151515';
const RUN_6='16161616-1616-4161-8161-161616161616';
const TOKEN_1='33333333-3333-4333-8333-333333333333';
const TOKEN_2='44444444-4444-4444-8444-444444444444';

const actor:ServerActorV1={principalId:RUN_1,localUserId:RUN_2,entry:'main',contextId:RUN_3,
  expiresAtMs:10_000,accountGuardRevision:'1'};

function item(runId:string,overrides:Partial<MeetingDiscussionScannedWork>={}):MeetingDiscussionScannedWork{
  return {runId,operationToken:null,deadlineExpired:false,...overrides};
}

function dependencies(overrides:Partial<MeetingDiscussionHostDependencies>={})
  :MeetingDiscussionHostDependencies{
  return {
    originalSessionResolver:async()=>actor,
    scan:async()=>[],
    finishScanned:async()=>false,
    runUnit:async()=>({state:'idle'}),
    ...overrides,
  };
}

test('scans while Session contract is unpublished and finishes expired work with exact scanned token',async()=>{
  const work=[item(RUN_1,{operationToken:TOKEN_1,deadlineExpired:true}),
    item(RUN_2,{deadlineExpired:true}),item(RUN_3,{operationToken:TOKEN_2,deadlineExpired:true}),item(RUN_4)];
  const finishCalls:Array<[string,string|null,string]>=[];
  let scanLimit=0,runCalls=0,finishAttempt=0;
  const summary=await runMeetingDiscussionHost(dependencies({
    originalSessionResolver:undefined,
    async scan(maxItems){scanLimit=maxItems;return work;},
    async finishScanned(runId,token,reason){
      finishCalls.push([runId,token,reason]);finishAttempt++;
      return finishAttempt===1;
    },
    async runUnit(){runCalls++;return {state:'source_complete',assemblyComplete:true};},
  }),new AbortController().signal);

  assert.equal(scanLimit,20);
  assert.deepEqual(finishCalls,[
    [RUN_1,TOKEN_1,'DISCUSSION_DEADLINE_EXPIRED'],
    [RUN_2,null,'DISCUSSION_DEADLINE_EXPIRED'],
    [RUN_3,TOKEN_2,'DISCUSSION_DEADLINE_EXPIRED'],
  ]);
  assert.equal(runCalls,0);
  assert.deepEqual(summary,{scanned:4,units:0,completed:0,sources:0,abandoned:1,deferred:3,failures:0,errors:{}});
});

test('counts source completion separately from full assembly and treats idle/stale as deferred',async()=>{
  const work=[item(RUN_1),item(RUN_2),item(RUN_3),item(RUN_4)];
  const results:MeetingDiscussionUnitResult[]=[
    {state:'source_complete',assemblyComplete:false},
    {state:'source_complete',assemblyComplete:true},
    {state:'idle'},
    {state:'not_current'},
  ];
  let index=0;
  const summary=await runMeetingDiscussionHost(dependencies({
    async scan(){return work;},
    async runUnit(){return results[index++]!;},
  }),new AbortController().signal);

  assert.deepEqual(summary,{scanned:4,units:4,completed:1,sources:2,abandoned:0,deferred:2,failures:0,errors:{}});
});

test('limits work to four unique runs and defers after the round deadline headroom is exhausted',async()=>{
  const work=[item(RUN_1),item(RUN_2),item(RUN_3),item(RUN_4),item(RUN_5),item(RUN_6),item(RUN_1)];
  const runCalls:string[]=[];
  const capped=await runMeetingDiscussionHost(dependencies({
    async scan(){return work;},
    async runUnit(runId){runCalls.push(runId);return {state:'yielded'};},
  }),new AbortController().signal);
  assert.deepEqual(runCalls,[RUN_2,RUN_3,RUN_4,RUN_5]);
  assert.deepEqual(capped,{scanned:7,units:4,completed:0,sources:0,abandoned:0,deferred:7,failures:0,errors:{}});

  let now=1_000;
  const deadlineCalls:string[]=[];
  const deadline=await runMeetingDiscussionHost(dependencies({
    now:()=>now,
    async scan(){return [item(RUN_1),item(RUN_2),item(RUN_3)];},
    async runUnit(runId){deadlineCalls.push(runId);now=451_001;return {state:'yielded'};},
  }),new AbortController().signal);
  assert.deepEqual(deadlineCalls,[RUN_1]);
  assert.deepEqual(deadline,{scanned:3,units:1,completed:0,sources:0,abandoned:0,deferred:3,failures:0,errors:{}});

  now=1_000;
  const scanDeadline=await runMeetingDiscussionHost(dependencies({
    now:()=>now,
    async scan(){now+=600_001;return [item(RUN_1)];},
    async runUnit(){assert.fail('work started after the round deadline');},
  }),new AbortController().signal);
  assert.deepEqual(scanDeadline,{scanned:1,units:0,completed:0,sources:0,abandoned:0,deferred:1,failures:0,errors:{}});
});

test('permanent Session/source failures finish only the scanned lease; temporary identity errors defer',async()=>{
  const work=[item(RUN_1,{operationToken:TOKEN_1}),item(RUN_2,{operationToken:TOKEN_2}),item(RUN_3),item(RUN_4)];
  const finishes:Array<[string,string|null,string]>=[];
  let index=0;
  const errors:unknown[]=[
    new KernelError('ACTOR_INVALID','private session text',401),
    new KernelError('RESOURCE_NOT_FOUND','private source text',404),
    new KernelError('IDENTITY_STATE_UNAVAILABLE','temporary state text',503),
    new KernelError('IDENTITY_CONTRACT_UNAVAILABLE','unpublished contract text',503),
  ];
  const summary=await runMeetingDiscussionHost(dependencies({
    async scan(){return work;},
    async finishScanned(runId,token,reason){finishes.push([runId,token,reason]);return true;},
    async runUnit(){throw errors[index++];},
  }),new AbortController().signal);

  assert.deepEqual(finishes,[
    [RUN_1,TOKEN_1,'DISCUSSION_SESSION_UNAVAILABLE'],
    [RUN_2,TOKEN_2,'DISCUSSION_SOURCE_UNAVAILABLE'],
  ]);
  assert.deepEqual(summary,{scanned:4,units:4,completed:0,sources:0,abandoned:2,deferred:2,failures:2,
    errors:{IDENTITY_STATE_UNAVAILABLE:1,IDENTITY_CONTRACT_UNAVAILABLE:1}});
});

test('all permanent actor identity failures map to metadata-only Session unavailability',async()=>{
  const codes=['ACTOR_CHANGED','ACCESS_DENIED','IDENTITY_INVALID','IDENTITY_MAPPING_CONFLICT'] as const;
  for(const [index,code] of codes.entries()){
    const runId=[RUN_1,RUN_2,RUN_3,RUN_4][index]!;
    const finishes:Array<[string,string|null,string]>=[];
    const summary=await runMeetingDiscussionHost(dependencies({
      async scan(){return [item(runId,{operationToken:TOKEN_1})];},
      async runUnit(){throw new KernelError(code,'identity details',403);},
      async finishScanned(scannedRunId,token,reason){finishes.push([scannedRunId,token,reason]);return true;},
    }),new AbortController().signal);
    assert.deepEqual(finishes,[[runId,TOKEN_1,'DISCUSSION_SESSION_UNAVAILABLE']]);
    assert.equal(summary.abandoned,1);
    assert.equal(summary.failures,0);
  }
});

test('a null scanned token cannot finish a lease acquired by a failed unit',async()=>{
  const finishCalls:Array<[string,string|null,string]>=[];
  const summary=await runMeetingDiscussionHost(dependencies({
    async scan(){return [item(RUN_1)];},
    async runUnit(){throw new KernelError('IDENTITY_INVALID','session text',403);},
    async finishScanned(runId,token,reason){finishCalls.push([runId,token,reason]);return false;},
  }),new AbortController().signal);

  assert.deepEqual(finishCalls,[[RUN_1,null,'DISCUSSION_SESSION_UNAVAILABLE']]);
  assert.deepEqual(summary,{scanned:1,units:1,completed:0,sources:0,abandoned:0,deferred:1,failures:0,errors:{}});
});

test('aggregates retain both safe error codes and unknown errors never expose messages',async()=>{
  const finishes:Array<[string,string|null,string]>=[];
  const summary=await runMeetingDiscussionHost(dependencies({
    async scan(){return [item(RUN_1),item(RUN_2),item(RUN_3)];},
    async runUnit(runId){
      if(runId===RUN_1)throw new AggregateError([
        new KernelError('DB_UNAVAILABLE','private operation details',503),
        new KernelError('DB_BUSY','private cleanup details',503),
      ],'private aggregate details');
      if(runId===RUN_2)throw new Error('token=secret transcript=private');
      throw new AggregateError([
        new KernelError('DB_COMMIT_UNKNOWN','private operation details',503),
        new KernelError('RESOURCE_NOT_FOUND','private cleanup details',404),
      ],'private aggregate details');
    },
    async finishScanned(runId,token,reason){finishes.push([runId,token,reason]);return true;},
  }),new AbortController().signal);

  assert.deepEqual(finishes,[]);
  assert.deepEqual(summary,{scanned:3,units:3,completed:0,sources:0,abandoned:0,deferred:3,failures:3,
    errors:{DB_UNAVAILABLE:1,DB_BUSY:1,DISCUSSION_HOST_UNAVAILABLE:1,DB_COMMIT_UNKNOWN:1,RESOURCE_NOT_FOUND:1}});
});
