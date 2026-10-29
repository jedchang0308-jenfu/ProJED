import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {KernelError} from '../../../server/errors.js';
import {GoogleCloudSpeechProviderError} from '../../../server/googleCloudSpeechProvider.js';
import {buildMeetingAudioObjectKey} from '../../../server/meetingAudioInput.js';
import {runMeetingAsrUnit,type MeetingAsrClaim,type MeetingAsrRepository,type MeetingAsrSettlement,
  type MeetingAsrWorkerDependencies} from '../../../server/meetingAsrWorker.js';

const encoded=new Uint8Array([2,7,1,8]);
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const captureId=randomUUID(),runId=randomUUID();
  const source={id:randomUUID(),tenantId:randomUUID(),projectId:randomUUID(),recordId:randomUUID(),
    segmentIndex:0,startOffsetMs:120_000,endOffsetMs:172_125,mime:'audio/webm',bytes:encoded.length,
    sha256:hash(encoded),generation:'77',objectPath:''};
  source.objectPath=buildMeetingAudioObjectKey({...source,captureId,sourceVersion:1});
  const claim:MeetingAsrClaim={captureId,runId,sourceVersion:1,leaseToken:randomUUID(),leaseExpiresAtMs:200_000,
    attemptId:`${runId}:audio:0:chunk:1:attempt:0`,chunkIndex:1,source};
  let sends=0,now=100_000,cancelled=false;
  const events:string[]=[],settlements:MeetingAsrSettlement[]=[];
  const controller=new AbortController();
  const repository:MeetingAsrRepository={
    async claimNext(){events.push('claim');return claim;},
    async markDispatch(){events.push('mark');return true;},
    async readDispatch(){events.push('read-dispatch');return 'authorized';},
    async settle(_claim,result){events.push('settle');settlements.push(result);return cancelled?'accounted_only':'published';},
  };
  const deps:MeetingAsrWorkerDependencies={repository,now:()=>now,
    storage:{async read(){events.push('read');return {bytes:encoded,contentType:'audio/webm',generation:'77',size:encoded.length};}},
    async decode(){events.push('decode');return new Uint8Array(834_000*2);},
    provider:{async transcribe({pcm16le}){events.push('POST');sends++;
      assert.equal(pcm16le.length,34_000*2);return {transcript:'採購閥門。',words:[{text:'採購',startMs:0,endMs:750},
        {text:'閥門',startMs:750,endMs:1500}],totalBilledTime:'3s',requestId:'request-1'};}},
  };
  return {claim,source,repository,deps,events,settlements,controller,sends:()=>sends,
    expire:()=>{now=200_000;},cancel:()=>{cancelled=true;controller.abort();}};
}

test('verified source produces one paid chunk with original sample coverage and absolute word times',async()=>{
  const f=fixture();assert.equal((await runMeetingAsrUnit(f.deps,f.controller.signal)).state,'published');
  assert.deepEqual(f.events,['claim','read','decode','mark','POST','settle']);assert.equal(f.sends(),1);
  const result=f.settlements[0]!;assert.equal(result.kind,'recognized');if(result.kind!=='recognized')return;
  assert.equal(result.transcript.rawText,'採購閥門。');assert.equal(result.transcript.startOffsetMs,170_000);
  assert.equal(result.transcript.endOffsetMs,172_125);assert.equal(result.transcript.startSample,800_000);
  assert.equal(result.transcript.endSample,834_000);assert.equal(result.transcript.chunkCount,2);
  assert.deepEqual(result.transcript.wordOffsets.map(w=>[w.start_ms,w.end_ms,w.source_audio_segment_id]),
    [[170_000,170_750,f.source.id],[170_750,171_500,f.source.id]]);
  assert.equal(result.totalBilledTime,'3s');assert.equal(result.providerRequestId,'request-1');
});

test('source generation, digest, MIME and size mismatch independently prevent paid dispatch',async()=>{
  for(const changed of [{generation:'78'},{bytes:new Uint8Array([2,7,1,9])},{contentType:'audio/mpeg'},{size:1}]){
    const f=fixture();const read=f.deps.storage.read;
    const deps={...f.deps,storage:{async read(...args:Parameters<typeof read>){return {...await read(...args),...changed};}}};
    assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,'not_dispatched');
    assert.equal(f.sends(),0);assert.deepEqual(f.events,['claim','read','settle']);
    assert.equal(f.settlements[0]?.kind,'not_sent');
  }
});

test('a forged source object location is rejected before reading audio or provider dispatch',async()=>{
  const f=fixture();f.source.objectPath=f.source.objectPath.replace(f.claim.captureId,randomUUID());
  await assert.rejects(runMeetingAsrUnit(f.deps,f.controller.signal),/claim is invalid/u);
  assert.deepEqual(f.events,['claim']);assert.equal(f.sends(),0);
});

test('no work and caller cancellation before claim perform no paid or database writes',async()=>{
  const f=fixture();f.repository.claimNext=async()=>null;
  assert.deepEqual(await runMeetingAsrUnit(f.deps,f.controller.signal),{state:'idle'});
  f.cancel();await assert.rejects(runMeetingAsrUnit(f.deps,f.controller.signal),/interrupted/u);
  assert.equal(f.sends(),0);assert.equal(f.settlements.length,0);
});

test('cancellation during decode and lease expiry before dispatch preserve a proven unsent outcome',async()=>{
  for(const interrupt of ['cancel','expire'] as const){
    const f=fixture();const deps={...f.deps,async decode(){f[interrupt]();return new Uint8Array(834_000*2);}};
    assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,'not_dispatched');
    assert.equal(f.sends(),0);assert.equal(f.events.includes('mark'),false);
    assert.equal(f.settlements[0]?.kind,'not_sent');
  }
});

test('current authorization/budget/source rejection after decode never calls provider',async()=>{
  const f=fixture();f.repository.markDispatch=async()=>false;
  assert.equal((await runMeetingAsrUnit(f.deps,f.controller.signal)).state,'not_dispatched');
  assert.equal(f.sends(),0);assert.equal(f.settlements.length,0);
});

test('unknown dispatch commit is read back by the same claim before one POST',async()=>{
  const f=fixture();let attempted=0;
  f.repository.markDispatch=async()=>{attempted++;throw new KernelError('DB_COMMIT_UNKNOWN','synthetic');};
  f.repository.readDispatch=async claim=>{assert.equal(claim.leaseToken,f.claim.leaseToken);f.events.push('read-dispatch');return 'authorized';};
  assert.equal((await runMeetingAsrUnit(f.deps,f.controller.signal)).state,'published');
  assert.equal(attempted,1);assert.equal(f.sends(),1);assert.ok(f.events.indexOf('read-dispatch')<f.events.indexOf('POST'));
});

test('unconfirmed dispatch outcome cannot be retried or treated as provider permission',async()=>{
  const f=fixture();f.repository.markDispatch=async()=>{throw new KernelError('DB_COMMIT_UNKNOWN','synthetic');};
  f.repository.readDispatch=async()=> 'not_authorized';
  assert.equal((await runMeetingAsrUnit(f.deps,f.controller.signal)).state,'not_dispatched');
  assert.equal(f.sends(),0);assert.equal(f.settlements.length,0);
});

test('lost provider response holds usage unknown without resending or exposing raw error content',async()=>{
  const f=fixture();let attempts=0;
  const deps={...f.deps,provider:{async transcribe(){attempts++;throw new Error('PRIVATE AUDIO/TOKEN');}}};
  assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,'usage_unknown');
  assert.equal(attempts,1);assert.deepEqual(f.settlements,[{kind:'usage_unknown',code:'ASR_UNIT_UNAVAILABLE'}]);
});

test('provider distinguishes a proven pre-dispatch auth failure from unknown paid timeout',async()=>{
  for(const sent of [false,true]){
    const f=fixture();const deps={...f.deps,provider:{async transcribe(){throw new GoogleCloudSpeechProviderError(
      sent?'ASR_REQUEST_TIMEOUT':'ASR_AUTH_UNAVAILABLE','PRIVATE',sent,sent);}}};
    assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,sent?'usage_unknown':'not_dispatched');
    assert.equal(f.settlements[0]?.kind,sent?'usage_unknown':'not_sent');
  }
});

test('only a sent 5xx provider rejection with proven unbilled status releases unknown usage',async()=>{
  const cases=[
    {status:500,sent:true,unknown:false,settlement:'rejected_unbilled',result:'rejected_unbilled'},
    {status:503,sent:true,unknown:false,settlement:'rejected_unbilled',result:'rejected_unbilled'},
    {status:599,sent:true,unknown:false,settlement:'rejected_unbilled',result:'rejected_unbilled'},
    {status:503,sent:true,unknown:true,settlement:'usage_unknown',result:'usage_unknown'},
    {status:401,sent:true,unknown:false,settlement:'usage_unknown',result:'usage_unknown'},
    {status:undefined,sent:true,unknown:false,settlement:'usage_unknown',result:'usage_unknown'},
    {status:503,sent:false,unknown:false,settlement:'not_sent',result:'not_dispatched'},
  ] as const;
  for(const item of cases){
    const f=fixture();let posts=0;
    const deps={...f.deps,provider:{async transcribe(){posts++;f.events.push('POST');
      throw new GoogleCloudSpeechProviderError('ASR_PROVIDER_REJECTED','PRIVATE',item.sent,item.unknown,item.status);}}};
    assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,item.result);
    assert.equal(posts,1);assert.equal(f.events.filter(event=>event==='POST').length,1);
    assert.equal(f.settlements[0]?.kind,item.settlement);
    assert.equal(f.settlements[0]?.code,'ASR_PROVIDER_REJECTED');
  }
});

test('response arriving after cancellation is retained for accounting-only settlement',async()=>{
  const f=fixture();const transcribe=f.deps.provider.transcribe;
  const deps={...f.deps,provider:{async transcribe(...args:Parameters<typeof transcribe>){const result=await transcribe(...args);f.cancel();return result;}}};
  assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,'accounted_only');
  assert.equal(f.settlements[0]?.kind,'recognized');assert.equal(f.sends(),1);
});

test('missing billing metadata and valid silence remain recognized, never invented free usage',async()=>{
  const f=fixture();const deps={...f.deps,provider:{async transcribe(){return {transcript:'',words:[]};}}};
  assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,'published');
  const result=f.settlements[0]!;assert.equal(result.kind,'recognized');
  assert.equal(Object.hasOwn(result,'totalBilledTime'),false);
});

test('unknown settlement commit surfaces as failure, never a second provider dispatch',async()=>{
  const f=fixture();f.repository.settle=async()=>{throw new KernelError('DB_COMMIT_UNKNOWN','synthetic');};
  await assert.rejects(runMeetingAsrUnit(f.deps,f.controller.signal),error=>error instanceof KernelError&&error.code==='DB_COMMIT_UNKNOWN');
  assert.equal(f.sends(),1);
});

test('provider boundary rounding is anchored to samples while an out-of-source word is rejected',async()=>{
  const f=fixture();const deps={...f.deps,provider:{async transcribe(){return {transcript:'結束',
    words:[{text:'結束',startMs:2000,endMs:2200}],totalBilledTime:'3s'};}}};
  assert.equal((await runMeetingAsrUnit(deps,f.controller.signal)).state,'published');
  const result=f.settlements[0]!;assert.equal(result.kind,'recognized');
  if(result.kind==='recognized')assert.equal(result.transcript.wordOffsets[0]?.end_ms,172_125);
  const other=fixture();const bad={...other.deps,provider:{async transcribe(){return {transcript:'超出',
    words:[{text:'超出',startMs:2200,endMs:2200}],totalBilledTime:'3s'};}}};
  assert.equal((await runMeetingAsrUnit(bad,other.controller.signal)).state,'usage_unknown');
  assert.deepEqual(other.settlements,[{kind:'usage_unknown',code:'ASR_PROVIDER_INVALID_RESPONSE'}]);
});
