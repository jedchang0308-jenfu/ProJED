import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import test from 'node:test';

import type {ServerActorV1} from '../../../server/actorTransaction.js';
import type {RuntimeConfig} from '../../../server/config.js';
import type {RuntimeDatabase} from '../../../server/db.js';
import {createMeetingCaptureHttpDispatcher} from '../../../server/meetingCaptureHttp.js';
import {createQualifiedMeetingUploadRepository,MeetingUploadRepository} from '../../../server/meetingUpload.js';
import type {MeetingAsrRuntimeBinding} from '../../../server/meetingAsrRuntimeBinding.js';
import type {MeetingJobDispatchResult} from '../../../server/meetingJobDispatch.js';

const config={env:'disposable',entry:'main',profile:{runtime:{timeouts:{transactionMillis:2000,statementMillis:1000,
  lockMillis:1000,idleInTransactionMillis:1000}}}} as unknown as RuntimeConfig;
const actor:ServerActorV1={principalId:'google:subject',localUserId:'95c1d3df-226a-4e6f-9db5-f0f7f0db9749',
  entry:'main',contextId:'9fcadd06-a3cb-43c2-8d1f-7c17147d0e68',expiresAtMs:Date.now()+60_000,accountGuardRevision:'1'};
const binding:MeetingAsrRuntimeBinding={projectId:'projed-cc78d',provider:'google-cloud-speech-v1',model:'default',
  dataLogging:'disabled',audioBucket:'projed-audio-qualified',qualificationEvidenceRef:'source:qualification:2026-10'};
const captureId='b53c9bd0-1e4c-4b02-b153-28f3ab4c2341';
const recordId='3b7ff75b-1c7a-4e52-9de4-34e77ee40b7b';
const runId='91e4a817-b146-45d0-a77a-c2a9938a6b11';

function uploadBody():Record<string,unknown>{
  return {operation:'complete-upload',captureId,expectedSourceVersion:1,audioManifestHash:'audio-manifest',
    pointerManifestHash:'pointer-manifest',sourceCompleteness:'complete',audioManifest:[{
      segmentIndex:0,epoch:0,bytes:128,startOffsetMs:0,endOffsetMs:100,overlapMs:0,gapBeforeMs:0,
      mime:'audio/webm',sha256:'a'.repeat(64),objectPath:`tenant/project/${recordId}/${captureId}/v1/0.webm`,
    }]};
}

function requestFor(body:Record<string,unknown>,headers:Record<string,string>={}):IncomingMessage{
  const encoded=JSON.stringify(body);
  const stream=Readable.from([Buffer.from(encoded)]);
  return Object.assign(stream,{url:'/api/v1/meeting-control',method:'POST',headers:{origin:'http://localhost',host:'localhost',
    'content-type':'application/json','content-length':String(Buffer.byteLength(encoded)),
    'x-projed-expected-account-id':actor.localUserId,'x-projed-expected-context-id':actor.contextId,...headers}}) as unknown as IncomingMessage;
}

function fakeDatabase(options:{readonly sourceComplete?:boolean;readonly completion?:Record<string,unknown>;
  readonly prepared?:Record<string,unknown>;readonly commitFailure?:boolean}={}):{
  readonly database:RuntimeDatabase;readonly statements:{readonly text:string;readonly values:readonly unknown[]}[];readonly checkoutCount:()=>number;
}{
  const statements:{text:string;values:readonly unknown[]}[]=[];let checkouts=0;
  const client={async query(text:string,values:readonly unknown[]=[]){
    statements.push({text,values});
    if(text==='COMMIT'&&options.commitFailure)throw Object.assign(new Error('transport failure'),{code:'08006'});
    if(text.includes('actor_context_valid_v1'))return {rows:[{valid:true}]};
    if(text.includes('SELECT record_id::text FROM projed_core.meeting_capture_sessions'))return {rows:[{record_id:recordId}]};
    if(text.includes('actor_can_write_record_v1'))return {rows:[{allowed:true}]};
    if(text.includes('complete_meeting_upload_v1'))return {rows:[{data:options.completion??{
      sourceComplete:options.sourceComplete??true,runId,idempotent:false,
    }}]};
    if(text.includes('prepare_meeting_cloud_speech_v1'))return {rows:[{data:options.prepared??{runId,state:'queued',idempotent:false}}]};
    return {rows:[]};
  }};
  const database={async checkout(){checkouts++;return {client,release(){}};}} as unknown as RuntimeDatabase;
  return {database,statements,checkoutCount:()=>checkouts};
}

test('Cloud upload repository stays disabled without exact qualification or matching bucket',()=>{
  assert.equal(createQualifiedMeetingUploadRepository(null,binding.audioBucket),null);
  assert.equal(createQualifiedMeetingUploadRepository(binding,undefined),null);
  assert.equal(createQualifiedMeetingUploadRepository(binding,''),null);
  assert.equal(createQualifiedMeetingUploadRepository(binding,'different-bucket'),null);
  assert.equal(createQualifiedMeetingUploadRepository({...binding,projectId:'other-project'} as unknown as MeetingAsrRuntimeBinding,
    binding.audioBucket),null);
  assert.equal(createQualifiedMeetingUploadRepository({...binding,provider:'google-cloud-speech-v2'} as unknown as MeetingAsrRuntimeBinding,
    binding.audioBucket),null);
  assert.equal(createQualifiedMeetingUploadRepository({...binding,model:'chirp-2'} as unknown as MeetingAsrRuntimeBinding,
    binding.audioBucket),null);
  assert.equal(createQualifiedMeetingUploadRepository({...binding,dataLogging:'enabled'} as unknown as MeetingAsrRuntimeBinding,
    binding.audioBucket),null);
  assert.equal(createQualifiedMeetingUploadRepository({...binding,qualificationEvidenceRef:'  '} as unknown as MeetingAsrRuntimeBinding,
    binding.audioBucket),null);
  assert.ok(createQualifiedMeetingUploadRepository(binding,binding.audioBucket));
});

test('unqualified complete-upload fails closed after unchanged actor checks and before DB checkout',async()=>{
  const fake=fakeDatabase();let actorResolutions=0;
  const dispatcher=createMeetingCaptureHttpDispatcher(config,fake.database,async()=>{actorResolutions++;return actor;},undefined,
    createQualifiedMeetingUploadRepository(null,binding.audioBucket));
  const result=await dispatcher(requestFor(uploadBody()),'unqualified-upload');
  assert.equal(result.status,503);
  assert.deepEqual(result.body,{error:{code:'ASR_PROVIDER_UNQUALIFIED',requestId:'unqualified-upload',retryable:true}});
  assert.equal(actorResolutions,1);
  assert.equal(fake.checkoutCount(),0,'the rejected upload cannot create a legacy queue or touch DB');

  const changed=await dispatcher(requestFor(uploadBody(),{'x-projed-expected-context-id':'00000000-0000-4000-8000-000000000001'}),
    'changed-actor');
  assert.equal(changed.status,409,'the existing expected-actor check still runs before qualification handling');
  assert.deepEqual(changed.body,{error:{code:'ACTOR_CHANGED',requestId:'changed-actor',retryable:false}});
  assert.equal(fake.checkoutCount(),0);

  const quickActor:ServerActorV1={...actor,entry:'quick'};
  const quickDispatcher=createMeetingCaptureHttpDispatcher(config,fake.database,async()=>quickActor,undefined,null);
  const quick=await quickDispatcher(requestFor(uploadBody()),'quick-entry');
  assert.equal(quick.status,403,'the existing main-entry restriction still precedes the provider gate');
  assert.deepEqual(quick.body,{error:{code:'ACCESS_DENIED',requestId:'quick-entry',retryable:false}});
  assert.equal(fake.checkoutCount(),0);
});

test('qualified complete-upload prepares Speech in the original actor transaction',async()=>{
  const fake=fakeDatabase();let actorResolutions=0;
  const dispatcher=createMeetingCaptureHttpDispatcher(config,fake.database,async()=>{actorResolutions++;return actor;},undefined,
    createQualifiedMeetingUploadRepository(binding,binding.audioBucket));
  const result=await dispatcher(requestFor(uploadBody()),'qualified-upload');
  assert.equal(result.status,200);
  assert.equal(actorResolutions,1,'the dispatcher resolves the original actor only once');
  assert.equal(fake.checkoutCount(),1,'complete and ASR preparation share one actor transaction');
  const begin=fake.statements.findIndex(statement=>statement.text.startsWith('BEGIN'));
  const actorContext=fake.statements.findIndex(statement=>statement.text.includes("set_config('projed.actor_context_id'"));
  const complete=fake.statements.findIndex(statement=>statement.text.includes('complete_meeting_upload_v1'));
  const prepare=fake.statements.findIndex(statement=>statement.text.includes('prepare_meeting_cloud_speech_v1'));
  const commit=fake.statements.findIndex(statement=>statement.text==='COMMIT');
  assert.ok(begin>=0&&begin<actorContext&&actorContext<complete&&complete<prepare&&prepare<commit,
    'the Cloud Speech prepare RPC runs in the same original-Session transaction after completion');
  assert.deepEqual(fake.statements[actorContext]!.values.slice(0,5),[
    actor.principalId,actor.localUserId,actor.entry,actor.contextId,actor.accountGuardRevision,
  ]);
  assert.deepEqual(fake.statements[prepare]!.values,[runId],'prepare receives the SQL-bound run, not a copied Session identity');
  assert.deepEqual(result.body,{data:{sourceComplete:true,runId,idempotent:false,state:'queued',providerMode:'cloud-speech-v1'}});
});

test('legacy upload remains an explicit default dispatcher seam',async()=>{
  const fake=fakeDatabase({sourceComplete:false});
  const dispatcher=createMeetingCaptureHttpDispatcher(config,fake.database,async()=>actor);
  const result=await dispatcher(requestFor(uploadBody()),'legacy-upload');
  assert.equal(result.status,200);
  assert.equal(fake.statements.some(statement=>statement.text.includes('prepare_meeting_cloud_speech_v1')),false);
  assert.deepEqual(result.body,{data:{sourceComplete:false,runId,idempotent:false}});
});

test('fresh committed upload wakes the job once while replay and non-runs do not',async()=>{
  const fresh=fakeDatabase({prepared:{runId,state:'queued',idempotent:true}});
  let freshCalls=0;let dispatchedSignal:AbortSignal|undefined;
  const freshDispatcher=createMeetingCaptureHttpDispatcher(config,fresh.database,async()=>actor,undefined,
    createQualifiedMeetingUploadRepository(binding,binding.audioBucket),{async run(signal){
      freshCalls++;dispatchedSignal=signal;
      assert.ok(fresh.statements.some(statement=>statement.text==='COMMIT'),'Job dispatch follows acknowledged COMMIT');
      return {kind:'accepted',operationName:'projects/projed-cc78d/locations/asia-east1/operations/op-1'};
    }});
  const completed=await freshDispatcher(requestFor(uploadBody()),'fresh-committed-upload');
  assert.equal(completed.status,200);
  assert.equal(freshCalls,1);
  assert.ok(dispatchedSignal instanceof AbortSignal,'request cancellation signal is forwarded');
  assert.deepEqual(completed.body,{data:{sourceComplete:true,runId,idempotent:false,state:'queued',providerMode:'cloud-speech-v1'}});

  const replay=fakeDatabase({completion:{sourceComplete:true,runId,idempotent:true},
    prepared:{runId,state:'queued',idempotent:false}});
  let replayCalls=0;
  const replayDispatcher=createMeetingCaptureHttpDispatcher(config,replay.database,async()=>actor,undefined,
    createQualifiedMeetingUploadRepository(binding,binding.audioBucket),{async run(){
      replayCalls++;return {kind:'accepted',operationName:'unused'};
    }});
  const replayed=await replayDispatcher(requestFor(uploadBody()),'replayed-upload');
  assert.equal(replayed.status,200);
  assert.equal(replayCalls,0,'completion idempotency survives the prepare receipt merge');
  assert.deepEqual(replayed.body,{data:{sourceComplete:true,runId,idempotent:true,state:'queued',providerMode:'cloud-speech-v1'}});

  const incomplete=fakeDatabase({sourceComplete:false});let incompleteCalls=0;
  const incompleteDispatcher=createMeetingCaptureHttpDispatcher(config,incomplete.database,async()=>actor,undefined,
    new MeetingUploadRepository(),{async run(){incompleteCalls++;return {kind:'accepted',operationName:'unused'};}});
  const nonComplete=await incompleteDispatcher(requestFor(uploadBody()),'incomplete-upload');
  assert.equal(nonComplete.status,200);
  assert.equal(incompleteCalls,0);

  const noRun=fakeDatabase({completion:{sourceComplete:true,runId:null,idempotent:false}});let noRunCalls=0;
  const noRunDispatcher=createMeetingCaptureHttpDispatcher(config,noRun.database,async()=>actor,undefined,
    new MeetingUploadRepository(),{async run(){noRunCalls++;return {kind:'accepted',operationName:'unused'};}});
  const missingRun=await noRunDispatcher(requestFor(uploadBody()),'missing-run-upload');
  assert.equal(missingRun.status,200);
  assert.equal(noRunCalls,0);
});

test('unknown commit never dispatches and uncertain wake-up preserves the completion receipt',async()=>{
  const unknownCommit=fakeDatabase({commitFailure:true});let commitCalls=0;
  const unknownCommitDispatcher=createMeetingCaptureHttpDispatcher(config,unknownCommit.database,async()=>actor,undefined,
    createQualifiedMeetingUploadRepository(binding,binding.audioBucket),{async run(){
      commitCalls++;return {kind:'accepted',operationName:'unused'};
    }});
  const commitResult=await unknownCommitDispatcher(requestFor(uploadBody()),'unknown-commit');
  assert.equal(commitResult.status,503);
  assert.equal((commitResult.body as {error:{code:string}}).error.code,'DB_COMMIT_UNKNOWN');
  assert.equal(commitCalls,0,'an unknown COMMIT must not cause a wake-up or resubmission');

  const fake=fakeDatabase();let calls=0;const logs:string[]=[];
  const originalError=console.error;
  console.error=(message?:unknown)=>{logs.push(String(message));};
  try{
    const dispatcher=createMeetingCaptureHttpDispatcher(config,fake.database,async()=>actor,undefined,
      createQualifiedMeetingUploadRepository(binding,binding.audioBucket),{async run():Promise<MeetingJobDispatchResult>{
        calls++;return {kind:'unknown'};
      }});
    const result=await dispatcher(requestFor(uploadBody()),'uncertain-job-wakeup');
    assert.equal(result.status,200,'an uncertain invocation does not change the durable upload receipt');
    assert.equal(calls,1,'there is no automatic retry after an unknown invocation result');
    assert.deepEqual(result.body,{data:{sourceComplete:true,runId,idempotent:false,state:'queued',providerMode:'cloud-speech-v1'}});
    assert.equal(logs.length,1);
    const event=JSON.parse(logs[0]!) as Record<string,unknown>;
    assert.deepEqual(event,{event:'meeting_upload_job_dispatch',kind:'unknown'});
    assert.equal(JSON.stringify(event).includes(runId),false);
    assert.equal(JSON.stringify(event).includes('operationName'),false);
  }finally{console.error=originalError;}

  const thrown=fakeDatabase();let thrownCalls=0;logs.length=0;
  console.error=(message?:unknown)=>{logs.push(String(message));};
  try{
    const dispatcher=createMeetingCaptureHttpDispatcher(config,thrown.database,async()=>actor,undefined,
      createQualifiedMeetingUploadRepository(binding,binding.audioBucket),{async run(){
        thrownCalls++;throw new Error('private-operation-detail');
      }});
    const result=await dispatcher(requestFor(uploadBody()),'failed-job-wakeup');
    assert.equal(result.status,200);
    assert.equal(thrownCalls,1,'a failed wake-up is not retried in the HTTP request');
    assert.deepEqual(result.body,{data:{sourceComplete:true,runId,idempotent:false,state:'queued',providerMode:'cloud-speech-v1'}});
    assert.equal(logs.length,1);
    const event=JSON.parse(logs[0]!) as Record<string,unknown>;
    assert.deepEqual(event,{event:'meeting_upload_job_dispatch',kind:'error'});
    assert.equal(JSON.stringify(event).includes('private-operation-detail'),false);
  }finally{console.error=originalError;}
});
