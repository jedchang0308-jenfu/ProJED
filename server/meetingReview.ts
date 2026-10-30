import { createHash, randomUUID } from 'node:crypto';
import type { ActorQueryPort } from './actorTransaction.js';
import { KernelError } from './errors.js';
import { reconcileKnowledgeRecordMirror } from './knowledgeRecordRagMirror.js';
import { RecordActivityRepository, bumpRecordActivityRevision } from './recordActivity.js';
import { normalizeMeetingReview, normalizeMeetingDecision, normalizeMeetingProjection,
  type MeetingDecisionInput, type MeetingProjectionInput } from './meetingReviewInput.js';

interface Capture {
  id:string;record_id:string;tenant_id:string;project_id:string;state:string;source_version:number;
  review_revision:string;active_transcript_revision_id:string|null;record_updated_at:string;
  record_status:string;
}
const RECORD_TOKEN=`to_char(record.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const CURRENT_TRANSCRIPT=`run.source_version=capture.source_version
  AND capture.active_transcript_revision_id IS NOT NULL
  AND transcript.transcript_revision_id=capture.active_transcript_revision_id`;
function missing():never {throw new KernelError('RESOURCE_NOT_FOUND','Meeting review is unavailable',404);}
function conflict():never {throw new KernelError('REVISION_CONFLICT','Meeting source, review or draft changed',409);}
function invalidSummary():never {throw new KernelError('DB_BOUNDARY_INVALID','Published meeting summary is invalid',503);}
function safeCounter(value:unknown):number {
  if((typeof value!=='string'&&typeof value!=='number')||!/^\d+$/u.test(String(value)))conflict();
  const result=Number(value);if(!Number.isSafeInteger(result)||result<0)conflict();return result;
}
function explicitAudioSourceId(value:unknown):string|null|undefined {
  if(!Array.isArray(value)||value.length===0)return undefined;
  const ids=value.map(word=>word&&typeof word==='object'&&!Array.isArray(word)
    ? (word as Record<string,unknown>).source_audio_segment_id : undefined);
  const populated=ids.filter(id=>id!==undefined&&id!==null&&id!=='');
  if(populated.length===0)return undefined;
  if(populated.length!==ids.length||populated.some(id=>typeof id!=='string'||id!==populated[0]))return undefined;
  return populated[0] as string;
}
async function captureFor(port:ActorQueryPort,id:string,version?:number,write=false):Promise<Capture>{
  const read=()=>port.query<Capture>(`SELECT capture.id::text,capture.record_id::text,capture.tenant_id::text,
    capture.project_id::text,capture.state,capture.source_version,capture.review_revision::text,
    capture.active_transcript_revision_id::text,${RECORD_TOKEN} AS record_updated_at,record.status AS record_status
    FROM projed_core.meeting_capture_sessions capture JOIN projed_core.knowledge_records record ON record.id=capture.record_id
    WHERE capture.id=$1::uuid`,[id]);
  let rows=await read();if(!rows.rows[0])missing();
  if(write){await port.authorizeMeetingCaptureMutation(rows.rows[0].record_id,id);
    const locked=await port.query('SELECT id FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid FOR UPDATE',[id]);
    if(locked.rows.length!==1)missing();rows=await read();}
  const capture=rows.rows[0];if(!capture)missing();
  if(version!==undefined&&capture.source_version!==version)conflict();
  return capture;
}
async function taskFor(port:ActorQueryPort,capture:Capture,reference:string):Promise<string>{
  const rows=await port.query<{id:string}>(`SELECT id::text FROM projed_core.wbs_items
    WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND (id::text=$3 OR legacy_task_id=$3)
      AND NOT archived AND (node_type IS NULL OR node_type IN ('task','milestone'))`,
  [capture.tenant_id,capture.project_id,reference]);
  if(rows.rows.length!==1)conflict();return rows.rows[0]!.id;
}

export class MeetingReviewRepository {
  async execute(port:ActorQueryPort,body:Record<string,unknown>):Promise<unknown>{
    if(body.operation==='review'){
      const input=normalizeMeetingReview(body);return this.review(port,await captureFor(port,input.captureId,input.expectedSourceVersion));
    }
    if(body.operation==='decide-match'){
      const input=normalizeMeetingDecision(body);return this.decide(port,await captureFor(port,input.captureId,input.expectedSourceVersion,true),input);
    }
    const input=normalizeMeetingProjection(body);
    const capture=await captureFor(port,input.captureId,input.expectedSourceVersion,true);
    if(capture.record_id!==input.recordId)missing();
    return this.project(port,capture,input);
  }

  private async review(port:ActorQueryPort,capture:Capture):Promise<unknown>{
    const transcript=await port.query<{id:string;transcript_revision_id:string;raw_text:string;
      start_offset_ms:string;end_offset_ms:string;word_offsets:unknown}>(`
      SELECT transcript.id::text,transcript.transcript_revision_id::text,transcript.raw_text,
        transcript.start_offset_ms::text,transcript.end_offset_ms::text,transcript.word_offsets
      FROM projed_core.meeting_transcript_segments transcript
      JOIN projed_core.meeting_analysis_runs run ON run.id=transcript.producer_run_id AND run.capture_id=transcript.capture_id
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=transcript.capture_id
      WHERE capture.id=$1::uuid AND ${CURRENT_TRANSCRIPT} ORDER BY transcript.segment_index,transcript.id
    `,[capture.id]);
    const resolutions=await port.query<{id:string;transcript_segment_id:string;resolution_state:string;revision:string;
      human_reviewed:boolean;human_empty_decision:boolean}>(`SELECT id::text,transcript_segment_id::text,
      resolution_state,revision::text,human_reviewed,human_empty_decision FROM projed_core.meeting_segment_resolutions
      WHERE capture_id=$1::uuid`,[capture.id]);
    const matches=await port.query<{resolution_id:string;task_id:string;internal_task_id:string;title:string;quote_range:unknown;
      semantic_score:string|null;pointer_feature:string|null;decision:string;decision_source:string;ai_suggestion_version:string}>(`
      SELECT match.resolution_id::text,COALESCE(task.legacy_task_id,task.id::text) AS task_id,task.id::text AS internal_task_id,task.title,
        match.quote_range,match.semantic_score::text,match.pointer_feature::text,match.decision,match.decision_source,match.ai_suggestion_version
      FROM projed_core.meeting_task_match_results match JOIN projed_core.wbs_items task
        ON task.id=match.task_id AND task.tenant_id=match.tenant_id AND task.project_id=match.project_id
      WHERE match.capture_id=$1::uuid AND NOT task.archived AND (task.node_type IS NULL OR task.node_type IN ('task','milestone'))
      ORDER BY match.created_at,match.id`,[capture.id]);
    const audio=await port.query<{id:string;start_offset_ms:string;end_offset_ms:string}>(`SELECT id::text,
      start_offset_ms::text,end_offset_ms::text FROM projed_core.meeting_capture_segments
      WHERE capture_id=$1::uuid AND source_version=$2 AND upload_state='verified' ORDER BY segment_index,id`,[capture.id,capture.source_version]);
    const published=await port.query<{summary_type:string|null;summary:string|null}>(`SELECT
      jsonb_typeof(checkpoint.payload_text::jsonb->'summary') AS summary_type,checkpoint.payload_text::jsonb->>'summary' AS summary
      FROM projed_core.meeting_llm_unit_checkpoints checkpoint
      JOIN projed_core.meeting_analysis_runs run ON run.id=checkpoint.run_id AND run.capture_id=checkpoint.capture_id
        AND run.source_version=checkpoint.source_version AND run.transcript_revision_id=checkpoint.transcript_revision_id
      WHERE checkpoint.capture_id=$1::uuid AND checkpoint.source_version=$2 AND checkpoint.transcript_revision_id=$3::uuid
        AND checkpoint.stage='compose' AND checkpoint.unit_key='final' AND checkpoint.slot='result'
        AND checkpoint.attempt_id=('publication:'||run.id::text) AND run.state='ready'
      ORDER BY run.updated_at DESC,checkpoint.created_at DESC,checkpoint.id DESC LIMIT 1`,
    [capture.id,capture.source_version,capture.active_transcript_revision_id]);
    const publishedRow=published.rows[0];let summary:string|null=null;
    if(published.rows.length>1)invalidSummary();
    if(publishedRow){
      if(publishedRow.summary_type==='null'&&publishedRow.summary===null)summary=null;
      else if(publishedRow.summary_type==='string'&&typeof publishedRow.summary==='string'
        &&Array.from(publishedRow.summary).length<=2000)summary=publishedRow.summary;
      else invalidSummary();
    }
    const taskRows=matches.rows.length?await port.query<{id:string;parent_id:string|null;title:string}>(`
      SELECT id::text,parent_id::text,title FROM projed_core.wbs_items
      WHERE tenant_id=$1::uuid AND project_id=$2::uuid`,[capture.tenant_id,capture.project_id]):{rows:[]};
    const tasks=new Map(taskRows.rows.map(task=>[task.id,task]));
    const pathFor=(id:string):string=>{
      const path:string[]=[],visited=new Set<string>();
      let current:string|null=id;
      while(current&&!visited.has(current)){
        visited.add(current);const task=tasks.get(current);if(!task)break;
        path.unshift(task.title);current=task.parent_id;
      }
      return path.join('/');
    };
    const byTranscript=new Map(resolutions.rows.map(row=>[row.transcript_segment_id,row]));
    return {captureId:capture.id,recordId:capture.record_id,state:capture.state,sourceVersion:capture.source_version,summary,
      recordUpdatedAt:capture.record_updated_at,reviewRevision:safeCounter(capture.review_revision),
      segments:transcript.rows.map(segment=>{
        const resolution=byTranscript.get(segment.id);
        const start=safeCounter(segment.start_offset_ms),end=safeCounter(segment.end_offset_ms);
        const anchorId=explicitAudioSourceId(segment.word_offsets);
        const source=anchorId===undefined
          ? audio.rows.find(row=>safeCounter(row.end_offset_ms)>start&&safeCounter(row.start_offset_ms)<end)??null
          : anchorId===null?null:audio.rows.find(row=>row.id===anchorId)??null;
        return {segmentId:segment.id,transcriptRevisionId:segment.transcript_revision_id,text:segment.raw_text,
          startOffsetMs:start,endOffsetMs:end,wordOffsets:segment.word_offsets,
          audioSegmentId:source?.id??null,
          audioSourceStartOffsetMs:source?safeCounter(source.start_offset_ms):null,
          audioSourceEndOffsetMs:source?safeCounter(source.end_offset_ms):null,
          resolutionId:resolution?.id??null,resolutionRevision:resolution?safeCounter(resolution.revision):0,
          decision:resolution?.resolution_state??'pending',humanReviewed:resolution?.human_reviewed??false,
          humanEmptyDecision:resolution?.human_empty_decision??false,
          candidates:matches.rows.filter(row=>row.resolution_id===resolution?.id).map(row=>{
            const semantic=Number(row.semantic_score??0),pointer=Number(row.pointer_feature??0);
            if(!Number.isFinite(semantic)||!Number.isFinite(pointer))conflict();
            return {taskId:row.task_id,title:row.title,path:pathFor(row.internal_task_id),quoteRange:row.quote_range,
              semanticScore:semantic,pointerFeature:pointer,decision:row.decision,
              source:row.decision_source==='human'?'human':pointer>0&&semantic<=0?'pointer':'lexical',
              snapshotHash:row.ai_suggestion_version,aiSuggestionVersion:row.ai_suggestion_version};
          })};
      })};
  }

  private async decide(port:ActorQueryPort,capture:Capture,input:MeetingDecisionInput):Promise<unknown>{
    if(['cancelled','expired'].includes(capture.state))conflict();
    await port.authorizeMeetingReviewMutation(capture.id,input.resolutionId);
    const resolution=await port.query<{revision:string;human_empty_decision:boolean}>(`SELECT revision::text,human_empty_decision
      FROM projed_core.meeting_segment_resolutions resolution WHERE resolution.id=$1::uuid AND resolution.capture_id=$2::uuid
        AND EXISTS (SELECT 1 FROM projed_core.meeting_transcript_segments transcript
          JOIN projed_core.meeting_analysis_runs run ON run.id=transcript.producer_run_id AND run.capture_id=transcript.capture_id
          JOIN projed_core.meeting_capture_sessions capture ON capture.id=transcript.capture_id
          WHERE transcript.id=resolution.transcript_segment_id AND transcript.capture_id=resolution.capture_id
            AND ${CURRENT_TRANSCRIPT}) FOR UPDATE`,[input.resolutionId,capture.id]);
    if(!resolution.rows[0])missing();
    if(safeCounter(resolution.rows[0].revision)!==input.expectedResolutionRevision)conflict();
    let empty=resolution.rows[0].human_empty_decision;
    for(const operation of input.operations){
      if(operation.action==='clear-all'){
        await port.query('DELETE FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid',[input.resolutionId]);empty=true;continue;
      }
      const task=await taskFor(port,capture,operation.taskId);
      const match=await port.query<{id:string;quote_range:unknown;pointer_feature:string|null}>(`SELECT id::text,quote_range,pointer_feature::text
        FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid AND task_id=$2::uuid`,[input.resolutionId,task]);
      if(operation.action==='accept'&&(!match.rows[0]||(match.rows[0].quote_range===null&&Number(match.rows[0].pointer_feature??0)>0)))conflict();
      if(operation.action==='replace')await port.query('DELETE FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid',[input.resolutionId]);
      await port.query(`INSERT INTO projed_core.meeting_task_match_results(id,resolution_id,task_id,ai_suggestion_version,
        decision,decision_source,corrected_by,corrected_at,capture_id,tenant_id,project_id)
        VALUES($1::uuid,$2::uuid,$3::uuid,'human.v1',$4,'human',projed_core.current_actor_user_id_v1(),now(),$5::uuid,$6::uuid,$7::uuid)
        ON CONFLICT(resolution_id,task_id) DO UPDATE SET decision=EXCLUDED.decision,decision_source='human',
          corrected_by=projed_core.current_actor_user_id_v1(),corrected_at=now(),updated_at=now()`,
      [randomUUID(),input.resolutionId,task,operation.action==='reject'?'rejected':'accepted',capture.id,capture.tenant_id,capture.project_id]);
      empty=false;
    }
    const accepted=await port.query<{count:string}>(`SELECT count(*)::text AS count FROM projed_core.meeting_task_match_results
      WHERE resolution_id=$1::uuid AND decision='accepted'`,[input.resolutionId]);
    const state=empty?'rejected':safeCounter(accepted.rows[0]!.count)>0?'accepted':'needs_review';
    const changed=await port.query<{revision:string}>(`UPDATE projed_core.meeting_segment_resolutions
      SET revision=revision+1,resolution_state=$3,human_reviewed=true,human_empty_decision=$4,updated_at=now()
      WHERE id=$1::uuid AND revision=$2::bigint RETURNING revision::text`,[input.resolutionId,input.expectedResolutionRevision,state,empty]);
    if(changed.rows.length!==1)conflict();
    const revised=await port.query<{review_revision:string}>(`UPDATE projed_core.meeting_capture_sessions
      SET review_revision=review_revision+1,updated_at=now() WHERE id=$1::uuid RETURNING review_revision::text`,[capture.id]);
    if(revised.rows.length!==1)conflict();
    return {resolutionId:input.resolutionId,resolutionRevision:safeCounter(changed.rows[0]!.revision),
      reviewRevision:safeCounter(revised.rows[0]!.review_revision),sourceVersion:capture.source_version,state};
  }

  private async project(port:ActorQueryPort,capture:Capture,input:MeetingProjectionInput):Promise<unknown>{
    if((input.tenantId!==undefined&&input.tenantId!==capture.tenant_id)
      ||(input.projectId!==undefined&&input.projectId!==capture.project_id))conflict();
    await port.authorizeMeetingProjectionMutation(capture.record_id,capture.id);
    const existing=await port.query<{capture_id:string;last_request_key:string|null;payload_hash:string|null}>(`
      SELECT capture_id::text,last_request_key,payload_hash FROM projed_core.meeting_draft_projections
      WHERE record_id=$1::uuid FOR UPDATE`,[capture.record_id]);
    const payloadHash=createHash('sha256').update(JSON.stringify({sourceVersion:input.expectedSourceVersion,
      userDraft:input.userDraft,taskLinks:input.taskLinks,requestKey:input.requestKey})).digest('hex');
    const old=existing.rows[0];
    const records=new RecordActivityRepository();
    if(old?.last_request_key===input.requestKey){
      if(old.capture_id!==capture.id||old.payload_hash!==payloadHash)conflict();
      return {savedRecord:await records.getRecord(port,capture.tenant_id,capture.project_id,capture.record_id),recordUpdatedAt:capture.record_updated_at,idempotent:true};
    }
    const cas=await port.query(`SELECT id FROM projed_core.knowledge_records
      WHERE id=$1::uuid AND updated_at=$2::timestamptz AND status='draft'`,[capture.record_id,input.expectedRecordUpdatedAt]);
    if(cas.rows.length!==1||safeCounter(capture.review_revision)!==input.expectedReviewRevision
      ||!['ready','failed_retryable','failed_terminal'].includes(capture.state))conflict();
    const requested:Array<{id:string;role:string}>=[];
    const seen=new Set<string>();
    for(const link of input.taskLinks){
      const id=await taskFor(port,capture,link.nodeId);const key=`${id}/${link.role}`;
      if(!seen.has(key)){requested.push({id,role:link.role});seen.add(key);}
    }
    const accepted=await port.query<{task_id:string;archived:boolean;node_type:string|null}>(`
      SELECT DISTINCT match.task_id::text,task.archived,task.node_type
      FROM projed_core.meeting_task_match_results match
      JOIN projed_core.meeting_segment_resolutions resolution ON resolution.id=match.resolution_id AND resolution.capture_id=match.capture_id
      JOIN projed_core.meeting_transcript_segments transcript ON transcript.id=resolution.transcript_segment_id AND transcript.capture_id=resolution.capture_id
      JOIN projed_core.meeting_analysis_runs run ON run.id=transcript.producer_run_id AND run.capture_id=transcript.capture_id
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=transcript.capture_id
      JOIN projed_core.wbs_items task ON task.id=match.task_id AND task.tenant_id=capture.tenant_id AND task.project_id=capture.project_id
      WHERE capture.id=$1::uuid AND match.decision='accepted' AND ${CURRENT_TRANSCRIPT}`,[capture.id]);
    for(const task of accepted.rows){
      if(task.archived||(task.node_type!==null&&!['task','milestone'].includes(task.node_type)))conflict();
      if(!requested.some(link=>link.id===task.task_id))requested.push({id:task.task_id,role:'related'});
    }
    const draft=input.userDraft;
    const update=await port.query(`UPDATE projed_core.knowledge_records SET
      title=CASE WHEN btrim($2)='' THEN title ELSE btrim($2) END,content=$3,status=$4,metadata=$5::jsonb,
      rag_enabled=false,updated_by=projed_core.current_actor_user_id_v1(),updated_at=now()
      WHERE id=$1::uuid`,[capture.record_id,draft.title,draft.content,draft.status,JSON.stringify(draft.metadata)]);
    if(update.rowCount!==1)missing();
    await port.query('DELETE FROM projed_core.record_task_links WHERE record_id=$1::uuid',[capture.record_id]);
    for(const link of requested)await port.query(`INSERT INTO projed_core.record_task_links(id,tenant_id,project_id,record_id,item_id,role,created_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,projed_core.current_actor_user_id_v1())`,
    [randomUUID(),capture.tenant_id,capture.project_id,capture.record_id,link.id,link.role]);
    const resolutionMetadata=draft.metadata.meetingTaskResolution;
    const metadata=resolutionMetadata&&typeof resolutionMetadata==='object'&&!Array.isArray(resolutionMetadata)
      ?resolutionMetadata as Record<string,unknown>:{};
    await port.query(`INSERT INTO projed_core.meeting_draft_projections(record_id,capture_id,applied_review_revision,
      last_request_key,payload_hash,manual_link_set,auto_link_set,record_version,updated_at)
      VALUES($1::uuid,$2::uuid,$3::bigint,$4,$5,$6::jsonb,$7::jsonb,1,now())
      ON CONFLICT(record_id) DO UPDATE SET capture_id=EXCLUDED.capture_id,applied_review_revision=EXCLUDED.applied_review_revision,
        last_request_key=EXCLUDED.last_request_key,payload_hash=EXCLUDED.payload_hash,manual_link_set=EXCLUDED.manual_link_set,
        auto_link_set=EXCLUDED.auto_link_set,record_version=meeting_draft_projections.record_version+1,updated_at=now()`,
    [capture.record_id,capture.id,capture.review_revision,input.requestKey,payloadHash,
      JSON.stringify(metadata.manualLinkSet??[]),JSON.stringify(metadata.autoLinkSet??[])]);
    await reconcileKnowledgeRecordMirror(port,{tenantId:capture.tenant_id,projectId:capture.project_id,recordId:capture.record_id});
    await bumpRecordActivityRevision(port,capture.tenant_id,capture.project_id);
    const current=await captureFor(port,capture.id,capture.source_version);
    return {savedRecord:await records.getRecord(port,capture.tenant_id,capture.project_id,capture.record_id),recordUpdatedAt:current.record_updated_at,idempotent:false};
  }
}
