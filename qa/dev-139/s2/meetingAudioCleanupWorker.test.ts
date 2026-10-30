import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import type {MeetingAudioCleanupStorage} from '../../../server/meetingAudioStorage.js';
import {
  runMeetingAudioCleanupHost,
  runMeetingAudioCleanupUnit,
  type MeetingAudioCleanupClaim,
  type MeetingAudioCleanupRepository,
  type MeetingAudioCleanupWorkerDependencies,
} from '../../../server/meetingAudioCleanupWorker.js';

const OBLIGATION='11111111-1111-4111-8111-111111111111';
const LEASE='22222222-2222-4222-8222-222222222222';
const OPERATION='33333333-3333-4333-8333-333333333333';
const KEY='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd/v1/0.webm';
const BODY=new Uint8Array([1,2,3]);
const SHA=createHash('sha256').update(BODY).digest('hex');

function claim(overrides:Partial<MeetingAudioCleanupClaim>={}):MeetingAudioCleanupClaim{
  return {obligationId:OBLIGATION,leaseToken:LEASE,leaseExpiresAtMs:200_000,key:KEY,
    generation:'7',uploadOperationToken:OPERATION,sha256:SHA,bytes:BODY.byteLength,uploadOutcome:'uploaded',...overrides};
}

function fixture(options:{
  readonly claim?:MeetingAudioCleanupClaim|null;
  readonly probe?:(key:string,generation:string|undefined,signal?:AbortSignal)=>Promise<Awaited<ReturnType<MeetingAudioCleanupStorage['probe']>>>;
  readonly read?:(key:string,signal?:AbortSignal)=>Promise<Awaited<ReturnType<MeetingAudioCleanupStorage['read']>>>;
  readonly delete?:(key:string,generation:string,signal?:AbortSignal)=>Promise<void>;
  readonly finish?:(claim:MeetingAudioCleanupClaim,result:{kind:'deleted'|'unknown'|'conflict';generation:string|null})=>Promise<boolean>;
  readonly now?:()=>number;
}={}){
  const probes:Array<{key:string;generation:string|undefined;aborted:boolean}>=[];
  const reads:Array<{key:string;aborted:boolean}>=[];
  const deletes:Array<{key:string;generation:string;aborted:boolean}>=[];
  const finishes:Array<{claim:MeetingAudioCleanupClaim;result:{kind:'deleted'|'unknown'|'conflict';generation:string|null}}>=[];
  const storage:MeetingAudioCleanupStorage={
    async probe(key,generation,signal){
      probes.push({key,generation,aborted:signal?.aborted??false});
      if(options.probe)return options.probe(key,generation,signal);
      return {kind:'missing'};
    },
    async read(key,signal){
      reads.push({key,aborted:signal?.aborted??false});
      if(options.read)return options.read(key,signal);
      return {bytes:BODY,contentType:'audio/webm',generation:'7',size:BODY.byteLength};
    },
    async delete(key,generation,signal){
      deletes.push({key,generation,aborted:signal?.aborted??false});
      await options.delete?.(key,generation,signal);
    },
  };
  const repository:MeetingAudioCleanupRepository={
    async scan(){return [];},
    async claim(){return options.claim===undefined?claim():options.claim;},
    async finish(current,result){
      finishes.push({claim:current,result});
      return options.finish?options.finish(current,result):true;
    },
  };
  const dependencies:MeetingAudioCleanupWorkerDependencies={repository,storage,now:options.now??(()=>1_000)};
  return {dependencies,repository,storage,probes,reads,deletes,finishes};
}

test('known generation missing is completed without probing or deleting a current replacement',async()=>{
  const h=fixture({claim:claim({generation:'7'}),probe:async(_key,generation)=>
    generation==='7'?{kind:'missing'}:{kind:'present',generation:'8',size:4,contentType:'audio/webm'}});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'deleted'});
  assert.deepEqual(h.probes.map(item=>item.generation),['7']);
  assert.equal(h.deletes.length,0);
  assert.deepEqual(h.finishes[0]?.result,{kind:'deleted',generation:'7'});
});

test('unknown generation hash mismatch records conflict and never deletes',async()=>{
  const h=fixture({claim:claim({generation:null,uploadOperationToken:null}),
    probe:async()=>({kind:'present',generation:'9',size:BODY.byteLength,contentType:'audio/webm'}),
    read:async()=>({bytes:new Uint8Array([9,9,9]),contentType:'audio/webm',generation:'9',size:3})});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'conflict'});
  assert.equal(h.reads.length,1);
  assert.equal(h.deletes.length,0);
  assert.deepEqual(h.finishes[0]?.result,{kind:'conflict',generation:null});

  const persistedGeneration=h.finishes[0]!.result.generation;
  const retry=fixture({claim:claim({generation:persistedGeneration,uploadOperationToken:null}),
    probe:async(_key,generation)=>generation===undefined
      ?{kind:'present',generation:'9',size:BODY.byteLength,contentType:'audio/webm'}
      :{kind:'present',generation:'9',size:BODY.byteLength,contentType:'audio/webm'},
    read:async()=>({bytes:new Uint8Array([9,9,9]),contentType:'audio/webm',generation:'9',size:3})});
  await runMeetingAudioCleanupUnit(retry.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(retry.probes.map(item=>item.generation),[undefined]);
  assert.equal(retry.deletes.length,0);
});

test('unknown generation read failure keeps generation null in settlement',async()=>{
  const h=fixture({claim:claim({generation:null,uploadOperationToken:OPERATION}),
    probe:async()=>({kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'}),
    read:async()=>{throw new Error('private provider response');}});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'unknown'});
  assert.deepEqual(h.finishes[0]?.result,{kind:'unknown',generation:null});
  assert.equal(h.deletes.length,0);

  const retry=fixture({claim:claim({generation:h.finishes[0]!.result.generation,uploadOperationToken:OPERATION}),
    probe:async(_key,generation)=>generation===undefined
      ?{kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'}
      :{kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'},
    read:async()=>{throw new Error('private provider response');}});
  await runMeetingAudioCleanupUnit(retry.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(retry.probes.map(item=>item.generation),[undefined]);
  assert.equal(retry.deletes.length,0);
});

test('unknown generation read with changed generation keeps generation null in settlement',async()=>{
  const h=fixture({claim:claim({generation:null,uploadOperationToken:OPERATION}),
    probe:async()=>({kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'}),
    read:async()=>({bytes:BODY,contentType:'audio/webm',generation:'11',size:BODY.byteLength})});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'conflict'});
  assert.deepEqual(h.finishes[0]?.result,{kind:'conflict',generation:null});
  assert.equal(h.deletes.length,0);

  const retry=fixture({claim:claim({generation:h.finishes[0]!.result.generation,uploadOperationToken:OPERATION}),
    probe:async(_key,generation)=>generation===undefined
      ?{kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'}
      :{kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'},
    read:async()=>({bytes:BODY,contentType:'audio/webm',generation:'11',size:BODY.byteLength})});
  await runMeetingAudioCleanupUnit(retry.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(retry.probes.map(item=>item.generation),[undefined]);
  assert.equal(retry.deletes.length,0);
});

test('unknown generation size mismatch keeps generation null and skips read and delete',async()=>{
  const h=fixture({claim:claim({generation:null,uploadOperationToken:OPERATION,bytes:BODY.byteLength+1}),
    probe:async()=>({kind:'present',generation:'10',size:BODY.byteLength,contentType:'audio/webm'})});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'conflict'});
  assert.deepEqual(h.finishes[0]?.result,{kind:'conflict',generation:null});
  assert.equal(h.reads.length,0);
  assert.equal(h.deletes.length,0);
});

test('known generation probe mismatch keeps the claimed generation',async()=>{
  const h=fixture({claim:claim({generation:'7'}),
    probe:async()=>({kind:'present',generation:'8',size:BODY.byteLength,contentType:'audio/webm'})});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'conflict'});
  assert.deepEqual(h.finishes[0]?.result,{kind:'conflict',generation:'7'});
  assert.equal(h.deletes.length,0);
});

test('known generation readback mismatch keeps the claimed generation',async()=>{
  let probeCount=0;
  const h=fixture({claim:claim({generation:'7'}),
    probe:async()=>++probeCount===1
      ?{kind:'present',generation:'7',size:BODY.byteLength,contentType:'audio/webm'}
      :{kind:'present',generation:'8',size:BODY.byteLength,contentType:'audio/webm'}});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'conflict'});
  assert.deepEqual(h.finishes[0]?.result,{kind:'conflict',generation:'7'});
  assert.equal(h.deletes.length,1);
});

test('unknown generation deletes only after same-generation readback matches original bytes',async()=>{
  const h=fixture({claim:claim({generation:null,uploadOperationToken:OPERATION}),
    probe:async(_key,generation)=>generation===undefined
      ?{kind:'present',generation:'9',size:3,contentType:'audio/webm'}:{kind:'missing'},
    read:async()=>({bytes:BODY,contentType:'audio/webm',generation:'9',size:BODY.byteLength})});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'deleted'});
  assert.equal(h.reads.length,1);
  assert.deepEqual(h.deletes.map(item=>item.generation),['9']);
  assert.deepEqual(h.probes.map(item=>item.generation),[undefined,'9']);
  assert.deepEqual(h.finishes[0]?.result,{kind:'deleted',generation:'9'});
});

test('missing unknown generation is only quiescent when no upload operation token exists',async()=>{
  const noToken=fixture({claim:claim({generation:null,uploadOperationToken:null})});
  const noTokenResult=await runMeetingAudioCleanupUnit(noToken.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(noTokenResult,{state:'deleted'});

  const token=fixture({claim:claim({generation:null,uploadOperationToken:OPERATION})});
  const tokenResult=await runMeetingAudioCleanupUnit(token.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(tokenResult,{state:'unknown'});
  assert.deepEqual(token.finishes[0]?.result,{kind:'unknown',generation:null});
});

test('DELETE error reads back the exact generation once and never resends DELETE',async()=>{
  let probeCount=0;
  const h=fixture({claim:claim({generation:'7'}),
    probe:async()=>++probeCount===1
      ?{kind:'present',generation:'7',size:3,contentType:'audio/webm'}:{kind:'missing'},
    delete:async()=>{throw new Error('provider detail');}});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'deleted'});
  assert.equal(h.deletes.length,1);
  assert.equal(h.probes.length,2);
  assert.deepEqual(h.finishes[0]?.result,{kind:'deleted',generation:'7'});
});

test('cancellation during probe stops further provider calls and still settles metadata unknown',async()=>{
  const controller=new AbortController();
  const h=fixture({claim:claim({generation:'7'}),probe:async()=>{
    controller.abort();return {kind:'present',generation:'7',size:3,contentType:'audio/webm'};
  }});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,controller.signal);
  assert.deepEqual(result,{state:'unknown'});
  assert.equal(h.probes.length,1);
  assert.equal(h.reads.length,0);
  assert.equal(h.deletes.length,0);
  assert.deepEqual(h.finishes[0]?.result,{kind:'unknown',generation:'7'});
});

test('cancellation before unknown generation hash proof settles with generation null',async()=>{
  const controller=new AbortController();
  const h=fixture({claim:claim({generation:null,uploadOperationToken:OPERATION}),probe:async()=>{
    controller.abort();return {kind:'present',generation:'9',size:BODY.byteLength,contentType:'audio/webm'};
  }});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,controller.signal);
  assert.deepEqual(result,{state:'unknown'});
  assert.deepEqual(h.finishes[0]?.result,{kind:'unknown',generation:null});
  assert.equal(h.reads.length,0);
  assert.equal(h.deletes.length,0);
});

test('noncanonical key is rejected before any storage lookup',async()=>{
  const h=fixture({claim:claim({key:KEY.replace('/v1/0.webm','/v1/../0.webm')})});
  const result=await runMeetingAudioCleanupUnit(h.dependencies,OBLIGATION,new AbortController().signal);
  assert.deepEqual(result,{state:'conflict'});
  assert.equal(h.probes.length,0);
  assert.equal(h.reads.length,0);
  assert.equal(h.deletes.length,0);
  assert.deepEqual(h.finishes[0]?.result,{kind:'conflict',generation:'7'});
});

test('host leaves obligations unclaimed when storage is disabled',async()=>{
  const ids=[OBLIGATION,'44444444-4444-4444-8444-444444444444'];
  let scanLimit=0,claimCalls=0;
  const repository:MeetingAudioCleanupRepository={
    async scan(limit){scanLimit=limit;return ids;},
    async claim(){claimCalls++;return null;},
    async finish(){return true;},
  };
  const summary=await runMeetingAudioCleanupHost({repository,storageEnabled:false},new AbortController().signal);
  assert.equal(scanLimit,20);
  assert.equal(claimCalls,0);
  assert.deepEqual(summary,{scanned:2,units:0,deleted:0,unknown:0,conflicts:0,deferred:2,failures:0,errors:{}});
});

test('enabled host without storage reports CONFIG_INVALID without scanning or claiming',async()=>{
  let scanCalls=0,claimCalls=0;
  const repository:MeetingAudioCleanupRepository={
    async scan(){scanCalls++;return [OBLIGATION];},
    async claim(){claimCalls++;return null;},
    async finish(){return true;},
  };
  const summary=await runMeetingAudioCleanupHost({repository,storageEnabled:true},new AbortController().signal);
  assert.equal(scanCalls,0);
  assert.equal(claimCalls,0);
  assert.deepEqual(summary,{scanned:0,units:0,deleted:0,unknown:0,conflicts:0,deferred:0,failures:1,errors:{CONFIG_INVALID:1}});
});

test('host scans at most twenty and claims at most four unique units per batch',async()=>{
  const ids=Array.from({length:21},(_,index)=>`${String(index+1).padStart(8,'0')}-1111-4111-8111-111111111111`);
  let scanLimit=0;
  const claims:string[]=[];
  const repository:MeetingAudioCleanupRepository={
    async scan(limit){scanLimit=limit;return ids;},
    async claim(id){
      claims.push(id);
      return claim({obligationId:id,generation:null,uploadOperationToken:null,uploadOutcome:null});
    },
    async finish(){return true;},
  };
  const storage:MeetingAudioCleanupStorage={
    async probe(){return {kind:'missing'};},
    async read(){throw new Error('read should not happen');},
    async delete(){throw new Error('delete should not happen');},
  };
  const summary=await runMeetingAudioCleanupHost({repository,storage,storageEnabled:true,now:()=>1_000},new AbortController().signal);
  assert.equal(scanLimit,20);
  assert.equal(summary.scanned,20);
  assert.equal(summary.units,4);
  assert.equal(summary.deleted,4);
  assert.equal(summary.deferred,16);
  assert.equal(claims.length,4);
});

test('host does not start a lease inside the 150 second deadline headroom',async()=>{
  let claims=0;
  const repository:MeetingAudioCleanupRepository={
    async scan(){return [OBLIGATION];},
    async claim(){claims++;return null;},
    async finish(){return true;},
  };
  const storage:MeetingAudioCleanupStorage={
    async probe(){return {kind:'missing'};},
    async read(){throw new Error('read should not happen');},
    async delete(){throw new Error('delete should not happen');},
  };
  const summary=await runMeetingAudioCleanupHost({repository,storage,storageEnabled:true,now:()=>1_000,deadlineAtMs:150_999},new AbortController().signal);
  assert.equal(claims,0);
  assert.equal(summary.deferred,1);
  assert.equal(summary.units,0);
});
