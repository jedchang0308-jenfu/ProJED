import type {ServerActorV1} from './actorTransaction.js';
import {KernelError} from './errors.js';
import {requireUuid} from './meetingCaptureInput.js';
import type {MeetingDiscussionFinishReason,MeetingDiscussionUnitResult} from './meetingDiscussionWorker.js';

export interface MeetingDiscussionScannedWork {
  readonly runId:string;
  readonly operationToken:string|null;
  readonly deadlineExpired:boolean;
}

export type MeetingDiscussionOriginalSessionResolver=(runId:string)=>Promise<ServerActorV1>;
export type MeetingDiscussionScannedFinishReason=Extract<MeetingDiscussionFinishReason,
  'DISCUSSION_DEADLINE_EXPIRED'|'DISCUSSION_SESSION_UNAVAILABLE'|'DISCUSSION_SOURCE_UNAVAILABLE'>;

export interface MeetingDiscussionHostDependencies {
  /** Its presence gates assembly; provider qualification is unrelated to discussion persistence. */
  readonly originalSessionResolver?:MeetingDiscussionOriginalSessionResolver;
  readonly scan:(maxItems:number)=>Promise<readonly MeetingDiscussionScannedWork[]>;
  /** Metadata-only and compare-and-set against the exact token returned by scan. */
  readonly finishScanned:(runId:string,operationToken:string|null,reason:MeetingDiscussionScannedFinishReason)=>Promise<boolean>;
  readonly runUnit:(runId:string,signal:AbortSignal)=>Promise<MeetingDiscussionUnitResult>;
  readonly now?:()=>number;
  readonly deadlineAtMs?:number;
}

export interface MeetingDiscussionHostSummary {
  scanned:number;units:number;completed:number;sources:number;abandoned:number;deferred:number;failures:number;
  readonly errors:Record<string,number>;
}

const MAX_SCAN_ITEMS=20;
const MAX_UNITS=4;
const MAX_ROUND_MS=600_000;
const REQUIRED_HEADROOM_MS=150_000;

function invalid():never{
  throw new KernelError('DB_BOUNDARY_INVALID','Meeting discussion host input is invalid',503);
}

function validateWork(value:unknown):MeetingDiscussionScannedWork{
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const item=value as Record<string,unknown>;
  if(Object.keys(item).sort().join('|')!=='deadlineExpired|operationToken|runId'
      ||typeof item.deadlineExpired!=='boolean'
      ||!(item.operationToken===null||typeof item.operationToken==='string'))invalid();
  return {runId:requireUuid(item.runId,'runId'),
    operationToken:item.operationToken===null?null:requireUuid(item.operationToken,'operationToken'),
    deadlineExpired:item.deadlineExpired};
}

function permanentFinishReason(error:unknown):MeetingDiscussionScannedFinishReason|undefined{
  if(error instanceof AggregateError)return error.errors.length>0?permanentFinishReason(error.errors[0]):undefined;
  if(!(error instanceof KernelError))return undefined;
  if(error.code==='RESOURCE_NOT_FOUND')return 'DISCUSSION_SOURCE_UNAVAILABLE';
  if(['ACTOR_INVALID','ACTOR_CHANGED','ACCESS_DENIED','IDENTITY_INVALID','IDENTITY_MAPPING_CONFLICT'].includes(error.code)){
    return 'DISCUSSION_SESSION_UNAVAILABLE';
  }
  // Current-state, DB, and unpublished identity-contract errors are not proof
  // that the original Session or source is permanently unavailable.
  return undefined;
}

function errorCodes(error:unknown):string[]{
  if(error instanceof AggregateError){
    const nested=error.errors.flatMap(errorCodes);
    return nested.length>0?nested:['DISCUSSION_HOST_UNAVAILABLE'];
  }
  return [error instanceof KernelError?error.code:'DISCUSSION_HOST_UNAVAILABLE'];
}

function recordFailure(summary:MeetingDiscussionHostSummary,error:unknown):void{
  summary.failures++;
  for(const code of errorCodes(error))summary.errors[code]=(summary.errors[code]??0)+1;
}

function validateUnitResult(value:unknown):MeetingDiscussionUnitResult{
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const result=value as Record<string,unknown>;
  if(typeof result.state!=='string'||!['idle','not_current','yielded','source_complete'].includes(result.state)
      ||(result.assemblyComplete!==undefined&&typeof result.assemblyComplete!=='boolean')
      ||(result.assemblyComplete===true&&result.state!=='source_complete'))invalid();
  return result as MeetingDiscussionUnitResult;
}

async function finishScanned(deps:MeetingDiscussionHostDependencies,summary:MeetingDiscussionHostSummary,
  item:MeetingDiscussionScannedWork,reason:MeetingDiscussionScannedFinishReason):Promise<void>{
  try{
    if(await deps.finishScanned(item.runId,item.operationToken,reason))summary.abandoned++;
    else summary.deferred++;
  }catch(error){recordFailure(summary,error);summary.deferred++;}
}

/** Processes one bounded batch of discussion assembly metadata and private work. */
export async function runMeetingDiscussionHost(deps:MeetingDiscussionHostDependencies,
  signal:AbortSignal):Promise<MeetingDiscussionHostSummary>{
  const summary:MeetingDiscussionHostSummary={scanned:0,units:0,completed:0,sources:0,abandoned:0,deferred:0,
    failures:0,errors:{}};
  if(signal.aborted)return summary;
  const now=deps.now??Date.now;
  const startedAt=now();
  if(!Number.isFinite(startedAt)){
    recordFailure(summary,new KernelError('DB_BOUNDARY_INVALID','Meeting discussion host clock is invalid',503));
    return summary;
  }
  const deadline=Math.min(startedAt+MAX_ROUND_MS,deps.deadlineAtMs??Infinity);

  let scanned:readonly MeetingDiscussionScannedWork[];
  try{
    const raw=await deps.scan(MAX_SCAN_ITEMS);
    if(!Array.isArray(raw)||raw.length>MAX_SCAN_ITEMS)invalid();
    scanned=raw.map(validateWork);
  }catch(error){recordFailure(summary,error);return summary;}
  summary.scanned=scanned.length;

  const runCounts=new Map<string,number>();
  for(const item of scanned)runCounts.set(item.runId,(runCounts.get(item.runId)??0)+1);
  const assemblyEnabled=typeof deps.originalSessionResolver==='function';

  for(const item of scanned){
    if(runCounts.get(item.runId)!==1){summary.deferred++;continue;}

    // Expired runs are metadata-only terminal work, even when Session contract
    // publication is unavailable or assembly itself is disabled.
    if(item.deadlineExpired){
      await finishScanned(deps,summary,item,'DISCUSSION_DEADLINE_EXPIRED');
      continue;
    }
    const currentTime=now();
    if(signal.aborted||!Number.isFinite(currentTime)||currentTime>=deadline
        ||deadline-currentTime<REQUIRED_HEADROOM_MS||summary.units>=MAX_UNITS||!assemblyEnabled){
      summary.deferred++;
      continue;
    }

    // Count before execution. A lost claim/commit still consumes the bounded
    // slot and is never retried in this round.
    summary.units++;
    try{
      const result=validateUnitResult(await deps.runUnit(item.runId,signal));
      if(result.state==='source_complete'){
        summary.sources++;
        if(result.assemblyComplete===true)summary.completed++;
      }else summary.deferred++;
    }catch(error){
      const finishReason=permanentFinishReason(error);
      if(error instanceof AggregateError)recordFailure(summary,error);
      if(!finishReason){
        if(!(error instanceof AggregateError))recordFailure(summary,error);
        summary.deferred++;
        continue;
      }

      try{
        if(await deps.finishScanned(item.runId,item.operationToken,finishReason))summary.abandoned++;
        else summary.deferred++;
      }catch(finishError){
        summary.deferred++;
        if(error instanceof AggregateError)recordFailure(summary,finishError);
        else recordFailure(summary,new AggregateError([error,finishError],
            'Meeting discussion failure and metadata finish both failed'));
      }
    }
  }
  return summary;
}
