import type {MeetingDiscussionAssemblyInput,MeetingDiscussionSegment} from './meetingDiscussionAssembly.js';
import {assembleMeetingDiscussionSource} from './meetingDiscussionAssembly.js';
import {KernelError} from './errors.js';
import {requireUuid} from './meetingCaptureInput.js';

export interface MeetingDiscussionProgress {
  readonly sourceIndex:number;readonly sourceFirstSegmentIndex:number;readonly nextSegmentIndex:number;
  readonly nextWordIndex:number;readonly deduplicatedPrefixWords:number|null;readonly done:boolean;
}
export interface MeetingDiscussionClaim extends MeetingDiscussionProgress {
  readonly runId:string;readonly captureId:string;readonly transcriptRevisionId:string;readonly sourceVersion:number;
  readonly leaseToken:string;readonly leaseExpiresAtMs:number;
}
export interface MeetingDiscussionSourceInput {
  readonly input:MeetingDiscussionAssemblyInput;readonly totalSourceWords:number;readonly lastSegmentHash:string|null;
}
export interface MeetingDiscussionBatch {
  readonly sourceId:string;readonly sourceIndex:number;readonly sourceFirstSegmentIndex:number;
  readonly expectedNextSegmentIndex:number;readonly deduplicatedPrefixWords:number;
  readonly sourceDone:boolean;readonly segments:readonly MeetingDiscussionSegment[];
}
export type MeetingDiscussionFinishReason='yield'|'DISCUSSION_SESSION_UNAVAILABLE'|'DISCUSSION_SOURCE_UNAVAILABLE'
  |'DISCUSSION_DEADLINE_EXPIRED'|'DISCUSSION_ASSEMBLY_INVALID'|'DISCUSSION_CONFIG_CHANGED';
export interface MeetingDiscussionRepository {
  claim():Promise<MeetingDiscussionClaim|null>;
  loadSource(claim:MeetingDiscussionClaim):Promise<MeetingDiscussionSourceInput|null>;
  append(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch):Promise<MeetingDiscussionProgress|null>;
  /** A read under the app transaction lock, never a second insert intent. */
  readProgress(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch):Promise<MeetingDiscussionProgress|'not_committed'|'stale'>;
  /** Exact-token metadata only. Never publishes private content or changes a capture. */
  finish(claim:MeetingDiscussionClaim,reason:MeetingDiscussionFinishReason):Promise<boolean>;
}
export type MeetingDiscussionUnitResult={readonly state:'idle'|'not_current'|'yielded'|'source_complete';readonly assemblyComplete?:boolean};

export interface MeetingDiscussionWorkerDependencies {
  readonly repository:MeetingDiscussionRepository;
  readonly now?:()=>number;
}

const LEASE_HEADROOM_MS=10_000;
const MAX_BATCH_SEGMENTS=16;
const MAX_BATCHES_PER_UNIT=8;
const MAX_SOURCE_WORDS=350_000;
const SHA256_RE=/^[a-f0-9]{64}$/u;

class MeetingDiscussionConfigChanged extends KernelError {
  constructor(){super('CONTRACT_VERSION_MISMATCH','Meeting discussion checkpoint or progress changed',409);}
}

function invalid():never{
  throw new KernelError('DOMAIN_DATA_INVALID','Meeting discussion worker input is invalid',409);
}

function configChanged():never{throw new MeetingDiscussionConfigChanged();}

function safeCounter(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>=0;}

function validateProgress(progress:MeetingDiscussionProgress):void{
  if(!progress||typeof progress!=='object'||!safeCounter(progress.sourceIndex)
      ||!safeCounter(progress.sourceFirstSegmentIndex)||!safeCounter(progress.nextSegmentIndex)
      ||!safeCounter(progress.nextWordIndex)
      ||(progress.deduplicatedPrefixWords!==null&&!safeCounter(progress.deduplicatedPrefixWords))
      ||typeof progress.done!=='boolean')invalid();
}

function hasHeadroom(claim:MeetingDiscussionClaim,signal:AbortSignal,now:()=>number):boolean{
  if(signal.aborted)return false;
  const current=now();
  return Number.isFinite(current)&&current<claim.leaseExpiresAtMs-LEASE_HEADROOM_MS;
}

function validateClaim(claim:MeetingDiscussionClaim):void{
  validateProgress(claim);
  requireUuid(claim.runId,'runId');requireUuid(claim.captureId,'captureId');
  requireUuid(claim.transcriptRevisionId,'transcriptRevisionId');requireUuid(claim.leaseToken,'leaseToken');
  if(!safeCounter(claim.sourceVersion)||claim.sourceVersion===0
      ||!safeCounter(claim.leaseExpiresAtMs)||claim.done
      ||claim.nextSegmentIndex<claim.sourceFirstSegmentIndex)invalid();
}

function validateSourceInput(claim:MeetingDiscussionClaim,sourceInput:MeetingDiscussionSourceInput):void{
  const input=sourceInput?.input;
  if(!input||typeof input!=='object'||!input.source||!Array.isArray(input.checkpoints)
      ||!safeCounter(sourceInput.totalSourceWords)||sourceInput.totalSourceWords>MAX_SOURCE_WORDS
      ||(sourceInput.lastSegmentHash!==null&&!SHA256_RE.test(sourceInput.lastSegmentHash)))invalid();
  if(input.source.captureId!==claim.captureId||input.source.sourceVersion!==claim.sourceVersion
      ||input.source.segmentIndex!==claim.sourceIndex||input.firstSegmentIndex!==claim.sourceFirstSegmentIndex)configChanged();
  if(input.checkpoints.length<1||input.checkpoints.length>7)invalid();
  let total=0;
  for(const checkpoint of input.checkpoints){
    if(checkpoint.captureId!==input.source.captureId||checkpoint.sourceVersion!==input.source.sourceVersion
        ||checkpoint.sourceSegmentId!==input.source.id||checkpoint.sourceSha256!==input.source.sha256
        ||checkpoint.sourceGeneration!==input.source.generation)configChanged();
    const words=checkpoint.result?.wordOffsets;
    if(!Array.isArray(words)||words.length>MAX_SOURCE_WORDS-total)invalid();
    total+=words.length;
  }
  if(total!==sourceInput.totalSourceWords)configChanged();
}

function expectedNextWordIndex(batch:MeetingDiscussionBatch,totalSourceWords:number):number{
  if(batch.segments.length===0)return totalSourceWords;
  const words=batch.segments[batch.segments.length-1]!.wordOffsets;
  const finalWord=words[words.length-1];
  if(!finalWord||!safeCounter(finalWord.source_word_index))invalid();
  return finalWord.source_word_index+1;
}

function validateReceipt(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch,receipt:MeetingDiscussionProgress,
  totalSourceWords:number,expectedPrefix:number):'same_source'|'source_complete'{
  validateProgress(receipt);
  if(receipt.sourceIndex===claim.sourceIndex){
    if(batch.sourceDone||receipt.done||receipt.sourceFirstSegmentIndex!==claim.sourceFirstSegmentIndex
        ||receipt.nextSegmentIndex!==batch.expectedNextSegmentIndex+batch.segments.length
        ||receipt.nextWordIndex!==expectedNextWordIndex(batch,totalSourceWords)
        ||receipt.deduplicatedPrefixWords!==expectedPrefix)configChanged();
    return 'same_source';
  }
  const nextSegmentIndex=batch.expectedNextSegmentIndex+batch.segments.length;
  if(batch.sourceDone&&receipt.sourceIndex===claim.sourceIndex+1
      &&receipt.nextSegmentIndex===nextSegmentIndex&&receipt.sourceFirstSegmentIndex===nextSegmentIndex
      &&receipt.nextWordIndex===0&&receipt.deduplicatedPrefixWords===null
      &&expectedNextWordIndex(batch,totalSourceWords)===totalSourceWords)return 'source_complete';
  configChanged();
}

const RETRY_NOT_ALLOWED=Symbol('discussion-retry-not-allowed');

async function appendWithReadback(repository:MeetingDiscussionRepository,claim:MeetingDiscussionClaim,
  batch:MeetingDiscussionBatch,totalSourceWords:number,expectedPrefix:number,signal:AbortSignal,now:()=>number)
  :Promise<MeetingDiscussionProgress|null|typeof RETRY_NOT_ALLOWED>{
  try{
    return await repository.append(claim,batch);
  }catch(error){
    if(!(error instanceof KernelError)||error.code!=='DB_COMMIT_UNKNOWN')throw error;
    const readback=await repository.readProgress(claim,batch);
    if(readback==='stale')return null;
    if(readback!=='not_committed'){
      validateReceipt(claim,batch,readback,totalSourceWords,expectedPrefix);
      return readback;
    }
    if(!hasHeadroom(claim,signal,now))return RETRY_NOT_ALLOWED;
    try{
      return await repository.append(claim,batch);
    }catch(retryError){
      if(!(retryError instanceof KernelError)||retryError.code!=='DB_COMMIT_UNKNOWN')throw retryError;
      const retryReadback=await repository.readProgress(claim,batch);
      if(retryReadback==='stale')return null;
      if(retryReadback==='not_committed')throw retryError;
      validateReceipt(claim,batch,retryReadback,totalSourceWords,expectedPrefix);
      return retryReadback;
    }
  }
}

async function processClaim(repository:MeetingDiscussionRepository,claim:MeetingDiscussionClaim,signal:AbortSignal,
  now:()=>number):Promise<MeetingDiscussionUnitResult>{
  validateClaim(claim);
  if(!hasHeadroom(claim,signal,now))return {state:'yielded'};
  const sourceInput=await repository.loadSource(claim);
  if(!sourceInput)return {state:'not_current'};
  validateSourceInput(claim,sourceInput);

  const iterator=assembleMeetingDiscussionSource(sourceInput.input);
  let cursor=iterator.next();
  const initiallyEmpty=cursor.done===true;
  const expectedPrefix=initiallyEmpty?sourceInput.totalSourceWords:cursor.value.wordOffsets[0]?.source_word_index;
  if(!safeCounter(expectedPrefix)||expectedPrefix>sourceInput.totalSourceWords)invalid();
  if(claim.deduplicatedPrefixWords!==null&&claim.deduplicatedPrefixWords!==expectedPrefix)configChanged();

  let boundary:MeetingDiscussionSegment|undefined;
  let skippedSegments=0;
  while(!cursor.done&&cursor.value.segmentIndex<claim.nextSegmentIndex){
    boundary=cursor.value;skippedSegments++;
    cursor=iterator.next();
  }
  if(claim.nextSegmentIndex>claim.sourceFirstSegmentIndex){
    const boundaryWord=boundary?.wordOffsets.at(-1);
    if(!boundary||boundary.segmentIndex!==claim.nextSegmentIndex-1
        ||sourceInput.lastSegmentHash!==boundary.sourceHash
        ||!boundaryWord||boundaryWord.source_word_index+1!==claim.nextWordIndex)configChanged();
    if(cursor.done)configChanged();
  }else if(claim.nextSegmentIndex!==claim.sourceFirstSegmentIndex)configChanged();

  let pending:MeetingDiscussionSegment|undefined=cursor.done?undefined:cursor.value;
  let exhausted=initiallyEmpty;
  let emptyBatchSent=false;
  let batches=0;
  let currentProgress:MeetingDiscussionProgress=claim;
  while(batches<MAX_BATCHES_PER_UNIT){
    if(!hasHeadroom(claim,signal,now))return {state:'yielded'};
    const segments:MeetingDiscussionSegment[]=[];
    while(segments.length<MAX_BATCH_SEGMENTS){
      if(pending){segments.push(pending);pending=undefined;continue;}
      if(exhausted)break;
      const next=iterator.next();
      if(next.done){exhausted=true;break;}
      pending=next.value;
    }
    if(segments.length===MAX_BATCH_SEGMENTS&&!exhausted){
      const lookahead=iterator.next();
      if(lookahead.done)exhausted=true;else pending=lookahead.value;
    }
    if(segments.length===0){
      if(!exhausted||!initiallyEmpty||skippedSegments>0||emptyBatchSent)configChanged();
      emptyBatchSent=true;
    }
    const batch:MeetingDiscussionBatch={sourceId:sourceInput.input.source.id,sourceIndex:currentProgress.sourceIndex,
      sourceFirstSegmentIndex:currentProgress.sourceFirstSegmentIndex,expectedNextSegmentIndex:currentProgress.nextSegmentIndex,
      deduplicatedPrefixWords:expectedPrefix,sourceDone:exhausted,segments};
    if(segments.length===0&&!batch.sourceDone)invalid();

    const receipt=await appendWithReadback(repository,claim,batch,sourceInput.totalSourceWords,
      expectedPrefix,signal,now);
    batches++;
    if(receipt===RETRY_NOT_ALLOWED)return {state:'yielded'};
    if(!receipt)return {state:'not_current'};
    const progressState=validateReceipt(claim,batch,receipt,sourceInput.totalSourceWords,expectedPrefix);
    if(progressState==='source_complete')return {state:'source_complete',assemblyComplete:receipt.done};
    if(!batch.sourceDone&&batches===MAX_BATCHES_PER_UNIT)return {state:'yielded'};
    if(batch.sourceDone)configChanged();
    currentProgress=receipt;
  }
  return {state:'yielded'};
}

/** Recompute and append one bounded source at a time; never publishes the transcript. */
export async function runMeetingDiscussionUnit(deps:MeetingDiscussionWorkerDependencies,
  signal:AbortSignal):Promise<MeetingDiscussionUnitResult>{
  if(signal.aborted)return {state:'yielded'};
  const claim=await deps.repository.claim();
  if(!claim)return {state:'idle'};
  const now=deps.now??Date.now;
  let finishReason:MeetingDiscussionFinishReason='yield';
  let result:MeetingDiscussionUnitResult|undefined;
  let operationError:unknown,hasOperationError=false;
  let finishError:unknown,hasFinishError=false;
  try{
    result=await processClaim(deps.repository,claim,signal,now);
  }catch(error){
    operationError=error;hasOperationError=true;
    if(error instanceof MeetingDiscussionConfigChanged)finishReason='DISCUSSION_CONFIG_CHANGED';
    else if(error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID')finishReason='DISCUSSION_ASSEMBLY_INVALID';
  }finally{
    try{await deps.repository.finish(claim,finishReason);}
    catch(error){finishError=error;hasFinishError=true;}
  }
  if(hasOperationError&&hasFinishError){
    throw new AggregateError([operationError,finishError],'Meeting discussion operation and lease release both failed');
  }
  if(hasOperationError)throw operationError;
  if(hasFinishError)throw finishError;
  if(!result)invalid();
  return result;
}
