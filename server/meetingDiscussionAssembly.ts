import {createHash} from 'node:crypto';
import {KernelError} from './errors.js';
import {validateMeetingAsrDispatchInput} from './meetingAsrDispatchInput.js';
import {normalizeMeetingAsrTranscriptUnit} from './meetingAsrSettlementInput.js';
import type {MeetingAsrTranscriptUnit} from './meetingAsrWorker.js';
import {requireUuid} from './meetingCaptureInput.js';

export const MEETING_DISCUSSION_CONFIG_VERSION='dev139.discussion.v1';
const MAX_DISCUSSION_MS=30_000,MAX_DISCUSSION_CHARACTERS=800,PAUSE_MS=800;
const SHA=/^[a-f0-9]{64}$/u,GENERATION=/^[1-9][0-9]{0,18}$/u;
type AsrWord=MeetingAsrTranscriptUnit['wordOffsets'][number];

export interface MeetingDiscussionSource {
  readonly id:string;readonly captureId:string;readonly sourceVersion:number;readonly segmentIndex:number;
  readonly startOffsetMs:number;readonly endOffsetMs:number;readonly overlapMs:number;readonly gapBeforeMs:number;
  readonly sha256:string;readonly generation:string;
}
export interface MeetingDiscussionCheckpoint {
  readonly unitIndex:number;readonly captureId:string;readonly sourceVersion:number;readonly sourceSegmentId:string;
  /** Original verified proof from the unit's stored ASR manifest, not client input. */
  readonly sourceSha256:string;readonly sourceGeneration:string;readonly result:MeetingAsrTranscriptUnit;
}
export interface MeetingDiscussionAssemblyInput {
  readonly source:MeetingDiscussionSource;readonly checkpoints:readonly MeetingDiscussionCheckpoint[];
  readonly firstUnitIndex:number;readonly firstSegmentIndex:number;
  readonly previous?:{readonly source:MeetingDiscussionSource;readonly tailWords:readonly AsrWord[]};
}
export interface MeetingDiscussionSegment {
  readonly segmentIndex:number;readonly rawText:string;readonly normalizedText:string;
  readonly startOffsetMs:number;readonly endOffsetMs:number;readonly wordOffsets:readonly AsrWord[];
  readonly sourceAudioRanges:readonly {readonly source_audio_segment_id:string;readonly from_word:number;
    readonly to_word:number;readonly start_ms:number;readonly end_ms:number}[];
  readonly sourceHash:string;
}
interface AlignedWord {readonly word:AsrWord;readonly raw:string;readonly checkpointHash:string;readonly chunkIndex:number}

function invalid():never{throw new KernelError('DOMAIN_DATA_INVALID','Meeting discussion source or word coverage is invalid',409);}
function counter(value:number,max=2_147_483_647):void{if(!Number.isSafeInteger(value)||value<0||value>max)invalid();}
function validateSource(source:MeetingDiscussionSource):void{
  requireUuid(source.id,'sourceId');requireUuid(source.captureId,'captureId');counter(source.sourceVersion);if(source.sourceVersion===0)invalid();
  counter(source.segmentIndex,4095);counter(source.startOffsetMs,Number.MAX_SAFE_INTEGER);
  counter(source.endOffsetMs,Number.MAX_SAFE_INTEGER);
  if(source.endOffsetMs<=source.startOffsetMs||source.endOffsetMs-source.startOffsetMs>302_000
    ||!Number.isSafeInteger(source.endOffsetMs+2000)||!SHA.test(source.sha256)||!GENERATION.test(source.generation))invalid();
  counter(source.overlapMs,500);counter(source.gapBeforeMs,Number.MAX_SAFE_INTEGER);
}
function fold(text:string):string{return text.normalize('NFKC').toLowerCase().replace(/\s/gu,'');}
function punctuationOnly(text:string):boolean{return /^[\s\p{P}]*$/u.test(text);}

/** Match real provider words to raw text. Only whitespace/punctuation may be
 * unanchored; a missing word fails instead of inventing a time or dropping text. */
export function alignMeetingWordText(rawText:string,words:readonly Pick<AsrWord,'text'>[]):readonly {start:number;end:number}[]{
  if(words.length===0){if(rawText!=='')invalid();return [];}
  const starts:number[]=[],ends:number[]=[];let normalized='';
  for(const grapheme of new Intl.Segmenter('und',{granularity:'grapheme'}).segment(rawText)){
    const text=fold(grapheme.segment);normalized+=text;
    for(let index=0;index<text.length;index++){starts.push(grapheme.index);ends.push(grapheme.index+grapheme.segment.length);}
  }
  const matches:{start:number;end:number}[]=[];let cursor=0,previousRawEnd=0;
  for(const word of words){
    const token=fold(word.text);if(token.length===0)invalid();
    const found=normalized.indexOf(token,cursor);if(found<0)invalid();
    const last=found+token.length-1,start=starts[found],end=ends[last];
    if(start===undefined||end===undefined||start<previousRawEnd
      ||(found>0&&starts[found-1]===start)||(last+1<starts.length&&starts[last+1]===starts[last])
      ||!punctuationOnly(rawText.slice(previousRawEnd,start)))invalid();
    matches.push({start,end});cursor=last+1;previousRawEnd=end;
  }
  if(!punctuationOnly(rawText.slice(previousRawEnd)))invalid();
  return matches;
}

function align(unit:MeetingAsrTranscriptUnit,sourceWordBase:number):AlignedWord[]{
  const matches=alignMeetingWordText(unit.rawText,unit.wordOffsets);
  return unit.wordOffsets.map((word,index)=>{
    const raw=unit.rawText.slice(index===0?0:matches[index]!.start,matches[index+1]?.start??unit.rawText.length);
    if(Array.from(raw).length>MAX_DISCUSSION_CHARACTERS||Math.ceil(word.end_ms)-Math.floor(word.start_ms)>MAX_DISCUSSION_MS)invalid();
    return {word:{...word,source_word_index:sourceWordBase+index},raw,checkpointHash:unit.sourceHash,chunkIndex:unit.chunkIndex};
  });
}

function overlapPrefix(words:readonly AlignedWord[],previous:NonNullable<MeetingDiscussionAssemblyInput['previous']>,
  source:MeetingDiscussionSource):number{
  const prior=previous.source,start=Math.max(prior.startOffsetMs,source.startOffsetMs),end=Math.min(prior.endOffsetMs,source.endOffsetMs);
  // Unknown/mismatched geometry retains words. It cannot authorize deletion.
  if(end<=start||end-start!==source.overlapMs||source.gapBeforeMs!==0)return 0;
  const inOverlap=(word:AsrWord)=>word.start_ms>=start&&word.end_ms<=end;
  const tail=previous.tailWords.filter(inOverlap);
  const prefix:AlignedWord[]=[];for(const word of words){if(!inOverlap(word.word))break;prefix.push(word);}
  const same=(left:AsrWord,right:AsrWord)=>left.text===right.text
    &&(Math.max(left.start_ms,right.start_ms)<Math.min(left.end_ms,right.end_ms)
      ||(left.start_ms===right.start_ms&&left.end_ms===right.end_ms));
  if(!prefix.length)return 0;
  let candidate=-1;
  for(let index=0;index<tail.length;index++)if(same(prefix[0]!.word,tail[index]!)){
    if(candidate!==-1)return 0;candidate=index; // Ambiguous timing retains both utterances.
  }
  if(candidate===-1||tail.length-candidate>prefix.length)return 0;
  const count=tail.length-candidate;
  return prefix.slice(0,count).every((item,index)=>same(item.word,tail[candidate+index]!))?count:0;
}

function prepare(input:MeetingDiscussionAssemblyInput):AlignedWord[]{
  try{
    const {source,checkpoints,previous}=input;validateSource(source);
    counter(input.firstUnitIndex,28671);counter(input.firstSegmentIndex);
    if(!Array.isArray(checkpoints)||checkpoints.length<1||checkpoints.length>7)invalid();
    if(source.segmentIndex===0){if(previous||input.firstUnitIndex!==0||input.firstSegmentIndex!==0||source.overlapMs!==0)invalid();}
    else{
      if(!previous)invalid();validateSource(previous.source);
      if(previous.source.id===source.id||previous.source.segmentIndex!==source.segmentIndex-1
        ||previous.source.captureId!==source.captureId
        ||previous.source.sourceVersion!==source.sourceVersion||source.startOffsetMs<previous.source.startOffsetMs
        ||previous.tailWords.length>350_000)invalid();
      let priorIndex=-1,priorStart=-1;
      for(const word of previous.tailWords){
        if(word.source_audio_segment_id!==previous.source.id||typeof word.text!=='string'||!word.text.length
          ||!Number.isFinite(word.start_ms)||!Number.isFinite(word.end_ms)||word.end_ms<word.start_ms
          ||word.start_ms<previous.source.startOffsetMs||word.end_ms>previous.source.endOffsetMs+2000
          ||word.start_ms<priorStart||!Number.isSafeInteger(word.source_word_index)||word.source_word_index<=priorIndex)invalid();
        priorIndex=word.source_word_index;priorStart=word.start_ms;
      }
    }
    const words:AlignedWord[]=[];let sourceWordBase=0,decodedHash:string|undefined,previousStart=-1;
    for(let index=0;index<checkpoints.length;index++){
      const checkpoint=checkpoints[index]!;
      counter(checkpoint.unitIndex,28671);
      if(checkpoint.unitIndex!==input.firstUnitIndex+index||checkpoint.sourceVersion!==source.sourceVersion
        ||checkpoint.captureId!==source.captureId
        ||checkpoint.sourceSegmentId!==source.id||checkpoint.sourceSha256!==source.sha256||checkpoint.sourceGeneration!==source.generation)invalid();
      const unit=normalizeMeetingAsrTranscriptUnit(checkpoint.result);
      if(unit.chunkIndex!==index||unit.chunkCount!==checkpoints.length||(decodedHash!==undefined&&unit.decodedSha256!==decodedHash))invalid();
      decodedHash=unit.decodedSha256;
      const {rawText:_raw,wordOffsets:_words,sourceHash:_hash,...dispatch}=unit;void _raw;void _words;void _hash;
      validateMeetingAsrDispatchInput(dispatch,{startOffsetMs:source.startOffsetMs,metadataDurationMs:source.endOffsetMs-source.startOffsetMs});
      for(const word of unit.wordOffsets){
        if(word.source_audio_segment_id!==source.id||word.start_ms<previousStart)invalid();previousStart=word.start_ms;
      }
      const aligned=align(unit,sourceWordBase);sourceWordBase+=unit.wordOffsets.length;
      for(const word of aligned)words.push(word);
    }
    return previous?words.slice(overlapPrefix(words,previous,source)):words;
  }catch(error){
    if(error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID')throw error;
    return invalid();
  }
}

function segment(items:readonly AlignedWord[],segmentIndex:number):MeetingDiscussionSegment{
  counter(segmentIndex);
  const first=items[0]!.word,last=items[items.length-1]!.word;
  const rawText=items.map(item=>item.raw).join('');
  const wordOffsets=items.map(item=>({...item.word}));
  const sourceAudioRanges=[{source_audio_segment_id:first.source_audio_segment_id,from_word:first.source_word_index,
    to_word:last.source_word_index,start_ms:first.start_ms,end_ms:Math.max(...wordOffsets.map(word=>word.end_ms))}];
  const sourceHash=createHash('sha256').update(JSON.stringify({config:MEETING_DISCUSSION_CONFIG_VERSION,
    checkpointHashes:[...new Set(items.map(item=>item.checkpointHash))],rawText,wordOffsets,sourceAudioRanges})).digest('hex');
  // Identity normalization gives an exact raw mapping and preserves negation,
  // punctuation and code points. Retrieval may derive a separate query later.
  return {segmentIndex,rawText,normalizedText:rawText,startOffsetMs:Math.floor(first.start_ms),
    endOffsetMs:Math.max(Math.floor(first.start_ms)+1,Math.ceil(Math.max(...wordOffsets.map(word=>word.end_ms)))),
    wordOffsets,sourceAudioRanges,sourceHash};
}

/** One verified upload source at a time (<=7 chunks), never a whole-meeting
 * transcript in memory. Consumers can persist bounded batches from this iterator.
 * This assembles content only; it never publishes a revision or marks a run ready. */
export function* assembleMeetingDiscussionSource(input:MeetingDiscussionAssemblyInput):Generator<MeetingDiscussionSegment>{
  const words=prepare(input);let current:AlignedWord[]=[],characters=0,index=input.firstSegmentIndex,currentEnd=0;
  for(let wordIndex=0;wordIndex<words.length;wordIndex++){
    const item=words[wordIndex]!,length=Array.from(item.raw).length;
    // Keep provider chunk text independent: no invented separator or merged
    // English word at a chunk seam. Adjacent context remains a separate input.
    if(current.length&&(current[current.length-1]!.chunkIndex!==item.chunkIndex
      ||Math.ceil(Math.max(currentEnd,item.word.end_ms))-Math.floor(current[0]!.word.start_ms)>MAX_DISCUSSION_MS
      ||characters+length>MAX_DISCUSSION_CHARACTERS)){
      yield segment(current,index++);current=[];characters=0;currentEnd=0;
    }
    if(length>MAX_DISCUSSION_CHARACTERS)invalid();
    current.push(item);characters+=length;currentEnd=Math.max(currentEnd,item.word.end_ms);
    const next=words[wordIndex+1];
    if(/[。！？.!?][\s\p{P}]*$/u.test(item.raw)||(next&&next.word.start_ms-item.word.end_ms>=PAUSE_MS)){
      yield segment(current,index++);current=[];characters=0;currentEnd=0;
    }
  }
  if(current.length)yield segment(current,index);
}

/** Adjacent discussion context is separate from the current segment's evidence. */
export function meetingDiscussionContext(previousRawText:string|undefined,nextRawText:string|undefined){
  return {previous:previousRawText===undefined?'':Array.from(previousRawText).slice(-400).join(''),
    next:nextRawText===undefined?'':Array.from(nextRawText).slice(0,400).join('')};
}
