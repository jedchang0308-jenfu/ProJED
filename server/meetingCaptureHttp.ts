import type { IncomingMessage } from 'node:http';
import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, MAX_RECORD_BODY_BYTES, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { MeetingCaptureRepository } from './meetingCapture.js';
import { MeetingUploadRepository } from './meetingUpload.js';
import type { MeetingJobDispatchResult } from './meetingJobDispatch.js';
import { MeetingReviewRepository } from './meetingReview.js';
import { MeetingAudioService } from './meetingAudio.js';
import { currentMeetingActor } from './meetingAudioHttp.js';
import type { MeetingAudioStorage } from './meetingAudioStorage.js';

export interface MeetingCaptureJobDispatcher {
  run(signal?:AbortSignal):Promise<MeetingJobDispatchResult>;
}

function isNewCompleteUpload(value:unknown):value is {readonly sourceComplete:true;readonly runId:string;readonly idempotent:false}{
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const receipt=value as Record<string,unknown>;
  return receipt.sourceComplete===true&&typeof receipt.runId==='string'&&receipt.runId.trim().length>0
    &&receipt.idempotent===false;
}

export function createMeetingCaptureHttpDispatcher(config:RuntimeConfig,database:RuntimeDatabase,resolveActor?:TrustedSessionActorResolver,
  storage?:MeetingAudioStorage,uploads:MeetingUploadRepository|null=new MeetingUploadRepository(),
  meetingJobDispatcher?:MeetingCaptureJobDispatcher){
  const repository=new MeetingCaptureRepository();
  const reviews=new MeetingReviewRepository();
  const audio=storage?new MeetingAudioService(database,config,storage):undefined;
  return async(request:IncomingMessage,requestId:string)=>{
    if(request.url!=='/api/v1/meeting-control')return {matched:false};
    if(!resolveActor){request.resume();return {matched:true,status:404,body:{error:{code:'ENDPOINT_UNAVAILABLE',requestId,retryable:false}}};}
    if(request.method!=='POST'){request.resume();return {matched:true,status:405,body:{error:{code:'METHOD_NOT_ALLOWED',requestId,retryable:false}}};}
    if(!isSameOriginWrite(request)){request.resume();return {matched:true,status:403,body:{error:{code:'ACCESS_DENIED',requestId,retryable:false}}};}
    const controller=new AbortController(),cancel=()=>controller.abort();
    const timer=setTimeout(cancel,29_000);timer.unref();
    request.once('aborted',cancel);request.socket?.once('close',cancel);
    try{
      const body=await readJsonBody(request,MAX_RECORD_BODY_BYTES);
      const actor=await resolveActor(request,{refresh:true});assertExpectedActor(request,actor);
      if(actor.entry!=='main')throw new KernelError('ACCESS_DENIED','Meeting capture requires the main application',403);
      const currentActor=currentMeetingActor(request,actor,resolveActor,controller.signal);
      let result:unknown;
      if(body.operation==='reserve-segment'||body.operation==='verify-segment'){
        if(!audio)throw new KernelError('MEETING_STORAGE_UNAVAILABLE','Meeting audio storage is unavailable',503);
        result=body.operation==='reserve-segment'?await audio.reserve(actor,body,controller.signal)
          :await audio.verify(currentActor,body,controller.signal);
      }else if(['review','decide-match','save-projection'].includes(String(body.operation))){
        result=await runActorTransaction(database,config,actor,port=>reviews.execute(port,body),{signal:controller.signal});
      }else if(body.operation==='complete-upload'){
        if(uploads===null)throw new KernelError('ASR_PROVIDER_UNQUALIFIED','Meeting ASR provider is not qualified',503);
        result=await runActorTransaction(database,config,actor,port=>uploads.execute(port,body),{signal:controller.signal});
        // The transaction promise resolves only after COMMIT is acknowledged.
        // Dispatch is a best-effort wake-up; the durable queue remains the
        // recovery path when the request is replayed or invocation is unknown.
        if(meetingJobDispatcher&&isNewCompleteUpload(result)){
          try{
            const dispatch=await meetingJobDispatcher.run(controller.signal);
            if(dispatch.kind!=='accepted')console.error(JSON.stringify({event:'meeting_upload_job_dispatch',kind:dispatch.kind}));
          }catch{
            console.error(JSON.stringify({event:'meeting_upload_job_dispatch',kind:'error'}));
          }
        }
      }else result=await runActorTransaction(database,config,actor,port=>repository.execute(port,body),{signal:controller.signal});
      return {matched:true,status:200,body:{data:result}};
    }catch(error){
      const safe=asKernelError(error);
      if(safe.httpStatus>=500){
        const cause=safe.cause;
        const sqlState=cause&&typeof cause==='object'&&'code' in cause&&typeof cause.code==='string'
          &&/^[0-9A-Z]{5}$/u.test(cause.code)?cause.code:undefined;
        console.error(JSON.stringify({event:'meeting_capture_failed',requestId,code:safe.code,sqlState}));
      }
      return {matched:true,status:safe.httpStatus,body:{error:{code:safe.code,requestId,retryable:safe.httpStatus>=500}}};
    }finally{clearTimeout(timer);request.removeListener('aborted',cancel);request.socket?.removeListener('close',cancel);}
  };
}
