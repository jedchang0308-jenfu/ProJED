import {KernelError} from './errors.js';
import {requireUuid} from './meetingCaptureInput.js';
import type {MeetingLlmPipelineResult} from './meetingLlmPipeline.js';
import type {MeetingLlmReceipt} from './meetingLlmRepository.js';

export type MeetingLlmScannedWork=
  |{readonly kind:'queued';readonly runId:string;readonly operationToken:null;readonly deadlineExpired:boolean}
  |{readonly kind:'recover';readonly runId:string;readonly operationToken:string};
export type MeetingLlmFinishReason='LLM_DEADLINE_EXPIRED'|'LLM_SESSION_UNAVAILABLE'|'LLM_SOURCE_UNAVAILABLE'|'LLM_CONFIG_CHANGED';
export interface MeetingLlmHostDependencies {
  readonly privateWorkEnabled:boolean;
  readonly scan:(maxItems:number)=>Promise<readonly MeetingLlmScannedWork[]>;
  readonly recover:(runId:string,token:string)=>Promise<MeetingLlmReceipt|null>;
  readonly finish:(runId:string,reason:MeetingLlmFinishReason)=>Promise<boolean>;
  readonly runNext:(runId:string,signal:AbortSignal)=>Promise<MeetingLlmPipelineResult>;
  readonly now?:()=>number;readonly deadlineAtMs?:number;
}
export interface MeetingLlmHostSummary {
  scanned:number;units:number;recovered:number;published:number;local:number;abandoned:number;deferred:number;failures:number;
  readonly errors:Record<string,number>;
}
function invalid():never{throw new KernelError('DB_BOUNDARY_INVALID','Meeting LLM metadata is invalid',503);}
export function parseMeetingLlmScannedWork(value:unknown,maxItems=20):readonly MeetingLlmScannedWork[]{
  if(!Array.isArray(value)||value.length>maxItems)invalid();
  return value.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const item=raw as Record<string,unknown>;
    requireUuid(item.runId,'runId');
    if(item.kind==='queued'&&Object.keys(item).sort().join('|')==='deadlineExpired|kind|operationToken|runId'
      &&item.operationToken===null&&typeof item.deadlineExpired==='boolean')return item as unknown as MeetingLlmScannedWork;
    if(item.kind==='recover'&&Object.keys(item).sort().join('|')==='kind|operationToken|runId'){
      requireUuid(item.operationToken,'operationToken');return item as unknown as MeetingLlmScannedWork;
    }return invalid();
  });
}
function permanentReason(error:unknown):MeetingLlmFinishReason|undefined{
  if(!(error instanceof KernelError))return undefined;
  if(error.code==='RESOURCE_NOT_FOUND')return 'LLM_SOURCE_UNAVAILABLE';
  if(['ACTOR_INVALID','ACTOR_CHANGED','ACCESS_DENIED','IDENTITY_INVALID','IDENTITY_MAPPING_CONFLICT'].includes(error.code))return 'LLM_SESSION_UNAVAILABLE';
  return undefined;
}
/** A single bounded round. Neither an uncertain unit nor its provider request
 * is retried here. Metadata recovery is available with private work disabled. */
export async function runMeetingLlmHost(deps:MeetingLlmHostDependencies,signal:AbortSignal):Promise<MeetingLlmHostSummary>{
  const summary:MeetingLlmHostSummary={scanned:0,units:0,recovered:0,published:0,local:0,abandoned:0,deferred:0,failures:0,errors:{}};
  if(signal.aborted)return summary;
  const now=deps.now??Date.now,started=now(),deadline=Math.min(started+600_000,deps.deadlineAtMs??Infinity);
  const failure=(error:unknown)=>{summary.failures++;const code=error instanceof KernelError?error.code:'LLM_HOST_UNAVAILABLE';
    summary.errors[code]=(summary.errors[code]??0)+1;};
  if(!Number.isFinite(started)||!Number.isFinite(deadline)){failure(new KernelError('DB_BOUNDARY_INVALID','Meeting host clock is invalid',503));return summary;}
  let work:readonly MeetingLlmScannedWork[];
  try{work=parseMeetingLlmScannedWork(await deps.scan(20));}catch(error){failure(error);return summary;}
  summary.scanned=work.length;
  const seen=new Set<string>();
  for(const item of work){
    const identity=`${item.kind}:${item.runId}:${item.operationToken??''}`;
    if(seen.has(identity)){summary.deferred++;continue;}seen.add(identity);
    if(signal.aborted||now()>=deadline){summary.deferred++;continue;}
    try{
      if(item.kind==='recover'){
        if(await deps.recover(item.runId,item.operationToken))summary.recovered++;else summary.deferred++;
        continue;
      }
      if(item.deadlineExpired){
        if(await deps.finish(item.runId,'LLM_DEADLINE_EXPIRED'))summary.abandoned++;else summary.deferred++;
        continue;
      }
      if(!deps.privateWorkEnabled){summary.deferred++;continue;}
      let ended=false;
      while(!signal.aborted&&summary.units<4&&deadline-now()>=150_000){
        summary.units++; // Unknown SQL/COMMIT still consumes this round's slot.
        const result=await deps.runNext(item.runId,signal);
        if(result.state==='published'){summary.published++;ended=true;break;}
        if(result.state==='local_completed'){summary.local++;continue;}
        if(result.state==='settled'&&result.checkpointPublished===true)continue;
        if(!['idle','deferred','settled'].includes(result.state))invalid();
        summary.deferred++;ended=true;break;
      }
      if(!ended)summary.deferred++;
    }catch(error){
      const reason=permanentReason(error);
      if(reason){try{if(await deps.finish(item.runId,reason))summary.abandoned++;else summary.deferred++;}
        catch(finishError){failure(error);failure(finishError);}}
      else failure(error);
      // Current-state/provider/DB outages do not prove a revoked Session.
    }
  }
  return summary;
}
