import {createHash} from 'node:crypto';
import {KernelError} from './errors.js';
import type {MeetingAudioCleanupStorage} from './meetingAudioStorage.js';
import {requireUuid} from './meetingCaptureInput.js';

export interface MeetingAudioCleanupClaim {
  readonly obligationId:string;
  readonly leaseToken:string;
  readonly leaseExpiresAtMs:number;
  readonly key:string;
  readonly generation:string|null;
  readonly uploadOperationToken:string|null;
  readonly sha256:string|null;
  readonly bytes:number|null;
  readonly uploadOutcome:'pending'|'uploaded'|'unknown'|'rejected'|null;
}

export interface MeetingAudioCleanupRepository {
  scan(maxItems:number):Promise<readonly string[]>;
  claim(obligationId:string):Promise<MeetingAudioCleanupClaim|null>;
  finish(claim:MeetingAudioCleanupClaim,result:{kind:'deleted'|'unknown'|'conflict';generation:string|null}):Promise<boolean>;
}

export interface MeetingAudioCleanupWorkerDependencies {
  readonly repository:MeetingAudioCleanupRepository;
  readonly storage:MeetingAudioCleanupStorage;
  readonly now?:()=>number;
}

export type MeetingAudioCleanupUnitResult={readonly state:'idle'|'deleted'|'unknown'|'conflict'};

const SETTLEMENT_HEADROOM_MS=10_000;
const MAX_AUDIO_SEGMENT_BYTES=10*1024*1024;
const MAX_SOURCE_VERSION=2_147_483_647;
const MAX_SEGMENT_INDEX=4095;
const MAX_GENERATION=9_223_372_036_854_775_807n;
const UUID_PART='[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const KEY_PATTERN=new RegExp(`^(${UUID_PART})/(${UUID_PART})/(${UUID_PART})/(${UUID_PART})/v([1-9][0-9]*)/(0|[1-9][0-9]*)\\.(webm|ogg|m4a|mp3|wav)$`);
const SHA256_PATTERN=/^[a-f0-9]{64}$/u;
const GENERATION_PATTERN=/^[1-9][0-9]{0,19}$/u;

function invalid():never{throw new KernelError('DOMAIN_DATA_INVALID','Meeting audio cleanup claim is invalid',409);}
function validGeneration(value:unknown):value is string{
  if(typeof value!=='string'||!GENERATION_PATTERN.test(value))return false;
  try{return BigInt(value)<=MAX_GENERATION;}catch{return false;}
}
function validObjectKey(value:unknown):value is string{
  if(typeof value!=='string'||value.length>256)return false;
  const match=KEY_PATTERN.exec(value);if(!match)return false;
  try{
    for(const part of match.slice(1,5))if(requireUuid(part,'Meeting audio object key')!==part)return false;
  }catch{return false;}
  const version=Number(match[5]),segment=Number(match[6]);
  return Number.isSafeInteger(version)&&version>=1&&version<=MAX_SOURCE_VERSION
    &&Number.isSafeInteger(segment)&&segment>=0&&segment<=MAX_SEGMENT_INDEX;
}
function validToken(value:unknown):value is string{
  try{return requireUuid(value,'Meeting audio upload operation')===value;}catch{return false;}
}
function safeGeneration(value:string|null):string|null{return validGeneration(value)?value:null;}

function leaseAbortScope(parent:AbortSignal,leaseExpiresAtMs:number,now:()=>number){
  const controller=new AbortController();
  const deadline=leaseExpiresAtMs-SETTLEMENT_HEADROOM_MS;
  const abortFromParent=()=>controller.abort();
  if(parent.aborted)controller.abort();
  else parent.addEventListener('abort',abortFromParent,{once:true});
  const remaining=deadline-now();
  let timer:NodeJS.Timeout|undefined;
  if(!controller.signal.aborted){
    if(remaining<=0)controller.abort();
    else timer=setTimeout(()=>controller.abort(),remaining);
  }
  return {
    signal:controller.signal,
    active():boolean{
      if(now()>=deadline&&!controller.signal.aborted)controller.abort();
      return !controller.signal.aborted;
    },
    dispose():void{
      if(timer)clearTimeout(timer);
      parent.removeEventListener('abort',abortFromParent);
    },
  };
}

function validateClaimEnvelope(claim:MeetingAudioCleanupClaim,requestedId:string):void{
  if(!claim||typeof claim!=='object'||claim.obligationId!==requestedId)invalid();
  requireUuid(claim.obligationId,'Cleanup obligation');
  requireUuid(claim.leaseToken,'Cleanup lease');
  if(!Number.isSafeInteger(claim.leaseExpiresAtMs)||claim.leaseExpiresAtMs<1)invalid();
  if(claim.uploadOperationToken!==null&&!validToken(claim.uploadOperationToken))invalid();
  if(claim.uploadOutcome!==null&&!['pending','uploaded','unknown','rejected'].includes(claim.uploadOutcome))invalid();
}

type Resolution={kind:'deleted'|'unknown'|'conflict';generation:string|null};
function unknown(generation:string|null=null):Resolution{return {kind:'unknown',generation};}
function conflict(generation:string|null=null):Resolution{return {kind:'conflict',generation};}
function deleted(generation:string|null):Resolution{return {kind:'deleted',generation};}

function validPresent(value:unknown):value is {kind:'present';generation:string;size:number;contentType:string}{
  if(!value||typeof value!=='object')return false;
  const candidate=value as Record<string,unknown>;
  return candidate.kind==='present'&&validGeneration(candidate.generation)
    &&Number.isSafeInteger(candidate.size)&&Number(candidate.size)>0&&Number(candidate.size)<=MAX_AUDIO_SEGMENT_BYTES
    &&typeof candidate.contentType==='string'&&candidate.contentType.length>0&&candidate.contentType.length<=160;
}

async function exactReadback(
  deps:MeetingAudioCleanupWorkerDependencies,
  claim:MeetingAudioCleanupClaim,
  generation:string,
  signal:AbortSignal,
  active:()=>boolean,
):Promise<Resolution>{
  if(!active())return unknown(generation);
  try{
    const result=await deps.storage.probe(claim.key,generation,signal);
    if(!active())return unknown(generation);
    if(result.kind==='missing')return deleted(generation);
    if(!validPresent(result))return unknown(generation);
    if(result.generation!==generation)return conflict(generation);
    return unknown(generation);
  }catch{
    return unknown(generation);
  }
}

async function deleteOnce(
  deps:MeetingAudioCleanupWorkerDependencies,
  claim:MeetingAudioCleanupClaim,
  generation:string,
  signal:AbortSignal,
  active:()=>boolean,
):Promise<Resolution>{
  if(!active())return unknown(generation);
  try{await deps.storage.delete(claim.key,generation,signal);}
  catch{
    if(!active())return unknown(generation);
    return exactReadback(deps,claim,generation,signal,active);
  }
  if(!active())return unknown(generation);
  return exactReadback(deps,claim,generation,signal,active);
}

async function resolveClaim(
  deps:MeetingAudioCleanupWorkerDependencies,
  claim:MeetingAudioCleanupClaim,
  signal:AbortSignal,
  active:()=>boolean,
):Promise<Resolution>{
  const knownGeneration=safeGeneration(claim.generation);
  if(!active())return unknown(knownGeneration);
  if(claim.generation!==null&&!knownGeneration)return conflict();
  if(!validObjectKey(claim.key))return conflict(knownGeneration);

  if(knownGeneration){
    let exact;
    try{exact=await deps.storage.probe(claim.key,knownGeneration,signal);}
    catch{return unknown(knownGeneration);}
    if(!active())return unknown(knownGeneration);
    if(exact.kind==='missing')return deleted(knownGeneration);
    if(!validPresent(exact))return unknown(knownGeneration);
    if(exact.generation!==knownGeneration)return conflict(knownGeneration);
    return deleteOnce(deps,claim,knownGeneration,signal,active);
  }

  let current;
  try{current=await deps.storage.probe(claim.key,undefined,signal);}
  catch{return unknown();}
  if(!active())return unknown();
  if(current.kind==='missing')return claim.uploadOperationToken===null?deleted(null):unknown();
  if(!validPresent(current))return unknown();
  if(!SHA256_PATTERN.test(claim.sha256??'')
    ||!Number.isSafeInteger(claim.bytes)||claim.bytes===null||claim.bytes<1||claim.bytes>MAX_AUDIO_SEGMENT_BYTES
    ||current.size!==claim.bytes)return conflict();

  let object;
  try{object=await deps.storage.read(claim.key,signal);}
  catch{return unknown();}
  if(!active())return unknown();
  if(!object||object.generation!==current.generation)return conflict();
  if(object.size!==claim.bytes||object.bytes.byteLength!==claim.bytes
    ||createHash('sha256').update(object.bytes).digest('hex')!==claim.sha256)return conflict();
  return deleteOnce(deps,claim,current.generation,signal,active);
}

/** One lease and at most one generation-fenced DELETE; settlement ignores cancellation. */
export async function runMeetingAudioCleanupUnit(
  deps:MeetingAudioCleanupWorkerDependencies,
  obligationId:string,
  parentSignal:AbortSignal,
):Promise<MeetingAudioCleanupUnitResult>{
  const requestedId=requireUuid(obligationId,'Cleanup obligation');
  if(parentSignal.aborted)return {state:'idle'};
  const claim=await deps.repository.claim(requestedId);
  if(!claim)return {state:'idle'};
  validateClaimEnvelope(claim,requestedId);
  const now=deps.now??Date.now;
  const lease=leaseAbortScope(parentSignal,claim.leaseExpiresAtMs,now);
  let resolution:Resolution;
  try{resolution=await resolveClaim(deps,claim,lease.signal,()=>lease.active());}
  catch{resolution=unknown(safeGeneration(claim.generation));}
  finally{lease.dispose();}

  // This metadata-only transaction is deliberately independent of the parent and
  // lease signals. A cancelled provider call still leaves an explicit unknown.
  const finished=await deps.repository.finish(claim,resolution);
  return {state:finished?resolution.kind:'unknown'};
}

export interface MeetingAudioCleanupHostDependencies {
  readonly repository:MeetingAudioCleanupRepository;
  readonly storage?:MeetingAudioCleanupStorage;
  readonly storageEnabled:boolean;
  readonly now?:()=>number;
  readonly deadlineAtMs?:number;
}

export interface MeetingAudioCleanupHostSummary{
  scanned:number;units:number;deleted:number;unknown:number;conflicts:number;deferred:number;failures:number;
  readonly errors:Record<string,number>;
}

function safeErrorCode(error:unknown):string{
  const candidate=error instanceof KernelError?error.code:'';
  return /^[A-Z0-9_]{1,96}$/u.test(candidate)?candidate:'MEETING_AUDIO_CLEANUP_UNAVAILABLE';
}
function recordFailure(summary:MeetingAudioCleanupHostSummary,code:string):void{
  summary.failures++;
  summary.errors[code]=(summary.errors[code]??0)+1;
}

/** One bounded scan; uncertain failures are never redelivered within this process. */
export async function runMeetingAudioCleanupHost(
  deps:MeetingAudioCleanupHostDependencies,
  signal:AbortSignal,
):Promise<MeetingAudioCleanupHostSummary>{
  const summary:MeetingAudioCleanupHostSummary={scanned:0,units:0,deleted:0,unknown:0,conflicts:0,deferred:0,failures:0,errors:{}};
  if(signal.aborted)return summary;
  if(deps.storageEnabled&&!deps.storage){recordFailure(summary,'CONFIG_INVALID');return summary;}
  const now=deps.now??Date.now,start=now();
  if(!Number.isSafeInteger(start)||start<0
    ||(deps.deadlineAtMs!==undefined&&(!Number.isSafeInteger(deps.deadlineAtMs)||deps.deadlineAtMs<0))){
    recordFailure(summary,'CONFIG_INVALID');return summary;
  }
  const deadline=Math.min(start+600_000,deps.deadlineAtMs??Infinity);
  let obligations:readonly string[];
  try{obligations=await deps.repository.scan(20);}
  catch(error){recordFailure(summary,safeErrorCode(error));return summary;}
  const items=obligations.slice(0,20);summary.scanned=items.length;
  const seen=new Set<string>();
  for(const obligationId of items){
    if(signal.aborted||now()>=deadline){summary.deferred++;continue;}
    if(!deps.storageEnabled){summary.deferred++;continue;}
    if(summary.units>=4||deadline-now()<150_000){summary.deferred++;continue;}
    let canonicalId:string;
    try{canonicalId=requireUuid(obligationId,'Cleanup obligation');}
    catch(error){recordFailure(summary,safeErrorCode(error));continue;}
    if(seen.has(canonicalId)){summary.deferred++;continue;}
    seen.add(canonicalId);
    summary.units++;
    try{
      const result=await runMeetingAudioCleanupUnit({
        repository:deps.repository,
        storage:deps.storage!,
        ...(deps.now?{now:deps.now}:{}),
      },canonicalId,signal);
      if(result.state==='deleted')summary.deleted++;
      else if(result.state==='unknown')summary.unknown++;
      else if(result.state==='conflict')summary.conflicts++;
      else summary.deferred++;
    }catch(error){recordFailure(summary,safeErrorCode(error));}
  }
  return summary;
}
