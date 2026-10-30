import assert from 'node:assert/strict';
import test from 'node:test';

import {KernelError} from '../../../server/errors.js';
import {assembleMeetingDiscussionSource, meetingDiscussionContext,
  type MeetingDiscussionAssemblyInput, type MeetingDiscussionCheckpoint, type MeetingDiscussionSource}
  from '../../../server/meetingDiscussionAssembly.js';
import type {MeetingAsrTranscriptUnit} from '../../../server/meetingAsrWorker.js';

const SOURCE_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEXT_SOURCE_ID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAPTURE_ID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_CAPTURE_ID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SHA='a'.repeat(64);
const SOURCE_SHA='b'.repeat(64);
const DECODED_SHA='c'.repeat(64);
const SOURCE_START_MS=100_000;

type AsrWord=MeetingAsrTranscriptUnit['wordOffsets'][number];
type WordSpec=Pick<AsrWord,'text'|'start_ms'|'end_ms'>;

function expectInvalid(action:()=>unknown):void{
  assert.throws(action,error=>error instanceof KernelError
    &&error.code==='DOMAIN_DATA_INVALID'&&error.httpStatus===409);
}

function source(overrides:Partial<MeetingDiscussionSource>={}):MeetingDiscussionSource{
  return {id:SOURCE_ID,captureId:CAPTURE_ID,sourceVersion:3,segmentIndex:0,startOffsetMs:SOURCE_START_MS,endOffsetMs:SOURCE_START_MS+100_000,
    overlapMs:0,gapBeforeMs:0,sha256:SOURCE_SHA,generation:'42',...overrides};
}

function unit(sourceValue:MeetingDiscussionSource,options:{chunkIndex:number;chunkCount:number;endSample:number;
  rawText:string;words:readonly WordSpec[];decodedSha256?:string}):MeetingAsrTranscriptUnit{
  const startSample=options.chunkIndex*800_000;
  const startOffsetMs=sourceValue.startOffsetMs+startSample/16;
  const endOffsetMs=Math.ceil(sourceValue.startOffsetMs+options.endSample/16);
  return {chunkIndex:options.chunkIndex,chunkCount:options.chunkCount,startSample,endSample:options.endSample,
    decodedSha256:options.decodedSha256??DECODED_SHA,sourceHash:SHA,startOffsetMs,endOffsetMs,rawText:options.rawText,
    wordOffsets:options.words.map((word,index)=>({...word,source_audio_segment_id:sourceValue.id,source_word_index:index}))};
}

function checkpoint(sourceValue:MeetingDiscussionSource,result:MeetingAsrTranscriptUnit,unitIndex:number,
  overrides:Partial<MeetingDiscussionCheckpoint>={}):MeetingDiscussionCheckpoint{
  return {unitIndex,captureId:sourceValue.captureId,sourceVersion:sourceValue.sourceVersion,sourceSegmentId:sourceValue.id,
    sourceSha256:sourceValue.sha256,sourceGeneration:sourceValue.generation,result,...overrides};
}

function oneChunkInput(options:{source?:MeetingDiscussionSource;rawText:string;words:readonly WordSpec[];
  durationMs?:number;firstUnitIndex?:number;firstSegmentIndex?:number}):MeetingDiscussionAssemblyInput{
  const src=options.source??source({endOffsetMs:SOURCE_START_MS+(options.durationMs??50_000)});
  const durationMs=options.durationMs??src.endOffsetMs-src.startOffsetMs;
  const result=unit(src,{chunkIndex:0,chunkCount:1,endSample:durationMs*16,rawText:options.rawText,words:options.words});
  return {source:src,checkpoints:[checkpoint(src,result,options.firstUnitIndex??0)],
    firstUnitIndex:options.firstUnitIndex??0,firstSegmentIndex:options.firstSegmentIndex??0};
}

function twoChunkInput():MeetingDiscussionAssemblyInput{
  const src=source();
  const first=unit(src,{chunkIndex:0,chunkCount:2,endSample:800_000,rawText:'Hello, 世界',words:[
    {text:'Hello',start_ms:149_800,end_ms:149_850},{text:'世界',start_ms:149_900,end_ms:149_950},
  ]});
  const second=unit(src,{chunkIndex:1,chunkCount:2,endSample:1_600_000,rawText:'Again',words:[
    {text:'Again',start_ms:150_000,end_ms:150_100},
  ]});
  return {source:src,checkpoints:[checkpoint(src,first,0),checkpoint(src,second,1)],firstUnitIndex:0,firstSegmentIndex:0};
}

function laterSourceInput(options:{overlapMs:number;gapBeforeMs:number;previousTail?:readonly AsrWord[];
  rawText?:string;words?:readonly WordSpec[];startOffsetMs?:number;endOffsetMs?:number}):MeetingDiscussionAssemblyInput{
  const prior=source({endOffsetMs:10_000,startOffsetMs:0});
  const current=source({id:NEXT_SOURCE_ID,segmentIndex:1,startOffsetMs:options.startOffsetMs??9_500,
    endOffsetMs:options.endOffsetMs??20_000,overlapMs:options.overlapMs,gapBeforeMs:options.gapBeforeMs});
  const durationMs=current.endOffsetMs-current.startOffsetMs;
  const result=unit(current,{chunkIndex:0,chunkCount:1,endSample:durationMs*16,
    rawText:options.rawText??'same same',words:options.words??[
      {text:'same',start_ms:9_500,end_ms:9_600},{text:'same',start_ms:12_000,end_ms:12_100},
    ]});
  return {source:current,checkpoints:[checkpoint(current,result,1)],firstUnitIndex:1,firstSegmentIndex:4,
    previous:{source:prior,tailWords:options.previousTail??[
      {text:'same',start_ms:9_500,end_ms:9_600,source_audio_segment_id:prior.id,source_word_index:0},
    ]}};
}

test('assembles each complete 50-second chunk separately with source-wide word and quote ranges',()=>{
  const input=twoChunkInput();
  const segments=Array.from(assembleMeetingDiscussionSource(input));

  assert.equal(segments.length,2);
  assert.deepEqual(segments.map(segment=>segment.rawText),['Hello, 世界','Again']);
  assert.deepEqual(segments.map(segment=>segment.normalizedText),['Hello, 世界','Again']);
  assert.deepEqual(segments.map(segment=>segment.wordOffsets.map(word=>word.source_word_index)),[[0,1],[2]]);
  assert.deepEqual(segments.map(segment=>segment.wordOffsets.map(word=>word.source_audio_segment_id)),
    [[SOURCE_ID,SOURCE_ID],[SOURCE_ID]]);
  assert.deepEqual(segments.map(segment=>segment.sourceAudioRanges),[
    [{source_audio_segment_id:SOURCE_ID,from_word:0,to_word:1,start_ms:149_800,end_ms:149_950}],
    [{source_audio_segment_id:SOURCE_ID,from_word:2,to_word:2,start_ms:150_000,end_ms:150_100}],
  ]);
  assert.deepEqual(segments.map(segment=>[segment.startOffsetMs,segment.endOffsetMs]),
    [[149_800,149_950],[150_000,150_100]]);
});

test('requires complete ordered checkpoints and matching source hash, generation, version, and decoded audio',()=>{
  const input=twoChunkInput();
  const first=input.checkpoints[0]!;
  const second=input.checkpoints[1]!;
  const reject=(checkpoints:readonly MeetingDiscussionCheckpoint[])=>expectInvalid(()=>
    Array.from(assembleMeetingDiscussionSource({...input,checkpoints})));

  reject([first]);
  reject([second,first]);
  reject([first,{...second,sourceSha256:SHA}]);
  reject([first,{...second,sourceGeneration:'41'}]);
  reject([first,{...second,sourceVersion:2}]);
  reject([first,{...second,captureId:OTHER_CAPTURE_ID}]);
  reject([first,{...second,sourceSegmentId:NEXT_SOURCE_ID}]);
  reject([first,{...second,result:{...second.result,chunkIndex:0}}]);
  reject([first,{...second,result:{...second.result,decodedSha256:SHA}}]);
  expectInvalid(()=>Array.from(assembleMeetingDiscussionSource({...input,
    source:{...input.source,generation:'0'}})));
});

test('rejects a previous source from another capture even when adjacent metadata matches',()=>{
  const input=laterSourceInput({overlapMs:500,gapBeforeMs:0});
  assert.ok(input.previous);
  const crossCapture:MeetingDiscussionAssemblyInput={...input,previous:{...input.previous,
    source:{...input.previous.source,captureId:OTHER_CAPTURE_ID}}};
  expectInvalid(()=>Array.from(assembleMeetingDiscussionSource(crossCapture)));
});

test('preserves punctuation, Unicode, English, deterministic hashes, and caller input',()=>{
  const input=twoChunkInput();
  const before=structuredClone(input);
  const first=Array.from(assembleMeetingDiscussionSource(input));
  const replay=Array.from(assembleMeetingDiscussionSource(input));

  assert.deepEqual(input,before);
  assert.deepEqual(replay,first);
  assert.deepEqual(first.map(segment=>segment.rawText),['Hello, 世界','Again']);
  assert.deepEqual(first.map(segment=>segment.normalizedText),['Hello, 世界','Again']);
  assert.ok(first.every(segment=>/^[a-f0-9]{64}$/u.test(segment.sourceHash)));
  assert.equal(first[0]?.wordOffsets[0]?.text,'Hello');
  assert.equal(first[0]?.wordOffsets[1]?.text,'世界');
  assert.equal(first[1]?.wordOffsets[0]?.text,'Again');
  assert.equal(first[1]?.wordOffsets[0]?.source_word_index,2);
});

test('keeps actual decoded samples within the two-second duration slack and rejects samples beyond it',()=>{
  const src=source({endOffsetMs:SOURCE_START_MS+10_000});
  const withinSlack=unit(src,{chunkIndex:0,chunkCount:1,endSample:192_000,rawText:'tail',words:[
    {text:'tail',start_ms:111_000,end_ms:111_500},
  ]});
  const input:MeetingDiscussionAssemblyInput={source:src,checkpoints:[checkpoint(src,withinSlack,0)],
    firstUnitIndex:0,firstSegmentIndex:0};
  const [segment]=Array.from(assembleMeetingDiscussionSource(input));
  assert.ok(segment);
  assert.equal(segment.wordOffsets[0]?.start_ms,111_000);
  assert.equal(segment.wordOffsets[0]?.end_ms,111_500);
  assert.equal(segment.endOffsetMs,111_500);

  const overSlack=unit(src,{chunkIndex:0,chunkCount:1,endSample:192_001,rawText:'tail',words:[
    {text:'tail',start_ms:111_000,end_ms:111_500},
  ]});
  expectInvalid(()=>Array.from(assembleMeetingDiscussionSource({...input,
    checkpoints:[checkpoint(src,overSlack,0)]})));
});

test('rejects missing word anchors and unanchored non-punctuation text',()=>{
  const missingAnchor=oneChunkInput({rawText:'known',words:[
    {text:'unknown',start_ms:101_000,end_ms:101_100},
  ]});
  const extraRawText=oneChunkInput({rawText:'known extra',words:[
    {text:'known',start_ms:101_000,end_ms:101_100},
  ]});
  expectInvalid(()=>Array.from(assembleMeetingDiscussionSource(missingAnchor)));
  expectInvalid(()=>Array.from(assembleMeetingDiscussionSource(extraRawText)));
});

test('uses NFKC only to align while preserving fullwidth and combining raw text',()=>{
  const rawText='Ｈｅｌｌｏ Cafe\u0301';
  const input=oneChunkInput({rawText,words:[
    {text:'Hello',start_ms:101_000,end_ms:101_100},{text:'Café',start_ms:101_100,end_ms:101_200},
  ]});
  const [segment]=Array.from(assembleMeetingDiscussionSource(input));
  assert.ok(segment);
  assert.equal(segment.rawText,rawText);
  assert.equal(segment.normalizedText,rawText);
  assert.equal(segment.wordOffsets[0]?.text,'Hello');
  assert.equal(segment.wordOffsets[1]?.text,'Café');
});

test('keeps fractional word times and applies the 30-second bound after integer rounding',()=>{
  const atBound=oneChunkInput({rawText:'bounded',words:[
    {text:'bounded',start_ms:SOURCE_START_MS+0.25,end_ms:SOURCE_START_MS+30_000},
  ]});
  const [segment]=Array.from(assembleMeetingDiscussionSource(atBound));
  assert.ok(segment);
  assert.equal(segment.endOffsetMs-segment.startOffsetMs,30_000);
  assert.equal(segment.wordOffsets[0]?.start_ms,SOURCE_START_MS+0.25);
  assert.equal(segment.wordOffsets[0]?.end_ms,SOURCE_START_MS+30_000);

  const overBound=oneChunkInput({rawText:'bounded',words:[
    {text:'bounded',start_ms:SOURCE_START_MS+0.25,end_ms:SOURCE_START_MS+30_000.01},
  ]});
  expectInvalid(()=>Array.from(assembleMeetingDiscussionSource(overBound)));
});

test('splits at sentence punctuation and an 800ms pause without gluing English words',()=>{
  const sentence=oneChunkInput({rawText:'Hello. world!',words:[
    {text:'Hello',start_ms:101_000,end_ms:101_100},{text:'world',start_ms:101_500,end_ms:101_700},
  ]});
  const sentenceSegments=Array.from(assembleMeetingDiscussionSource(sentence));
  assert.deepEqual(sentenceSegments.map(item=>item.rawText),['Hello. ','world!']);
  assert.deepEqual(sentenceSegments.map(item=>item.normalizedText),['Hello. ','world!']);

  const pause=oneChunkInput({rawText:'before after',words:[
    {text:'before',start_ms:101_000,end_ms:101_100},{text:'after',start_ms:101_900,end_ms:102_000},
  ]});
  assert.deepEqual(Array.from(assembleMeetingDiscussionSource(pause)).map(item=>item.rawText),['before ','after']);
});

test('splits when one discussion would exceed 30 seconds or 800 Unicode codepoints',()=>{
  const long=oneChunkInput({rawText:'long next',words:[
    {text:'long',start_ms:SOURCE_START_MS,end_ms:SOURCE_START_MS+30_000},
    {text:'next',start_ms:SOURCE_START_MS+30_000,end_ms:SOURCE_START_MS+30_100},
  ]});
  const longSegments=Array.from(assembleMeetingDiscussionSource(long));
  assert.deepEqual(longSegments.map(item=>item.rawText),['long ','next']);
  assert.ok(longSegments.every(item=>item.endOffsetMs-item.startOffsetMs<=30_000));

  const emoji='😀'.repeat(400),unicode='é'.repeat(400);
  const byCodepoint=oneChunkInput({rawText:`${emoji} ${unicode}`,words:[
    {text:emoji,start_ms:101_000,end_ms:101_100},{text:unicode,start_ms:101_100,end_ms:101_200},
  ]});
  const codepointSegments=Array.from(assembleMeetingDiscussionSource(byCodepoint));
  assert.deepEqual(codepointSegments.map(item=>Array.from(item.rawText).length),[401,400]);
  assert.ok(codepointSegments.every(item=>Array.from(item.rawText).length<=800));
});

test('deduplicates only a unique matching word in the actual adjacent-source overlap',()=>{
  const input=laterSourceInput({overlapMs:500,gapBeforeMs:0});
  const [segment]=Array.from(assembleMeetingDiscussionSource(input));
  assert.ok(segment);
  assert.equal(segment.rawText,'same');
  assert.equal(segment.wordOffsets.length,1);
  assert.equal(segment.wordOffsets[0]?.start_ms,12_000);
  assert.equal(segment.wordOffsets[0]?.source_word_index,1);
  assert.deepEqual(segment.sourceAudioRanges,[{source_audio_segment_id:NEXT_SOURCE_ID,from_word:1,to_word:1,
    start_ms:12_000,end_ms:12_100}]);
});

test('retains words when overlap geometry is mismatched, interrupted by a gap, or ambiguous',()=>{
  const mismatch=laterSourceInput({overlapMs:400,gapBeforeMs:0});
  const ambiguousTail:AsrWord[]=[
    {text:'same',start_ms:9_500,end_ms:9_600,source_audio_segment_id:SOURCE_ID,source_word_index:0},
    {text:'same',start_ms:9_500,end_ms:9_600,source_audio_segment_id:SOURCE_ID,source_word_index:1},
  ];
  const ambiguous=laterSourceInput({overlapMs:500,gapBeforeMs:0,previousTail:ambiguousTail,
    rawText:'same',words:[{text:'same',start_ms:9_500,end_ms:9_600}]});
  const interrupted=laterSourceInput({overlapMs:500,gapBeforeMs:1});

  for(const input of [mismatch,ambiguous,interrupted]){
    const [segment]=Array.from(assembleMeetingDiscussionSource(input));
    assert.ok(segment);
    assert.equal(segment.wordOffsets[0]?.start_ms,9_500);
  }
  assert.equal(Array.from(assembleMeetingDiscussionSource(mismatch)).reduce((count,item)=>count+item.wordOffsets.length,0),2);
  assert.equal(Array.from(assembleMeetingDiscussionSource(ambiguous)).reduce((count,item)=>count+item.wordOffsets.length,0),1);
});

test('case or width differences never authorize overlap word deletion',()=>{
  for(const text of ['Same','ｓａｍｅ']){
    const input=laterSourceInput({overlapMs:500,gapBeforeMs:0,previousTail:[
      {text,start_ms:9_500,end_ms:9_600,source_audio_segment_id:SOURCE_ID,source_word_index:0},
    ]});
    const segments=Array.from(assembleMeetingDiscussionSource(input));
    assert.equal(segments.flatMap(segment=>segment.wordOffsets).length,2);
    assert.equal(segments[0]?.wordOffsets[0]?.source_word_index,0);
  }
});

test('keeps source timeline gaps and legal empty speech without invented timestamps',()=>{
  const gapInput=laterSourceInput({overlapMs:0,gapBeforeMs:1_000,startOffsetMs:11_000,endOffsetMs:21_000,
    rawText:'gap',words:[{text:'gap',start_ms:11_000,end_ms:11_200}]});
  const [gapSegment]=Array.from(assembleMeetingDiscussionSource(gapInput));
  assert.ok(gapSegment);
  assert.equal(gapSegment.startOffsetMs,11_000);
  assert.equal(gapSegment.wordOffsets[0]?.start_ms,11_000);
  assert.equal(gapSegment.endOffsetMs,11_200);

  const silence=oneChunkInput({rawText:'',words:[]});
  assert.deepEqual(Array.from(assembleMeetingDiscussionSource(silence)),[]);
});

test('keeps adjacent context separate and bounds each side by 400 Unicode codepoints',()=>{
  const previous=`older${'😀'.repeat(400)}tail`;
  const next=`${'界'.repeat(401)}after`;
  const context=meetingDiscussionContext(previous,next);

  assert.deepEqual(Object.keys(context),['previous','next']);
  assert.equal(context.previous,`${'😀'.repeat(396)}tail`);
  assert.equal(context.next,'界'.repeat(400));
  assert.equal(Array.from(context.previous).length,400);
  assert.equal(Array.from(context.next).length,400);
});
