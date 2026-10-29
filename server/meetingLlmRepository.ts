import {createHash,randomUUID} from 'node:crypto';
import {runActorTransaction,type ActorQueryPort,type ServerActorV1} from './actorTransaction.js';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase,ScopedQuery} from './db.js';
import {KernelError} from './errors.js';
import {requireUuid} from './meetingCaptureInput.js';
import {runMeetingMaintenanceTransaction} from './meetingAsrRepository.js';
import {MEETING_LLM_CONFIG_VERSION,type MeetingLlmStage,type MeetingLlmUsage} from './meetingLlmPricing.js';
import {buildMeetingTaskMatchPrompt} from './meetingTaskMatching.js';
import {readCurrentMeetingTaskSnapshots} from './meetingTaskRead.js';
import type {MeetingTaskCandidateSnapshot,MeetingTaskCandidateScope} from './meetingTaskCandidates.js';
import type {MeetingDiscussionSegment} from './meetingDiscussionAssembly.js';
import {buildMeetingComposePrompt,createMeetingComposePlan,type MeetingComposeResult} from './meetingCompose.js';

const HASH=/^[a-f0-9]{64}$/u;
const MAX_WIRE_BYTES=1048576;
const ACTOR_UNAVAILABLE=new Set(['ACTOR_INVALID','ACTOR_CHANGED','ACCESS_DENIED','RESOURCE_NOT_FOUND','IDENTITY_INVALID',
  'IDENTITY_CONTRACT_UNAVAILABLE','IDENTITY_MAPPING_CONFLICT','IDENTITY_STATE_UNAVAILABLE']);
export interface MeetingLlmPreparedUnit {
  readonly stage:MeetingLlmStage;readonly unitKey:string;readonly inputHash:string;readonly inputText:string;
}
export interface MeetingLlmEnvelope {
  readonly configVersion:typeof MEETING_LLM_CONFIG_VERSION;readonly sourceVersion:number;
  readonly transcriptRevisionId:string;readonly body:Readonly<Record<string,unknown>>;
}
export interface MeetingLlmClaim extends MeetingLlmPreparedUnit {
  readonly status:'claimed';readonly runId:string;readonly captureId:string;readonly sourceVersion:number;
  readonly transcriptRevisionId:string;readonly leaseToken:string;readonly leaseExpiresAtMs:number;readonly attemptId:string;
}
export type MeetingLlmSettlement=
  |{readonly kind:'completed';readonly usage:MeetingLlmUsage;readonly resultText:string;readonly modelVersion?:string;readonly responseId?:string}
  |{readonly kind:'unusable';readonly usage:MeetingLlmUsage;readonly code:string;readonly modelVersion?:string;readonly responseId?:string}
  |{readonly kind:'not_sent'|'usage_unknown';readonly code:string};
export interface MeetingLlmReceipt {
  readonly kind:MeetingLlmSettlement['kind'];readonly published:boolean;readonly chargeMicros:number|null;
  readonly requestHash:string;readonly costBasis:'budget_estimate_not_invoice';readonly resultHash?:string|null;
}
export interface MeetingLlmTransactions {
  actor<T>(operation:(port:ActorQueryPort,scope:MeetingTaskCandidateScope)=>Promise<T>):Promise<T>;
  accounting<T>(operation:(query:ScopedQuery)=>Promise<T>):Promise<T>;
}
function invalid():never{throw new KernelError('DB_BOUNDARY_INVALID','Meeting LLM persistence is invalid',503);}
function badInput():never{throw new KernelError('DOMAIN_DATA_INVALID','Meeting LLM input is invalid',409);}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function hash(text:string):string{return createHash('sha256').update(text).digest('hex');}
function boundedJson(text:string):Record<string,unknown>{
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_WIRE_BYTES)badInput();
  let value:unknown;try{value=JSON.parse(text);}catch{badInput();}
  if(!record(value))badInput();return value;
}
export function readMeetingLlmEnvelope(unit:MeetingLlmPreparedUnit):MeetingLlmEnvelope{
  if(!unit||!['retrieve','match','compose'].includes(unit.stage)||typeof unit.unitKey!=='string'
    ||!(/^[a-z0-9:-]{1,96}$/u.test(unit.unitKey))||typeof unit.inputHash!=='string'||typeof unit.inputText!=='string'
    ||!HASH.test(unit.inputHash)||hash(unit.inputText)!==unit.inputHash)badInput();
  const value=boundedJson(unit.inputText);
  if(value.configVersion!==MEETING_LLM_CONFIG_VERSION||!Number.isSafeInteger(value.sourceVersion)||Number(value.sourceVersion)<1
    ||typeof value.transcriptRevisionId!=='string'||!record(value.body))badInput();
  requireUuid(value.transcriptRevisionId,'transcriptRevisionId');
  return value as unknown as MeetingLlmEnvelope;
}
const envelope=readMeetingLlmEnvelope;
export function prepareMeetingLlmUnit(stage:MeetingLlmStage,unitKey:string,input:MeetingLlmEnvelope):MeetingLlmPreparedUnit{
  let inputText:string;try{inputText=JSON.stringify(input);}catch{badInput();}
  const unit={stage,unitKey,inputHash:hash(inputText),inputText};envelope(unit);
  return Object.freeze(unit);
}
function claimResult(value:unknown,runId:string,token:string,unit:MeetingLlmPreparedUnit):MeetingLlmClaim|null|'awaiting_budget'{
  if(value===null)return null;
  if(!record(value))invalid();
  if(value.status==='awaiting_budget'&&Object.keys(value).length===1)return 'awaiting_budget';
  if(value.status!=='claimed'||value.runId!==runId||value.leaseToken!==token||value.stage!==unit.stage||value.unitKey!==unit.unitKey
    ||value.inputHash!==unit.inputHash||value.inputText!==unit.inputText||typeof value.captureId!=='string'
    ||typeof value.transcriptRevisionId!=='string'||!Number.isSafeInteger(value.sourceVersion)||Number(value.sourceVersion)<1
    ||!Number.isSafeInteger(value.leaseExpiresAtMs)||Number(value.leaseExpiresAtMs)<1
    ||typeof value.attemptId!=='string'||value.attemptId.length>300||value.attemptId.length<1)invalid();
  requireUuid(value.captureId,'captureId');requireUuid(value.transcriptRevisionId,'transcriptRevisionId');
  const input=envelope(unit);
  if(value.sourceVersion!==input.sourceVersion||value.transcriptRevisionId!==input.transcriptRevisionId)invalid();
  return value as unknown as MeetingLlmClaim;
}
function receipt(value:unknown):MeetingLlmReceipt{
  if(!record(value)||!['completed','unusable','not_sent','usage_unknown'].includes(String(value.kind))
    ||typeof value.published!=='boolean'||typeof value.requestHash!=='string'||!HASH.test(value.requestHash)
    ||value.costBasis!=='budget_estimate_not_invoice'||!(value.chargeMicros===null
      ||(Number.isSafeInteger(value.chargeMicros)&&Number(value.chargeMicros)>=0&&Number(value.chargeMicros)<=111000000))
    ||(value.kind==='usage_unknown'?value.chargeMicros!==null:value.chargeMicros===null)
    ||(value.published&&value.kind!=='completed'))invalid();
  return value as unknown as MeetingLlmReceipt;
}
function withoutPrivateResult(payload:Extract<MeetingLlmSettlement,{kind:'completed'}>,code:string):MeetingLlmSettlement{
  return {kind:'unusable',usage:payload.usage,code,
    ...(payload.modelVersion===undefined?{}:{modelVersion:payload.modelVersion}),
    ...(payload.responseId===undefined?{}:{responseId:payload.responseId})};
}

/** Live WBS snapshots and compose dependencies are checked inside the SAME
 * actor transaction that marks dispatch or stores its private result. */
export async function meetingLlmInputIsCurrent(port:ActorQueryPort,scope:MeetingTaskCandidateScope,
  runId:string,unit:MeetingLlmPreparedUnit):Promise<boolean>{
  const input=envelope(unit),body=input.body;
  if(unit.stage==='retrieve')return typeof body.queryText==='string'&&Buffer.byteLength(body.queryText,'utf8')<=3200;
  if(unit.stage==='match'){
    if(!record(body.discussion)||!Array.isArray(body.candidates)||typeof body.prompt!=='string')badInput();
    const discussion=body.discussion as unknown as MeetingDiscussionSegment;
    const candidates=body.candidates as readonly MeetingTaskCandidateSnapshot[];
    const adjacent=await port.query<{segment_index:number;raw_text:string}>(`SELECT segment_index,raw_text FROM projed_core.meeting_transcript_segments
      WHERE producer_run_id=$1::uuid AND transcript_revision_id=$2::uuid AND segment_index IN($3::integer,$4::integer)`,
    [runId,input.transcriptRevisionId,discussion.segmentIndex-1,discussion.segmentIndex+1]);
    const previousRawText=adjacent.rows.find(row=>row.segment_index===discussion.segmentIndex-1)?.raw_text;
    const nextRawText=adjacent.rows.find(row=>row.segment_index===discussion.segmentIndex+1)?.raw_text;
    if(body.previousRawText!==previousRawText||body.nextRawText!==nextRawText)return false;
    if(body.prompt!==buildMeetingTaskMatchPrompt({discussion,candidates,previousRawText,nextRawText}))return false;
    return await readCurrentMeetingTaskSnapshots(port,scope,candidates)!==null;
  }
  if(!record(body.request)||typeof body.prompt!=='string')badInput();
  const leaves=await port.query<{id:string;raw_text:string}>(`SELECT id::text,raw_text FROM projed_core.meeting_transcript_segments
    WHERE producer_run_id=$1::uuid AND transcript_revision_id=$2::uuid ORDER BY segment_index`,[runId,input.transcriptRevisionId]);
  const checkpoints=await port.query<{unit_key:string;payload_text:string}>(`SELECT unit_key,payload_text FROM projed_core.meeting_llm_unit_checkpoints
    WHERE run_id=$1::uuid AND transcript_revision_id=$2::uuid AND stage='compose' AND slot='result' ORDER BY created_at,id`,
  [runId,input.transcriptRevisionId]);
  const results=new Map<string,MeetingComposeResult>();
  for(const row of checkpoints.rows){
    const parsed=boundedJson(row.payload_text),result=parsed.result;
    if(!record(result))invalid();
    if(results.has(row.unit_key)&&JSON.stringify(results.get(row.unit_key))!==JSON.stringify(result))invalid();
    results.set(row.unit_key,result as unknown as MeetingComposeResult);
  }
  const plan=createMeetingComposePlan({configVersion:MEETING_LLM_CONFIG_VERSION,
    leaves:leaves.rows.map(row=>({sourceId:row.id,summary:row.raw_text}))});
  const expected=buildMeetingComposePrompt(plan,unit.unitKey,results);
  return body.prompt===expected.prompt&&body.request.nodeId===expected.nodeId&&body.request.configVersion===expected.configVersion
    &&body.request.childHash===expected.childHash&&body.request.prompt===expected.prompt
    &&JSON.stringify(body.request.childIds)===JSON.stringify(expected.childIds)
    &&JSON.stringify(body.request.sourceIds)===JSON.stringify(expected.sourceIds);
}

export class MeetingLlmDatabaseRepository {
  constructor(readonly runId:string,private readonly transactions:MeetingLlmTransactions){requireUuid(runId,'runId');}
  #check(claim:MeetingLlmClaim):void{
    if(claim.runId!==this.runId)invalid();requireUuid(claim.leaseToken,'leaseToken');envelope(claim);
  }
  async claim(unit:MeetingLlmPreparedUnit):Promise<MeetingLlmClaim|null|'awaiting_budget'>{
    envelope(unit);const token=randomUUID();
    // An uncertain claim is never repeated under a different token.
    return this.transactions.actor(async(port,scope)=>{
      if(!await meetingLlmInputIsCurrent(port,scope,this.runId,unit))return null;
      const result=await port.query<{claim:unknown}>('SELECT projed_core.claim_meeting_llm_unit_v1($1::uuid,$2::uuid,$3::jsonb) AS claim',
        [this.runId,token,JSON.stringify(unit)]);
      if(result.rows.length!==1)invalid();return claimResult(result.rows[0]?.claim,this.runId,token,unit);
    });
  }
  async markDispatch(claim:MeetingLlmClaim,readOnly=false):Promise<boolean>{
    this.#check(claim);
    return this.transactions.actor(async(port,scope)=>{
      if(!await meetingLlmInputIsCurrent(port,scope,this.runId,claim))return false;
      const result=await port.query<{marked:boolean}>('SELECT projed_core.mark_meeting_llm_dispatch_v1($1::uuid,$2::uuid,$3::text,$4::boolean) AS marked',
        [this.runId,claim.leaseToken,claim.inputHash,readOnly]);
      if(result.rows.length!==1||typeof result.rows[0]?.marked!=='boolean')invalid();return result.rows[0].marked;
    });
  }
  async settle(claim:MeetingLlmClaim,payload:MeetingLlmSettlement):Promise<MeetingLlmReceipt>{
    this.#check(claim);
    if(payload.kind==='completed')boundedJson(payload.resultText);
    const save=async(query:ScopedQuery,input:MeetingLlmSettlement)=>{
      const result=await query<{receipt:unknown}>('SELECT projed_core.settle_meeting_llm_unit_v1($1::uuid,$2::uuid,$3::jsonb) AS receipt',
        [this.runId,claim.leaseToken,JSON.stringify(input)]);
      if(result.rows.length!==1)return invalid();return receipt(result.rows[0]?.receipt);
    };
    let entered=false;
    try{
      return await this.transactions.actor(async(port,scope)=>{
        entered=true;
        const fresh=payload.kind!=='completed'||await meetingLlmInputIsCurrent(port,scope,this.runId,claim);
        return save(port.query,fresh?payload:withoutPrivateResult(payload,'LLM_INPUT_STALE'));
      });
    }catch(error){
      if(entered||!(error instanceof KernelError)||!ACTOR_UNAVAILABLE.has(error.code))throw error;
      // No SQL/COMMIT failure gets a second transaction. Lost actor preconditions
      // strip private result content before invoking accounting-only persistence.
      const accounting:MeetingLlmSettlement=payload.kind==='completed'?withoutPrivateResult(payload,'LLM_SESSION_UNAVAILABLE'):payload;
      return this.transactions.accounting(query=>save(query,accounting));
    }
  }
  async readSettlement(claim:MeetingLlmClaim):Promise<MeetingLlmReceipt|null>{
    this.#check(claim);return this.#recover(claim.leaseToken,true);
  }
  async recover(token:string):Promise<MeetingLlmReceipt|null>{return this.#recover(token,false);}
  async #recover(token:string,readOnly:boolean):Promise<MeetingLlmReceipt|null>{
    requireUuid(token,'operationToken');
    const recover=async(query:ScopedQuery)=>{
      const result=await query<{receipt:unknown}>('SELECT projed_core.recover_meeting_llm_unit_v1($1::uuid,$2::uuid,$3::boolean) AS receipt',
        [this.runId,token,readOnly]);
      if(result.rows.length!==1)invalid();return result.rows[0]?.receipt===null?null:receipt(result.rows[0]?.receipt);
    };
    let entered=false;
    try{return await this.transactions.actor(port=>{entered=true;return recover(port.query);});}
    catch(error){if(entered||!(error instanceof KernelError)||!ACTOR_UNAVAILABLE.has(error.code))throw error;
      return this.transactions.accounting(recover);}
  }
}

/** Each private operation resolves the original run's current Session again. */
export function createPostgresMeetingLlmRepository(options:{readonly runId:string;readonly database:RuntimeDatabase;
  readonly config:RuntimeConfig;readonly resolveActor:(runId:string)=>Promise<ServerActorV1>}):MeetingLlmDatabaseRepository{
  const {runId,database,config,resolveActor}=options;
  return new MeetingLlmDatabaseRepository(runId,{
    actor:async operation=>{
      const actor=await resolveActor(runId);
      return runActorTransaction(database,config,actor,async port=>{
        const result=await port.query<{record_id:string;capture_id:string;tenant_id:string;project_id:string}>(`SELECT capture.record_id::text,
          capture.id::text AS capture_id,capture.tenant_id::text,capture.project_id::text FROM projed_core.meeting_analysis_runs run
          JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid`,[runId]);
        const row=result.rows[0];if(!row)throw new KernelError('RESOURCE_NOT_FOUND','Meeting LLM source is unavailable',404);
        await port.authorizeMeetingCaptureMutation(row.record_id,row.capture_id);
        return operation(port,{tenantId:row.tenant_id,projectId:row.project_id});
      });
    },
    accounting:operation=>runMeetingMaintenanceTransaction(database,config,operation),
  });
}
