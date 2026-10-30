import assert from 'node:assert/strict';
import test from 'node:test';

import {KernelError} from '../../../server/errors.js';
import {runMeetingAsrHost,type MeetingAsrHostDependencies,type MeetingAsrWork} from '../../../server/meetingAsrHost.js';
import {meetingAsrJobCheck} from '../../../server/meetingAsrJob.js';

const RUN_1='11111111-1111-4111-8111-111111111111';
const RUN_2='12121212-1212-4121-8121-121212121212';
const RUN_3='13131313-1313-4131-8131-131313131313';
const RUN_4='14141414-1414-4141-8141-141414141414';
const RUN_5='15151515-1515-4151-8151-151515151515';
const RUN_6='16161616-1616-4161-8161-161616161616';
const TOKEN='33333333-3333-4333-8333-333333333333';

type QueuedWork=Extract<MeetingAsrWork,{kind:'queued'}>;
function queued(runId:string,overrides:Partial<Omit<QueuedWork,'kind'|'runId'>>={}):QueuedWork{
  return {kind:'queued',runId,deadlineExpired:false,budgetMonthCurrent:true,...overrides};
}

function dependencies(overrides:Partial<MeetingAsrHostDependencies>={}):MeetingAsrHostDependencies{
  return {
    dispatchEnabled:true,
    scan:async()=>[],
    recover:async()=>({recovered:false,kind:null,retryScheduled:false}),
    abandon:async()=>false,
    runUnit:async()=>({state:'idle'}),
    ...overrides,
  };
}

test('Job check-only reports status without connecting runtime or calling provider',()=>{
  const result=meetingAsrJobCheck();
  assert.deepEqual(Object.keys(result).sort(),['event','llmDispatch','provider','providerDispatch','runtime','sessionContract','status']);
  assert.equal(result.event,'projed_meeting_asr_job_check');
  assert.equal(result.status,'CHECK_ONLY');
  assert.equal(result.runtime,'NOT_CONNECTED');
  assert.equal(result.provider,'NOT_RUN');
  assert.equal(result.llmDispatch,'DISABLED');
  assert.ok(result.providerDispatch==='DISABLED'||result.providerDispatch==='QUALIFICATION_BOUND');
  assert.ok(result.sessionContract==='UNPUBLISHED'||result.sessionContract==='PINNED');
});

test('disabled dispatch still recovers expired units and cleans pool, deadline and month work',async()=>{
  const work:MeetingAsrWork[]=[
    {kind:'recover_unit',runId:RUN_1,operationToken:TOKEN},
    {kind:'recover_pool',runId:RUN_2},
    queued(RUN_3,{deadlineExpired:true}),
    queued(RUN_4,{budgetMonthCurrent:false}),
    queued(RUN_5),
  ];
  const recoveries:Array<[string,string]>=[];
  const abandons:Array<[string,string]>=[];
  let unitCalls=0,scanLimit=0;

  const summary=await runMeetingAsrHost(dependencies({
    dispatchEnabled:false,
    async scan(maxItems){scanLimit=maxItems;return work;},
    async recover(runId,token){recoveries.push([runId,token]);return {recovered:true,kind:'not_sent',retryScheduled:true};},
    async abandon(runId,reason){abandons.push([runId,reason]);return true;},
    async runUnit(){unitCalls++;return {state:'published',attemptId:'must-not-run'};},
  }),new AbortController().signal);

  assert.equal(scanLimit,20);
  assert.deepEqual(recoveries,[[RUN_1,TOKEN]]);
  assert.deepEqual(abandons,[
    [RUN_2,'ASR_SOURCE_UNAVAILABLE'],
    [RUN_3,'ASR_DEADLINE_EXPIRED'],
    [RUN_4,'ASR_BUDGET_MONTH_CHANGED'],
  ]);
  assert.equal(unitCalls,0);
  assert.deepEqual(summary,{scanned:5,units:0,recovered:1,abandoned:3,deferred:1,failures:0,errors:{}});
});

test('permanent Session loss abandons, while temporary identity and DB errors do not',async()=>{
  const work=[queued(RUN_1),queued(RUN_2),queued(RUN_3)];
  const runCalls:string[]=[];
  const abandons:Array<[string,string]>=[];
  const summary=await runMeetingAsrHost(dependencies({
    async scan(){return work;},
    async abandon(runId,reason){abandons.push([runId,reason]);return true;},
    async runUnit(runId){
      runCalls.push(runId);
      if(runId===RUN_1)throw new KernelError('IDENTITY_INVALID','session was permanently lost',403);
      if(runId===RUN_2)throw new KernelError('IDENTITY_STATE_UNAVAILABLE','identity state is temporarily unavailable',503);
      throw new KernelError('DB_COMMIT_UNKNOWN','unit result commit is unknown',503);
    },
  }),new AbortController().signal);

  assert.deepEqual(runCalls,[RUN_1,RUN_2,RUN_3]);
  assert.deepEqual(abandons,[[RUN_1,'ASR_SESSION_UNAVAILABLE']]);
  assert.equal(summary.units,3);
  assert.equal(summary.abandoned,1);
  assert.equal(summary.failures,2);
  assert.deepEqual(summary.errors,{IDENTITY_STATE_UNAVAILABLE:1,DB_COMMIT_UNKNOWN:1});
});

test('an unknown unit outcome is not redelivered and the host continues to another run',async()=>{
  const work=[queued(RUN_1),queued(RUN_2)];
  const runCalls:string[]=[];
  const abandons:string[]=[];
  const summary=await runMeetingAsrHost(dependencies({
    async scan(){return work;},
    async abandon(runId){abandons.push(runId);return true;},
    async runUnit(runId){
      runCalls.push(runId);
      if(runId===RUN_1)throw new KernelError('DB_COMMIT_UNKNOWN','settlement acknowledgement was lost',503);
      return {state:'published',attemptId:`${runId}:attempt`};
    },
  }),new AbortController().signal);

  assert.deepEqual(runCalls,[RUN_1,RUN_2]);
  assert.deepEqual(abandons,[]);
  assert.equal(summary.units,2);
  assert.equal(summary.failures,1);
  assert.deepEqual(summary.errors,{DB_COMMIT_UNKNOWN:1});
});

test('host caps paid units at four per batch',async()=>{
  const work=[queued(RUN_1),queued(RUN_2),queued(RUN_3),queued(RUN_4),queued(RUN_5),queued(RUN_6)];
  const runCalls:string[]=[];
  const summary=await runMeetingAsrHost(dependencies({
    async scan(){return work;},
    async runUnit(runId){runCalls.push(runId);return {state:'published',attemptId:`${runId}:attempt`};},
  }),new AbortController().signal);

  assert.deepEqual(runCalls,[RUN_1,RUN_2,RUN_3,RUN_4]);
  assert.equal(summary.units,4);
  assert.equal(summary.deferred,2);
});

test('shutdown and deadline headroom defer remaining units without launching them',async()=>{
  const shutdownWork=[queued(RUN_1),queued(RUN_2),queued(RUN_3)];
  const controller=new AbortController();
  const shutdownCalls:string[]=[];
  const shutdown=await runMeetingAsrHost(dependencies({
    async scan(){return shutdownWork;},
    async runUnit(runId){shutdownCalls.push(runId);controller.abort();return {state:'published',attemptId:`${runId}:attempt`};},
  }),controller.signal);
  assert.deepEqual(shutdownCalls,[RUN_1]);
  assert.equal(shutdown.units,1);
  assert.equal(shutdown.deferred,2);

  let now=1_000;
  const deadlineCalls:string[]=[];
  const deadline=await runMeetingAsrHost(dependencies({
    now:()=>now,
    async scan(){return shutdownWork;},
    async runUnit(runId){deadlineCalls.push(runId);now=451_001;return {state:'published',attemptId:`${runId}:attempt`};},
  }),new AbortController().signal);
  assert.deepEqual(deadlineCalls,[RUN_1]);
  assert.equal(deadline.units,1);
  assert.equal(deadline.deferred,2);
});
