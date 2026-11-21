import {KernelError} from './errors.js';
import type {GoogleCloudMeetingProvider} from './googleCloudMeetingProvider.js';
import {createPostgresMeetingLlmTransactions,createPostgresMeetingLlmRepository,type MeetingLlmPostgresOptions} from './meetingLlmRepository.js';
import {planMeetingLlmWork} from './meetingLlmPlan.js';
import {runMeetingLlmUnit} from './meetingLlmWorker.js';
import {runMeetingMaintenanceTransaction} from './meetingAsrRepository.js';
import {parseMeetingLlmScannedWork,type MeetingLlmFinishReason} from './meetingLlmHost.js';
import {requireUuid} from './meetingCaptureInput.js';

export type MeetingLlmPipelineResult={readonly state:'idle'|'deferred'|'local_completed'|'published'|'settled';readonly checkpointPublished?:boolean};
/** Recompute local/final work inside its WRITE transaction. A plan observed in
 * another transaction is never sufficient authority to publish a result. */
export function createPostgresMeetingLlmPipeline(options:MeetingLlmPostgresOptions){
  const transactions=createPostgresMeetingLlmTransactions(options),repository=createPostgresMeetingLlmRepository(options);
  return async(provider:GoogleCloudMeetingProvider|null,signal:AbortSignal):Promise<MeetingLlmPipelineResult>=>{
    if(signal.aborted)return {state:'deferred'};
    const outcome=await transactions.actor(async(port,scope)=>{
      const work=await planMeetingLlmWork(port,scope,options.runId);
      if(signal.aborted)return {kind:'deferred'} as const;
      if(work.kind==='idle'||work.kind==='paid')return work;
      if(work.kind==='local'){
        const result=await port.query<{saved:boolean}>('SELECT projed_core.commit_meeting_local_match_v1($1::uuid,$2::jsonb) AS saved',
          [options.runId,JSON.stringify(work.unit)]);
        if(result.rows.length!==1||typeof result.rows[0]?.saved!=='boolean')throw new KernelError('DB_BOUNDARY_INVALID','Local meeting progress is invalid',503);
        return {kind:result.rows[0].saved?'local_completed':'deferred'} as const;
      }
      const payload={sourceVersion:work.sourceVersion,transcriptRevisionId:work.transcriptRevisionId,summary:work.summary,
        discussions:work.discussions.map(({segmentId,candidates,matches})=>({segmentId,candidates,matches})),proofs:work.proofs};
      const result=await port.query<{saved:boolean}>('SELECT projed_core.publish_meeting_analysis_v1($1::uuid,$2::jsonb) AS saved',
        [options.runId,JSON.stringify(payload)]);
      if(result.rows.length!==1||typeof result.rows[0]?.saved!=='boolean')throw new KernelError('DB_BOUNDARY_INVALID','Meeting publication is invalid',503);
      return {kind:result.rows[0].saved?'published':'deferred'} as const;
    });
    if(outcome.kind!=='paid')return {state:outcome.kind};
    if(provider===null||signal.aborted)return {state:'deferred'};
    const result=await runMeetingLlmUnit({repository,provider},outcome.unit,signal);
    if(result.state!=='settled')return {state:result.state==='idle'?'idle':'deferred'};
    return {state:'settled',checkpointPublished:result.receipt.published};
  };
}

/** These operations return only queue/lease/terminal metadata. */
export function createPostgresMeetingLlmControl(options:Pick<MeetingLlmPostgresOptions,'database'|'config'>){
  const {database,config}=options;
  return {
    scan:(maxItems:number)=>runMeetingMaintenanceTransaction(database,config,async query=>{
      if(!Number.isInteger(maxItems)||maxItems<1||maxItems>20)throw new KernelError('DB_BOUNDARY_INVALID','Meeting scan limit is invalid',503);
      const result=await query<{work:unknown}>('SELECT projed_core.scan_meeting_llm_work_v1($1::integer) AS work',[maxItems]);
      if(result.rows.length!==1)throw new KernelError('DB_BOUNDARY_INVALID','Meeting scan is invalid',503);
      return parseMeetingLlmScannedWork(result.rows[0]?.work,maxItems);
    }),
    finish:(runId:string,reason:MeetingLlmFinishReason)=>{
      requireUuid(runId,'runId');
      return runMeetingMaintenanceTransaction(database,config,async query=>{
        const result=await query<{finished:boolean}>('SELECT projed_core.finish_meeting_llm_work_v1($1::uuid,$2::text) AS finished',[runId,reason]);
        if(result.rows.length!==1||typeof result.rows[0]?.finished!=='boolean')throw new KernelError('DB_BOUNDARY_INVALID','Meeting finish is invalid',503);
        return result.rows[0].finished;
      });
    },
  };
}
