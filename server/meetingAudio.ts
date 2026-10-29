import {createHash,randomUUID} from 'node:crypto';
import {runActorTransaction,type ActorQueryPort,type ServerActorV1} from './actorTransaction.js';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase} from './db.js';
import {asKernelError,KernelError} from './errors.js';
import {buildMeetingAudioObjectKey,normalizeMeetingAudioReservation} from './meetingAudioInput.js';
import type {MeetingAudioReadResult,MeetingAudioStorage} from './meetingAudioStorage.js';
import {requireAudioMime,requirePositiveVersion,requireUuid} from './meetingCaptureInput.js';

type CurrentActor=()=>Promise<ServerActorV1>;
interface AudioCapture {
  id:string;tenant_id:string;project_id:string;record_id:string;source_version:number;state:string;audio_expires_at:Date|null;
  audio_expired:boolean|null;
}
interface AudioSegment {
  id:string;capture_id:string;source_version:number;segment_index:number;epoch:number;
  start_offset_ms:string;end_offset_ms:string;overlap_ms:number;gap_before_ms:number;
  mime:string;bytes:string;sha256:string|null;object_path:string;reservation_key:string|null;
  upload_state:string;upload_token_expires_at:Date|null;storage_backend:string|null;storage_generation:string|null;
}
interface CleanupProof {
  upload_operation_token:string|null;upload_outcome:string|null;upload_sha256:string|null;upload_bytes:string|null;
  storage_generation:string|null;object_locator:string|null;storage_backend:string|null;state:string;
}
interface PreparedUpload {segment:AudioSegment;token:string;shouldUpload:boolean;}
const ACCEPTING=['recording','paused','stopped','uploading'];
function missing():never{throw new KernelError('RESOURCE_NOT_FOUND','Meeting audio is unavailable',404);}
function conflict():never{throw new KernelError('MEETING_STORAGE_CONFLICT','Meeting audio source changed',409);}
function unsupported():never{throw new KernelError('BACKEND_UNSUPPORTED','Meeting audio storage provenance is unavailable',409);}
function attempt(segment:AudioSegment):string{return `storage:${segment.capture_id}:v${segment.source_version}:segment:${segment.segment_index}`;}
function segmentDto(segment:AudioSegment){return {id:segment.id,segment_index:segment.segment_index,
  source_version:segment.source_version,bytes:Number(segment.bytes),sha256:segment.sha256,
  upload_state:segment.upload_state,object_path:segment.object_path};}
function assertGcs(capture:AudioCapture,segment:AudioSegment){
  if(segment.storage_backend!=='gcs')unsupported();
  const key=buildMeetingAudioObjectKey({tenantId:capture.tenant_id,projectId:capture.project_id,recordId:capture.record_id,
    captureId:capture.id,sourceVersion:segment.source_version,segmentIndex:segment.segment_index,mime:segment.mime});
  if(segment.object_path!==key)conflict();
}
async function captureScope(port:ActorQueryPort,id:string,version:number|undefined,write=true):Promise<AudioCapture>{
  const result=await port.query<AudioCapture>(`SELECT *,audio_expires_at<=clock_timestamp() AS audio_expired
    FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid`,[id]);
  const capture=result.rows[0];if(!capture)missing();
  if((write&&version===undefined)||(version!==undefined&&capture.source_version!==version))
    throw new KernelError('REVISION_CONFLICT','Meeting source version changed',409);
  if(write)await port.authorizeMeetingCaptureMutation(capture.record_id,id);
  if((write&&!ACCEPTING.includes(capture.state))||['cancelled','expired'].includes(capture.state)
    ||capture.audio_expired===true)conflict();
  return capture;
}
async function segmentById(port:ActorQueryPort,id:string):Promise<AudioSegment>{
  const result=await port.query<AudioSegment>('SELECT * FROM projed_core.meeting_capture_segments WHERE id=$1::uuid',[id]);
  const segment=result.rows[0];if(!segment)missing();return segment;
}

/** Cleanup proof only: deliberately independent of the former actor's lifetime. */
export async function settleMeetingAudioWrite(database:RuntimeDatabase,config:RuntimeConfig,token:string,
  outcome:'uploaded'|'unknown'|'rejected',generation?:string):Promise<void>{
  requireUuid(token,'Upload operation');
  if(!['uploaded','unknown','rejected'].includes(outcome)
    ||(outcome==='uploaded'&&(!generation||!(/^[1-9][0-9]{0,18}$/u.test(generation)))))conflict();
  const lease=await database.checkout();let began=false,beginSent=false,commitSent=false;
  const deadline=performance.now()+config.profile.runtime.timeouts.transactionMillis;
  try{
    beginSent=true;await lease.client.query('BEGIN');began=true;
    await lease.client.query(`SELECT set_config('projed.meeting_upload_phase','settle',true),
      set_config('projed.meeting_upload_token',$1,true),set_config('statement_timeout',$2,true),set_config('lock_timeout',$3,true)`,
    [token,`${config.profile.runtime.timeouts.statementMillis}ms`,`${config.profile.runtime.timeouts.lockMillis}ms`]);
    await lease.client.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0))");
    const result=await lease.client.query<CleanupProof>(`SELECT upload_outcome,storage_generation,upload_operation_token,
      upload_sha256,upload_bytes,object_locator,storage_backend,state FROM projed_core.meeting_artifact_cleanup
      WHERE upload_operation_token=$1::uuid FOR UPDATE`,[token]);
    const existing=result.rows[0];if(!existing)missing();
    if(existing.upload_outcome==='uploaded'){
      if(outcome==='uploaded'&&existing.storage_generation!==generation)conflict();
      // A failed duplicate read cannot downgrade a confirmed remote write.
    }else{
      await lease.client.query(`UPDATE projed_core.meeting_artifact_cleanup SET upload_outcome=$2,
        storage_generation=$3,updated_at=now() WHERE upload_operation_token=$1::uuid`,[token,outcome,generation??null]);
    }
    if(performance.now()>=deadline)throw new KernelError('TRANSACTION_USAGE_INVALID','Audio settlement deadline exceeded',409);
    commitSent=true;await lease.client.query('COMMIT');began=false;lease.release();
  }catch(error){
    if(commitSent){lease.release(true);throw new KernelError('DB_COMMIT_UNKNOWN','Audio cleanup settlement outcome is unknown',503,{cause:error});}
    let rolledBack=!began;try{if(began){await lease.client.query('ROLLBACK');rolledBack=true;}}catch{/* Preserve the original failure. */}
    lease.release((beginSent&&!began)||!rolledBack);throw asKernelError(error);
  }
}

export class MeetingAudioService {
  constructor(private readonly database:RuntimeDatabase,private readonly config:RuntimeConfig,private readonly storage:MeetingAudioStorage){}

  async reserve(actor:ServerActorV1,body:Record<string,unknown>,signal:AbortSignal){
    const id=requireUuid(body.captureId,'captureId'),version=requirePositiveVersion(body.expectedSourceVersion);
    return runActorTransaction(this.database,this.config,actor,async port=>{
      const capture=await captureScope(port,id,version),input=normalizeMeetingAudioReservation(id,version,body);
      const existing=await port.query<AudioSegment>(`SELECT * FROM projed_core.meeting_capture_segments
        WHERE capture_id=$1::uuid AND source_version=$2 AND segment_index=$3`,[id,version,input.segmentIndex]);
      let segment=existing.rows[0];
      if(segment){
        assertGcs(capture,segment);
        if(segment.reservation_key!==input.reservationKey||segment.epoch!==input.epoch||segment.mime!==input.mime
          ||Number(segment.start_offset_ms)!==input.startOffsetMs||Number(segment.end_offset_ms)!==input.endOffsetMs
          ||segment.overlap_ms!==input.overlapMs||segment.gap_before_ms!==input.gapBeforeMs
          ||(input.bytes!==0&&Number(segment.bytes)!==0&&Number(segment.bytes)!==input.bytes))conflict();
      }else{
        const segmentId=randomUUID();await port.authorizeMeetingAudioMutation(id,segmentId,'reserve');
        const key=buildMeetingAudioObjectKey({tenantId:capture.tenant_id,projectId:capture.project_id,recordId:capture.record_id,
          captureId:id,sourceVersion:version,segmentIndex:input.segmentIndex,mime:input.mime});
        const inserted=await port.query<AudioSegment>(`INSERT INTO projed_core.meeting_capture_segments
          (id,capture_id,segment_index,epoch,start_offset_ms,end_offset_ms,overlap_ms,gap_before_ms,
           object_path,mime,bytes,source_version,reservation_key,upload_token_expires_at,storage_backend)
          VALUES($1::uuid,$2::uuid,$3,$4,$5::bigint,$6::bigint,$7,$8,$9,$10,$11::bigint,$12,$13,now()+interval '2 hours','gcs') RETURNING *`,
        [segmentId,id,input.segmentIndex,input.epoch,input.startOffsetMs,input.endOffsetMs,input.overlapMs,input.gapBeforeMs,
          key,input.mime,input.bytes,version,input.reservationKey]);
        segment=inserted.rows[0]!;
        const obligation=await port.query(`INSERT INTO projed_core.meeting_artifact_cleanup
          (obligation_id,capture_id,attempt_id,kind,object_locator,state,upload_token_expires_at,due_at,storage_backend)
          SELECT $1::uuid,segment.capture_id,$2,'storage',segment.object_path,'pending',segment.upload_token_expires_at,
            greatest(coalesce(capture.audio_expires_at,now()+interval '7 days'),segment.upload_token_expires_at),'gcs'
          FROM projed_core.meeting_capture_segments segment
          JOIN projed_core.meeting_capture_sessions capture ON capture.id=segment.capture_id
          WHERE segment.id=$3::uuid`,[randomUUID(),attempt(segment),segment.id]);
        if(obligation.rowCount!==1)conflict();
      }
      return {segmentId:segment.id,sourceVersion:version,segmentIndex:segment.segment_index,path:segment.object_path,
        uploadUrl:`/api/v1/meeting-audio/${segment.id}`,token:null,signedUrl:null,
        expiresAt:segment.upload_token_expires_at?.getTime()??0,uploadState:segment.upload_state,
        alreadyVerified:segment.upload_state==='verified',sha256:segment.sha256,bytes:Number(segment.bytes)};
    },{signal});
  }

  private async prepare(actor:ServerActorV1,id:string,version:number,signal:AbortSignal,
    upload?:{bytes:number;sha256:string;mime:string}):Promise<PreparedUpload>{
    let newToken:string|undefined;
    try{return await runActorTransaction(this.database,this.config,actor,async port=>{
      let segment=await segmentById(port,id);const capture=await captureScope(port,segment.capture_id,version);
      if(segment.source_version!==version)conflict();assertGcs(capture,segment);
      if(upload&&(segment.mime!==upload.mime||(Number(segment.bytes)>0&&Number(segment.bytes)!==upload.bytes)
        ||(segment.sha256!==null&&segment.sha256!==upload.sha256)))conflict();
      await port.authorizeMeetingAudioMutation(capture.id,id,upload?'claim':'verify');
      const proofResult=await port.query<CleanupProof>(`SELECT upload_operation_token,upload_outcome,upload_sha256,upload_bytes,
        storage_generation,object_locator,storage_backend,state FROM projed_core.meeting_artifact_cleanup
        WHERE attempt_id=$1 AND kind='storage'`,[attempt(segment)]);
      const proof=proofResult.rows[0];if(!proof||proof.object_locator!==segment.object_path||proof.state!=='pending'||proof.storage_backend!=='gcs')conflict();
      if(proof.upload_operation_token&&proof.upload_outcome!=='rejected'){
        if(!proof.upload_sha256||proof.upload_sha256!==segment.sha256||proof.upload_bytes!==segment.bytes)conflict();
        return {segment,token:proof.upload_operation_token,shouldUpload:false};
      }
      if(!upload||segment.upload_state==='verified')conflict();
      const token=randomUUID();newToken=token;
      const updated=await port.query<AudioSegment>(`UPDATE projed_core.meeting_capture_segments SET bytes=$2::bigint,
        sha256=$3,upload_state='uploading',upload_token_expires_at=now()+interval '2 hours',updated_at=now()
        WHERE id=$1::uuid RETURNING *`,[id,upload.bytes,upload.sha256]);
      segment=updated.rows[0]!;
      const claimed=await port.query(`UPDATE projed_core.meeting_artifact_cleanup AS obligation SET upload_operation_token=$2::uuid,
        upload_outcome='pending',upload_sha256=$3,upload_bytes=$4::bigint,storage_generation=NULL,
        upload_token_expires_at=segment.upload_token_expires_at,
        due_at=greatest(obligation.due_at,coalesce(capture.audio_expires_at,now()+interval '7 days'),segment.upload_token_expires_at),updated_at=now()
        FROM projed_core.meeting_capture_segments segment
        JOIN projed_core.meeting_capture_sessions capture ON capture.id=segment.capture_id
        WHERE obligation.attempt_id=$1 AND obligation.kind='storage' AND segment.id=$5::uuid
          AND segment.capture_id=obligation.capture_id`,[attempt(segment),token,upload.sha256,upload.bytes,segment.id]);
      if(claimed.rowCount!==1)conflict();return {segment,token,shouldUpload:true};
    },{signal});}catch(error){
      if(newToken&&error instanceof KernelError&&error.code==='DB_COMMIT_UNKNOWN'){
        // No storage call has happened yet. Read back the exact token under the
        // same mutex and record this locally known not-sent outcome if durable.
        try{await settleMeetingAudioWrite(this.database,this.config,newToken,'rejected');}
        catch(settlementError){
          if(!(settlementError instanceof KernelError&&settlementError.code==='RESOURCE_NOT_FOUND'))
            throw new KernelError('DB_COMMIT_UNKNOWN','Audio claim could not be reconciled',503,
              {cause:new AggregateError([error,settlementError],'Audio claim and cleanup reconciliation failed')});
        }
      }
      throw error;
    }
  }

  private checkObject(segment:AudioSegment,object:MeetingAudioReadResult){
    if(object.size!==Number(segment.bytes)||object.bytes.byteLength!==object.size
      ||requireAudioMime(object.contentType)!==segment.mime
      ||createHash('sha256').update(object.bytes).digest('hex')!==segment.sha256)conflict();
    if(segment.storage_generation!==null&&segment.storage_generation!==object.generation)conflict();
  }
  private async finish(currentActor:CurrentActor,prepared:PreparedUpload,object:MeetingAudioReadResult,signal:AbortSignal){
    this.checkObject(prepared.segment,object);
    await settleMeetingAudioWrite(this.database,this.config,prepared.token,'uploaded',object.generation);
    const actor=await currentActor();
    return runActorTransaction(this.database,this.config,actor,async port=>{
      const segment=await segmentById(port,prepared.segment.id),capture=await captureScope(port,segment.capture_id,prepared.segment.source_version);
      if(segment.source_version!==prepared.segment.source_version||segment.object_path!==prepared.segment.object_path)conflict();
      this.checkObject(segment,object);
      if(segment.upload_state==='verified')return {segment:segmentDto(segment)};
      await port.authorizeMeetingAudioMutation(capture.id,segment.id,'verify');
      const result=await port.query<AudioSegment>(`UPDATE projed_core.meeting_capture_segments SET
        upload_state='verified',storage_generation=$2,verified_at=now(),last_error=NULL,updated_at=now()
        WHERE id=$1::uuid RETURNING *`,[segment.id,object.generation]);
      if(!result.rows[0])conflict();return {segment:segmentDto(result.rows[0])};
    },{signal});
  }

  async upload(currentActor:CurrentActor,id:string,version:number,bytes:Uint8Array,mime:string,signal:AbortSignal){
    const prepared=await this.prepare(await currentActor(),id,version,signal,
      {bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex'),mime});
    if(prepared.segment.upload_state==='verified')return {segment:segmentDto(prepared.segment)};
    if(prepared.shouldUpload){
      let generation:string|undefined;
      try{
        const result=await this.storage.upload(prepared.segment.object_path,bytes,mime,signal);
        generation=result.generation;
      }catch(error){
        const known=error instanceof KernelError&&['MEETING_STORAGE_REJECTED','MEETING_STORAGE_NOT_SENT'].includes(error.code);
        await settleMeetingAudioWrite(this.database,this.config,prepared.token,known?'rejected':'unknown');
        if(known||signal.aborted)throw error;
        // An unknown POST is never replayed. Only readback may resolve it.
      }
      if(generation)await settleMeetingAudioWrite(this.database,this.config,prepared.token,'uploaded',generation);
    }
    // Recheck record permission/state as well as Session before retrieving the
    // object. A successful late write still settles its cleanup proof above.
    const readable=await this.prepare(await currentActor(),id,version,signal);
    if(readable.token!==prepared.token)conflict();
    if(readable.segment.upload_state==='verified')return {segment:segmentDto(readable.segment)};
    const object=await this.storage.read(readable.segment.object_path,signal);
    return this.finish(currentActor,readable,object,signal);
  }

  async verify(currentActor:CurrentActor,body:Record<string,unknown>,signal:AbortSignal){
    if(Object.keys(body).some(key=>!['operation','captureId','expectedSourceVersion','segmentIndex'].includes(key)))conflict();
    const captureId=requireUuid(body.captureId,'captureId'),version=requirePositiveVersion(body.expectedSourceVersion);
    if(typeof body.segmentIndex!=='number'||!Number.isInteger(body.segmentIndex)||body.segmentIndex<0||body.segmentIndex>4095)conflict();
    const actor=await currentActor();
    const segmentId=await runActorTransaction(this.database,this.config,actor,async port=>{
      await captureScope(port,captureId,version);
      const result=await port.query<{id:string}>(`SELECT id::text FROM projed_core.meeting_capture_segments
        WHERE capture_id=$1::uuid AND source_version=$2 AND segment_index=$3`,[captureId,version,body.segmentIndex]);
      if(!result.rows[0])missing();return result.rows[0].id;
    },{signal});
    const prepared=await this.prepare(await currentActor(),segmentId,version,signal);
    if(prepared.segment.upload_state==='verified')return {segment:segmentDto(prepared.segment)};
    const object=await this.storage.read(prepared.segment.object_path,signal);
    return this.finish(currentActor,prepared,object,signal);
  }

  async playback(currentActor:CurrentActor,id:string,recordRef:string,signal:AbortSignal){
    const authorize=async()=>runActorTransaction(this.database,this.config,await currentActor(),async port=>{
      const segment=await segmentById(port,id);
      const capture=await captureScope(port,segment.capture_id,undefined,false);assertGcs(capture,segment);
      const record=await port.query(`SELECT id FROM projed_core.knowledge_records WHERE id=$1::uuid
        AND (id::text=$2 OR legacy_record_id=$2)`,[capture.record_id,recordRef]);
      if(!record.rows[0]||segment.upload_state!=='verified'||!segment.storage_generation||!segment.sha256)missing();
      return {segment,expiresAt:Math.min(Date.now()+60_000,capture.audio_expires_at?.getTime()??Date.now()+60_000)};
    },{signal});
    const before=await authorize(),object=await this.storage.read(before.segment.object_path,signal);
    const after=await authorize();
    if(before.segment.storage_generation!==after.segment.storage_generation||before.segment.sha256!==after.segment.sha256)conflict();
    this.checkObject(after.segment,object);return {bytes:object.bytes,mime:after.segment.mime,expiresAt:after.expiresAt};
  }
}
