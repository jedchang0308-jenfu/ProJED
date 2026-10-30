import {KernelError} from './errors.js';
import {runMeetingAsrHost,type MeetingAsrHostDependencies,type MeetingAsrHostSummary} from './meetingAsrHost.js';
import {runMeetingDiscussionHost,type MeetingDiscussionHostDependencies,type MeetingDiscussionHostSummary} from './meetingDiscussionHost.js';
import {runMeetingLlmHost,type MeetingLlmHostDependencies,type MeetingLlmHostSummary} from './meetingLlmHost.js';

export interface MeetingBackgroundDependencies {
  readonly asr:MeetingAsrHostDependencies;
  readonly discussion:MeetingDiscussionHostDependencies;
  readonly llm:MeetingLlmHostDependencies;
  readonly deadlineAtMs:number;
  readonly now?:()=>number;
}

function accumulate<T extends {errors:Record<string,number>}>(total:T,round:T):void{
  for(const key of Object.keys(round) as (keyof T)[]){
    const value=round[key],previous=total[key];
    if(typeof value==='number'&&typeof previous==='number')total[key]=(previous+value) as T[keyof T];
  }
  for(const [code,count] of Object.entries(round.errors))total.errors[code]=(total.errors[code]??0)+count;
}

/** Continue only after a confirmed private checkpoint, within one Job's original
 * deadline. An uncertain/failed run cannot re-enter private work in this process;
 * its durable token is left for a later independent recovery execution. */
export async function runMeetingBackgroundHost(deps:MeetingBackgroundDependencies,signal:AbortSignal){
  const now=deps.now??Date.now,started=now(),deadline=Math.min(deps.deadlineAtMs,started+600_000);
  if(!Number.isFinite(started)||!Number.isFinite(deadline))
    throw new KernelError('CONFIG_INVALID','Meeting Job deadline is invalid',503);
  const asr:MeetingAsrHostSummary={scanned:0,units:0,recovered:0,abandoned:0,deferred:0,failures:0,errors:{}};
  const discussion:MeetingDiscussionHostSummary={scanned:0,units:0,completed:0,sources:0,abandoned:0,deferred:0,failures:0,errors:{}};
  const llm:MeetingLlmHostSummary={scanned:0,units:0,recovered:0,published:0,local:0,abandoned:0,deferred:0,failures:0,errors:{}};
  const blocked=new Set<string>();
  const unavailablePhases=new Set<string>();
  let rounds=0,progress=0;
  const privateUnit=async<T>(runId:string,run:()=>Promise<T>,committed:(result:T)=>boolean):Promise<T>=>{
    try{
      const result=await run();
      if(committed(result))progress++;else blocked.add(runId);
      return result;
    }catch(error){blocked.add(runId);throw error;}
  };
  const recordFailure=(phase:string,total:{failures:number;errors:Record<string,number>},error:unknown)=>{
    unavailablePhases.add(phase);total.failures++;
    const code=error instanceof KernelError?error.code:'MEETING_BACKGROUND_UNAVAILABLE';
    total.errors[code]=(total.errors[code]??0)+1;
  };
  do{
    if(signal.aborted||now()>=deadline)break;
    rounds++;progress=0;
    if(!unavailablePhases.has('asr'))try{
      accumulate(asr,await runMeetingAsrHost({...deps.asr,now,deadlineAtMs:deadline,
        scan:async limit=>(await deps.asr.scan(limit)).filter(item=>item.kind!=='queued'
          ||item.deadlineExpired||!item.budgetMonthCurrent||!blocked.has(item.runId)),
        recover:async(runId,token)=>{blocked.add(runId);return deps.asr.recover(runId,token);},
        runUnit:(runId,unitSignal)=>privateUnit(runId,()=>deps.asr.runUnit(runId,unitSignal),result=>result.state==='published'),
      },signal));
    }catch(error){recordFailure('asr',asr,error);}
    if(!unavailablePhases.has('discussion'))try{
      accumulate(discussion,await runMeetingDiscussionHost({...deps.discussion,now,deadlineAtMs:deadline,
        scan:async limit=>(await deps.discussion.scan(limit)).filter(item=>item.deadlineExpired||!blocked.has(item.runId)),
        runUnit:(runId,unitSignal)=>privateUnit(runId,()=>deps.discussion.runUnit(runId,unitSignal),result=>result.state==='source_complete'),
      },signal));
    }catch(error){recordFailure('discussion',discussion,error);}
    if(!unavailablePhases.has('llm'))try{
      accumulate(llm,await runMeetingLlmHost({...deps.llm,now,deadlineAtMs:deadline,
        scan:async limit=>(await deps.llm.scan(limit)).filter(item=>item.kind==='recover'
          ||item.deadlineExpired||!blocked.has(item.runId)),
        recover:async(runId,token)=>{blocked.add(runId);return deps.llm.recover(runId,token);},
        runNext:(runId,unitSignal)=>privateUnit(runId,()=>deps.llm.runNext(runId,unitSignal),
          result=>result.state==='local_completed'||result.state==='published'
            ||(result.state==='settled'&&result.checkpointPublished===true)),
      },signal));
    }catch(error){recordFailure('llm',llm,error);}
    // No timer polling, recursive jobs.run or provider retry. The next recovery
    // schedule can resume the persisted queue if there is insufficient headroom.
  }while(progress>0&&!signal.aborted&&deadline-now()>=150_000);
  return {rounds,asr,discussion,llm,deferredRuns:blocked.size,failures:asr.failures+discussion.failures+llm.failures};
}
