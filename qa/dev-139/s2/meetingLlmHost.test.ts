import assert from 'node:assert/strict';
import test from 'node:test';
import {KernelError} from '../../../server/errors.js';
import {parseMeetingLlmScannedWork,runMeetingLlmHost,type MeetingLlmHostDependencies,
  type MeetingLlmScannedWork} from '../../../server/meetingLlmHost.js';
import type {MeetingLlmPipelineResult} from '../../../server/meetingLlmPipeline.js';
import type {MeetingLlmReceipt} from '../../../server/meetingLlmRepository.js';

const RUN_A='11111111-1111-4111-8111-111111111111';
const RUN_B='22222222-2222-4222-8222-222222222222';
const RUN_C='33333333-3333-4333-8333-333333333333';
const TOKEN='44444444-4444-4444-8444-444444444444';
const receipt:MeetingLlmReceipt={kind:'usage_unknown',published:false,chargeMicros:null,
  requestHash:'a'.repeat(64),costBasis:'budget_estimate_not_invoice'};

const queued=(runId:string,deadlineExpired=false):MeetingLlmScannedWork=>({kind:'queued',runId,operationToken:null,deadlineExpired});
const recover=(runId:string,operationToken:string):MeetingLlmScannedWork=>({kind:'recover',runId,operationToken});

function baseDependencies(work:readonly MeetingLlmScannedWork[],overrides:Partial<MeetingLlmHostDependencies>={}){
  return {privateWorkEnabled:true,scan:async(maxItems:number)=>{assert.equal(maxItems,20);return work;},recover:async()=>null,finish:async()=>true,
    runNext:async()=>({state:'idle'} as const),...overrides} satisfies MeetingLlmHostDependencies;
}

test('metadata parser accepts bounded exact queue/recovery rows and rejects private body fields',()=>{
  assert.deepEqual(parseMeetingLlmScannedWork([recover(RUN_A,TOKEN),queued(RUN_B,true)]),[
    recover(RUN_A,TOKEN),queued(RUN_B,true),
  ]);
  for(const invalid of [
    [{...queued(RUN_A),discussion:'private transcript'}],
    [{...recover(RUN_A,TOKEN),inputText:'provider prompt'}],
    [{...queued(RUN_A),operationToken:TOKEN}],
    Array.from({length:21},(_,index)=>queued(RUN_A.replace(/^1/u,String(index+1).padStart(8,'0')))),
  ])assert.throws(()=>parseMeetingLlmScannedWork(invalid),error=>error instanceof KernelError&&error.code==='DB_BOUNDARY_INVALID');
});

test('private work disabled still performs metadata recovery and deadline finish only',async()=>{
  const work=[recover(RUN_A,TOKEN),queued(RUN_B,true),queued(RUN_C,false)],recovered:string[]=[],finished:Array<[string,string]>=[];
  let runCalls=0;
  const deps=baseDependencies(work,{privateWorkEnabled:false,
    async recover(runId,token){recovered.push(`${runId}:${token}`);return receipt;},
    async finish(runId,reason){finished.push([runId,reason]);return true;},
    async runNext(){runCalls++;return {state:'published'};},
  });

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.equal(summary.scanned,3);assert.equal(summary.recovered,1);assert.equal(summary.abandoned,1);
  assert.equal(summary.deferred,1);assert.deepEqual(recovered,[`${RUN_A}:${TOKEN}`]);
  assert.deepEqual(finished,[[RUN_B,'LLM_DEADLINE_EXPIRED']]);assert.equal(runCalls,0);
});

test('local, settled checkpoint, and publish progress advance in order',async()=>{
  const results:MeetingLlmPipelineResult[]=[{state:'local_completed'},{state:'settled',checkpointPublished:true},{state:'published'}];
  const calls:string[]=[];
  const deps=baseDependencies([queued(RUN_A)],{async runNext(runId){calls.push(runId);return results.shift()!;}});

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.equal(summary.units,3);assert.equal(summary.local,1);assert.equal(summary.published,1);
  assert.equal(summary.deferred,0);assert.deepEqual(calls,[RUN_A,RUN_A,RUN_A]);
});

test('unknown SQL failure consumes a unit slot before failure and the round remains capped at four',async()=>{
  const calls:string[]=[],work=[queued(RUN_A),queued(RUN_B)];
  const deps=baseDependencies(work,{async runNext(runId){
    calls.push(runId);
    if(runId===RUN_A)throw new KernelError('DB_COMMIT_UNKNOWN','synthetic uncertain unit transaction');
    return {state:'settled',checkpointPublished:true};
  }});

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.equal(summary.units,4);assert.equal(summary.failures,1);assert.equal(summary.errors.DB_COMMIT_UNKNOWN,1);
  assert.equal(calls.filter(runId=>runId===RUN_A).length,1);
  assert.equal(calls.filter(runId=>runId===RUN_B).length,3);
});

test('unknown provider settlement is not resent and later independent work continues',async()=>{
  const calls:string[]=[],work=[queued(RUN_A),queued(RUN_B)];
  const deps=baseDependencies(work,{async runNext(runId){
    calls.push(runId);
    return runId===RUN_A?{state:'settled',checkpointPublished:false}:{state:'published'};
  }});

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.deepEqual(calls,[RUN_A,RUN_B]);assert.equal(summary.units,2);
  assert.equal(summary.deferred,1);assert.equal(summary.published,1);assert.equal(summary.failures,0);
});

test('temporary identity-state outage is recorded but does not terminally finish the run',async()=>{
  const finished:Array<[string,string]>=[],calls:string[]=[];
  const deps=baseDependencies([queued(RUN_A),queued(RUN_B)],{
    async runNext(runId){calls.push(runId);if(runId===RUN_A)throw new KernelError('IDENTITY_STATE_UNAVAILABLE','synthetic temporary lookup outage');
      return {state:'published'};},
    async finish(runId,reason){finished.push([runId,reason]);return true;},
  });

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.deepEqual(calls,[RUN_A,RUN_B]);assert.deepEqual(finished,[]);
  assert.equal(summary.failures,1);assert.equal(summary.abandoned,0);assert.equal(summary.published,1);
});

test('permanent access denial requests the narrow Session-unavailable finish reason',async()=>{
  const finished:Array<[string,string]>=[];
  const deps=baseDependencies([queued(RUN_A)],{
    async runNext(){throw new KernelError('ACCESS_DENIED','synthetic permanent session denial',403);},
    async finish(runId,reason){finished.push([runId,reason]);return true;},
  });

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.deepEqual(finished,[[RUN_A,'LLM_SESSION_UNAVAILABLE']]);
  assert.equal(summary.abandoned,1);assert.equal(summary.failures,0);
});

test('absolute Job deadline below 150 seconds of headroom starts no unit',async()=>{
  const now=50_000;let calls=0;
  const deps=baseDependencies([queued(RUN_A)],{now:()=>now,deadlineAtMs:now+149_999,
    async runNext(){calls++;return {state:'published'};},
  });

  const summary=await runMeetingLlmHost(deps,new AbortController().signal);

  assert.equal(summary.scanned,1);assert.equal(summary.units,0);assert.equal(calls,0);
});
