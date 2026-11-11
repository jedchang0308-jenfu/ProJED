import {KernelError} from './errors.js';
import type {MeetingAsrUnitResult} from './meetingAsrWorker.js';

export type MeetingAsrWork=
  |{readonly kind:'queued';readonly runId:string;readonly deadlineExpired:boolean;readonly budgetMonthCurrent:boolean}
  |{readonly kind:'recover_unit';readonly runId:string;readonly operationToken:string}
  |{readonly kind:'recover_pool';readonly runId:string};
export type MeetingAsrAbandonReason='ASR_SESSION_UNAVAILABLE'|'ASR_SOURCE_UNAVAILABLE'|'ASR_DEADLINE_EXPIRED'|'ASR_BUDGET_MONTH_CHANGED';
export interface MeetingAsrRecovery {
  readonly recovered:boolean;readonly kind:'not_sent'|'usage_unknown'|null;readonly retryScheduled:boolean;
}
export interface MeetingAsrHostDependencies {
  readonly dispatchEnabled:boolean;
  readonly scan:(maxItems:number)=>Promise<readonly MeetingAsrWork[]>;
  readonly recover:(runId:string,token:string)=>Promise<MeetingAsrRecovery>;
  readonly abandon:(runId:string,reason:MeetingAsrAbandonReason)=>Promise<boolean>;
  readonly runUnit:(runId:string,signal:AbortSignal)=>Promise<MeetingAsrUnitResult>;
  readonly now?:()=>number;
  readonly deadlineAtMs?:number;
}
export interface MeetingAsrHostSummary {
  scanned:number;units:number;recovered:number;abandoned:number;deferred:number;failures:number;
  readonly errors:Record<string,number>;
}

function permanentActorFailure(error:unknown):MeetingAsrAbandonReason|undefined{
  if(!(error instanceof KernelError))return undefined;
  if(error.code==='RESOURCE_NOT_FOUND')return 'ASR_SOURCE_UNAVAILABLE';
  if(['ACTOR_INVALID','ACTOR_CHANGED','ACCESS_DENIED','IDENTITY_INVALID','IDENTITY_MAPPING_CONFLICT'].includes(error.code))return 'ASR_SESSION_UNAVAILABLE';
  // Network/DB/current-state and unpublished-contract errors are temporary or
  // unqualified, not proof that the user's original Session has been revoked.
  return undefined;
}

/** One bounded batch. A failed/uncertain unit is never retried in this process. */
export async function runMeetingAsrHost(deps:MeetingAsrHostDependencies,signal:AbortSignal):Promise<MeetingAsrHostSummary>{
  const summary:MeetingAsrHostSummary={scanned:0,units:0,recovered:0,abandoned:0,deferred:0,failures:0,errors:{}};
  if(signal.aborted)return summary;
  const now=deps.now??Date.now,deadline=Math.min(now()+600_000,deps.deadlineAtMs??Infinity);
  const work=await deps.scan(20);summary.scanned=work.length;
  for(const item of work){
    if(signal.aborted||now()>=deadline){summary.deferred++;continue;}
    try{
      if(item.kind==='recover_unit'){
        if((await deps.recover(item.runId,item.operationToken)).recovered)summary.recovered++;
        else summary.deferred++;
      }else if(item.kind==='recover_pool'||item.deadlineExpired||!item.budgetMonthCurrent){
        const reason=item.kind==='recover_pool'?'ASR_SOURCE_UNAVAILABLE':item.deadlineExpired?'ASR_DEADLINE_EXPIRED':'ASR_BUDGET_MONTH_CHANGED';
        if(await deps.abandon(item.runId,reason))summary.abandoned++;else summary.deferred++;
      }else if(!deps.dispatchEnabled||summary.units>=4||deadline-now()<150_000){summary.deferred++;}
      else{
        // Increment before execution: an unknown claim/COMMIT still consumes
        // this slot and can only be recovered later from its original token.
        summary.units++;
        try{await deps.runUnit(item.runId,signal);}
        catch(error){
          const reason=permanentActorFailure(error);
          if(!reason)throw error;
          // SQL rechecks the run and outstanding units under the app lock;
          // a stale scan can never refund an active/dispatched unit.
          if(await deps.abandon(item.runId,reason))summary.abandoned++;else summary.deferred++;
        }
      }
    }catch(error){
      summary.failures++;
      const code=error instanceof KernelError?error.code:'ASR_HOST_UNAVAILABLE';
      summary.errors[code]=(summary.errors[code]??0)+1;
      // Independent runs remain safe to process. Never log content, source
      // paths, identity, tokens, connection strings or arbitrary error text.
    }
  }
  return summary;
}
