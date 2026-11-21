import type {IncomingMessage} from 'node:http';
import type {ServerActorV1} from './actorTransaction.js';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase} from './db.js';
import type {TrustedSessionActorResolver} from './domainReadHttp.js';
import {isSameOriginWrite} from './domainWriteHttp.js';
import {asKernelError,KernelError} from './errors.js';
import {assertExpectedActor} from './expectedActorHttp.js';
import {MeetingAudioService} from './meetingAudio.js';
import type {MeetingAudioStorage} from './meetingAudioStorage.js';
import {requireAudioMime,requirePositiveVersion,requireUuid} from './meetingCaptureInput.js';

export function currentMeetingActor(request:IncomingMessage,initial:ServerActorV1,
  resolve:TrustedSessionActorResolver,signal:AbortSignal){
  if(initial.entry!=='main')throw new KernelError('ACCESS_DENIED','Meeting audio requires the main application',403);
  return async()=>{
    if(signal.aborted)throw new KernelError('TRANSACTION_USAGE_INVALID','Meeting operation was cancelled',409);
    const actor=await resolve(request,{refresh:true});assertExpectedActor(request,actor);
    if(actor.localUserId!==initial.localUserId||actor.contextId!==initial.contextId||actor.principalId!==initial.principalId
      ||actor.entry!==initial.entry||actor.accountGuardRevision!==initial.accountGuardRevision)
      throw new KernelError('ACTOR_CHANGED','Meeting actor changed',409);
    if(actor.entry!=='main')throw new KernelError('ACCESS_DENIED','Meeting audio requires the main application',403);
    return actor;
  };
}
async function readAudioBody(request:IncomingMessage,signal:AbortSignal):Promise<Uint8Array>{
  const raw=request.headers['content-length'];
  if(raw!==undefined&&(typeof raw!=='string'||!/^\d+$/u.test(raw)||Number(raw)>10*1024*1024)){
    request.resume();throw new KernelError('DOMAIN_DATA_INVALID','Audio body is too large',413);
  }
  const chunks:Buffer[]=[];let size=0,tooLarge=false;
  for await(const chunk of request){
    if(signal.aborted)throw new KernelError('TRANSACTION_USAGE_INVALID','Audio upload was cancelled',409);
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;
    if(size>10*1024*1024)tooLarge=true;else chunks.push(bytes);
  }
  if(tooLarge)throw new KernelError('DOMAIN_DATA_INVALID','Audio body is too large',413);
  if(size===0||(raw!==undefined&&Number(raw)!==size))throw new KernelError('DOMAIN_DATA_INVALID','Audio body size is invalid',400);
  return Buffer.concat(chunks);
}
export interface MeetingAudioHttpResult {
  matched:boolean;status?:number;body?:unknown;
  audio?:{bytes:Uint8Array;mime:string;expiresAt:number};
}
export function createMeetingAudioHttpDispatcher(config:RuntimeConfig,database:RuntimeDatabase,
  resolveActor?:TrustedSessionActorResolver,storage?:MeetingAudioStorage){
  const service=storage?new MeetingAudioService(database,config,storage):undefined;
  return async(request:IncomingMessage,requestId:string):Promise<MeetingAudioHttpResult>=>{
    const match=/^\/api\/v1\/meeting-audio\/([0-9a-f-]{36})$/iu.exec(request.url??'');
    if(!match)return {matched:false};
    if(!resolveActor){request.resume();return {matched:true,status:404,body:{error:{code:'ENDPOINT_UNAVAILABLE',requestId,retryable:false}}};}
    if(!['GET','PUT'].includes(request.method??'')){request.resume();return {matched:true,status:405,body:{error:{code:'METHOD_NOT_ALLOWED',requestId,retryable:false}}};}
    const controller=new AbortController(),abort=()=>controller.abort();
    const timer=setTimeout(abort,29_000);timer.unref();
    request.once('aborted',abort);request.socket?.once('close',abort);
    try{
      if(request.method==='PUT'&&!isSameOriginWrite(request))throw new KernelError('ACCESS_DENIED','Audio upload requires the same origin',403);
      const initial=await resolveActor(request,{refresh:true});assertExpectedActor(request,initial);
      const currentActor=currentMeetingActor(request,initial,resolveActor,controller.signal);
      const id=requireUuid(match[1],'segmentId');
      if(!service)throw new KernelError('MEETING_STORAGE_UNAVAILABLE','Meeting audio storage is unavailable',503);
      if(request.method==='GET'){
        const record=request.headers['x-projed-record-id'];
        if(typeof record!=='string'||!record||record.length>512||/[\p{Cc}]/u.test(record))
          throw new KernelError('DOMAIN_DATA_INVALID','Audio record binding is required',400);
        const audio=await service.playback(currentActor,id,record,controller.signal);
        return {matched:true,status:200,audio};
      }
      const version=requirePositiveVersion(request.headers['x-projed-source-version']);
      const mime=requireAudioMime(request.headers['content-type']);
      const bytes=await readAudioBody(request,controller.signal);
      const data=await service.upload(currentActor,id,version,bytes,mime,controller.signal);
      return {matched:true,status:200,body:{data}};
    }catch(error){
      request.resume();const safe=asKernelError(error);
      if(safe.httpStatus>=500){
        const cause=safe.cause;
        const sqlState=cause&&typeof cause==='object'&&'code' in cause&&typeof cause.code==='string'
          &&/^[0-9A-Z]{5}$/u.test(cause.code)?cause.code:undefined;
        console.error(JSON.stringify({event:'meeting_audio_failed',requestId,code:safe.code,sqlState}));
      }
      return {matched:true,status:safe.httpStatus,body:{error:{code:safe.code,requestId,retryable:safe.httpStatus>=500}}};
    }finally{
      clearTimeout(timer);request.removeListener('aborted',abort);request.socket?.removeListener('close',abort);
    }
  };
}
