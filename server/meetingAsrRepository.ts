import {randomUUID} from 'node:crypto';
import type {QueryResultRow} from 'pg';
import {runActorTransaction,type ActorQueryPort,type ServerActorV1} from './actorTransaction.js';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase,ScopedQuery} from './db.js';
import {asKernelError,KernelError} from './errors.js';
import {validateMeetingAsrDispatchInput,type MeetingAsrDispatchUnit} from './meetingAsrDispatchInput.js';
import {normalizeMeetingAsrSettlementInput,type NormalizedMeetingAsrSettlement} from './meetingAsrSettlementInput.js';
import type {MeetingAsrClaim,MeetingAsrRepository,MeetingAsrSettlement} from './meetingAsrWorker.js';
import {requireUuid} from './meetingCaptureInput.js';

export interface MeetingAsrTransactions {
  /** Re-resolve the original Session and authorize its current record before entering the callback. */
  actor<T>(operation:(port:ActorQueryPort)=>Promise<T>):Promise<T>;
  /** No business actor is present; only an exact operation token can settle accounting metadata. */
  accounting<T>(operation:(query:ScopedQuery)=>Promise<T>):Promise<T>;
}

const ACTOR_UNAVAILABLE=new Set([
  'ACTOR_INVALID','ACTOR_CHANGED','ACCESS_DENIED','RESOURCE_NOT_FOUND','IDENTITY_INVALID',
  'IDENTITY_CONTRACT_UNAVAILABLE','IDENTITY_MAPPING_CONFLICT','IDENTITY_STATE_UNAVAILABLE',
]);
function actorUnavailable(error:unknown):boolean{
  return error instanceof KernelError&&ACTOR_UNAVAILABLE.has(error.code);
}
function invalid():never{throw new KernelError('DB_BOUNDARY_INVALID','Meeting ASR persistence result is invalid',503);}

/** SQL persistence for one exact run. It does not scan queues or call providers. */
export class MeetingAsrDatabaseRepository implements MeetingAsrRepository {
  readonly #runId:string;
  #dispatch:{token:string;payload:MeetingAsrDispatchUnit}|undefined;
  constructor(runId:string,private readonly transactions:MeetingAsrTransactions){
    this.#runId=requireUuid(runId,'runId');
  }
  #check(claim:MeetingAsrClaim):void{
    if(claim.runId!==this.#runId)invalid();
    requireUuid(claim.captureId,'captureId');requireUuid(claim.leaseToken,'leaseToken');
  }
  async #settle(query:ScopedQuery,claim:MeetingAsrClaim,payload:NormalizedMeetingAsrSettlement):Promise<boolean>{
    const result=await query<{receipt:unknown}>(
      'SELECT projed_core.settle_meeting_asr_unit_v1($1::uuid,$2::uuid,$3::jsonb) AS receipt',
      [this.#runId,claim.leaseToken,JSON.stringify(payload)]);
    const receipt=result.rows[0]?.receipt;
    if(result.rows.length!==1||typeof receipt!=='object'||receipt===null||Array.isArray(receipt)
      ||!('kind' in receipt)||receipt.kind!==payload.kind||!('published' in receipt)||typeof receipt.published!=='boolean')invalid();
    return receipt.published;
  }
  async #closeUnsent(query:ScopedQuery,claim:MeetingAsrClaim):Promise<void>{
    await this.#settle(query,claim,{kind:'not_sent',code:'ASR_DISPATCH_NOT_AUTHORIZED'});
  }
  async claimNext():Promise<MeetingAsrClaim|null>{
    this.#dispatch=undefined;
    const token=randomUUID();
    // A lost claim COMMIT is surfaced. The host may recover this pending lease;
    // this method never acquires a second token after an uncertain commit.
    return this.transactions.actor(async port=>{
      const result=await port.query<{claim:MeetingAsrClaim|null}>(
        'SELECT projed_core.claim_meeting_asr_unit_v1($1::uuid,$2::uuid) AS claim',[this.#runId,token]);
      const claim=result.rows[0]?.claim??null;
      if(claim){this.#check(claim);if(claim.leaseToken!==token)invalid();}
      return claim;
    });
  }
  async markDispatch(claim:MeetingAsrClaim,input:MeetingAsrDispatchUnit):Promise<boolean>{
    this.#check(claim);
    const payload=validateMeetingAsrDispatchInput(input,{startOffsetMs:claim.source.startOffsetMs,
      metadataDurationMs:claim.source.endOffsetMs-claim.source.startOffsetMs});
    this.#dispatch={token:claim.leaseToken,payload};
    return this.transactions.actor(async port=>{
      const result=await port.query<{marked:boolean}>(
        'SELECT projed_core.mark_meeting_asr_dispatch_v1($1::uuid,$2::uuid,$3::jsonb) AS marked',
        [this.#runId,claim.leaseToken,JSON.stringify(payload)]);
      const marked=result.rows[0]?.marked===true;
      if(!marked)await this.#closeUnsent(port.query,claim);
      return marked;
    });
  }
  async readDispatch(claim:MeetingAsrClaim):Promise<'authorized'|'not_authorized'>{
    this.#check(claim);
    const dispatch=this.#dispatch;
    if(!dispatch||dispatch.token!==claim.leaseToken)invalid();
    return this.transactions.actor(async port=>{
      const result=await port.query<{authorized:boolean}>(
        'SELECT projed_core.read_meeting_asr_dispatch_v1($1::uuid,$2::uuid,$3::jsonb) AS authorized',
        [this.#runId,claim.leaseToken,JSON.stringify(dispatch.payload)]);
      const authorized=result.rows[0]?.authorized===true;
      // First read this exact intent. A denied readback only closes the known
      // unsent operation; it cannot mark another intent or acquire a new claim.
      if(!authorized)await this.#closeUnsent(port.query,claim);
      return authorized?'authorized':'not_authorized';
    });
  }
  async settle(claim:MeetingAsrClaim,input:MeetingAsrSettlement):Promise<'published'|'accounted_only'>{
    this.#check(claim);
    const payload=normalizeMeetingAsrSettlementInput(input);
    let entered=false;
    try{
      const stored=await this.transactions.actor(async port=>{
        entered=true;
        return this.#settle(port.query,claim,payload);
      });
      this.#dispatch=undefined;
      // "published" here means an authorized private ASR checkpoint. SQL does
      // not mark the complete discussion/matching workflow ready.
      return stored?'published':'accounted_only';
    }catch(error){
      // Never reinterpret SQL/COMMIT failures as an identity failure and try a
      // second transaction. Only a failed actor precondition gets cost-only work.
      if(entered||!actorUnavailable(error))throw error;
      await this.transactions.accounting(query=>this.#settle(query,claim,payload));
      this.#dispatch=undefined;
      return 'accounted_only';
    }
  }
}

async function accountingTransaction<T>(database:RuntimeDatabase,config:RuntimeConfig,
  operation:(query:ScopedQuery)=>Promise<T>):Promise<T>{
  const lease=await database.checkout();let began=false;let commitSent=false;
  const deadline=performance.now()+config.profile.runtime.timeouts.transactionMillis;
  try{
    await lease.client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
    await lease.client.query(`SELECT set_config('projed.actor_principal_id','',true),set_config('projed.actor_local_user_id','',true),
      set_config('projed.actor_entry','',true),set_config('projed.actor_context_id','',true),set_config('projed.actor_guard_revision','',true),
      set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true)`,
    [`${config.profile.runtime.timeouts.statementMillis}ms`,`${config.profile.runtime.timeouts.lockMillis}ms`,
      `${config.profile.runtime.timeouts.idleInTransactionMillis}ms`]);
    const query:ScopedQuery=async<R extends QueryResultRow>(sql:string,values:readonly unknown[]=[])=>{
      if(performance.now()>=deadline)throw new KernelError('TRANSACTION_USAGE_INVALID','Accounting transaction deadline exceeded',503);
      return lease.client.query<R>(sql,[...values]);
    };
    const result=await operation(query);
    if(performance.now()>=deadline)throw new KernelError('TRANSACTION_USAGE_INVALID','Accounting transaction deadline exceeded',503);
    commitSent=true;await lease.client.query('COMMIT');began=false;lease.release();return result;
  }catch(error){
    if(commitSent){
      lease.release(true);
      const code=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
      if(typeof code==='string'&&/^23[0-9A-Z]{3}$/u.test(code))throw new KernelError('DOMAIN_DATA_INVALID','Accounting transaction violates constraints',409);
      throw new KernelError('DB_COMMIT_UNKNOWN','Accounting commit result is unknown',503);
    }
    let safe=false;if(began){try{await lease.client.query('ROLLBACK');safe=true;}catch{/* Destroy an uncertain connection. */}}
    lease.release(!safe);throw asKernelError(error);
  }
}

export function createPostgresMeetingAsrRepository(options:{readonly runId:string;readonly database:RuntimeDatabase;
  readonly config:RuntimeConfig;readonly resolveActor:(runId:string)=>Promise<ServerActorV1>}):MeetingAsrDatabaseRepository{
  const {runId,database,config,resolveActor}=options;requireUuid(runId,'runId');
  return new MeetingAsrDatabaseRepository(runId,{
    actor:async operation=>{
      const actor=await resolveActor(runId);
      return runActorTransaction(database,config,actor,async port=>{
        const source=await port.query<{record_id:string;capture_id:string}>(`SELECT capture.record_id::text,capture.id::text AS capture_id
          FROM projed_core.meeting_analysis_runs run JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
          WHERE run.id=$1::uuid`,[runId]);
        const row=source.rows[0];if(!row)throw new KernelError('RESOURCE_NOT_FOUND','Meeting ASR source is unavailable',404);
        await port.authorizeMeetingCaptureMutation(row.record_id,row.capture_id);
        return operation(port);
      });
    },
    accounting:operation=>accountingTransaction(database,config,operation),
  });
}
