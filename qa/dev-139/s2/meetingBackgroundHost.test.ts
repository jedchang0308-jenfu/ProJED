import assert from 'node:assert/strict';
import test from 'node:test';
import {KernelError} from '../../../server/errors.js';
import {runMeetingBackgroundHost,type MeetingBackgroundDependencies} from '../../../server/meetingBackgroundHost.js';

const RUN='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const signal=()=>new AbortController().signal;
const queued=(runId=RUN)=>({kind:'queued',runId,operationToken:null,deadlineExpired:false} as const);
function base():MeetingBackgroundDependencies{
  return {deadlineAtMs:600_000,now:()=>0,
    asr:{dispatchEnabled:true,scan:async()=>[],recover:async()=>({recovered:false,kind:null,retryScheduled:false}),
      abandon:async()=>false,runUnit:async()=>({state:'idle'})},
    discussion:{originalSessionResolver:async()=>{throw new Error('repository owns original Session resolution');},
      scan:async()=>[],finishScanned:async()=>false,runUnit:async()=>({state:'idle'})},
    llm:{privateWorkEnabled:true,scan:async()=>[],recover:async()=>null,finish:async()=>false,runNext:async()=>({state:'idle'})}};
}

test('one Job resumes multiple sources and more than four LLM units through publication',async()=>{
  const deps=base(),events:string[]=[];let sources=0,discussions=0,llm=0;
  const result=await runMeetingBackgroundHost({...deps,
    asr:{...deps.asr,scan:async()=>sources<2?[{kind:'queued',runId:RUN,deadlineExpired:false,budgetMonthCurrent:true}]:[],
      runUnit:async()=>{events.push(`asr:${++sources}`);return {state:'published',attemptId:`source-${sources}`};}},
    discussion:{...deps.discussion,scan:async()=>sources===2&&discussions<2?
      [{runId:RUN,operationToken:null,deadlineExpired:false}]:[],
      runUnit:async()=>{events.push(`discussion:${++discussions}`);return {state:'source_complete',assemblyComplete:discussions===2};}},
    llm:{...deps.llm,scan:async()=>discussions===2&&llm<7?[queued()]:[],
      runNext:async()=>{events.push(`llm:${++llm}`);return llm===7?{state:'published'}:{state:'settled',checkpointPublished:true};}},
  },signal());
  assert.equal(sources,2);assert.equal(discussions,2);assert.equal(llm,7);
  assert.ok(events.indexOf('discussion:1')>events.indexOf('asr:2'));
  assert.ok(events.indexOf('llm:1')>events.indexOf('discussion:2'));
  assert.equal(result.asr.units,2);assert.equal(result.discussion.completed,1);
  assert.equal(result.llm.units,7);assert.equal(result.llm.published,1);assert.equal(result.failures,0);
  assert.equal(result.rounds,5);
});

test('no committed progress stops immediately without provider polling or another Job',async()=>{
  const deps=base();let calls=0;
  const result=await runMeetingBackgroundHost({...deps,llm:{...deps.llm,scan:async()=>[queued()],
    runNext:async()=>{calls++;return {state:'deferred'};}}},signal());
  assert.equal(calls,1);assert.equal(result.rounds,1);assert.equal(result.deferredRuns,1);
});

test('unknown commit is never retried in later rounds while independent work completes',async()=>{
  const deps=base(),calls:string[]=[];let otherUnits=0;
  const result=await runMeetingBackgroundHost({...deps,llm:{...deps.llm,
    scan:async()=>[queued(),...(otherUnits<6?[queued(OTHER)]:[])],
    runNext:async runId=>{calls.push(runId);
      if(runId===RUN)throw new KernelError('DB_COMMIT_UNKNOWN','unknown private COMMIT');
      return ++otherUnits===6?{state:'published'}:{state:'settled',checkpointPublished:true};},
  }},signal());
  assert.equal(calls.filter(id=>id===RUN).length,1);assert.equal(otherUnits,6);
  assert.equal(result.llm.published,1);assert.equal(result.failures,1);
  assert.equal(result.llm.errors.DB_COMMIT_UNKNOWN,1);assert.equal(result.deferredRuns,1);
});

test('metadata recovery does not authorize same-process private replay',async()=>{
  const deps=base();let recovered=false,privateCalls=0,otherUnits=0;
  const result=await runMeetingBackgroundHost({...deps,llm:{...deps.llm,
    scan:async()=>[recovered?queued():{kind:'recover',runId:RUN,operationToken:TOKEN},...(otherUnits<6?[queued(OTHER)]:[])],
    recover:async()=>{recovered=true;return {kind:'usage_unknown',published:false,chargeMicros:null,
      requestHash:'a'.repeat(64),costBasis:'budget_estimate_not_invoice'};},
    runNext:async runId=>{if(runId===RUN)privateCalls++;
      return ++otherUnits===6?{state:'published'}:{state:'settled',checkpointPublished:true};},
  }},signal());
  assert.equal(privateCalls,0);assert.equal(result.llm.recovered,1);assert.equal(result.llm.published,1);
});

test('all phases share the original 600-second deadline and require dispatch headroom',async()=>{
  const deps=base();let now=0,paid=0;
  const result=await runMeetingBackgroundHost({...deps,now:()=>now,
    asr:{...deps.asr,scan:async()=>[{kind:'queued',runId:RUN,deadlineExpired:false,budgetMonthCurrent:true}],
      runUnit:async()=>{now=451_000;return {state:'published',attemptId:'last-unit'};}},
    llm:{...deps.llm,scan:async()=>[queued(OTHER)],runNext:async()=>{paid++;return {state:'published'};}},
  },signal());
  assert.equal(paid,0);assert.equal(result.rounds,1);assert.equal(result.asr.units,1);assert.equal(result.llm.deferred,1);
});

test('an independent phase continues after scan failure and pre-abort opens nothing',async()=>{
  const deps=base();let local=0,scans=0;
  const options={...deps,asr:{...deps.asr,scan:async()=>{scans++;throw new KernelError('DB_UNAVAILABLE','scan unavailable');}},
    llm:{...deps.llm,scan:async()=>local===0?[queued()]:[],runNext:async()=>{local++;return {state:'published'} as const;}}};
  const result=await runMeetingBackgroundHost(options,signal());
  assert.equal(local,1);assert.equal(scans,1);assert.equal(result.failures,1);assert.equal(result.llm.published,1);
  const aborted=new AbortController();aborted.abort();
  const stopped=await runMeetingBackgroundHost(options,aborted.signal);
  assert.equal(stopped.rounds,0);assert.equal(scans,1);
});
