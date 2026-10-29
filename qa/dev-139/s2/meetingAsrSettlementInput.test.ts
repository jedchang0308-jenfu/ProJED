import assert from 'node:assert/strict';
import test from 'node:test';

import {KernelError} from '../../../server/errors.js';
import {normalizeMeetingAsrSettlementInput} from '../../../server/meetingAsrSettlementInput.js';
import type {MeetingAsrSettlement, MeetingAsrTranscriptUnit} from '../../../server/meetingAsrWorker.js';

const SHA='a'.repeat(64);
const SEGMENT_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function transcript(overrides:Partial<MeetingAsrTranscriptUnit>={}):MeetingAsrTranscriptUnit{
  return {
    chunkIndex:0,chunkCount:1,startSample:0,endSample:16_001,decodedSha256:SHA,sourceHash:'b'.repeat(64),
    startOffsetMs:10_000,endOffsetMs:11_001,rawText:'',wordOffsets:[],...overrides,
  };
}

function expectInvalid(value:unknown):void{
  assert.throws(()=>normalizeMeetingAsrSettlementInput(value as MeetingAsrSettlement),error=>
    error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID'&&error.httpStatus===409);
}

test('recognized settlement keeps JSON-safe transcript and exact charge metadata only',()=>{
  const input={kind:'recognized' as const,transcript:transcript({rawText:'recognized text'}),
    totalBilledTime:'1s',providerRequestId:'123456789'};
  const normalized=normalizeMeetingAsrSettlementInput(input);
  assert.deepEqual(normalized,{kind:'recognized',transcript:input.transcript,chargeMicros:'16000',chargeSource:'provider_metadata'});
  assert.equal(Object.hasOwn(normalized,'providerRequestId'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)),normalized);
});

test('missing billed time prices exact sent samples with the validated PCM upper bound',()=>{
  const normalized=normalizeMeetingAsrSettlementInput({kind:'recognized',transcript:transcript()});
  assert.equal(normalized.kind,'recognized');
  if(normalized.kind!=='recognized')return;
  assert.equal(normalized.chargeMicros,'32000');
  assert.equal(normalized.chargeSource,'validated_pcm_upper_bound');
});

test('preserves fractional millisecond word offsets and allows silence words',()=>{
  const item=transcript({rawText:'hi',wordOffsets:[
    {text:'hi',start_ms:10_000.125,end_ms:10_000.875,source_audio_segment_id:SEGMENT_ID,source_word_index:0},
    {text:'silence',start_ms:10_000.875,end_ms:10_000.875,source_audio_segment_id:SEGMENT_ID,source_word_index:1},
  ]});
  const normalized=normalizeMeetingAsrSettlementInput({kind:'recognized',transcript:item});
  assert.equal(normalized.kind,'recognized');
  if(normalized.kind!=='recognized')return;
  assert.deepEqual(normalized.transcript.wordOffsets,item.wordOffsets);
});

test('normalizes failure outcomes to kind and bounded safe code',()=>{
  for(const value of [
    {kind:'not_sent',code:'ASR_AUTH_UNAVAILABLE'},
    {kind:'rejected_unbilled',code:'ASR_PROVIDER_REJECTED'},
    {kind:'usage_unknown',code:'ASR_UNIT_UNAVAILABLE'},
  ]){
    const result=normalizeMeetingAsrSettlementInput(value as MeetingAsrSettlement);
    assert.deepEqual(result,value);
    assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
  }
});

test('rejects extra own keys, accessors, symbols and malformed failure codes',()=>{
  expectInvalid({kind:'usage_unknown',code:'ASR_FAILURE',private:'secret'});
  expectInvalid({kind:'usage_unknown',code:'lowercase'});
  expectInvalid({kind:'usage_unknown',code:'a'.repeat(81)});
  expectInvalid({kind:'rejected_unbilled',code:'OTHER_FAILURE'});
  expectInvalid({kind:'not_sent',code:'ASR_FAILURE',transcript:transcript()});
  const symbolKey=Object.assign({kind:'usage_unknown',code:'ASR_FAILURE'},{[Symbol('extra')]:true});
  expectInvalid(symbolKey);
  const accessor={kind:'usage_unknown',code:'ASR_FAILURE'};
  Object.defineProperty(accessor,'extra',{get(){throw new Error('must not read accessor');}});
  expectInvalid(accessor);
});

test('rejects malformed dispatch metadata, transcript text/hash and billed duration',()=>{
  for(const item of [
    transcript({decodedSha256:SHA.toUpperCase()}),
    transcript({sourceHash:'g'.repeat(64)}),
    transcript({rawText:'bad\0text'}),
    transcript({rawText:'x'.repeat(128_001)}),
    transcript({endOffsetMs:11_000}),
  ])expectInvalid({kind:'recognized',transcript:item});
  expectInvalid({kind:'recognized',transcript:transcript(),totalBilledTime:'3s'});
  expectInvalid({kind:'recognized',transcript:transcript(),totalBilledTime:'not-duration'});
});

test('enforces exact transcript and word shapes, bounds and sequential source word indexes',()=>{
  const extraTranscript={...transcript(),extra:true};
  const extraWord={text:'x',start_ms:10_000,end_ms:10_001,source_audio_segment_id:SEGMENT_ID,source_word_index:0,extra:true};
  const validWord={text:'x',start_ms:10_000,end_ms:10_001,source_audio_segment_id:SEGMENT_ID,source_word_index:0};
  for(const item of [
    extraTranscript,
    transcript({wordOffsets:[{...validWord,text:'x'.repeat(1_001)}]}),
    transcript({wordOffsets:[{...validWord,text:'x\0'}]}),
    transcript({wordOffsets:[{...validWord,source_audio_segment_id:'not-a-uuid'}]}),
    transcript({wordOffsets:[{...validWord,source_word_index:1}]}),
    transcript({wordOffsets:[{...validWord,start_ms:9_999.999}]}),
    transcript({wordOffsets:[{...validWord,end_ms:11_002}]}),
    transcript({wordOffsets:[{...validWord,start_ms:Number.NaN}]}),
    transcript({wordOffsets:[{...validWord,end_ms:Number.MAX_SAFE_INTEGER+1}]}),
    transcript({wordOffsets:[extraWord]}),
  ])expectInvalid({kind:'recognized',transcript:item});
});

test('matches provider UTF-16 text and word limits without reducing accepted payload size',()=>{
  const maximumRawText='😀'.repeat(64_000);
  const normalized=normalizeMeetingAsrSettlementInput({kind:'recognized',transcript:transcript({rawText:maximumRawText})});
  assert.equal(normalized.kind,'recognized');
  if(normalized.kind==='recognized')assert.equal(normalized.transcript.rawText.length,128_000);
  expectInvalid({kind:'recognized',transcript:transcript({rawText:`${maximumRawText}x`})});
  assert.doesNotThrow(()=>normalizeMeetingAsrSettlementInput({kind:'recognized',transcript:transcript({
    wordOffsets:[{text:'😀'.repeat(500),start_ms:10_000,end_ms:10_000,
      source_audio_segment_id:SEGMENT_ID,source_word_index:0}],
  })}));
  expectInvalid({kind:'recognized',transcript:transcript({wordOffsets:[{text:'😀'.repeat(501),start_ms:10_000,end_ms:10_000,
    source_audio_segment_id:SEGMENT_ID,source_word_index:0}]})});
});

test('accepts the provider word count limit and rejects one more word',()=>{
  const words=Array.from({length:50_000},(_,index)=>({text:'x',start_ms:10_000,end_ms:10_000,
    source_audio_segment_id:SEGMENT_ID,source_word_index:index}));
  const normalized=normalizeMeetingAsrSettlementInput({kind:'recognized',transcript:transcript({wordOffsets:words})});
  assert.equal(normalized.kind,'recognized');
  if(normalized.kind==='recognized')assert.equal(normalized.transcript.wordOffsets.length,50_000);
  expectInvalid({kind:'recognized',transcript:transcript({wordOffsets:[...words,
    {text:'x',start_ms:10_000,end_ms:10_000,source_audio_segment_id:SEGMENT_ID,source_word_index:50_000}]})});
});
