import assert from 'node:assert/strict';
import test from 'node:test';
import type {QueryResult,QueryResultRow} from 'pg';

import type {ActorQueryPort} from '../../../server/actorTransaction.js';
import {KernelError} from '../../../server/errors.js';
import {createPostgresMeetingDiscussionControl,MeetingDiscussionDatabaseRepository,
  parseMeetingDiscussionClaim,parseMeetingDiscussionProgress,parseMeetingDiscussionReadProgress,
  parseMeetingDiscussionScanWork,parseMeetingDiscussionSourceInput,
  type MeetingDiscussionTransactions} from '../../../server/meetingDiscussionRepository.js';
import type {ScopedQuery} from '../../../server/db.js';
import type {RuntimeConfig} from '../../../server/config.js';
import type {RuntimeDatabase} from '../../../server/db.js';
import type {MeetingDiscussionBatch,MeetingDiscussionClaim,MeetingDiscussionProgress} from '../../../server/meetingDiscussionWorker.js';

const RUN_ID='11111111-1111-4111-8111-111111111111';
const CAPTURE_ID='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const SOURCE_ID='44444444-4444-4444-8444-444444444444';
const REVISION_ID='55555555-5555-4555-8555-555555555555';
const RECORD_ID='66666666-6666-4666-8666-666666666666';
const SHA='a'.repeat(64);
const EXPIRY_MS=1_900_000_000_000;

interface Call {readonly scope:'actor'|'maintenance';readonly transaction:number;readonly sql:string;readonly values:readonly unknown[]}
type Handler=(call:Call)=>QueryResultRow|Promise<QueryResultRow>;
type Plan={readonly when:'before'|'after';readonly error:unknown};

function errorCode(code:string){return (error:unknown)=>error instanceof KernelError&&error.code===code;}
function stringValue(values:readonly unknown[],index:number):string{
  const value=values[index];assert.equal(typeof value,'string');return value as string;
}

function claimReceipt(token=TOKEN):Record<string,unknown>{
  return {sourceIndex:0,sourceFirstSegmentIndex:0,nextSegmentIndex:0,nextWordIndex:0,deduplicatedPrefixWords:null,
    done:false,runId:RUN_ID,captureId:CAPTURE_ID,transcriptRevisionId:REVISION_ID,sourceVersion:1,
    leaseToken:token,leaseExpiresAtMs:EXPIRY_MS};
}

function progressReceipt(overrides:Partial<MeetingDiscussionProgress>={}):MeetingDiscussionProgress{
  return {sourceIndex:0,sourceFirstSegmentIndex:0,nextSegmentIndex:1,nextWordIndex:2,
    deduplicatedPrefixWords:0,done:false,...overrides};
}

function sourceEnvelope():Record<string,unknown>{
  return {input:{source:{id:SOURCE_ID,captureId:CAPTURE_ID,sourceVersion:1,segmentIndex:0,startOffsetMs:100_000,
    endOffsetMs:150_000,overlapMs:0,gapBeforeMs:0,sha256:SHA,generation:'7'},checkpoints:[],firstUnitIndex:0,
    firstSegmentIndex:0},totalSourceWords:0,lastSegmentHash:null};
}

function batch():MeetingDiscussionBatch{
  return {sourceId:SOURCE_ID,sourceIndex:0,sourceFirstSegmentIndex:0,expectedNextSegmentIndex:0,
    deduplicatedPrefixWords:0,sourceDone:true,segments:[]};
}

function harness(){
  const calls:Call[]=[],plans:Plan[]=[];
  let actorCount=0,maintenanceCount=0,authorizations=0;
  let handler:Handler=call=>{
    if(call.sql.includes('claim_meeting_discussion_source_v1'))return {claim:claimReceipt(stringValue(call.values,1))};
    if(call.sql.includes('read_meeting_discussion_source_v1'))return {source:sourceEnvelope()};
    if(call.sql.includes('append_meeting_discussion_batch_v1'))return {progress:progressReceipt()};
    if(call.sql.includes('read_meeting_discussion_batch_v1'))return {progress:'not_committed'};
    if(call.sql.includes('finish_meeting_discussion_work_v1'))return {changed:true};
    throw new Error('Unexpected discussion query');
  };
  const scoped=(scope:'actor'|'maintenance',transaction:number):ScopedQuery=>async<R extends QueryResultRow = QueryResultRow>(
    sql:string,values:readonly unknown[]=[]):Promise<QueryResult<R>>=>{
    const call:Call={scope,transaction,sql,values:[...values]};calls.push(call);
    const row=await handler(call);
    return {rows:[row],rowCount:1} as unknown as QueryResult<R>;
  };
  const transactions:MeetingDiscussionTransactions={
    actor:async operation=>{
      const transaction=++actorCount,plan=plans.shift();
      if(plan?.when==='before')throw plan.error;
      const port={query:scoped('actor',transaction),async authorizeMeetingCaptureMutation(recordId:string,captureId:string){
        authorizations++;assert.equal(recordId,RECORD_ID);assert.equal(captureId,CAPTURE_ID);
      }} as unknown as ActorQueryPort;
      const result=await operation(port);
      if(plan?.when==='after')throw plan.error;
      return result;
    },
    maintenance:async operation=>operation(scoped('maintenance',++maintenanceCount)),
  };
  const repository=new MeetingDiscussionDatabaseRepository(RUN_ID,transactions);
  return {calls,plans,repository,transactions,
    get actorCount(){return actorCount;},get maintenanceCount(){return maintenanceCount;},
    get authorizations(){return authorizations;},set handler(value:Handler){handler=value;}};
}

function claimForTest(overrides:Partial<MeetingDiscussionClaim>={}):MeetingDiscussionClaim{
  return {...parseMeetingDiscussionClaim(claimReceipt(),RUN_ID,TOKEN),...overrides};
}

function actorRpc(calls:readonly Call[],name:string):Call{
  const matches=calls.filter(call=>call.sql.includes(name));assert.equal(matches.length,1);
  const call=matches[0];assert.ok(call);return call;
}

function controlHarness(handler:(sql:string,values:readonly unknown[])=>QueryResultRow){
  const calls:Array<{sql:string;values:readonly unknown[]}>=[];let releases=0;
  const client={async query(sql:string,values:readonly unknown[]=[]){
    calls.push({sql,values:[...values]});return {rows:[handler(sql,values)],rowCount:1};
  }};
  const database={async checkout(){return {client,release(){releases++;}};}} as unknown as RuntimeDatabase;
  const config={profile:{runtime:{timeouts:{transactionMillis:5000,statementMillis:2000,lockMillis:1000,
    idleInTransactionMillis:5000}}}} as unknown as RuntimeConfig;
  return {calls,database,config,get releases(){return releases;}};
}

test('claim receipt parser is exact, bounded, and bound to the one proposed token',()=>{
  const value=claimReceipt();
  assert.deepEqual(parseMeetingDiscussionClaim(value,RUN_ID,TOKEN),value);
  for(const invalid of [
    {...value,extra:'private'},
    {...value,leaseToken:'bad'},
    {...value,runId:'12121212-1212-4121-8121-121212121212'},
    {...value,sourceIndex:4096},
    {...value,nextWordIndex:350_001},
    {...value,sourceVersion:0},
    {...value,leaseExpiresAtMs:Number.MAX_SAFE_INTEGER+1},
    {...value,done:true},
  ])assert.throws(()=>parseMeetingDiscussionClaim(invalid,RUN_ID,TOKEN),errorCode('DB_BOUNDARY_INVALID'));
});

test('progress and source envelope parsers reject extra fields and invalid bounds',()=>{
  const progress=progressReceipt();
  assert.deepEqual(parseMeetingDiscussionProgress(progress),progress);
  assert.equal(parseMeetingDiscussionReadProgress('stale'),'stale');
  assert.equal(parseMeetingDiscussionReadProgress('not_committed'),'not_committed');
  assert.deepEqual(parseMeetingDiscussionReadProgress(progress),progress);
  const completed={sourceIndex:4096,sourceFirstSegmentIndex:10,nextSegmentIndex:10,nextWordIndex:0,
    deduplicatedPrefixWords:null,done:true} as const;
  assert.deepEqual(parseMeetingDiscussionProgress(completed),completed);
  for(const invalid of [
    {...progress,extra:true},{...progress,nextWordIndex:-1},{...progress,done:'false'},
    {...progress,deduplicatedPrefixWords:350_001},{...progress,nextSegmentIndex:0,sourceFirstSegmentIndex:1},
    {...completed,done:false},{...completed,nextWordIndex:1},{...completed,deduplicatedPrefixWords:0},
    {...completed,sourceFirstSegmentIndex:9},
  ])assert.throws(()=>parseMeetingDiscussionProgress(invalid),errorCode('DB_BOUNDARY_INVALID'));

  const envelope=sourceEnvelope();
  assert.deepEqual(parseMeetingDiscussionSourceInput(envelope),envelope);
  assert.throws(()=>parseMeetingDiscussionSourceInput({...envelope,rawText:'not a source field'}),errorCode('DB_BOUNDARY_INVALID'));
  assert.throws(()=>parseMeetingDiscussionSourceInput({...envelope,totalSourceWords:350_001}),errorCode('DB_BOUNDARY_INVALID'));
  assert.throws(()=>parseMeetingDiscussionSourceInput({...envelope,lastSegmentHash:'bad'}),errorCode('DB_BOUNDARY_INVALID'));
});

test('scan parser accepts only unique, bounded metadata rows',()=>{
  const work=[{runId:RUN_ID,operationToken:null,deadlineExpired:false},
    {runId:'12121212-1212-4121-8121-121212121212',operationToken:TOKEN,deadlineExpired:true}];
  assert.deepEqual(parseMeetingDiscussionScanWork(work,2),work);
  for(const [value,max] of [
    [[...work,{runId:'13131313-1313-4131-8131-131313131313',operationToken:null,deadlineExpired:false}],2],
    [[work[0],{...work[1],runId:RUN_ID}],2],
    [[{...work[0],extra:'words'}],1],
    [[{...work[0],operationToken:'bad'}],1],
    [[work[0]],0],
  ] as const)assert.throws(()=>parseMeetingDiscussionScanWork(value,max),errorCode('DB_BOUNDARY_INVALID'));
});

test('claim uses one generated token and an uncertain commit never generates a second',async()=>{
  const h=harness();
  h.handler=call=>{
    if(call.sql.includes('claim_meeting_discussion_source_v1'))return {claim:claimReceipt(stringValue(call.values,1))};
    return call.sql.includes('SELECT capture.record_id')?{record_id:RECORD_ID,capture_id:CAPTURE_ID}:{changed:true};
  };
  const lost=new KernelError('DB_COMMIT_UNKNOWN','claim ack lost',503);h.plans.push({when:'after',error:lost});

  await assert.rejects(h.repository.claim(),error=>error===lost);

  const rpc=actorRpc(h.calls,'claim_meeting_discussion_source_v1');
  assert.equal(h.actorCount,1);
  assert.equal(h.maintenanceCount,0);
  assert.equal(h.calls.filter(call=>call.sql.includes('claim_meeting_discussion_source_v1')).length,1);
  assert.match(stringValue(rpc.values,1),/^[0-9a-f-]{36}$/u);
  assert.equal(rpc.scope,'actor');
  assert.equal(rpc.transaction,actorRpc(h.calls,'SELECT capture.record_id').transaction);
});

test('private read and append RPCs each resolve and authorize the same capture actor without maintenance fallback',async()=>{
  const h=harness();
  h.handler=call=>{
    if(call.sql.includes('claim_meeting_discussion_source_v1'))return {claim:claimReceipt(stringValue(call.values,1))};
    if(call.sql.includes('read_meeting_discussion_source_v1'))return {source:sourceEnvelope()};
    if(call.sql.includes('append_meeting_discussion_batch_v1'))return {progress:progressReceipt()};
    if(call.sql.includes('read_meeting_discussion_batch_v1'))return {progress:'not_committed'};
    if(call.sql.includes('SELECT capture.record_id'))return {record_id:RECORD_ID,capture_id:CAPTURE_ID};
    return {changed:true};
  };
  const claim=await h.repository.claim();assert.ok(claim);
  assert.ok(await h.repository.loadSource(claim));
  assert.deepEqual(await h.repository.append(claim,batch()),progressReceipt());
  assert.equal(await h.repository.readProgress(claim,batch()),'not_committed');

  assert.equal(h.actorCount,4);
  assert.equal(h.authorizations,4);
  assert.equal(h.maintenanceCount,0);
  const privateCalls=h.calls.filter(call=>call.scope==='actor');
  assert.equal(privateCalls.filter(call=>call.sql.includes('SELECT capture.record_id')).length,4);
  for(const name of ['claim_meeting_discussion_source_v1','read_meeting_discussion_source_v1',
    'append_meeting_discussion_batch_v1','read_meeting_discussion_batch_v1']){
    const rpc=actorRpc(privateCalls,name);
    const scope=privateCalls.find(call=>call.transaction===rpc.transaction&&call.sql.includes('SELECT capture.record_id'));
    assert.ok(scope);
  }
  const append=actorRpc(privateCalls,'append_meeting_discussion_batch_v1');
  assert.deepEqual(JSON.parse(stringValue(append.values,2)),batch());
});

test('private actor failure never falls back to a metadata maintenance transaction',async()=>{
  const h=harness();const error=new KernelError('ACCESS_DENIED','actor unavailable',403);
  h.plans.push({when:'before',error});
  await assert.rejects(h.repository.loadSource(claimForTest()),value=>value===error);
  assert.equal(h.actorCount,1);
  assert.equal(h.maintenanceCount,0);
  assert.equal(h.calls.length,0);
});

test('finish is exact-token metadata-only maintenance and scanned yield requires a token',async()=>{
  const h=harness();
  assert.equal(await h.repository.finish(claimForTest(),'yield'),true);
  assert.equal(h.actorCount,0);
  assert.equal(h.maintenanceCount,1);
  const finish=actorRpc(h.calls,'finish_meeting_discussion_work_v1');
  assert.equal(finish.scope,'maintenance');
  assert.deepEqual(finish.values,[RUN_ID,TOKEN,'yield']);

  const controlDb=controlHarness(sql=>{
    if(sql.includes('scan_meeting_discussion_work_v1'))return {work:[{runId:RUN_ID,operationToken:TOKEN,deadlineExpired:false}]};
    if(sql.includes('finish_meeting_discussion_work_v1'))return {changed:true};
    return {};
  });
  const control=createPostgresMeetingDiscussionControl({database:controlDb.database,config:controlDb.config});
  const work=await control.scan(2);
  assert.deepEqual(work,[{runId:RUN_ID,operationToken:TOKEN,deadlineExpired:false}]);
  assert.equal(await control.finishScanned(RUN_ID,TOKEN,'yield'),true);
  const scan=controlDb.calls.find(call=>call.sql.includes('scan_meeting_discussion_work_v1'));
  const scannedFinish=controlDb.calls.find(call=>call.sql.includes('finish_meeting_discussion_work_v1'));
  assert.deepEqual(scan?.values,[2]);
  assert.deepEqual(scannedFinish?.values,[RUN_ID,TOKEN,'yield']);
  assert.equal(controlDb.releases,2);

  await assert.rejects(control.finishScanned(RUN_ID,null,'yield'),errorCode('DB_BOUNDARY_INVALID'));
  await assert.rejects(control.finishScanned('bad',null,'DISCUSSION_SOURCE_UNAVAILABLE'),errorCode('DOMAIN_DATA_INVALID'));
});
