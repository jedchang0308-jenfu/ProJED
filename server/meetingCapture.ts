import { randomUUID } from 'node:crypto';
import type { ActorQueryPort } from './actorTransaction.js';
import { resolveBoard } from './domainRead.js';
import { KernelError } from './errors.js';
import { assertEpochManifestDoesNotRewind, normalizeEpochManifest, normalizePointerBatch,
  normalizeSourceGaps, requirePositiveVersion, requireUuid } from './meetingCaptureInput.js';

interface CaptureRow {
  id: string; tenant_id: string; project_id: string; record_id: string; state: string;
  source_version: number; epoch_manifest: unknown; source_gaps: unknown;
  last_progress_at: Date | null; stopped_at: Date | null; audio_expires_at: Date | null;
  started_at: Date | null; created_at: Date; review_revision: string;
  final_pointer_sequence: string | null; pointer_loss: boolean; source_completeness: string;
}

function invalid(message: string): never { throw new KernelError('DOMAIN_DATA_INVALID',message,400); }
function conflict(message: string): never { throw new KernelError('REVISION_CONFLICT',message,409); }
function missing(): never { throw new KernelError('RESOURCE_NOT_FOUND','Meeting capture is unavailable',404); }
function text(value: unknown, max: number): string {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\p{Cc}]/u.test(value))invalid('Meeting text field is invalid');
  return value.trim();
}
function counter(value: unknown, min = 0): number {
  const integerText = min < 0 ? /^-?\d+$/u : /^\d+$/u;
  if(typeof value!=='number'&&(typeof value!=='string'||!integerText.test(value)))invalid('Meeting counter is invalid');
  const parsed=Number(value);
  if(!Number.isSafeInteger(parsed)||parsed<min)conflict('Meeting counter cannot be represented by this client');
  return parsed;
}
function progress(row: CaptureRow) {
  return {captureId:row.id,state:row.state,sourceVersion:row.source_version,
    lastProgressAt:row.last_progress_at?.getTime()??null,stoppedAt:row.stopped_at?.getTime()??null,
    audioExpiresAt:row.audio_expires_at?.getTime()??null,reviewRevision:counter(row.review_revision),
    pointerLoss:row.pointer_loss,sourceCompleteness:row.source_completeness,
    finalPointerSequence:row.final_pointer_sequence===null?null:counter(row.final_pointer_sequence,-1),
    sourceGaps:row.source_gaps};
}

const FIELDS: Readonly<Record<string,readonly string[]>>={
  begin:['tenantId','projectId','recordId','idempotencyKey'],
  status:['captureId'],
  progress:['captureId','expectedSourceVersion','epochManifest','lastProgressAt'],
  pause:['captureId','expectedSourceVersion'],
  resume:['captureId','expectedSourceVersion','epochManifest'],
  stop:['captureId','expectedSourceVersion','stoppedAt','pointerLoss','epochManifest','finalPointerSequence','gaps','reason'],
  'append-pointer':['captureId','expectedSourceVersion','batchKey','digest','intervals'],
  cancel:['captureId','expectedSourceVersion','reason'],
  'revise-source':['captureId','expectedSourceVersion','requestKey'],
};

export class MeetingCaptureRepository {
  async execute(port: ActorQueryPort, body: Record<string,unknown>): Promise<unknown> {
    const operation=body.operation;
    if(typeof operation!=='string'||!Object.hasOwn(FIELDS,operation))
      throw new KernelError('BACKEND_UNSUPPORTED','Meeting operation is not available',409);
    const fields=FIELDS[operation]!;
    if(Object.keys(body).some(key=>key!=='operation'&&!fields.includes(key)))invalid('Unknown meeting input field');
    if(operation==='begin')return this.begin(port,body);
    const id=requireUuid(body.captureId,'captureId');
    const visible=await port.query<CaptureRow>('SELECT * FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid',[id]);
    if(visible.rows.length!==1)missing();
    if(operation==='status')return progress(visible.rows[0]!);
    await port.authorizeMeetingCaptureMutation(visible.rows[0]!.record_id,id);
    const locked=await port.query<CaptureRow>('SELECT * FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid FOR UPDATE',[id]);
    const capture=locked.rows[0];if(!capture)missing();
    const expected=requirePositiveVersion(body.expectedSourceVersion);
    if(capture.source_version!==expected)conflict('Meeting source version changed');
    if(operation==='cancel'){
      const reason=body.reason===undefined?'user-cancel':text(body.reason,160);
      const result=await port.query<{data:unknown}>(
        'SELECT projed_core.cancel_meeting_capture_v1($1::uuid,$2::integer,$3) AS data',[id,expected,reason]);
      return result.rows[0]!.data;
    }
    if(operation==='append-pointer')return this.appendPointer(port,capture,body);
    if(operation==='revise-source'){
      text(body.requestKey,180);
      if(!['stopped','queued','ready','failed_retryable','failed_terminal'].includes(capture.state))conflict('Meeting source cannot be revised');
      if(expected>=2_147_483_647)conflict('Meeting source version limit reached');
      // Cancel pending old-version work and its undispatched reservations in the
      // same transaction. Completed/unknown provider use is never refunded.
      await port.query('SELECT projed_core.cancel_meeting_capture_v1($1::uuid,$2::integer,$3)',[id,expected,'source-revised']);
      await port.query(`UPDATE projed_core.meeting_capture_sessions SET
        source_version=source_version+1,source_parent_version=source_version,
        source_frozen_at=NULL,audio_manifest_hash=NULL,pointer_manifest_hash=NULL,
        source_completeness='missing',state='stopped',updated_at=now() WHERE id=$1::uuid`,[id]);
      return {captureId:id,state:'stopped',sourceVersion:expected+1,parentVersion:expected};
    }
    if(operation==='pause'){
      if(!['recording','paused'].includes(capture.state))conflict('Meeting capture cannot pause');
      if(capture.state==='recording')await port.query(`UPDATE projed_core.meeting_capture_sessions
        SET state='paused',last_progress_at=now(),updated_at=now() WHERE id=$1::uuid`,[id]);
    }else if(operation==='progress'||operation==='resume'){
      const epochs=normalizeEpochManifest(body.epochManifest??capture.epoch_manifest);
      assertEpochManifestDoesNotRewind(capture.epoch_manifest,epochs);
      if(operation==='progress'&&!['recording','paused'].includes(capture.state))conflict('Meeting capture no longer accepts progress');
      if(operation==='resume'){
        if(capture.state==='recording'&&JSON.stringify(epochs)===JSON.stringify(capture.epoch_manifest))return progress(capture);
        if(capture.state!=='paused')conflict('Meeting capture cannot resume');
        const previous=normalizeEpochManifest(capture.epoch_manifest).at(-1)?.epoch??-1;
        if((epochs.at(-1)?.epoch??-1)<=previous)conflict('Meeting resume requires a new epoch');
      }
      await port.query(`UPDATE projed_core.meeting_capture_sessions SET
        epoch_manifest=$2::jsonb,state=$3,last_progress_at=now(),updated_at=now() WHERE id=$1::uuid`,
      [id,JSON.stringify(epochs),operation==='resume'?'recording':capture.state]);
    }else if(operation==='stop'){
      if(!['recording','paused','stopped'].includes(capture.state))conflict('Meeting capture cannot stop');
      const epochs=normalizeEpochManifest(body.epochManifest??capture.epoch_manifest);
      assertEpochManifestDoesNotRewind(capture.epoch_manifest,epochs);
      const gaps=normalizeSourceGaps(body.gaps??capture.source_gaps);
      const oldGaps=normalizeSourceGaps(capture.source_gaps);
      if(gaps.length<oldGaps.length||oldGaps.some((gap,index)=>JSON.stringify(gap)!==JSON.stringify(gaps[index])))
        conflict('Meeting stop cannot remove source gaps');
      const sequence=body.finalPointerSequence==null?capture.final_pointer_sequence:counter(body.finalPointerSequence,-1);
      if(capture.final_pointer_sequence!==null&&sequence!==null&&BigInt(sequence)<BigInt(capture.final_pointer_sequence))
        conflict('Meeting pointer sequence cannot rewind');
      if(body.pointerLoss!==undefined&&typeof body.pointerLoss!=='boolean')invalid('pointerLoss must be boolean');
      await port.query(`UPDATE projed_core.meeting_capture_sessions SET state='stopped',
        stopped_at=coalesce(stopped_at,now()),audio_expires_at=coalesce(stopped_at,now())+interval '7 days',
        epoch_manifest=$2::jsonb,source_gaps=$3::jsonb,final_pointer_sequence=$4::bigint,
        pointer_loss=pointer_loss OR $5::boolean,stopped_reason=$6,last_progress_at=now(),updated_at=now()
        WHERE id=$1::uuid`,[id,JSON.stringify(epochs),JSON.stringify(gaps),sequence,
        body.pointerLoss??false,body.reason===undefined?'user-stop':text(body.reason,120)]);
    }
    const result=await port.query<CaptureRow>('SELECT * FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid',[id]);
    if(!result.rows[0])missing();
    return progress(result.rows[0]);
  }

  private async begin(port:ActorQueryPort,body:Record<string,unknown>){
    const board=await resolveBoard(port,text(body.tenantId,512),text(body.projectId,512));
    const recordRef=text(body.recordId,512),key=text(body.idempotencyKey,160);
    const records=await port.query<{id:string;status:string;allowed:boolean}>(`SELECT id::text,status,
      projed_core.actor_can_write_record_v1(tenant_id,project_id,visibility,created_by,recorded_by) AS allowed
      FROM projed_core.knowledge_records WHERE tenant_id=$1::uuid AND project_id=$2::uuid
      AND (id::text=$3 OR legacy_record_id=$3) AND record_type='meeting' FOR UPDATE`,[board.tenantId,board.id,recordRef]);
    if(records.rows.length!==1||records.rows[0]?.allowed!==true)missing();
    const record=records.rows[0]!;
    if(record.status!=='draft')conflict('Recording requires a draft meeting');
    const existing=await port.query<CaptureRow>(`SELECT * FROM projed_core.meeting_capture_sessions
      WHERE record_id=$1::uuid AND idempotency_key=$2`,[record.id,key]);
    if(existing.rows[0])return this.begun(existing.rows[0],true);
    const active=await port.query(`SELECT id FROM projed_core.meeting_capture_sessions WHERE record_id=$1::uuid
      AND state IN ('created','recording','paused','stopped','uploading','queued','running','awaiting_budget','failed_retryable')`,[record.id]);
    if(active.rows.length)conflict('Meeting already has an active recording');
    const id=randomUUID();await port.authorizeMeetingCaptureMutation(record.id,id);
    const created=await port.query<CaptureRow>(`INSERT INTO projed_core.meeting_capture_sessions
      (id,tenant_id,project_id,record_id,created_by,idempotency_key,state,last_progress_at,started_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,projed_core.current_actor_user_id_v1(),$5,'recording',now(),now())
      RETURNING *`,[id,board.tenantId,board.id,record.id,key]);
    return this.begun(created.rows[0]!,false);
  }
  private begun(row:CaptureRow,idempotent:boolean){
    return {captureId:row.id,state:row.state,sourceVersion:row.source_version,
      startedAt:(row.started_at??row.created_at).toISOString(),idempotent};
  }
  private async appendPointer(port:ActorQueryPort,capture:CaptureRow,body:Record<string,unknown>){
    if(!['recording','paused','stopped','uploading'].includes(capture.state))conflict('Meeting no longer accepts pointer evidence');
    const batch=normalizePointerBatch(capture.id,body);
    const prior=await port.query<{sequence:string;batch_key:string;batch_digest:string}>(`SELECT sequence,batch_key,batch_digest
      FROM projed_core.meeting_pointer_intervals WHERE capture_id=$1::uuid AND sequence=ANY($2::bigint[])`,
    [capture.id,batch.intervals.map(item=>item.sequence)]);
    for(const row of prior.rows){
      if(row.batch_key!==batch.batchKey||row.batch_digest!==batch.digest)conflict('Pointer sequence already belongs to another batch');
    }
    const existing=new Set(prior.rows.map(row=>row.sequence));
    const pending=batch.intervals.filter(item=>!existing.has(String(item.sequence))).map(item=>({
      id:randomUUID(),epoch:item.clockEpoch,sequence:item.sequence,task:item.canonicalTaskId,
      surface:item.surfaceKind,start:item.startedOffsetMs,end:item.endedOffsetMs,
      visible:item.visible,reason:item.terminationReason,
    }));
    if(pending.length)await port.query(`INSERT INTO projed_core.meeting_pointer_intervals
      (id,capture_id,clock_epoch,sequence,canonical_task_id,surface_kind,started_offset_ms,ended_offset_ms,
       visible,termination_reason,batch_key,batch_digest,tenant_id,project_id)
      SELECT item.id,$1::uuid,item.epoch,item.sequence,item.task,item.surface,item.start,item."end",
        item.visible,item.reason,$3,$4,$5::uuid,$6::uuid
      FROM jsonb_to_recordset($2::jsonb) AS item(id uuid,epoch integer,sequence bigint,task uuid,
        surface text,start bigint,"end" bigint,visible boolean,reason text)`,
    [capture.id,JSON.stringify(pending),batch.batchKey,batch.digest,capture.tenant_id,capture.project_id]);
    return {ackSequence:batch.ackSequence};
  }
}
