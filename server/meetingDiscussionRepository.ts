import {randomUUID} from 'node:crypto';
import {runActorTransaction,type ActorQueryPort,type ServerActorV1} from './actorTransaction.js';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase,ScopedQuery} from './db.js';
import {KernelError} from './errors.js';
import type {MeetingDiscussionAssemblyInput} from './meetingDiscussionAssembly.js';
import {requireUuid} from './meetingCaptureInput.js';
import {runMeetingMaintenanceTransaction} from './meetingAsrRepository.js';
import type {MeetingDiscussionClaim,MeetingDiscussionFinishReason,MeetingDiscussionProgress,
  MeetingDiscussionRepository,MeetingDiscussionSourceInput,MeetingDiscussionBatch} from './meetingDiscussionWorker.js';

const SHA256_RE=/^[a-f0-9]{64}$/u;
const MAX_SOURCE_INDEX=4095;
const MAX_SOURCE_WORDS=350_000;
const MAX_SEGMENT_INDEX=2_147_483_647;
const CLAIM_KEYS=Object.freeze(['sourceIndex','sourceFirstSegmentIndex','nextSegmentIndex','nextWordIndex',
  'deduplicatedPrefixWords','done','runId','captureId','transcriptRevisionId','sourceVersion','leaseToken','leaseExpiresAtMs']);
const PROGRESS_KEYS=Object.freeze(['sourceIndex','sourceFirstSegmentIndex','nextSegmentIndex','nextWordIndex',
  'deduplicatedPrefixWords','done']);
const BATCH_KEYS=Object.freeze(['sourceId','sourceIndex','sourceFirstSegmentIndex','expectedNextSegmentIndex',
  'deduplicatedPrefixWords','sourceDone','segments']);
const FINISH_REASONS:readonly MeetingDiscussionFinishReason[]=Object.freeze([
  'yield','DISCUSSION_SESSION_UNAVAILABLE','DISCUSSION_SOURCE_UNAVAILABLE','DISCUSSION_DEADLINE_EXPIRED',
  'DISCUSSION_ASSEMBLY_INVALID','DISCUSSION_CONFIG_CHANGED',
]);

export interface MeetingDiscussionTransactions {
  /** Re-resolve the original Session and authorize its current meeting record for each private operation. */
  actor<T>(operation:(port:ActorQueryPort)=>Promise<T>):Promise<T>;
  /** Metadata-only maintenance path. It never reads or writes private discussion content. */
  maintenance<T>(operation:(query:ScopedQuery)=>Promise<T>):Promise<T>;
}

export interface MeetingDiscussionScannedWork {
  readonly runId:string;readonly operationToken:string|null;readonly deadlineExpired:boolean;
}

function invalid():never{
  throw new KernelError('DB_BOUNDARY_INVALID','Meeting discussion persistence result is invalid',503);
}

function safeInteger(value:unknown,max=Number.MAX_SAFE_INTEGER):value is number{
  return Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=max;
}

function exactRecord(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(typeof value!=='object'||value===null||Array.isArray(value))invalid();
  const ownKeys=Object.keys(value);
  if(ownKeys.length!==keys.length||ownKeys.some(key=>!keys.includes(key)))invalid();
  return value as Record<string,unknown>;
}

function exactArray(value:unknown,maxLength:number):unknown[]{
  if(!Array.isArray(value)||value.length>maxLength)invalid();
  return value;
}

function parseBoundary<T>(parse:()=>T):T{
  try{return parse();}
  catch(error){
    if(error instanceof KernelError&&error.code==='DB_BOUNDARY_INVALID')throw error;
    return invalid();
  }
}

function uuid(value:unknown):string{
  try{return requireUuid(value);}
  catch{return invalid();}
}

function progressFields(value:unknown):MeetingDiscussionProgress{
  const record=exactRecord(value,PROGRESS_KEYS);
  const sourceIndex=record.sourceIndex,sourceFirstSegmentIndex=record.sourceFirstSegmentIndex;
  const nextSegmentIndex=record.nextSegmentIndex,nextWordIndex=record.nextWordIndex;
  const deduplicatedPrefixWords=record.deduplicatedPrefixWords,done=record.done;
  if(!safeInteger(sourceIndex,MAX_SOURCE_INDEX+1)||!safeInteger(sourceFirstSegmentIndex,MAX_SEGMENT_INDEX)
      ||!safeInteger(nextSegmentIndex,MAX_SEGMENT_INDEX)||!safeInteger(nextWordIndex,MAX_SOURCE_WORDS)
      ||!(deduplicatedPrefixWords===null||safeInteger(deduplicatedPrefixWords,MAX_SOURCE_WORDS))
      ||typeof done!=='boolean'||sourceFirstSegmentIndex>nextSegmentIndex
      ||(!done&&sourceIndex>MAX_SOURCE_INDEX)
      ||(sourceIndex===MAX_SOURCE_INDEX+1&&!done)
      ||(done&&(nextWordIndex!==0||deduplicatedPrefixWords!==null||sourceFirstSegmentIndex!==nextSegmentIndex)))invalid();
  return {sourceIndex,sourceFirstSegmentIndex,nextSegmentIndex,nextWordIndex,deduplicatedPrefixWords,done};
}

/** Parse the exact twelve-field claim receipt emitted by the claim RPC. */
export function parseMeetingDiscussionClaim(value:unknown,expectedRunId:string,expectedToken:string):MeetingDiscussionClaim{
  return parseBoundary(()=>{
    const record=exactRecord(value,CLAIM_KEYS);
    const runId=uuid(record.runId),captureId=uuid(record.captureId),transcriptRevisionId=uuid(record.transcriptRevisionId);
    const leaseToken=uuid(record.leaseToken);
    const progress=progressFields(Object.fromEntries(PROGRESS_KEYS.map(key=>[key,record[key]])));
    const sourceVersion=record.sourceVersion,leaseExpiresAtMs=record.leaseExpiresAtMs;
    if(runId!==expectedRunId||leaseToken!==expectedToken||!safeInteger(sourceVersion)||sourceVersion===0
        ||!safeInteger(leaseExpiresAtMs)||record.done!==false||progress.sourceIndex>MAX_SOURCE_INDEX)invalid();
    return {runId,captureId,transcriptRevisionId,sourceVersion,leaseToken,leaseExpiresAtMs,...progress,done:false};
  });
}

/** Parse one exact six-field progress receipt. */
export function parseMeetingDiscussionProgress(value:unknown):MeetingDiscussionProgress{
  return parseBoundary(()=>progressFields(value));
}

/** Parse the JSON source envelope; its input details are checked by the assembler. */
export function parseMeetingDiscussionSourceInput(value:unknown):MeetingDiscussionSourceInput{
  return parseBoundary(()=>{
    const record=exactRecord(value,['input','totalSourceWords','lastSegmentHash']);
    const input=record.input;
    const totalSourceWords=record.totalSourceWords;
    const lastSegmentHash=record.lastSegmentHash;
    if(typeof input!=='object'||input===null||Array.isArray(input)
        ||!safeInteger(totalSourceWords,MAX_SOURCE_WORDS)
        ||!(lastSegmentHash===null||(typeof lastSegmentHash==='string'&&SHA256_RE.test(lastSegmentHash))))invalid();
    return {input:input as MeetingDiscussionAssemblyInput,totalSourceWords,lastSegmentHash};
  });
}

/** Parse the exact readback result: either a state marker or six-field progress. */
export function parseMeetingDiscussionReadProgress(value:unknown):MeetingDiscussionProgress|'not_committed'|'stale'{
  return parseBoundary(()=>{
    if(value==='not_committed'||value==='stale')return value;
    return progressFields(value);
  });
}

/** Parse the bounded metadata-only control scan and reject duplicates/content fields. */
export function parseMeetingDiscussionScanWork(value:unknown,maxItems:number):readonly MeetingDiscussionScannedWork[]{
  return parseBoundary(()=>{
    if(!Number.isInteger(maxItems)||maxItems<1||maxItems>20)invalid();
    const items=exactArray(value,maxItems),seen=new Set<string>();
    return items.map(item=>{
      const record=exactRecord(item,['runId','operationToken','deadlineExpired']);
      const runId=uuid(record.runId),operationToken=record.operationToken===null?null:uuid(record.operationToken);
      if(typeof record.deadlineExpired!=='boolean'||seen.has(runId))invalid();
      seen.add(runId);
      return {runId,operationToken,deadlineExpired:record.deadlineExpired};
    });
  });
}

function serializeBatch(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch):string{
  const record=exactRecord(batch,BATCH_KEYS);
  if(uuid(record.sourceId)!==record.sourceId||record.sourceIndex!==claim.sourceIndex
      ||record.sourceFirstSegmentIndex!==claim.sourceFirstSegmentIndex
      ||!safeInteger(record.expectedNextSegmentIndex,MAX_SEGMENT_INDEX)
      ||Number(record.expectedNextSegmentIndex)<claim.sourceFirstSegmentIndex
      ||!safeInteger(record.deduplicatedPrefixWords,MAX_SOURCE_WORDS)
      ||typeof record.sourceDone!=='boolean')invalid();
  const segments=exactArray(record.segments,16);
  if(segments.length===0&&record.sourceDone!==true)invalid();
  try{
    const serialized=JSON.stringify(batch);
    if(typeof serialized!=='string')invalid();
    return serialized;
  }catch{return invalid();}
}

function checkFinishReason(reason:unknown,operationToken:string|null):MeetingDiscussionFinishReason{
  if(typeof reason!=='string'||!FINISH_REASONS.includes(reason as MeetingDiscussionFinishReason)
      ||(reason==='yield'&&operationToken===null))invalid();
  return reason as MeetingDiscussionFinishReason;
}

/** Persistence for one exact discussion run. Private reads/writes never fall back to maintenance identity. */
export class MeetingDiscussionDatabaseRepository implements MeetingDiscussionRepository {
  readonly #runId:string;
  constructor(runId:string,private readonly transactions:MeetingDiscussionTransactions){
    this.#runId=requireUuid(runId,'runId');
  }

  #checkClaim(claim:MeetingDiscussionClaim):void{
    if(!claim||claim.runId!==this.#runId)invalid();
    requireUuid(claim.captureId,'captureId');requireUuid(claim.transcriptRevisionId,'transcriptRevisionId');
    requireUuid(claim.leaseToken,'leaseToken');
    if(!safeInteger(claim.sourceVersion)||claim.sourceVersion<1||!safeInteger(claim.sourceIndex,MAX_SOURCE_INDEX))invalid();
  }

  async #withActor<T>(operation:(port:ActorQueryPort,captureId:string)=>Promise<T>):Promise<T>{
    return this.transactions.actor(async port=>{
      const selected=await port.query<{record_id:string;capture_id:string}>(`SELECT capture.record_id::text AS record_id,
        capture.id::text AS capture_id FROM projed_core.meeting_analysis_runs run
        JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid`,[this.#runId]);
      if(selected.rows.length!==1){
        if(selected.rows.length===0)throw new KernelError('RESOURCE_NOT_FOUND','Meeting discussion run is unavailable',404);
        invalid();
      }
      const row=selected.rows[0];if(!row)invalid();
      const recordId=requireUuid(row.record_id,'recordId'),captureId=requireUuid(row.capture_id,'captureId');
      await port.authorizeMeetingCaptureMutation(recordId,captureId);
      return operation(port,captureId);
    });
  }

  async claim():Promise<MeetingDiscussionClaim|null>{
    const proposedToken=randomUUID();
    return this.#withActor(async(port,captureId)=>{
      const result=await port.query<{claim:unknown}>(
        'SELECT projed_core.claim_meeting_discussion_source_v1($1::uuid,$2::uuid) AS claim',
        [this.#runId,proposedToken]);
      if(result.rows.length!==1)invalid();
      const value=result.rows[0]?.claim;
      if(value===null)return null;
      const parsed=parseMeetingDiscussionClaim(value,this.#runId,proposedToken);
      if(parsed.captureId!==captureId)invalid();
      return parsed;
    });
  }

  #checkBatch(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch):string{
    this.#checkClaim(claim);
    return serializeBatch(claim,batch);
  }

  async loadSource(claim:MeetingDiscussionClaim):Promise<MeetingDiscussionSourceInput|null>{
    this.#checkClaim(claim);
    return this.#withActor(async(port,captureId)=>{
      if(claim.captureId!==captureId)invalid();
      const result=await port.query<{source:unknown}>(
        'SELECT projed_core.read_meeting_discussion_source_v1($1::uuid,$2::uuid) AS source',
        [this.#runId,claim.leaseToken]);
      if(result.rows.length!==1)invalid();
      const value=result.rows[0]?.source;
      if(value===null)return null;
      const parsed=parseMeetingDiscussionSourceInput(value);
      const sourceValue=(parsed.input as unknown as {source?:unknown}).source;
      if(typeof sourceValue!=='object'||sourceValue===null||Array.isArray(sourceValue))invalid();
      const source=sourceValue as MeetingDiscussionAssemblyInput['source'];
      if(source.captureId!==captureId||source.sourceVersion!==claim.sourceVersion
          ||source.segmentIndex!==claim.sourceIndex||parsed.input.firstSegmentIndex!==claim.sourceFirstSegmentIndex)invalid();
      return parsed;
    });
  }

  async append(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch):Promise<MeetingDiscussionProgress|null>{
    const serialized=this.#checkBatch(claim,batch);
    return this.#withActor(async(port,captureId)=>{
      if(claim.captureId!==captureId)invalid();
      const result=await port.query<{progress:unknown}>(
        'SELECT projed_core.append_meeting_discussion_batch_v1($1::uuid,$2::uuid,$3::jsonb) AS progress',
        [this.#runId,claim.leaseToken,serialized]);
      if(result.rows.length!==1)invalid();
      const receipt=result.rows[0]?.progress;
      return receipt===null?null:parseMeetingDiscussionProgress(receipt);
    });
  }

  async readProgress(claim:MeetingDiscussionClaim,batch:MeetingDiscussionBatch)
    :Promise<MeetingDiscussionProgress|'not_committed'|'stale'>{
    const serialized=this.#checkBatch(claim,batch);
    return this.#withActor(async(port,captureId)=>{
      if(claim.captureId!==captureId)invalid();
      const result=await port.query<{progress:unknown}>(
        'SELECT projed_core.read_meeting_discussion_batch_v1($1::uuid,$2::uuid,$3::jsonb) AS progress',
        [this.#runId,claim.leaseToken,serialized]);
      if(result.rows.length!==1)invalid();
      return parseMeetingDiscussionReadProgress(result.rows[0]?.progress);
    });
  }

  async finish(claim:MeetingDiscussionClaim,reason:MeetingDiscussionFinishReason):Promise<boolean>{
    this.#checkClaim(claim);
    const checkedReason=checkFinishReason(reason,claim.leaseToken);
    return this.transactions.maintenance(async query=>{
      const result=await query<{changed:unknown}>(
        'SELECT projed_core.finish_meeting_discussion_work_v1($1::uuid,$2::uuid,$3::text) AS changed',
        [this.#runId,claim.leaseToken,checkedReason]);
      if(result.rows.length!==1||typeof result.rows[0]?.changed!=='boolean')invalid();
      return result.rows[0].changed as boolean;
    });
  }
}

/** Bind each private operation to the current actor Session and exact meeting capture. */
export function createPostgresMeetingDiscussionRepository(options:{readonly runId:string;readonly database:RuntimeDatabase;
  readonly config:RuntimeConfig;readonly resolveActor:(runId:string)=>Promise<ServerActorV1>}):MeetingDiscussionDatabaseRepository{
  const {runId,database,config,resolveActor}=options;requireUuid(runId,'runId');
  return new MeetingDiscussionDatabaseRepository(runId,{
    actor:async operation=>{
      const actor=await resolveActor(runId);
      return runActorTransaction(database,config,actor,operation);
    },
    maintenance:operation=>runMeetingMaintenanceTransaction(database,config,operation),
  });
}

/** Metadata-only bounded scanner and exact-token finalizer for the discussion host. */
export function createPostgresMeetingDiscussionControl(options:{readonly database:RuntimeDatabase;readonly config:RuntimeConfig}){
  const {database,config}=options;
  return {
    scan:async(maxItems:number):Promise<readonly MeetingDiscussionScannedWork[]>=>runMeetingMaintenanceTransaction(
      database,config,async query=>{
        if(!Number.isInteger(maxItems)||maxItems<1||maxItems>20)invalid();
        const result=await query<{work:unknown}>(
          'SELECT projed_core.scan_meeting_discussion_work_v1($1::integer) AS work',[maxItems]);
        if(result.rows.length!==1)invalid();
        return parseMeetingDiscussionScanWork(result.rows[0]?.work,maxItems);
      }),
    finishScanned:async(runId:string,operationToken:string|null,reason:MeetingDiscussionFinishReason):Promise<boolean>=>{
      const targetRunId=requireUuid(runId,'runId');
      const token=operationToken===null?null:requireUuid(operationToken,'operationToken');
      const checkedReason=checkFinishReason(reason,token);
      return runMeetingMaintenanceTransaction(database,config,async query=>{
        const result=await query<{changed:unknown}>(
          'SELECT projed_core.finish_meeting_discussion_work_v1($1::uuid,$2::uuid,$3::text) AS changed',
          [targetRunId,token,checkedReason]);
        if(result.rows.length!==1||typeof result.rows[0]?.changed!=='boolean')invalid();
        return result.rows[0].changed as boolean;
      });
    },
  };
}
