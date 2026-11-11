import assert from 'node:assert/strict';
import test from 'node:test';
import type {QueryResult,QueryResultRow} from 'pg';

import type {ActorQueryPort} from '../../../server/actorTransaction.js';
import {KernelError} from '../../../server/errors.js';
import {MeetingLlmDatabaseRepository,prepareMeetingLlmUnit,
  type MeetingLlmClaim,type MeetingLlmPreparedUnit,type MeetingLlmTransactions} from '../../../server/meetingLlmRepository.js';
import {MEETING_LLM_CONFIG_VERSION} from '../../../server/meetingLlmPricing.js';
import type {ScopedQuery} from '../../../server/db.js';
import type {MeetingTaskCandidateScope} from '../../../server/meetingTaskCandidates.js';

const RUN_ID='11111111-1111-4111-8111-111111111111';
const CAPTURE_ID='22222222-2222-4222-8222-222222222222';
const REVISION_ID='33333333-3333-4333-8333-333333333333';
const TENANT_ID='44444444-4444-4444-8444-444444444444';
const PROJECT_ID='55555555-5555-4555-8555-555555555555';
const SHA='a'.repeat(64);
const LEASE_EXPIRES_AT_MS=1_900_000_000_000;
const SCOPE:MeetingTaskCandidateScope={tenantId:TENANT_ID,projectId:PROJECT_ID};

interface Call {readonly scope:'actor'|'accounting';readonly transaction:number;readonly sql:string;readonly values:readonly unknown[]}
type Handler=(call:Call)=>QueryResultRow|Promise<QueryResultRow>;

function unit():MeetingLlmPreparedUnit{
  return prepareMeetingLlmUnit('retrieve','query:1',{
    configVersion:MEETING_LLM_CONFIG_VERSION,sourceVersion:1,transcriptRevisionId:REVISION_ID,
    body:{queryText:'會議任務檢索問題'},
  });
}

function claimReceipt(prepared:MeetingLlmPreparedUnit,token:string,overrides:Record<string,unknown>={}){
  return {status:'claimed',runId:RUN_ID,captureId:CAPTURE_ID,sourceVersion:1,transcriptRevisionId:REVISION_ID,
    leaseToken:token,leaseExpiresAtMs:LEASE_EXPIRES_AT_MS,attemptId:'attempt-1',stage:prepared.stage,
    unitKey:prepared.unitKey,inputHash:prepared.inputHash,inputText:prepared.inputText,...overrides};
}

function validReceipt(overrides:Record<string,unknown>={}){
  return {kind:'completed',published:true,chargeMicros:0,requestHash:SHA,
    costBasis:'budget_estimate_not_invoice',...overrides};
}

function harness(){
  const calls:Call[]=[];
  let actorCount=0,actorCallbacks=0,accountingCount=0;
  let handler:Handler=call=>{
    if(call.sql.includes('claim_meeting_llm_unit_v1')){
      const prepared=JSON.parse(String(call.values[2])) as MeetingLlmPreparedUnit;
      return {claim:claimReceipt(prepared,String(call.values[1]))};
    }
    if(call.sql.includes('mark_meeting_llm_dispatch_v1'))return {marked:true};
    if(call.sql.includes('settle_meeting_llm_unit_v1'))return {receipt:validReceipt()};
    if(call.sql.includes('recover_meeting_llm_unit_v1'))return {receipt:validReceipt()};
    throw new Error('Unexpected meeting LLM query');
  };
  let queryFailure:unknown=null,actorBeforeFailure:unknown=null,actorAfterFailure:unknown=null;
  const scoped=(scope:'actor'|'accounting',transaction:number):ScopedQuery=>async<R extends QueryResultRow = QueryResultRow>(
    sql:string,values:readonly unknown[]=[]):Promise<QueryResult<R>>=>{
    const call:Call={scope,transaction,sql,values:[...values]};calls.push(call);
    if(queryFailure!==null)throw queryFailure;
    const row=await handler(call);
    return {rows:[row],rowCount:1} as unknown as QueryResult<R>;
  };
  const transactions:MeetingLlmTransactions={
    actor:async operation=>{
      const transaction=++actorCount;
      if(actorBeforeFailure!==null)throw actorBeforeFailure;
      actorCallbacks++;
      const port={query:scoped('actor',transaction),async authorizeMeetingCaptureMutation(){}} as unknown as ActorQueryPort;
      const result=await operation(port,SCOPE);
      if(actorAfterFailure!==null)throw actorAfterFailure;
      return result;
    },
    accounting:async operation=>operation(scoped('accounting',++accountingCount)),
  };
  const repository=new MeetingLlmDatabaseRepository(RUN_ID,transactions);
  return {calls,repository,
    get actorCount(){return actorCount;},get actorCallbacks(){return actorCallbacks;},
    get accountingCount(){return accountingCount;},
    set handler(value:Handler){handler=value;},
    set queryFailure(value:unknown){queryFailure=value;},
    set actorBeforeFailure(value:unknown){actorBeforeFailure=value;},
    set actorAfterFailure(value:unknown){actorAfterFailure=value;},
  };
}

function onlyCall(calls:readonly Call[],name:string):Call{
  const matches=calls.filter(call=>call.sql.includes(name));
  assert.equal(matches.length,1);
  const call=matches[0];assert.ok(call);return call;
}

function stringValue(values:readonly unknown[],index:number):string{
  const value=values[index];assert.equal(typeof value,'string');return value as string;
}

function claimFrom(h:ReturnType<typeof harness>,value=unit()):Promise<MeetingLlmClaim>{
  return h.repository.claim(value).then(result=>{
    if(!result||result==='awaiting_budget')throw new Error('Expected a claimed LLM unit');
    return result;
  });
}

test('claim binds the RPC token, input hash, and exact prepared payload; mismatched echo is rejected',async()=>{
  const h=harness(),prepared=unit();
  const claim=await claimFrom(h,prepared);
  const rpc=onlyCall(h.calls,'claim_meeting_llm_unit_v1');
  const token=stringValue(rpc.values,1);
  assert.match(token,/^[0-9a-f-]{36}$/u);
  assert.deepEqual(rpc.values,[RUN_ID,token,JSON.stringify(prepared)]);
  assert.equal(claim.leaseToken,token);
  assert.equal(claim.inputHash,prepared.inputHash);
  assert.equal(claim.inputText,prepared.inputText);

  const mismatch=harness();
  mismatch.handler=call=>{
    const echoed=JSON.parse(stringValue(call.values,2)) as MeetingLlmPreparedUnit;
    return {claim:claimReceipt(echoed,stringValue(call.values,1),{inputHash:'f'.repeat(64)})};
  };
  await assert.rejects(mismatch.repository.claim(prepared),error=>
    error instanceof KernelError&&error.code==='DB_BOUNDARY_INVALID');
  assert.equal(mismatch.calls.filter(call=>call.sql.includes('claim_meeting_llm_unit_v1')).length,1);
  assert.equal(mismatch.accountingCount,0);
});

test('dispatch passes the input binding and read-only flag through the actor RPC',async()=>{
  const h=harness(),claim=await claimFrom(h);
  assert.equal(await h.repository.markDispatch(claim,true),true);
  const dispatch=onlyCall(h.calls,'mark_meeting_llm_dispatch_v1');
  assert.deepEqual(dispatch.values,[RUN_ID,claim.leaseToken,claim.inputHash,true]);
  assert.equal(dispatch.scope,'actor');
  assert.equal(h.accountingCount,0);
});

test('pre-callback actor loss settles accounting-only and strips private result text',async()=>{
  const h=harness(),claim=await claimFrom(h);
  h.actorBeforeFailure=new KernelError('ACCESS_DENIED','actor authorization unavailable',403);
  let saved:unknown;
  h.handler=call=>{
    if(call.sql.includes('settle_meeting_llm_unit_v1')){
      saved=JSON.parse(stringValue(call.values,2));
      return {receipt:validReceipt({kind:'unusable',published:false})};
    }
    throw new Error('Unexpected query');
  };
  const secretResult=JSON.stringify({private:'transcript-derived result'});
  const result=await h.repository.settle(claim,{kind:'completed',usage:{promptTokens:1,candidateTokens:1},resultText:secretResult});
  assert.equal(result.kind,'unusable');
  assert.deepEqual(saved,{kind:'unusable',usage:{promptTokens:1,candidateTokens:1},code:'LLM_SESSION_UNAVAILABLE'});
  assert.equal(JSON.stringify(saved).includes(secretResult),false);
  const savedCall=onlyCall(h.calls,'settle_meeting_llm_unit_v1');
  assert.equal(savedCall.scope,'accounting');
  assert.equal(h.actorCount,2);
  assert.equal(h.actorCallbacks,1);
  assert.equal(h.accountingCount,1);
});

test('SQL, commit-unknown, and in-callback access errors never fallback or resend',async t=>{
  const cases=[
    {name:'SQL error',mode:'query' as const,error:new Error('SQL failed')},
    {name:'commit unknown',mode:'commit' as const,error:new KernelError('DB_COMMIT_UNKNOWN','commit acknowledgement lost',503)},
    {name:'access denied in callback',mode:'query' as const,error:new KernelError('ACCESS_DENIED','SQL denied',403)},
  ];
  for(const item of cases){
    await t.test(item.name,async()=>{
      const h=harness(),claim=await claimFrom(h);
      const payload={kind:'not_sent' as const,code:'LLM_ABORTED_BEFORE_SEND'};
      if(item.mode==='query')h.queryFailure=item.error;
      else h.actorAfterFailure=item.error;
      await assert.rejects(h.repository.settle(claim,payload),error=>error===item.error);
      assert.equal(h.actorCallbacks,2);
      assert.equal(h.accountingCount,0);
      assert.equal(h.calls.filter(call=>call.sql.includes('settle_meeting_llm_unit_v1')).length,1);
    });
  }
});

test('unknown claim commit is surfaced without generating a replacement token or second claim',async()=>{
  const h=harness(),lost=new KernelError('DB_COMMIT_UNKNOWN','claim commit unknown',503);
  h.actorAfterFailure=lost;
  await assert.rejects(h.repository.claim(unit()),error=>error===lost);
  const claim=onlyCall(h.calls,'claim_meeting_llm_unit_v1');
  assert.match(stringValue(claim.values,1),/^[0-9a-f-]{36}$/u);
  assert.equal(h.actorCount,1);
  assert.equal(h.accountingCount,0);
});

test('unsafe RPC settlement receipt is rejected without accounting fallback',async()=>{
  const h=harness(),claim=await claimFrom(h);
  h.handler=call=>{
    if(call.sql.includes('settle_meeting_llm_unit_v1'))return {receipt:validReceipt({chargeMicros:111_000_001})};
    throw new Error('Unexpected query');
  };
  await assert.rejects(h.repository.settle(claim,{kind:'not_sent',code:'LLM_ABORTED_BEFORE_SEND'}),error=>
    error instanceof KernelError&&error.code==='DB_BOUNDARY_INVALID');
  assert.equal(h.actorCallbacks,2);
  assert.equal(h.accountingCount,0);
  assert.equal(h.calls.filter(call=>call.sql.includes('settle_meeting_llm_unit_v1')).length,1);
});

test('read-only settlement lookup passes metadata only and actor-loss fallback remains read-only',async()=>{
  const h=harness(),claim=await claimFrom(h);
  const found=await h.repository.readSettlement(claim);
  assert.equal(found?.kind,'completed');
  const read=onlyCall(h.calls,'recover_meeting_llm_unit_v1');
  assert.equal(read.scope,'actor');
  assert.deepEqual(read.values,[RUN_ID,claim.leaseToken,true]);

  const recovered=await h.repository.recover(claim.leaseToken);
  assert.equal(recovered?.kind,'completed');
  const recoveryCalls=h.calls.filter(call=>call.sql.includes('recover_meeting_llm_unit_v1'));
  assert.deepEqual(recoveryCalls.map(call=>call.values),[
    [RUN_ID,claim.leaseToken,true],[RUN_ID,claim.leaseToken,false],
  ]);

  h.actorBeforeFailure=new KernelError('ACCESS_DENIED','actor authorization unavailable',403);
  const fallback=await h.repository.readSettlement(claim);
  assert.equal(fallback?.kind,'completed');
  const callsAfterFallback=h.calls.filter(call=>call.sql.includes('recover_meeting_llm_unit_v1'));
  const fallbackCall=callsAfterFallback.at(-1);
  assert.ok(fallbackCall);
  assert.equal(fallbackCall.scope,'accounting');
  assert.deepEqual(fallbackCall.values,[RUN_ID,claim.leaseToken,true]);
  assert.equal(fallbackCall.values.length,3);
  assert.equal(h.accountingCount,1);
});
