import {KernelError} from './errors.js';
import {MeetingCloudProviderError,type GoogleCloudMeetingProvider,type MeetingCloudGeneration} from './googleCloudMeetingProvider.js';
import {readMeetingLlmEnvelope,type MeetingLlmClaim,type MeetingLlmDatabaseRepository,
  type MeetingLlmPreparedUnit,type MeetingLlmReceipt,type MeetingLlmSettlement} from './meetingLlmRepository.js';
import {meetingLlmCharge} from './meetingLlmPricing.js';
import {buildMeetingTaskMatchPrompt,parseMeetingTaskMatchResponse} from './meetingTaskMatching.js';
import type {MeetingDiscussionSegment} from './meetingDiscussionAssembly.js';
import type {MeetingTaskCandidateSnapshot} from './meetingTaskCandidates.js';
import {parseMeetingComposeOutput,type MeetingComposeRequest} from './meetingCompose.js';
import {requireUuid} from './meetingCaptureInput.js';

export type MeetingLlmWorkerRepository=Pick<MeetingLlmDatabaseRepository,'claim'|'markDispatch'|'settle'|'readSettlement'>;
export interface MeetingLlmWorkerDependencies {
  readonly repository:MeetingLlmWorkerRepository;
  /** The host must qualify the actual project's ZDR and model binding first. */
  readonly provider:GoogleCloudMeetingProvider;
  readonly now?:()=>number;
}
export type MeetingLlmUnitResult=
  |{readonly state:'idle'|'awaiting_budget'}
  |{readonly state:'settled';readonly attemptId:string;readonly receipt:MeetingLlmReceipt};

function invalid():never{throw new KernelError('DOMAIN_DATA_INVALID','Meeting LLM unit is invalid',409);}
function interrupted():never{throw new KernelError('TRANSACTION_USAGE_INVALID','Meeting LLM unit was interrupted',409);}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function commitUnknown(error:unknown):boolean{return error instanceof KernelError&&error.code==='DB_COMMIT_UNKNOWN';}
function leaseScope(parent:AbortSignal,expiresAt:number,now:()=>number){
  const controller=new AbortController(),deadline=expiresAt-10_000;
  const abort=()=>controller.abort();
  parent.addEventListener('abort',abort,{once:true});
  if(parent.aborted||now()>=deadline)abort();
  const timer=controller.signal.aborted?undefined:setTimeout(abort,deadline-now());
  return {signal:controller.signal,active(){if(now()>=deadline)abort();if(controller.signal.aborted)interrupted();},
    dispose(){if(timer)clearTimeout(timer);parent.removeEventListener('abort',abort);}};
}
function validateClaim(claim:MeetingLlmClaim,unit:MeetingLlmPreparedUnit,now:number):void{
  for(const id of [claim.runId,claim.captureId,claim.leaseToken,claim.transcriptRevisionId])requireUuid(id,'LLM identity');
  const input=readMeetingLlmEnvelope(claim);
  if(claim.status!=='claimed'||claim.stage!==unit.stage||claim.unitKey!==unit.unitKey
    ||claim.inputHash!==unit.inputHash||claim.inputText!==unit.inputText
    ||claim.sourceVersion!==input.sourceVersion||claim.transcriptRevisionId!==input.transcriptRevisionId
    ||typeof claim.attemptId!=='string'||claim.attemptId.length<1||claim.attemptId.length>300
    ||!Number.isSafeInteger(claim.leaseExpiresAtMs)||claim.leaseExpiresAtMs<1
    ||claim.leaseExpiresAtMs>now+150_000)invalid();
}
function validateBody(unit:MeetingLlmPreparedUnit):void{
  const {body}=readMeetingLlmEnvelope(unit);
  if(unit.stage==='retrieve'){
    if(typeof body.queryText!=='string'||!body.queryText.trim()||Array.from(body.queryText).length>800
      ||Buffer.byteLength(body.queryText,'utf8')>3200)invalid();
  }else if(unit.stage==='match'){
    if(!record(body.discussion)||!Array.isArray(body.candidates)||typeof body.prompt!=='string')invalid();
    if(body.prompt!==buildMeetingTaskMatchPrompt({discussion:body.discussion as unknown as MeetingDiscussionSegment,
      candidates:body.candidates as readonly MeetingTaskCandidateSnapshot[],
      previousRawText:body.previousRawText as string|undefined,nextRawText:body.nextRawText as string|undefined}))invalid();
  }else if(!record(body.request)||body.request.nodeId!==unit.unitKey||body.request.prompt!==body.prompt
    ||typeof body.prompt!=='string'||body.request.configVersion!==readMeetingLlmEnvelope(unit).configVersion)invalid();
}
function generationMetadata(response:MeetingCloudGeneration){
  return {...(response.modelVersion===null?{}:{modelVersion:response.modelVersion}),
    ...(response.responseId===null?{}:{responseId:response.responseId})};
}
function generationSettlement(claim:MeetingLlmClaim,response:MeetingCloudGeneration):MeetingLlmSettlement{
  if(!response.usage||!response.modelVersion||!/^gemini-3\.5-flash(?:-\d{3})?$/u.test(response.modelVersion)
    ||meetingLlmCharge(claim.stage,response.usage)===null)return {kind:'usage_unknown',code:'LLM_USAGE_UNAVAILABLE'};
  const metadata=generationMetadata(response);
  if(response.outcome!=='generated'||response.text===null||response.usage.cachedTokens!==0){
    return {kind:'unusable',code:'LLM_RESULT_UNUSABLE',usage:response.usage,...metadata};
  }
  let result:unknown;
  try{
    const {body}=readMeetingLlmEnvelope(claim);
    if(claim.stage==='match')result={matches:parseMeetingTaskMatchResponse(response.text,{
      discussion:body.discussion as unknown as MeetingDiscussionSegment,
      candidates:body.candidates as readonly MeetingTaskCandidateSnapshot[]})};
    else result={result:parseMeetingComposeOutput(body.request as unknown as MeetingComposeRequest,response.text)};
  }catch{return {kind:'unusable',code:'LLM_RESULT_INVALID',usage:response.usage,...metadata};}
  return {kind:'completed',usage:response.usage,resultText:JSON.stringify(result),...metadata};
}

/** One paid unit at most. No model call for validation, no provider retries,
 * and no business transaction held over network I/O. Free/local units belong
 * to the planner's explicit path; this driver never fabricates dispatch/usage. */
export async function runMeetingLlmUnit(deps:MeetingLlmWorkerDependencies,prepared:MeetingLlmPreparedUnit,
  signal:AbortSignal):Promise<MeetingLlmUnitResult>{
  if(signal.aborted)interrupted();
  const unit=Object.freeze({...prepared});validateBody(unit);
  const claimed=await deps.repository.claim(unit);
  if(claimed===null)return {state:'idle'};
  if(claimed==='awaiting_budget')return {state:'awaiting_budget'};
  const claim=Object.freeze({...claimed}),now=deps.now??Date.now;
  validateClaim(claim,unit,now());
  const lease=leaseScope(signal,claim.leaseExpiresAtMs,now);
  let invoked=false,payload:MeetingLlmSettlement;
  try{
    try{
      lease.active();
      let authorized:boolean;
      try{authorized=await deps.repository.markDispatch(claim);}
      catch(error){if(!commitUnknown(error))throw error;authorized=await deps.repository.markDispatch(claim,true);}
      if(!authorized)payload={kind:'not_sent',code:'LLM_DISPATCH_UNAVAILABLE'};
      else{
        lease.active();
        const {body}=readMeetingLlmEnvelope(claim);
        invoked=true;
        if(claim.stage==='retrieve'){
          const response=await deps.provider.embedQuery({text:body.queryText as string,signal:lease.signal});
          const usage={tokenCount:response.tokenCount,billableCharacterCount:response.billableCharacterCount};
          if(meetingLlmCharge('retrieve',usage,Buffer.byteLength(body.queryText as string,'utf8'))===null){
            payload={kind:'usage_unknown',code:'LLM_USAGE_UNAVAILABLE'};
          }else if(!Array.isArray(response.values)||response.values.length!==3072
            ||response.values.some(value=>!Number.isFinite(value)||!Number.isFinite(Math.fround(value)))
            ||response.values.every(value=>Math.fround(value)===0)){
            payload={kind:'unusable',code:'LLM_RESULT_INVALID',usage,modelVersion:'gemini-embedding-001'};
          }else payload={kind:'completed',usage,modelVersion:'gemini-embedding-001',
            resultText:JSON.stringify({embedding:response.values.map(Math.fround)})};
        }else payload=generationSettlement(claim,await deps.provider.generateJson({prompt:body.prompt as string,
          maxOutputTokens:8192,signal:lease.signal}));
      }
    }catch(error){
      if(claim.stage==='retrieve'&&error instanceof MeetingCloudProviderError&&error.embeddingUsage
        &&meetingLlmCharge('retrieve',error.embeddingUsage,
          Buffer.byteLength(readMeetingLlmEnvelope(claim).body.queryText as string,'utf8'))!==null){
        payload={kind:'unusable',code:'LLM_RESULT_INVALID',usage:error.embeddingUsage,modelVersion:'gemini-embedding-001'};
      }else{
        const knownNotSent=!invoked||(error instanceof MeetingCloudProviderError&&!error.requestSent);
        payload={kind:knownNotSent?'not_sent':'usage_unknown',code:knownNotSent?'LLM_REQUEST_NOT_SENT':'LLM_USAGE_UNAVAILABLE'};
      }
    }
    // Cost settlement survives abort. Only persistence may authorize a private
    // checkpoint, after rechecking the original Session/source/current WBS.
    let saved:MeetingLlmReceipt;
    try{saved=await deps.repository.settle(claim,payload);}
    catch(error){
      if(!commitUnknown(error))throw error;
      const existing=await deps.repository.readSettlement(claim);
      // This is the actual immutable receipt for this token, including a
      // recovery's unknown/unpublished outcome; never assert that the local
      // completed payload was published. Only stored private checkpoints count.
      // Readback serializes behind any uncertain commit. If still absent,
      // replay this same settlement once; never repeat the provider request.
      saved=existing??await deps.repository.settle(claim,payload);
    }
    return {state:'settled',attemptId:claim.attemptId,receipt:saved};
  }finally{lease.dispose();}
}
