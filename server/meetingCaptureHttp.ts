import type { IncomingMessage } from 'node:http';
import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { MeetingCaptureRepository } from './meetingCapture.js';

export function createMeetingCaptureHttpDispatcher(config:RuntimeConfig,database:RuntimeDatabase,resolveActor?:TrustedSessionActorResolver){
  const repository=new MeetingCaptureRepository();
  return async(request:IncomingMessage,requestId:string)=>{
    if(request.url!=='/api/v1/meeting-control')return {matched:false};
    if(!resolveActor){request.resume();return {matched:true,status:404,body:{error:{code:'ENDPOINT_UNAVAILABLE',requestId,retryable:false}}};}
    if(request.method!=='POST'){request.resume();return {matched:true,status:405,body:{error:{code:'METHOD_NOT_ALLOWED',requestId,retryable:false}}};}
    if(!isSameOriginWrite(request)){request.resume();return {matched:true,status:403,body:{error:{code:'ACCESS_DENIED',requestId,retryable:false}}};}
    const controller=new AbortController(),cancel=()=>controller.abort();
    request.once('aborted',cancel);request.socket?.once('close',cancel);
    try{
      const body=await readJsonBody(request,2*1024*1024);
      const actor=await resolveActor(request,{refresh:true});assertExpectedActor(request,actor);
      if(actor.entry!=='main')throw new KernelError('ACCESS_DENIED','Meeting capture requires the main application',403);
      const result=await runActorTransaction(database,config,actor,port=>repository.execute(port,body),{signal:controller.signal});
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
    }finally{request.removeListener('aborted',cancel);request.socket?.removeListener('close',cancel);}
  };
}
