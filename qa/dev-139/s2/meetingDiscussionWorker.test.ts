import assert from 'node:assert/strict';
import test from 'node:test';

import {KernelError} from '../../../server/errors.js';
import {assembleMeetingDiscussionSource,
  type MeetingDiscussionAssemblyInput,type MeetingDiscussionSource}
  from '../../../server/meetingDiscussionAssembly.js';
import {runMeetingDiscussionUnit,
  type MeetingDiscussionBatch,type MeetingDiscussionClaim,type MeetingDiscussionProgress,
  type MeetingDiscussionRepository,type MeetingDiscussionSourceInput} from '../../../server/meetingDiscussionWorker.js';
import type {MeetingAsrTranscriptUnit} from '../../../server/meetingAsrWorker.js';

const CAPTURE_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOURCE_ID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PREVIOUS_SOURCE_ID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHA='a'.repeat(64);
const SOURCE_SHA='b'.repeat(64);
const DECODED_SHA='c'.repeat(64);
const START_MS=100_000;

type AsrWord=MeetingAsrTranscriptUnit['wordOffsets'][number];
type WordSpec=Pick<AsrWord,'text'|'start_ms'|'end_ms'>;

interface FixtureOptions {
  readonly rawText?:string;
  readonly words?:readonly WordSpec[];
  readonly firstSegmentIndex?:number;
  readonly sourceIndex?:number;
  readonly source?:MeetingDiscussionSource;
  readonly sourceInput?:MeetingDiscussionSourceInput;
  readonly claim?:Partial<MeetingDiscussionClaim>;
  readonly doneAfterSource?:boolean;
}

interface Hooks {
  load?:(claim:MeetingDiscussionClaim)=>Promise<MeetingDiscussionSourceInput|null>;
  append?:(batch:MeetingDiscussionBatch,attempt:number)=>Promise<MeetingDiscussionProgress|null>;
  readProgress?:(batch:MeetingDiscussionBatch,attempt:number)=>Promise<MeetingDiscussionProgress|'not_committed'|'stale'>;
  finish?:(reason:Parameters<MeetingDiscussionRepository['finish']>[1])=>Promise<boolean>;
}

function source(overrides:Partial<MeetingDiscussionSource>={}):MeetingDiscussionSource{
  return {id:SOURCE_ID,captureId:CAPTURE_ID,sourceVersion:3,segmentIndex:0,startOffsetMs:START_MS,
    endOffsetMs:START_MS+50_000,overlapMs:0,gapBeforeMs:0,sha256:SOURCE_SHA,generation:'42',...overrides};
}

function sourceInput(options:FixtureOptions={}):MeetingDiscussionSourceInput{
  const src=options.source??source({segmentIndex:options.sourceIndex??0});
  const words=options.words??[
    {text:'first',start_ms:START_MS+100,end_ms:START_MS+150},
    {text:'second',start_ms:START_MS+200,end_ms:START_MS+250},
  ];
  const rawText=options.rawText??words.map(word=>word.text).join(' ');
  const result:MeetingAsrTranscriptUnit={chunkIndex:0,chunkCount:1,startSample:0,endSample:800_000,
    decodedSha256:DECODED_SHA,sourceHash:SHA,startOffsetMs:src.startOffsetMs,endOffsetMs:src.startOffsetMs+50_000,
    rawText,wordOffsets:words.map((word,index)=>({...word,source_audio_segment_id:src.id,source_word_index:index}))};
  const input:MeetingDiscussionAssemblyInput={source:src,checkpoints:[{unitIndex:0,captureId:src.captureId,
    sourceVersion:src.sourceVersion,sourceSegmentId:src.id,sourceSha256:src.sha256,sourceGeneration:src.generation,
    result}],firstUnitIndex:0,firstSegmentIndex:options.firstSegmentIndex??0};
  return options.sourceInput??{input,totalSourceWords:words.length,lastSegmentHash:null};
}

function claim(sourceValue:MeetingDiscussionSource,firstSegmentIndex:number,overrides:Partial<MeetingDiscussionClaim>={})
  :MeetingDiscussionClaim{
  return {runId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',captureId:sourceValue.captureId,
    transcriptRevisionId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',sourceVersion:sourceValue.sourceVersion,
    leaseToken:'ffffffff-ffff-4fff-8fff-ffffffffffff',leaseExpiresAtMs:60_000,sourceIndex:sourceValue.segmentIndex,
    sourceFirstSegmentIndex:firstSegmentIndex,nextSegmentIndex:firstSegmentIndex,nextWordIndex:0,
    deduplicatedPrefixWords:null,done:false,...overrides};
}

function nextProgress(current:MeetingDiscussionClaim,batch:MeetingDiscussionBatch,doneAfterSource=true)
  :MeetingDiscussionProgress{
  if(batch.sourceDone){
    const nextSegment=batch.expectedNextSegmentIndex+batch.segments.length;
    return {sourceIndex:current.sourceIndex+1,sourceFirstSegmentIndex:nextSegment,nextSegmentIndex:nextSegment,
      nextWordIndex:0,deduplicatedPrefixWords:null,done:doneAfterSource};
  }
  const finalSegment=batch.segments[batch.segments.length-1];
  const finalWord=finalSegment?.wordOffsets.at(-1);
  return {sourceIndex:current.sourceIndex,sourceFirstSegmentIndex:batch.sourceFirstSegmentIndex,
    nextSegmentIndex:batch.expectedNextSegmentIndex+batch.segments.length,
    nextWordIndex:finalWord?finalWord.source_word_index+1:batch.deduplicatedPrefixWords,
    deduplicatedPrefixWords:batch.deduplicatedPrefixWords,done:false};
}

function fixture(options:FixtureOptions={},hooks:Hooks={}){
  const loaded=sourceInput(options);
  const currentClaim=claim(loaded.input.source,loaded.input.firstSegmentIndex,options.claim);
  let nowMs=0,appendAttempts=0,readAttempts=0;
  const calls={claims:0,loads:0,appends:[] as MeetingDiscussionBatch[],reads:[] as MeetingDiscussionBatch[],
    finishes:[] as Parameters<MeetingDiscussionRepository['finish']>[1][]};
  const repository:MeetingDiscussionRepository={
    async claim(){calls.claims++;return currentClaim;},
    async loadSource(value){calls.loads++;return hooks.load?hooks.load(value):loaded;},
    async append(_value,batch){
      calls.appends.push(batch);appendAttempts++;
      return hooks.append?hooks.append(batch,appendAttempts):nextProgress(currentClaim,batch,options.doneAfterSource??true);
    },
    async readProgress(_value,batch){
      calls.reads.push(batch);readAttempts++;
      return hooks.readProgress?hooks.readProgress(batch,readAttempts):'not_committed';
    },
    async finish(_value,reason){calls.finishes.push(reason);return hooks.finish?hooks.finish(reason):true;},
  };
  return {repository,calls,claim:currentClaim,input:loaded,now:()=>nowMs,setNow:(value:number)=>{nowMs=value;},
    deps:{repository,now:()=>nowMs}};
}

function unknownCommit():KernelError{return new KernelError('DB_COMMIT_UNKNOWN','synthetic commit outcome',503);}
function code(error:unknown):string|null{return error instanceof KernelError?error.code:null;}

function manySentenceWords(count:number):{rawText:string;words:WordSpec[]}{
  return {rawText:'x. '.repeat(count),words:Array.from({length:count},(_,index)=>({text:'x',
    start_ms:START_MS+index*100+1,end_ms:START_MS+index*100+11}))};
}

test('claims once, replays segment hash and word cursor, and appends only the unseen boundary',async()=>{
  const firstSegmentIndex=5;
  const current=source({segmentIndex:1});
  const loadedBase=sourceInput({source:current,rawText:'one. two.',words:[
    {text:'one',start_ms:START_MS+100,end_ms:START_MS+150},
    {text:'two',start_ms:START_MS+200,end_ms:START_MS+250},
  ],firstSegmentIndex});
  const prior=source({id:PREVIOUS_SOURCE_ID,segmentIndex:0,startOffsetMs:0,endOffsetMs:START_MS});
  const loaded:MeetingDiscussionSourceInput={...loadedBase,input:{...loadedBase.input,
    previous:{source:prior,tailWords:[]}}};
  const generated=Array.from(assembleMeetingDiscussionSource(loaded.input));
  assert.equal(generated.length,2);
  const sourceWithBoundary:MeetingDiscussionSourceInput={...loaded,lastSegmentHash:generated[0]!.sourceHash};
  const f=fixture({source:loaded.input.source,sourceInput:sourceWithBoundary,firstSegmentIndex,
    claim:{nextSegmentIndex:firstSegmentIndex+1,nextWordIndex:1,deduplicatedPrefixWords:0}});

  const result=await runMeetingDiscussionUnit(f.deps,new AbortController().signal);

  assert.deepEqual(result,{state:'source_complete',assemblyComplete:true});
  assert.equal(f.calls.claims,1);
  assert.equal(f.calls.loads,1);
  assert.equal(f.calls.appends.length,1);
  assert.equal(f.calls.appends[0]?.expectedNextSegmentIndex,6);
  assert.equal(f.calls.appends[0]?.sourceFirstSegmentIndex,5);
  assert.equal(f.calls.appends[0]?.segments.length,1);
  assert.equal(f.calls.appends[0]?.segments[0]?.segmentIndex,6);
  assert.equal(f.calls.appends[0]?.segments[0]?.wordOffsets[0]?.source_word_index,1);
  assert.deepEqual(f.calls.finishes,['yield']);
});

test('an already-aborted invocation does not create a claim',async()=>{
  const f=fixture();
  const controller=new AbortController();controller.abort();

  assert.deepEqual(await runMeetingDiscussionUnit(f.deps,controller.signal),{state:'yielded'});
  assert.equal(f.calls.claims,0);
  assert.equal(f.calls.loads,0);
  assert.deepEqual(f.calls.finishes,[]);
});

test('missing or changed dedup prefix and persisted segment boundary finish as CONFIG_CHANGED',async()=>{
  for(const overrides of [
    {claim:{deduplicatedPrefixWords:1}},
    {claim:{nextSegmentIndex:1,nextWordIndex:2,deduplicatedPrefixWords:0},lastSegmentHash:SHA},
    {claim:{nextSegmentIndex:1,nextWordIndex:1,deduplicatedPrefixWords:0},lastSegmentHash:null},
  ]){
    const base=sourceInput({rawText:'one. two.',words:[
      {text:'one',start_ms:START_MS+100,end_ms:START_MS+150},
      {text:'two',start_ms:START_MS+200,end_ms:START_MS+250},
    ]});
    const f=fixture({source:base.input.source,sourceInput:{...base,lastSegmentHash:overrides.lastSegmentHash??null},
      claim:overrides.claim});
    await assert.rejects(runMeetingDiscussionUnit(f.deps,new AbortController().signal),
      error=>code(error)==='CONTRACT_VERSION_MISMATCH');
    assert.deepEqual(f.calls.finishes,['DISCUSSION_CONFIG_CHANGED']);
    assert.equal(f.calls.appends.length,0);
  }
});

test('submits no-speech and all-overlap sources as one empty sourceDone batch',async()=>{
  const silence=fixture({rawText:'',words:[]});
  assert.deepEqual(await runMeetingDiscussionUnit(silence.deps,new AbortController().signal),
    {state:'source_complete',assemblyComplete:true});
  assert.equal(silence.calls.appends.length,1);
  assert.deepEqual(silence.calls.appends[0]?.segments,[]);
  assert.equal(silence.calls.appends[0]?.sourceDone,true);
  assert.equal(silence.calls.appends[0]?.deduplicatedPrefixWords,0);

  const prior=source({id:PREVIOUS_SOURCE_ID,segmentIndex:0,startOffsetMs:0,endOffsetMs:10_000});
  const current=source({segmentIndex:1,startOffsetMs:9_500,endOffsetMs:20_000,overlapMs:500});
  const word={text:'same',start_ms:9_500,end_ms:9_600};
  const overlapResult:MeetingAsrTranscriptUnit={chunkIndex:0,chunkCount:1,startSample:0,endSample:168_000,
    decodedSha256:DECODED_SHA,sourceHash:SHA,startOffsetMs:9_500,endOffsetMs:20_000,rawText:'same',
    wordOffsets:[{...word,source_audio_segment_id:current.id,source_word_index:0}]};
  const overlapInput:MeetingDiscussionAssemblyInput={source:current,checkpoints:[{unitIndex:1,captureId:current.captureId,
    sourceVersion:current.sourceVersion,sourceSegmentId:current.id,sourceSha256:current.sha256,
    sourceGeneration:current.generation,result:overlapResult}],firstUnitIndex:1,firstSegmentIndex:4,
    previous:{source:prior,tailWords:[{...word,source_audio_segment_id:prior.id,source_word_index:0}]}};
  const allOverlap=fixture({source:current,sourceInput:{input:overlapInput,totalSourceWords:1,lastSegmentHash:null},
    claim:{sourceFirstSegmentIndex:4,nextSegmentIndex:4}});
  assert.deepEqual(await runMeetingDiscussionUnit(allOverlap.deps,new AbortController().signal),
    {state:'source_complete',assemblyComplete:true});
  assert.deepEqual(allOverlap.calls.appends[0]?.segments,[]);
  assert.equal(allOverlap.calls.appends[0]?.deduplicatedPrefixWords,1);
  assert.equal(allOverlap.calls.appends[0]?.sourceDone,true);
});

test('each batch holds at most 16 segments and a unit appends at most eight batches',async()=>{
  const content=manySentenceWords(130);
  const f=fixture({rawText:content.rawText,words:content.words});

  assert.deepEqual(await runMeetingDiscussionUnit(f.deps,new AbortController().signal),{state:'yielded'});
  assert.equal(f.calls.appends.length,8);
  assert.deepEqual(f.calls.appends.map(batch=>batch.segments.length),Array(8).fill(16));
  assert.ok(f.calls.appends.every(batch=>batch.sourceDone===false));
  assert.equal(f.calls.appends[0]?.segments[0]?.segmentIndex,0);
  assert.equal(f.calls.appends[7]?.segments[15]?.segmentIndex,127);
});

test('abort or expired lease headroom stops before another append and always releases the claim',async()=>{
  const content=manySentenceWords(20);
  const controller=new AbortController();
  const abortDuringAppend=fixture({rawText:content.rawText,words:content.words},{append:async(batch,attempt)=>{
    if(attempt===1)controller.abort();
    return nextProgress(claim(source(),0),batch,false);
  }});
  assert.deepEqual(await runMeetingDiscussionUnit(abortDuringAppend.deps,controller.signal),{state:'yielded'});
  assert.equal(abortDuringAppend.calls.appends.length,1);
  assert.deepEqual(abortDuringAppend.calls.finishes,['yield']);

  const nearExpiry=fixture({}, {load:async()=>{
    nearExpiry.setNow(50_000);
    return nearExpiry.input;
  }});
  assert.deepEqual(await runMeetingDiscussionUnit(nearExpiry.deps,new AbortController().signal),{state:'yielded'});
  assert.equal(nearExpiry.calls.appends.length,0);
  assert.deepEqual(nearExpiry.calls.finishes,['yield']);
});

test('an unknown append commit is read back and a proven commit is not repeated',async()=>{
  let receipt:MeetingDiscussionProgress|undefined;
  const f=fixture({}, {append:async(batch,attempt)=>{
    receipt=nextProgress(f.claim,batch,true);
    if(attempt===1)throw unknownCommit();
    return receipt;
  },readProgress:async()=>receipt??'not_committed'});

  assert.deepEqual(await runMeetingDiscussionUnit(f.deps,new AbortController().signal),
    {state:'source_complete',assemblyComplete:true});
  assert.equal(f.calls.appends.length,1);
  assert.equal(f.calls.reads.length,1);
});

test('rejects malformed source-complete receipts and same-source receipts marked done',async()=>{
  const mutations:Array<(progress:MeetingDiscussionProgress)=>MeetingDiscussionProgress>=[
    progress=>({...progress,nextSegmentIndex:progress.nextSegmentIndex+1}),
    progress=>({...progress,sourceFirstSegmentIndex:progress.sourceFirstSegmentIndex+1}),
    progress=>({...progress,nextWordIndex:1}),
    progress=>({...progress,deduplicatedPrefixWords:0}),
  ];
  const mutate=(change:(progress:MeetingDiscussionProgress)=>MeetingDiscussionProgress)=>{
    const f=fixture({}, {append:async(batch)=>change(nextProgress(claim(source(),0),batch,true))});
    return {f,promise:runMeetingDiscussionUnit(f.deps,new AbortController().signal)};
  };
  for(const change of mutations){
    const {f,promise}=mutate(change);
    await assert.rejects(promise,error=>code(error)==='CONTRACT_VERSION_MISMATCH');
    assert.deepEqual(f.calls.finishes,['DISCUSSION_CONFIG_CHANGED']);
  }

  const content=manySentenceWords(17);
  const sameSource=fixture({rawText:content.rawText,words:content.words},{append:async(batch)=>
    ({...nextProgress(claim(source(),0),batch,false),done:true})});
  await assert.rejects(runMeetingDiscussionUnit(sameSource.deps,new AbortController().signal),
    error=>code(error)==='CONTRACT_VERSION_MISMATCH');
  assert.deepEqual(sameSource.calls.finishes,['DISCUSSION_CONFIG_CHANGED']);

  const prematureSourceAdvance=fixture({rawText:content.rawText,words:content.words},{append:async(batch)=>{
    const progress=nextProgress(claim(source(),0),batch,false);
    return {...progress,sourceIndex:1};
  }});
  await assert.rejects(runMeetingDiscussionUnit(prematureSourceAdvance.deps,new AbortController().signal),
    error=>code(error)==='CONTRACT_VERSION_MISMATCH');
  assert.deepEqual(prematureSourceAdvance.calls.finishes,['DISCUSSION_CONFIG_CHANGED']);

  const corruptedLastWord=fixture({}, {append:async(batch)=>{
    const word=batch.segments[batch.segments.length-1]?.wordOffsets.at(-1);
    if(word)(word as unknown as {source_word_index:number}).source_word_index=100;
    return nextProgress(claim(source(),0),batch,true);
  }});
  await assert.rejects(runMeetingDiscussionUnit(corruptedLastWord.deps,new AbortController().signal),
    error=>code(error)==='CONTRACT_VERSION_MISMATCH');
  assert.deepEqual(corruptedLastWord.calls.finishes,['DISCUSSION_CONFIG_CHANGED']);
});

test('retries a proven missing batch once and readbacks a second unknown without another retry',async()=>{
  const missing=fixture({}, {append:async(batch,attempt)=>{
    if(attempt===1)throw unknownCommit();
    return nextProgress(claim(source(),0),batch,true);
  },readProgress:async()=> 'not_committed'});
  assert.deepEqual(await runMeetingDiscussionUnit(missing.deps,new AbortController().signal),
    {state:'source_complete',assemblyComplete:true});
  assert.equal(missing.calls.appends.length,2);
  assert.equal(missing.calls.reads.length,1);

  const secondUnknown=fixture({}, {append:async(_batch,attempt)=>{
    if(attempt<=2)throw unknownCommit();
    return nextProgress(claim(source(),0),_batch,true);
  },readProgress:async()=> 'not_committed'});
  await assert.rejects(runMeetingDiscussionUnit(secondUnknown.deps,new AbortController().signal),
    error=>code(error)==='DB_COMMIT_UNKNOWN');
  assert.equal(secondUnknown.calls.appends.length,2);
  assert.equal(secondUnknown.calls.reads.length,2);
  assert.deepEqual(secondUnknown.calls.finishes,['yield']);
});

test('stale readback stops without retry and read errors propagate',async()=>{
  const stale=fixture({}, {append:async()=>{throw unknownCommit();},readProgress:async()=> 'stale'});
  assert.deepEqual(await runMeetingDiscussionUnit(stale.deps,new AbortController().signal),{state:'not_current'});
  assert.equal(stale.calls.appends.length,1);
  assert.equal(stale.calls.reads.length,1);

  const readFailure=new KernelError('DB_UNAVAILABLE','readback unavailable',503);
  const failed=fixture({}, {append:async()=>{throw unknownCommit();},readProgress:async()=>{throw readFailure;}});
  await assert.rejects(runMeetingDiscussionUnit(failed.deps,new AbortController().signal),error=>error===readFailure);
  assert.equal(failed.calls.appends.length,1);
  assert.deepEqual(failed.calls.finishes,['yield']);
});

test('assembly errors finish with a bounded permanent reason before propagating',async()=>{
  const malformed=sourceInput({rawText:'known extra',words:[
    {text:'known',start_ms:START_MS+100,end_ms:START_MS+150},
  ]});
  const f=fixture({source:malformed.input.source,sourceInput:malformed});
  await assert.rejects(runMeetingDiscussionUnit(f.deps,new AbortController().signal),
    error=>code(error)==='DOMAIN_DATA_INVALID');
  assert.deepEqual(f.calls.finishes,['DISCUSSION_ASSEMBLY_INVALID']);
  assert.equal(f.calls.appends.length,0);
});

test('when finish and operation both fail, AggregateError preserves both with operation first',async()=>{
  const original=new KernelError('DB_UNAVAILABLE','append failed',503);
  const cleanup=new KernelError('DB_BUSY','finish failed',503);
  const f=fixture({}, {append:async()=>{throw original;},finish:async()=>{throw cleanup;}});

  await assert.rejects(runMeetingDiscussionUnit(f.deps,new AbortController().signal),error=>error instanceof AggregateError
    &&error.errors.length===2&&error.errors[0]===original&&error.errors[1]===cleanup);
  assert.deepEqual(f.calls.finishes,['yield']);
});
