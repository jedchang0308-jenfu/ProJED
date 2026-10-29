import assert from 'node:assert/strict';
import test from 'node:test';
import type {QueryResult,QueryResultRow} from 'pg';

import type {ActorQueryPort} from '../../../server/actorTransaction.js';
import {KernelError} from '../../../server/errors.js';
import {MeetingAsrDatabaseRepository,type MeetingAsrTransactions} from '../../../server/meetingAsrRepository.js';
import type {ScopedQuery} from '../../../server/db.js';
import type {MeetingAsrClaim,MeetingAsrSettlement} from '../../../server/meetingAsrWorker.js';
import type {MeetingAsrDispatchUnit} from '../../../server/meetingAsrDispatchInput.js';

const RUN_ID='11111111-1111-4111-8111-111111111111';
const OTHER_RUN_ID='12121212-1212-4121-8121-121212121212';
const CAPTURE_ID='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const OTHER_TOKEN='34343434-3434-4434-8434-343434343434';
const SOURCE_ID='44444444-4444-4444-8444-444444444444';
const TENANT_ID='55555555-5555-4555-8555-555555555555';
const PROJECT_ID='66666666-6666-4666-8666-666666666666';
const RECORD_ID='77777777-7777-4777-8777-777777777777';
const SOURCE_START_MS=120_000;
const SHA='a'.repeat(64);

interface RecordedQuery {
  readonly scope:'actor'|'accounting';
  readonly transaction:number;
  readonly sql:string;
  readonly values:readonly unknown[];
}

type QueryHandler=(call:RecordedQuery)=>QueryResultRow|Promise<QueryResultRow>;
type ActorPlan=
  |{readonly kind:'normal'}
  |{readonly kind:'before'|'after';readonly error:unknown};

function errorCode(code:string){
  return (error:unknown)=>error instanceof KernelError&&error.code===code;
}

function expectString(values:readonly unknown[],index:number):string{
  const value=values[index];
  assert.equal(typeof value,'string');
  return value as string;
}

function makeClaim(overrides:Partial<Omit<MeetingAsrClaim,'source'>>&{source?:Partial<MeetingAsrClaim['source']>}={}):MeetingAsrClaim{
  const base:MeetingAsrClaim={
    runId:RUN_ID,captureId:CAPTURE_ID,sourceVersion:1,leaseToken:TOKEN,leaseExpiresAtMs:1_900_000_000_000,
    attemptId:`${RUN_ID}:asr:0:0:0`,chunkIndex:0,
    source:{id:SOURCE_ID,tenantId:TENANT_ID,projectId:PROJECT_ID,recordId:RECORD_ID,segmentIndex:0,
      startOffsetMs:SOURCE_START_MS,endOffsetMs:SOURCE_START_MS+50_000,mime:'audio/webm;codecs=opus',bytes:1234,
      sha256:SHA,generation:'1',objectPath:'meetings/test.webm'},
  };
  const {source,...fields}=overrides;
  return {...base,...fields,source:{...base.source,...source}};
}

function dispatch(overrides:Partial<MeetingAsrDispatchUnit>={}):MeetingAsrDispatchUnit{
  return {chunkIndex:0,chunkCount:1,startSample:0,endSample:800_000,decodedSha256:SHA,
    startOffsetMs:SOURCE_START_MS,endOffsetMs:SOURCE_START_MS+50_000,...overrides};
}

function recognizedSettlement():MeetingAsrSettlement{
  return {kind:'recognized',totalBilledTime:'1s',transcript:{chunkIndex:0,chunkCount:1,startSample:0,endSample:16_000,
    decodedSha256:SHA,sourceHash:'b'.repeat(64),startOffsetMs:SOURCE_START_MS,endOffsetMs:SOURCE_START_MS+1_000,
    rawText:'hello',wordOffsets:[{text:'hello',start_ms:SOURCE_START_MS,end_ms:SOURCE_START_MS+0.5,
      source_audio_segment_id:SOURCE_ID,source_word_index:0}]}};
}

function defaultResponse(call:RecordedQuery):QueryResultRow{
  if(call.sql.includes('claim_meeting_asr_unit_v1')){
    return {claim:null};
  }
  if(call.sql.includes('mark_meeting_asr_dispatch_v1'))return {marked:true};
  if(call.sql.includes('read_meeting_asr_dispatch_v1'))return {authorized:true};
  if(call.sql.includes('settle_meeting_asr_unit_v1')){
    const payload=JSON.parse(expectString(call.values,2)) as {kind:string};
    return {receipt:{kind:payload.kind,published:payload.kind==='recognized'}};
  }
  throw new Error(`Unexpected repository SQL: ${call.sql}`);
}

function harness(){
  const calls:RecordedQuery[]=[];
  const actorPlans:ActorPlan[]=[];
  let actorCalls=0;
  let accountingCalls=0;
  let actorHandler:QueryHandler=defaultResponse;
  let accountingHandler:QueryHandler=defaultResponse;

  const scopedQuery=(scope:'actor'|'accounting',transaction:number,handler:QueryHandler):ScopedQuery=>
    async <R extends QueryResultRow>(sql:string,values:readonly unknown[]=[]):Promise<QueryResult<R>>=>{
      const call:RecordedQuery={scope,transaction,sql,values:[...values]};
      calls.push(call);
      const row=await handler(call);
      return {rows:[row],rowCount:1} as unknown as QueryResult<R>;
    };

  const transactions:MeetingAsrTransactions={
    actor:async <T>(operation:(port:ActorQueryPort)=>Promise<T>):Promise<T>=>{
      const transaction=++actorCalls;
      const plan=actorPlans.shift()??{kind:'normal' as const};
      if(plan.kind==='before')throw plan.error;
      const port={query:scopedQuery('actor',transaction,(call)=>actorHandler(call))} as unknown as ActorQueryPort;
      const result=await operation(port);
      if(plan.kind==='after')throw plan.error;
      return result;
    },
    accounting:async <T>(operation:(query:ScopedQuery)=>Promise<T>):Promise<T>=>{
      const transaction=++accountingCalls;
      return operation(scopedQuery('accounting',transaction,(call)=>accountingHandler(call)));
    },
  };

  return {
    calls,actorPlans,transactions,
    get actorCalls(){return actorCalls;},
    get accountingCalls(){return accountingCalls;},
    set actorHandler(handler:QueryHandler){actorHandler=handler;},
    set accountingHandler(handler:QueryHandler){accountingHandler=handler;},
  };
}

function oneCall(calls:readonly RecordedQuery[],rpc:string):RecordedQuery{
  const matches=calls.filter(call=>call.sql.includes(rpc));
  assert.equal(matches.length,1,`expected one ${rpc} call`);
  const call=matches[0];
  assert.ok(call);
  return call;
}

test('claim uses one generated token for the exact repository run',async()=>{
  const h=harness();
  h.actorHandler=call=>{
    assert.ok(call.sql.includes('claim_meeting_asr_unit_v1'));
    return {claim:makeClaim({leaseToken:expectString(call.values,1)})};
  };
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);

  const claim=await repository.claimNext();

  assert.ok(claim);
  assert.equal(claim.runId,RUN_ID);
  assert.equal(claim.leaseToken,expectString(oneCall(h.calls,'claim_meeting_asr_unit_v1').values,1));
  assert.equal(expectString(oneCall(h.calls,'claim_meeting_asr_unit_v1').values,0),RUN_ID);
  assert.equal(h.actorCalls,1);
  assert.equal(h.accountingCalls,0);
  assert.equal(h.calls.length,1);
});

test('claim COMMIT unknown is surfaced without acquiring a second token',async()=>{
  const h=harness();
  h.actorPlans.push({kind:'after',error:new KernelError('DB_COMMIT_UNKNOWN','claim acknowledgement lost',503)});
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);

  await assert.rejects(repository.claimNext(),errorCode('DB_COMMIT_UNKNOWN'));

  const call=oneCall(h.calls,'claim_meeting_asr_unit_v1');
  assert.equal(expectString(call.values,0),RUN_ID);
  assert.match(expectString(call.values,1),/^[a-f0-9-]{36}$/u);
  assert.equal(h.actorCalls,1);
  assert.equal(h.accountingCalls,0);
  assert.equal(h.calls.length,1);
});

test('mark false settles a known-unsent attempt in the same actor transaction',async()=>{
  const h=harness();
  h.actorHandler=call=>call.sql.includes('mark_meeting_asr_dispatch_v1')?{marked:false}:defaultResponse(call);
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);

  const marked=await repository.markDispatch(makeClaim(),dispatch());

  assert.equal(marked,false);
  assert.equal(h.actorCalls,1);
  assert.equal(h.accountingCalls,0);
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[0]?.transaction,h.calls[1]?.transaction);
  assert.ok(h.calls[0]?.sql.includes('mark_meeting_asr_dispatch_v1'));
  const close=oneCall(h.calls,'settle_meeting_asr_unit_v1');
  assert.equal(close.scope,'actor');
  assert.equal(expectString(close.values,0),RUN_ID);
  assert.equal(expectString(close.values,1),TOKEN);
  assert.deepEqual(JSON.parse(expectString(close.values,2)),{
    kind:'not_sent',code:'ASR_DISPATCH_NOT_AUTHORIZED',
  });
});

test('dispatch COMMIT unknown is read back once with the exact persisted payload',async()=>{
  const h=harness();
  h.actorPlans.push({kind:'after',error:new KernelError('DB_COMMIT_UNKNOWN','dispatch acknowledgement lost',503)});
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);
  const claim=makeClaim();
  const input=dispatch();

  await assert.rejects(repository.markDispatch(claim,input),errorCode('DB_COMMIT_UNKNOWN'));
  assert.equal(await repository.readDispatch(claim),'authorized');

  const mark=oneCall(h.calls,'mark_meeting_asr_dispatch_v1');
  const read=oneCall(h.calls,'read_meeting_asr_dispatch_v1');
  assert.deepEqual(JSON.parse(expectString(mark.values,2)),input);
  assert.deepEqual(JSON.parse(expectString(read.values,2)),JSON.parse(expectString(mark.values,2)));
  assert.equal(expectString(read.values,0),RUN_ID);
  assert.equal(expectString(read.values,1),TOKEN);
  assert.equal(h.calls.filter(call=>call.sql.includes('mark_meeting_asr_dispatch_v1')).length,1);
  assert.deepEqual(h.calls.map(call=>call.transaction),[1,2]);
  assert.equal(h.accountingCalls,0);
});

test('read false closes the exact unsent attempt in that same actor transaction',async()=>{
  const h=harness();
  h.actorHandler=call=>call.sql.includes('read_meeting_asr_dispatch_v1')?{authorized:false}:defaultResponse(call);
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);
  const claim=makeClaim();
  await repository.markDispatch(claim,dispatch());
  h.calls.length=0;

  assert.equal(await repository.readDispatch(claim),'not_authorized');

  assert.equal(h.actorCalls,2);
  assert.equal(h.accountingCalls,0);
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[0]?.transaction,h.calls[1]?.transaction);
  assert.equal(h.calls[0]?.transaction,2);
  assert.ok(h.calls[0]?.sql.includes('read_meeting_asr_dispatch_v1'));
  const close=oneCall(h.calls,'settle_meeting_asr_unit_v1');
  assert.deepEqual(JSON.parse(expectString(close.values,2)),{
    kind:'not_sent',code:'ASR_DISPATCH_NOT_AUTHORIZED',
  });
});

test('actor precondition loss uses accounting only and never reports a historical publication',async()=>{
  const h=harness();
  h.actorPlans.push({kind:'before',error:new KernelError('ACCESS_DENIED','actor no longer authorized',403)});
  h.accountingHandler=call=>{
    assert.ok(call.sql.includes('settle_meeting_asr_unit_v1'));
    return {receipt:{kind:'recognized',published:true}};
  };
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);

  const result=await repository.settle(makeClaim(),recognizedSettlement());

  assert.equal(result,'accounted_only');
  assert.equal(h.actorCalls,1);
  assert.equal(h.accountingCalls,1);
  assert.equal(h.calls.length,1);
  const call=oneCall(h.calls,'settle_meeting_asr_unit_v1');
  assert.equal(call.scope,'accounting');
  assert.equal(expectString(call.values,0),RUN_ID);
  assert.equal(expectString(call.values,1),TOKEN);
  const payload=JSON.parse(expectString(call.values,2)) as {chargeMicros:string;chargeSource:string;transcript:{wordOffsets:unknown[]}};
  assert.equal(payload.chargeMicros,'16000');
  assert.equal(typeof payload.chargeMicros,'string');
  assert.equal(payload.chargeSource,'provider_metadata');
  assert.equal(payload.transcript.wordOffsets.length,1);
});

test('SQL, callback validation, and COMMIT failures after actor entry never fall back to accounting',async()=>{
  const scenarios:[string,QueryHandler,ActorPlan][]=[
    ['actor-shaped SQL error',()=>{throw new KernelError('ACTOR_CHANGED','query failed after entry',409);},{kind:'normal'}],
    ['callback result validation error',()=>({receipt:{kind:'wrong',published:'yes'}}),{kind:'normal'}],
    ['COMMIT unknown',defaultResponse,{kind:'after',error:new KernelError('DB_COMMIT_UNKNOWN','commit uncertain',503)}],
    ['actor-shaped callback error',defaultResponse,{kind:'after',error:new KernelError('ACCESS_DENIED','callback failed',403)}],
  ];
  for(const [label,handler,plan] of scenarios){
    const h=harness();
    h.actorHandler=handler;
    h.actorPlans.push(plan);
    const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);
    const expectedCode=plan.kind==='after'&&plan.error instanceof KernelError?plan.error.code
      :label==='callback result validation error'?'DB_BOUNDARY_INVALID':'ACTOR_CHANGED';

    await assert.rejects(repository.settle(makeClaim(),recognizedSettlement()),errorCode(expectedCode),label);

    assert.equal(h.actorCalls,1,label);
    assert.equal(h.accountingCalls,0,label);
  }
});

test('cross-run and cross-token work is rejected before opening another actor transaction',async()=>{
  const h=harness();
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);
  const crossRun=makeClaim({runId:OTHER_RUN_ID});

  await assert.rejects(repository.markDispatch(crossRun,dispatch()),errorCode('DB_BOUNDARY_INVALID'));
  await assert.rejects(repository.settle(crossRun,recognizedSettlement()),errorCode('DB_BOUNDARY_INVALID'));
  await repository.markDispatch(makeClaim(),dispatch());
  const callCount=h.calls.length;
  const actorCount=h.actorCalls;
  await assert.rejects(repository.readDispatch(makeClaim({leaseToken:OTHER_TOKEN})),errorCode('DB_BOUNDARY_INVALID'));

  assert.equal(h.calls.length,callCount);
  assert.equal(h.actorCalls,actorCount);
  assert.equal(expectString(oneCall(h.calls,'mark_meeting_asr_dispatch_v1').values,0),RUN_ID);
  assert.equal(expectString(oneCall(h.calls,'mark_meeting_asr_dispatch_v1').values,1),TOKEN);
});

test('markDispatch rejects sample coverage shorter than source duration before transaction entry',async()=>{
  const h=harness();
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);
  const longSource=makeClaim({source:{endOffsetMs:SOURCE_START_MS+300_000}});

  await assert.rejects(repository.markDispatch(longSource,dispatch()),errorCode('DOMAIN_DATA_INVALID'));

  assert.equal(h.actorCalls,0);
  assert.equal(h.accountingCalls,0);
  assert.equal(h.calls.length,0);
});

test('recognized settlement sends normalized anchors and string charge to the exact RPC binding',async()=>{
  const h=harness();
  const repository=new MeetingAsrDatabaseRepository(RUN_ID,h.transactions);

  assert.equal(await repository.settle(makeClaim(),recognizedSettlement()),'published');

  const call=oneCall(h.calls,'settle_meeting_asr_unit_v1');
  assert.equal(h.actorCalls,1);
  assert.equal(h.accountingCalls,0);
  assert.equal(call.scope,'actor');
  assert.equal(expectString(call.values,0),RUN_ID);
  assert.equal(expectString(call.values,1),TOKEN);
  const payload=JSON.parse(expectString(call.values,2)) as {kind:string;chargeMicros:string;chargeSource:string;
    transcript:{wordOffsets:{source_audio_segment_id:string;source_word_index:number}[]}};
  assert.equal(payload.kind,'recognized');
  assert.equal(payload.chargeMicros,'16000');
  assert.equal(typeof payload.chargeMicros,'string');
  assert.equal(payload.chargeSource,'provider_metadata');
  assert.deepEqual(payload.transcript.wordOffsets,[{text:'hello',start_ms:SOURCE_START_MS,end_ms:SOURCE_START_MS+0.5,
    source_audio_segment_id:SOURCE_ID,source_word_index:0}]);
});
