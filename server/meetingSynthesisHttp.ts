import {createHash,randomUUID} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {runActorTransaction,type ServerActorV1} from './actorTransaction.js';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase} from './db.js';
import {resolveBoard,type BoardIdentity} from './domainRead.js';
import type {TrustedSessionActorResolver} from './domainReadHttp.js';
import {isSameOriginWrite,readJsonBody} from './domainWriteHttp.js';
import {asKernelError,KernelError} from './errors.js';
import {assertExpectedActor} from './expectedActorHttp.js';
import type {RagProvider} from './geminiRagProvider.js';
import {buildMeetingSynthesisPrompt,completeMeetingSynthesis,MeetingSynthesisQualityError,
  parseMeetingSynthesisRequest} from './meetingSynthesis.js';

export type MeetingSynthesisModel = 'gemini-3.5-flash'|'gemini-3.1-flash-lite';
export type MeetingSynthesisProvider = Pick<RagProvider,'generate'>;

export function parseMeetingSynthesisModel(value:string|undefined):MeetingSynthesisModel|undefined {
  if(!value)return undefined;
  if(value==='gemini-3.5-flash'||value==='gemini-3.1-flash-lite')return value;
  throw new KernelError('CONFIG_INVALID','Meeting synthesis model is not supported',503);
}

function resourceRef(value:string):string {
  let decoded:string;
  try{decoded=decodeURIComponent(value);}catch{throw new KernelError('DOMAIN_DATA_INVALID','Resource reference is invalid',400);}
  if(!decoded||decoded.length>512||decoded==='.'||decoded==='..'||/[\\/]/u.test(decoded)
    ||Array.from(decoded).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)) {
    throw new KernelError('DOMAIN_DATA_INVALID','Resource reference is invalid',400);
  }
  return decoded;
}

function sameActor(left:ServerActorV1,right:ServerActorV1):boolean {
  return left.localUserId===right.localUserId&&left.principalId===right.principalId
    &&left.contextId===right.contextId&&left.entry===right.entry
    &&left.accountGuardRevision===right.accountGuardRevision;
}

export function createMeetingSynthesisHttpDispatcher(
  config:RuntimeConfig,database:RuntimeDatabase,resolveActor?:TrustedSessionActorResolver,
  provider?:MeetingSynthesisProvider,configuredModel?:MeetingSynthesisModel,
) {
  return async(request:IncomingMessage,requestId:string)=>{
    const path=request.url??'';
    if(!/^\/api\/v1\/workspaces\/[^/]+\/boards\/[^/]+\/meeting:synthesize$/u.test(path))return{matched:false};
    if(!resolveActor){request.resume();return{matched:true,status:404,body:{error:{code:'ENDPOINT_UNAVAILABLE',requestId,retryable:false}}};}
    if(request.method!=='POST'){request.resume();return{matched:true,status:405,body:{error:{code:'METHOD_NOT_ALLOWED',requestId,retryable:false}}};}
    if(!isSameOriginWrite(request)){request.resume();return{matched:true,status:403,body:{error:{code:'ACCESS_DENIED',requestId,retryable:false}}};}
    const controller=new AbortController();
    const cancel=()=>controller.abort();
    request.once('aborted',cancel);request.socket?.once('close',cancel);
    const timer=setTimeout(cancel,29_000);timer.unref();
    let phase='authorization';
    try{
      const parts=path.split('/');
      const workspaceRef=resourceRef(parts[4]!),boardRef=resourceRef(parts[6]!);
      const initial=await resolveActor(request);assertExpectedActor(request,initial);
      const currentActor=async()=>{
        if(controller.signal.aborted)throw new KernelError('RAG_TIMEOUT','Meeting synthesis was cancelled',504);
        const actor=await resolveActor(request,{refresh:true});assertExpectedActor(request,actor);
        if(!sameActor(initial,actor))throw new KernelError('ACTOR_CHANGED','Meeting actor changed',409);
        return actor;
      };
      const authorize=async():Promise<BoardIdentity>=>{
        const actor=await currentActor();
        return runActorTransaction(database,config,actor,async port=>{
          const board=await resolveBoard(port,workspaceRef,boardRef);
          const access=await port.query<{allowed:boolean}>(`SELECT
            projed_core.actor_has_board_capability_v1($1::uuid,$2::uuid,'read_board') AS allowed`,[board.tenantId,board.id]);
          if(access.rows[0]?.allowed!==true)throw new KernelError('ACCESS_DENIED','Meeting scope is unavailable',403);
          return board;
        },{signal:controller.signal});
      };
      const scope=await authorize();
      const source=parseMeetingSynthesisRequest(await readJsonBody(request,2*1024*1024));
      if(!provider)throw new KernelError('RAG_PROVIDER_UNAVAILABLE','Meeting provider is unavailable',503);
      // The source is a user-authored draft snapshot. This endpoint retrieves no
      // private record/task bodies and performs no record or task mutation.
      const prompt=buildMeetingSynthesisPrompt(source.input);
      const models:MeetingSynthesisModel[]=configuredModel?[configuredModel]:['gemini-3.5-flash','gemini-3.1-flash-lite'];
      let output:string|undefined,model:MeetingSynthesisModel=models[0]!;
      const warnings:string[]=[];
      phase='generation';
      for(let index=0;index<models.length;index++){
        model=models[index]!;
        await authorize();
        try{
          output=await provider.generate({model,prompt,responseMimeType:'application/json',temperature:0.2},controller.signal);
          break;
        }catch(error){
          if(error instanceof KernelError&&error.code==='RAG_MODEL_UNAVAILABLE'&&models[index+1]){
            warnings.push(`模型 ${model} 不可用，已改用 ${models[index+1]}。`);
            continue;
          }
          throw error;
        }
      }
      if(output===undefined)throw new KernelError('EMPTY_SYNTHESIS','Meeting provider returned no draft',502);
      phase='quality';
      const result=completeMeetingSynthesis(source,output,{runId:randomUUID(),model});
      result.warnings=[...warnings,...result.warnings];
      phase='response-revalidation';
      const actor=await currentActor();
      await runActorTransaction(database,config,actor,async port=>{
        const current=await resolveBoard(port,workspaceRef,boardRef);
        if(current.id!==scope.id||current.tenantId!==scope.tenantId)
          throw new KernelError('SYNTHESIS_SCOPE_CHANGED','Meeting scope changed',409);
        const log=await port.query(`INSERT INTO projed_core.llm_access_logs
          (id,tenant_id,project_id,actor_id,provider,model,prompt_hash,retrieved_chunk_ids,response_metadata)
          SELECT $1::uuid,$2::uuid,$3::uuid,projed_core.current_actor_user_id_v1(),'google',$4,$5,'{}'::uuid[],$6::jsonb
          WHERE projed_core.actor_has_board_capability_v1($2::uuid,$3::uuid,'read_board') RETURNING id`,
        [randomUUID(),scope.tenantId,scope.id,model,createHash('sha256').update(JSON.stringify(source.input),'utf8').digest('hex'),
          JSON.stringify({purpose:'meeting_synthesis',runId:result.runId,contentLength:result.content.length,
            normalization:result.normalization})]);
        if(log.rowCount!==1)throw new KernelError('ACCESS_DENIED','Meeting scope is unavailable',403);
      },{signal:controller.signal});
      if(controller.signal.aborted)throw new KernelError('RAG_TIMEOUT','Meeting synthesis was cancelled',504);
      return{matched:true,status:200,body:{data:result}};
    }catch(error){
      const safe=controller.signal.aborted?new KernelError('RAG_TIMEOUT','Meeting synthesis was cancelled',504):asKernelError(error);
      if(safe.httpStatus>=500){
        const cause=safe.cause;
        const code=cause&&typeof cause==='object'&&'code' in cause?cause.code:undefined;
        console.error(JSON.stringify({event:'meeting_synthesis_failed',requestId,phase,code:safe.code,
          sqlState:typeof code==='string'&&/^[0-9A-Z]{5}$/u.test(code)?code:undefined}));
      }
      return{matched:true,status:safe.httpStatus,body:{error:{code:safe.code,requestId,
        retryable:safe.httpStatus>=500||safe.httpStatus===429,
        ...(error instanceof MeetingSynthesisQualityError?{details:error.details}:{})}}};
    }finally{
      clearTimeout(timer);request.removeListener('aborted',cancel);request.socket?.removeListener('close',cancel);
    }
  };
}
