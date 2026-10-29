import {createHash} from 'node:crypto';
import {KernelError} from './errors.js';
import {GoogleCloudSpeechProviderError,type GoogleCloudSpeechProvider,type GoogleCloudSpeechTranscription} from './googleCloudSpeechProvider.js';
import {buildMeetingAudioObjectKey,MAX_AUDIO_SEGMENT_BYTES} from './meetingAudioInput.js';
import {decodeMeetingAudioToPcm,splitMeetingPcm,type DecodeMeetingAudioToPcmInput} from './meetingAudioPcm.js';
import type {MeetingAudioStorage} from './meetingAudioStorage.js';
import {requireAudioMime,requireUuid} from './meetingCaptureInput.js';

/** A repository claim is created in a short transaction, never around a provider call. */
export interface MeetingAsrClaim {
  readonly runId:string;
  readonly captureId:string;
  readonly sourceVersion:number;
  readonly leaseToken:string;
  readonly leaseExpiresAtMs:number;
  readonly attemptId:string;
  readonly chunkIndex:number;
  readonly source:{
    readonly id:string;readonly tenantId:string;readonly projectId:string;readonly recordId:string;
    readonly segmentIndex:number;readonly startOffsetMs:number;readonly endOffsetMs:number;
    readonly mime:string;readonly bytes:number;readonly sha256:string;readonly generation:string;readonly objectPath:string;
  };
}

export interface MeetingAsrTranscriptUnit {
  readonly chunkIndex:number;
  readonly chunkCount:number;
  readonly startSample:number;
  readonly endSample:number;
  readonly decodedSha256:string;
  readonly sourceHash:string;
  readonly startOffsetMs:number;
  readonly endOffsetMs:number;
  readonly rawText:string;
  readonly wordOffsets:readonly {
    readonly text:string;readonly start_ms:number;readonly end_ms:number;
    readonly source_audio_segment_id:string;readonly source_word_index:number;
  }[];
}

export type MeetingAsrSettlement =
  | {readonly kind:'recognized';readonly transcript:MeetingAsrTranscriptUnit;
      readonly totalBilledTime?:string;readonly providerRequestId?:string}
  | {readonly kind:'not_sent';readonly code:string}
  | {readonly kind:'rejected_unbilled';readonly code:'ASR_PROVIDER_REJECTED'}
  | {readonly kind:'usage_unknown';readonly code:string};

/**
 * App-specific persistence seam. Implementations must atomically fence the current
 * source, actor/Principal state, account guard, lease, deadline and budget before
 * marking dispatch. No lease takeover may resend a dispatched/unknown attempt.
 * Settlement is idempotent by attemptId. After cancellation, loss of access or
 * source deletion it may settle only that attempt's costs, never publish content.
 */
export interface MeetingAsrRepository {
  claimNext():Promise<MeetingAsrClaim|null>;
  /** False closes this unsent claim in the same transaction; it cannot leak a reservation/lease. */
  markDispatch(claim:MeetingAsrClaim,unit:Omit<MeetingAsrTranscriptUnit,'rawText'|'wordOffsets'|'sourceHash'>):Promise<boolean>;
  /** Read back this exact claim after an unknown COMMIT; never acquire another. */
  readDispatch(claim:MeetingAsrClaim):Promise<'authorized'|'not_authorized'>;
  /** A successful response may settle from exact PCM duration; no response remains usage-unknown. */
  settle(claim:MeetingAsrClaim,result:MeetingAsrSettlement):Promise<'published'|'accounted_only'>;
}

export interface MeetingAsrWorkerDependencies {
  readonly repository:MeetingAsrRepository;
  readonly storage:Pick<MeetingAudioStorage,'read'>;
  readonly provider:GoogleCloudSpeechProvider;
  readonly decode?:(input:DecodeMeetingAudioToPcmInput)=>Promise<Uint8Array>;
  readonly now?:()=>number;
}

export type MeetingAsrUnitResult =
  | {readonly state:'idle'}
  | {readonly state:'published'|'accounted_only'|'not_dispatched'|'rejected_unbilled'|'usage_unknown';readonly attemptId:string};

function invalid():never{throw new KernelError('DOMAIN_DATA_INVALID','Meeting ASR claim is invalid',409);}
function interrupted():KernelError{return new KernelError('TRANSACTION_USAGE_INVALID','Meeting ASR unit was interrupted',409);}
function hash(bytes:Uint8Array|string):string{return createHash('sha256').update(bytes).digest('hex');}
function validateClaim(claim:MeetingAsrClaim):void{
  for(const id of [claim.runId,claim.captureId,claim.leaseToken,claim.source.id,claim.source.tenantId,
    claim.source.projectId,claim.source.recordId])requireUuid(id,'ASR identity');
  if(!Number.isSafeInteger(claim.sourceVersion)||claim.sourceVersion<1
    ||!Number.isSafeInteger(claim.chunkIndex)||claim.chunkIndex<0||claim.chunkIndex>6
    ||!Number.isSafeInteger(claim.leaseExpiresAtMs)||claim.leaseExpiresAtMs<1
    ||typeof claim.attemptId!=='string'||claim.attemptId.length<1||claim.attemptId.length>256
    ||/[\p{Cc}]/u.test(claim.attemptId)
    ||!Number.isSafeInteger(claim.source.segmentIndex)||claim.source.segmentIndex<0
    ||!Number.isSafeInteger(claim.source.startOffsetMs)||claim.source.startOffsetMs<0
    ||!Number.isSafeInteger(claim.source.endOffsetMs)||claim.source.endOffsetMs<=claim.source.startOffsetMs
    ||claim.source.endOffsetMs-claim.source.startOffsetMs>302_000
    ||!Number.isSafeInteger(claim.source.bytes)||claim.source.bytes<1||claim.source.bytes>MAX_AUDIO_SEGMENT_BYTES
    ||!(/^[a-f0-9]{64}$/u.test(claim.source.sha256))
    ||!(/^[1-9][0-9]{0,18}$/u.test(claim.source.generation)))invalid();
  const expectedPath=buildMeetingAudioObjectKey({tenantId:claim.source.tenantId,projectId:claim.source.projectId,
    recordId:claim.source.recordId,captureId:claim.captureId,sourceVersion:claim.sourceVersion,
    segmentIndex:claim.source.segmentIndex,mime:requireAudioMime(claim.source.mime)});
  if(claim.source.objectPath!==expectedPath)invalid();
}

function resultFor(claim:MeetingAsrClaim,pcm:Uint8Array,response:GoogleCloudSpeechTranscription):MeetingAsrTranscriptUnit{
  const chunks=splitMeetingPcm(pcm),chunk=chunks[claim.chunkIndex];if(!chunk)invalid();
  const base=claim.source.startOffsetMs+chunk.startSample/16;
  const duration=(chunk.endSample-chunk.startSample)/16;
  if(!Number.isSafeInteger(base)||!Number.isSafeInteger(base+Math.ceil(duration)))invalid();
  // Preserve decoded sample coverage, including codec padding. Do not silently
  // trim samples to the browser's timer or fabricate word boundaries from text.
  return {chunkIndex:claim.chunkIndex,chunkCount:chunks.length,startSample:chunk.startSample,endSample:chunk.endSample,
    decodedSha256:hash(pcm),sourceHash:hash(JSON.stringify({audio:claim.source.sha256,generation:claim.source.generation,
      startSample:chunk.startSample,endSample:chunk.endSample,text:response.transcript,words:response.words})),
    startOffsetMs:base,endOffsetMs:Math.ceil(base+duration),rawText:response.transcript,
    wordOffsets:response.words.map((word,index)=>{
      if(word.startMs>duration||word.endMs>duration+100)throw new GoogleCloudSpeechProviderError(
        'ASR_PROVIDER_INVALID_RESPONSE','Speech word timing exceeds its source',true,true);
      // Recognize allows 100 ms of boundary rounding. Keep the original timing
      // in sourceHash, but anchor review/playback offsets inside actual samples.
      return {text:word.text,start_ms:base+word.startMs,end_ms:base+Math.min(duration,word.endMs),
        source_audio_segment_id:claim.source.id,source_word_index:index};
    })};
}

function safeCode(error:unknown):string{
  if(error instanceof GoogleCloudSpeechProviderError)return error.code;
  if(error instanceof KernelError)return error.code;
  return 'ASR_UNIT_UNAVAILABLE';
}

/** One durable unit, one provider POST at most; no SDK/worker retry loop. */
export async function runMeetingAsrUnit(deps:MeetingAsrWorkerDependencies,signal:AbortSignal):Promise<MeetingAsrUnitResult>{
  if(signal.aborted)throw interrupted();
  const claim=await deps.repository.claimNext();if(!claim)return {state:'idle'};
  validateClaim(claim);
  const now=deps.now??Date.now;
  const active=()=>{if(signal.aborted||now()>=claim.leaseExpiresAtMs)throw interrupted();};
  let providerInvoked=false;
  let settlement:MeetingAsrSettlement;
  try{
    active();
    const audio=await deps.storage.read(claim.source.objectPath,signal);
    active();
    if(audio.generation!==claim.source.generation||audio.size!==claim.source.bytes
      ||audio.bytes.byteLength!==claim.source.bytes||audio.contentType.toLowerCase()!==claim.source.mime.toLowerCase()
      ||hash(audio.bytes)!==claim.source.sha256)throw new KernelError('MEETING_STORAGE_CONFLICT','Meeting ASR source changed',409);
    const pcm=await (deps.decode??decodeMeetingAudioToPcm)({bytes:audio.bytes,mimeType:audio.contentType,
      expectedDurationMs:claim.source.endOffsetMs-claim.source.startOffsetMs,signal});
    active();
    const chunks=splitMeetingPcm(pcm),chunk=chunks[claim.chunkIndex];if(!chunk)invalid();
    const draft=resultFor(claim,pcm,{transcript:'',words:[]});
    const {rawText:_text,wordOffsets:_words,sourceHash:_source,...dispatch}=draft;
    void _text;void _words;void _source;
    let authorized:boolean;
    try{authorized=await deps.repository.markDispatch(claim,dispatch);}
    catch(error){
      if(!(error instanceof KernelError)||error.code!=='DB_COMMIT_UNKNOWN')throw error;
      authorized=await deps.repository.readDispatch(claim)==='authorized';
    }
    if(!authorized)return {state:'not_dispatched',attemptId:claim.attemptId};
    active();
    providerInvoked=true;
    const response=await deps.provider.transcribe({pcm16le:chunk.bytes,signal});
    // Even after cancellation, preserve the factual response/usage for the
    // repository's accounting-only path. It must reauthorize publication.
    settlement={kind:'recognized',transcript:resultFor(claim,pcm,response),
      ...(response.totalBilledTime===undefined?{}:{totalBilledTime:response.totalBilledTime}),
      ...(response.requestId===undefined?{}:{providerRequestId:response.requestId})};
  }catch(error){
    const knownNotSent=!providerInvoked||(error instanceof GoogleCloudSpeechProviderError&&!error.requestSent);
    const knownUnbilledServerReject=error instanceof GoogleCloudSpeechProviderError
      &&error.code==='ASR_PROVIDER_REJECTED'&&error.requestSent&&error.usageUnknown===false
      &&typeof error.httpStatus==='number'&&error.httpStatus>=500&&error.httpStatus<=599;
    if(knownNotSent)settlement={kind:'not_sent',code:safeCode(error)};
    else if(knownUnbilledServerReject)settlement={kind:'rejected_unbilled',code:'ASR_PROVIDER_REJECTED'};
    else settlement={kind:'usage_unknown',code:safeCode(error)};
  }
  // No cancellation signal is passed here: an already-paid attempt still needs
  // isolated accounting. A failed settlement is surfaced, never a second POST.
  const settled=await deps.repository.settle(claim,settlement);
  const state=settlement.kind==='usage_unknown'?'usage_unknown'
    :settlement.kind==='not_sent'?'not_dispatched'
      :settlement.kind==='rejected_unbilled'?'rejected_unbilled':settled;
  return {state,attemptId:claim.attemptId};
}
