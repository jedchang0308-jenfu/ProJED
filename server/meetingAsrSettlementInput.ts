import {KernelError} from './errors.js';
import {estimateSuccessfulGoogleCloudSpeechV1Charge} from './googleCloudSpeechPricing.js';
import {validateMeetingAsrDispatchInput, type MeetingAsrDispatchUnit} from './meetingAsrDispatchInput.js';
import type {MeetingAsrSettlement, MeetingAsrTranscriptUnit} from './meetingAsrWorker.js';

const SHA256_RE=/^[a-f0-9]{64}$/u;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CODE_RE=/^[A-Z0-9_]{1,80}$/u;
const MAX_RAW_TEXT_CODE_UNITS=128_000;
const MAX_WORD_CODE_UNITS=1_000;
const MAX_WORDS=50_000;
const MAX_SAFE_TIME=Number.MAX_SAFE_INTEGER;

const TRANSCRIPT_KEYS=Object.freeze([
  'chunkIndex','chunkCount','startSample','endSample','decodedSha256','sourceHash',
  'startOffsetMs','endOffsetMs','rawText','wordOffsets',
]);
const WORD_KEYS=Object.freeze(['text','start_ms','end_ms','source_audio_segment_id','source_word_index']);

export type NormalizedMeetingAsrSettlement =
  | {readonly kind:'recognized';readonly transcript:MeetingAsrTranscriptUnit;
      readonly chargeMicros:string;readonly chargeSource:'provider_metadata'|'validated_pcm_upper_bound'}
  | {readonly kind:'not_sent'|'rejected_unbilled'|'usage_unknown';readonly code:string};

function invalid():never{
  throw new KernelError('DOMAIN_DATA_INVALID','Meeting ASR settlement input is invalid',409);
}

function exactRecord(value:unknown,allowed:readonly string[],required:readonly string[]):Record<string,unknown>{
  if(typeof value!=='object'||value===null||Array.isArray(value))invalid();
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)invalid();
  const keys=Reflect.ownKeys(value);
  if(keys.some(key=>typeof key!=='string'||!allowed.includes(key)))invalid();
  for(const key of required)if(!Object.hasOwn(value,key))invalid();
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value'))invalid();
  }
  return value as Record<string,unknown>;
}

function exactArray(value:unknown,maxLength:number):unknown[]{
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maxLength)invalid();
  const keys=Reflect.ownKeys(value);
  if(keys.length!==value.length+1||!keys.includes('length'))invalid();
  const items:unknown[]=[];
  for(let index=0;index<value.length;index++){
    const key=String(index);
    if(!Object.hasOwn(value,key))invalid();
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value'))invalid();
    items.push(descriptor.value);
  }
  return items;
}

function normalizeTranscript(input:unknown):MeetingAsrTranscriptUnit{
  const value=exactRecord(input,TRANSCRIPT_KEYS,TRANSCRIPT_KEYS);
  const dispatch:MeetingAsrDispatchUnit=validateMeetingAsrDispatchInput({
    chunkIndex:value.chunkIndex,
    chunkCount:value.chunkCount,
    startSample:value.startSample,
    endSample:value.endSample,
    decodedSha256:value.decodedSha256,
    startOffsetMs:value.startOffsetMs,
    endOffsetMs:value.endOffsetMs,
  });
  const sourceHash=value.sourceHash;
  const rawText=value.rawText;
  if(typeof sourceHash!=='string'||!SHA256_RE.test(sourceHash)
      ||typeof rawText!=='string'||rawText.includes('\0')||rawText.length>MAX_RAW_TEXT_CODE_UNITS)invalid();

  const wordValues=exactArray(value.wordOffsets,MAX_WORDS);
  if(rawText.length>0&&wordValues.length===0)invalid();
  const wordOffsets:MeetingAsrTranscriptUnit['wordOffsets'][number][]=[];
  let previousStartMs=-1;
  for(let index=0;index<wordValues.length;index++){
    const word=exactRecord(wordValues[index],WORD_KEYS,WORD_KEYS);
    const text=word.text;
    const start=word.start_ms;
    const end=word.end_ms;
    const segmentId=word.source_audio_segment_id;
    const sourceWordIndex=word.source_word_index;
    if(typeof text!=='string'||text.length===0||text.length>MAX_WORD_CODE_UNITS||text.includes('\0'))invalid();
    if(typeof start!=='number'||!Number.isFinite(start)||start<0||start>MAX_SAFE_TIME
        ||typeof end!=='number'||!Number.isFinite(end)||end<start||end>MAX_SAFE_TIME
        ||start<dispatch.startOffsetMs||end>dispatch.endOffsetMs
        ||start<previousStartMs-0.000001
        ||typeof segmentId!=='string'||!UUID_RE.test(segmentId)
        ||!Number.isSafeInteger(sourceWordIndex)||sourceWordIndex!==index)invalid();
    wordOffsets.push({text,start_ms:start,end_ms:end,source_audio_segment_id:segmentId,source_word_index:index});
    previousStartMs=start;
  }

  return {
    ...dispatch,
    sourceHash,
    rawText,
    wordOffsets,
  };
}

function normalize(value:unknown):NormalizedMeetingAsrSettlement{
  const record=exactRecord(value,
    ['kind','transcript','totalBilledTime','providerRequestId','code'],['kind']);
  if(record.kind==='recognized'){
    if(!Object.hasOwn(record,'transcript')||Object.hasOwn(record,'code'))invalid();
    const transcript=normalizeTranscript(record.transcript);
    const billedTime=record.totalBilledTime;
    const requestId=record.providerRequestId;
    if(billedTime!==undefined&&typeof billedTime!=='string')invalid();
    if(requestId!==undefined&&typeof requestId!=='string')invalid();
    const estimate=estimateSuccessfulGoogleCloudSpeechV1Charge({
      pcmSamples16k:BigInt(transcript.endSample-transcript.startSample),
      ...(billedTime===undefined?{}:{billedTime}),
    });
    return {
      kind:'recognized',transcript,chargeMicros:estimate.microTwd.toString(),chargeSource:estimate.source,
    };
  }
  if(record.kind==='not_sent'||record.kind==='rejected_unbilled'||record.kind==='usage_unknown'){
    if(!Object.hasOwn(record,'code')||Object.hasOwn(record,'transcript')
        ||Object.hasOwn(record,'totalBilledTime')||Object.hasOwn(record,'providerRequestId'))invalid();
    const code=record.code;
    if(typeof code!=='string'||!CODE_RE.test(code)
        ||(record.kind==='rejected_unbilled'&&code!=='ASR_PROVIDER_REJECTED'))invalid();
    return {kind:record.kind,code};
  }
  return invalid();
}

/** Validate and copy a worker settlement into a JSON-safe, content-limited result. */
export function normalizeMeetingAsrSettlementInput(result:MeetingAsrSettlement):NormalizedMeetingAsrSettlement{
  try{
    return normalize(result);
  }catch(error){
    if(error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID'&&error.httpStatus===409)throw error;
    return invalid();
  }
}
