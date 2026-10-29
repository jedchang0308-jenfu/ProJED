import type {ActorQueryPort} from './actorTransaction.js';
import {KernelError} from './errors.js';
import {validTaskDetailNotes} from './domainRead.js';
import {requireUuid} from './meetingCaptureInput.js';
import {createMeetingTaskCandidateSnapshot,type MeetingTaskCandidateSnapshot,type MeetingTaskCandidateScope,
  type MeetingTaskCandidateSignal,type MeetingTaskCandidateSource} from './meetingTaskCandidates.js';
import {buildWbsRagSource} from '../shared/wbsRagSource.js';
import {normalizeRagChunkContent} from '../shared/ragChunkContent.js';
import type {TaskDetailNote,TaskStatus} from '../src/types/index.js';

/** An authorized live WBS read, not an imported document's self-reported hash. */
export interface MeetingTaskRagSource {
  readonly taskId:string;readonly content:string;readonly contentHash:string;readonly taskStateHash:string;
  readonly indexedContentLength:number;
}
export interface MeetingTaskSources {
  readonly tasks:readonly MeetingTaskCandidateSource[];
  readonly ragSources:readonly MeetingTaskRagSource[];
}
export interface MeetingTaskRagMatches {
  readonly signals:readonly MeetingTaskCandidateSignal[];
  readonly totalTasks:number;readonly indexedTasks:number;readonly incomplete:boolean;
}

const TASK_TAGS_SQL=`LEFT JOIN LATERAL (
  SELECT array_agg(tag.name ORDER BY tag.sort_order,tag.id) AS names
    FROM projed_core.wbs_item_tags assignment JOIN projed_core.task_tags tag
      ON tag.tenant_id=assignment.tenant_id AND tag.id=assignment.tag_id
    WHERE assignment.tenant_id=task.tenant_id AND assignment.project_id=task.project_id AND assignment.item_id=task.id
) task_tags ON true`;
const TASK_STATE_SQL=`encode(sha256(convert_to((to_jsonb(task)||jsonb_build_object(
  'tagNames',coalesce(task_tags.names,ARRAY[]::text[])))::text,'UTF8')),'hex')`;
const WORDS=new Intl.Segmenter('zh-Hant',{granularity:'word'});
const HASH=/^[a-f0-9]{64}$/u;

function invalid():never{throw new KernelError('DOMAIN_DATA_INVALID','Meeting task retrieval input is invalid',409);}
function boundary():never{throw new KernelError('DB_BOUNDARY_INVALID','Meeting task retrieval result is invalid',503);}
function scopeIds(scope:MeetingTaskCandidateScope):[string,string]{
  return [requireUuid(scope.tenantId,'tenantId'),requireUuid(scope.projectId,'projectId')];
}
async function authorize(port:ActorQueryPort,scope:MeetingTaskCandidateScope):Promise<void>{
  const result=await port.query<{allowed:boolean}>(`SELECT projed_core.actor_has_board_capability_v1($1::uuid,$2::uuid,'read_board') AS allowed`,scopeIds(scope));
  if(result.rows.length!==1||result.rows[0]?.allowed!==true)throw new KernelError('ACCESS_DENIED','Meeting task scope is unavailable',403);
}

interface TaskRow {
  id:string;parent_id:string|null;legacy_task_id:string;title:string;description:string|null;detail_notes:unknown;
  status:TaskStatus;start_date:string|null;end_date:string|null;node_type:'task'|'milestone'|'group'|null;
  archived:boolean;updated_at:string;tag_names:string[];task_state_hash:string;
}

/** Read the same canonical content used by the existing WBS index producer.
 * Groups remain available for paths; only live tasks enter candidate/index data. */
export async function readMeetingTaskSources(port:ActorQueryPort,scope:MeetingTaskCandidateScope):Promise<MeetingTaskSources>{
  await authorize(port,scope);
  const result=await port.query<TaskRow>(`SELECT task.id::text,task.parent_id::text,task.legacy_task_id,task.title,
    task.description,task.detail_notes,task.status,to_char(task.start_date,'YYYY-MM-DD') AS start_date,
    to_char(task.end_date,'YYYY-MM-DD') AS end_date,task.node_type,task.archived,
    to_char(task.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
    coalesce(task_tags.names,ARRAY[]::text[]) AS tag_names,${TASK_STATE_SQL} AS task_state_hash
    FROM projed_core.wbs_items task ${TASK_TAGS_SQL}
    WHERE task.tenant_id=$1::uuid AND task.project_id=$2::uuid ORDER BY task.id`,scopeIds(scope));
  const byId=new Map(result.rows.map(row=>[row.id,row]));
  if(byId.size!==result.rows.length)boundary();
  const pathFor=(row:TaskRow):string=>{
    const titles:string[]=[],seen=new Set<string>();let current:TaskRow|undefined=row;
    while(current){
      if(seen.has(current.id))boundary();seen.add(current.id);titles.push(current.title);
      if(current.parent_id===null)break;
      current=byId.get(current.parent_id);if(!current)boundary();
    }
    return titles.reverse().join(' / ');
  };
  const tasks:MeetingTaskCandidateSource[]=[],ragSources:MeetingTaskRagSource[]=[];
  for(const row of result.rows){
    requireUuid(row.id,'taskId');
    if(typeof row.title!=='string'||typeof row.legacy_task_id!=='string'||typeof row.status!=='string'
      ||typeof row.archived!=='boolean'||!Array.isArray(row.tag_names)||row.tag_names.some(tag=>typeof tag!=='string')
      ||!HASH.test(row.task_state_hash)||!Number.isFinite(Date.parse(row.updated_at))||!validTaskDetailNotes(row.detail_notes))boundary();
    if(row.archived||row.node_type==='group')continue;
    const canonical=buildWbsRagSource({title:row.title,status:row.status,description:row.description??undefined,
      nodeType:row.node_type??undefined,detailNotes:row.detail_notes as TaskDetailNote[],
      startDate:row.start_date??undefined,endDate:row.end_date??undefined},row.tag_names);
    tasks.push({taskId:row.id,tenantId:scope.tenantId,projectId:scope.projectId,title:row.title,taskCode:row.legacy_task_id,
      path:pathFor(row),description:canonical.content,status:row.status,updatedAt:row.updated_at,sourceHash:row.task_state_hash,
      nodeType:row.node_type,archived:row.archived});
    ragSources.push({taskId:row.id,content:canonical.content,contentHash:canonical.contentHash,taskStateHash:row.task_state_hash,
      indexedContentLength:normalizeRagChunkContent(canonical.content).length});
  }
  return {tasks,ragSources};
}

/** After a provider call, re-read in the same actor transaction that will store
 * its result. Ancestor path changes affect the snapshot even when WBS index
 * content and the child task's updated_at remain unchanged. */
export async function readCurrentMeetingTaskSnapshots(port:ActorQueryPort,scope:MeetingTaskCandidateScope,
  expected:readonly MeetingTaskCandidateSnapshot[]):Promise<readonly MeetingTaskCandidateSnapshot[]|null>{
  if(expected.length>12||new Set(expected.map(snapshot=>snapshot.taskId)).size!==expected.length)invalid();
  const live=await readMeetingTaskSources(port,scope),byId=new Map(live.tasks.map(task=>[task.taskId,task]));
  const current:MeetingTaskCandidateSnapshot[]=[];
  for(const before of expected){
    const task=byId.get(before.taskId);if(!task)return null;
    const after=createMeetingTaskCandidateSnapshot(task);
    if(after.taskId!==before.taskId||after.text!==before.text||after.updatedAt!==before.updatedAt
      ||after.sourceHash!==before.sourceHash||after.snapshotHash!==before.snapshotHash)return null;
    current.push(after);
  }
  return current;
}

function fold(text:string):string{return text.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();}
function terms(text:string):Set<string>{
  return new Set([...WORDS.segment(fold(text))].filter(part=>part.isWordLike).map(part=>part.segment));
}
function containsCode(text:string,code:string):boolean{
  if(!code)return false;
  let at=text.indexOf(code);
  while(at!==-1){
    const left=at===0?'':text[at-1]!,right=text[at+code.length]??'';
    if(!/[a-z0-9]/u.test(left)&&!/[a-z0-9]/u.test(right))return true;
    at=text.indexOf(code,at+1);
  }
  return false;
}

/** Ranking signals only. Neither lexical overlap nor pointer is acceptance. */
export function scoreMeetingTaskLexical(text:string,tasks:readonly MeetingTaskCandidateSource[]):readonly MeetingTaskCandidateSignal[]{
  if(typeof text!=='string'||Array.from(text).length>800)invalid();
  const query=fold(text),queryTerms=terms(text);
  return tasks.flatMap(task=>{
    if(task.archived||!(task.nodeType===null||task.nodeType==='task'||task.nodeType==='milestone'))return [];
    // Codes are exact identities, not bags of shared prefixes such as "T".
    const title=fold(task.title),code=fold(task.taskCode),taskTerms=terms(`${task.title} ${task.path}`);
    const direct=(title.length>0&&query.includes(title))||containsCode(query,code);
    const overlap=[...taskTerms].filter(term=>queryTerms.has(term)).length;
    const score=direct?1:taskTerms.size>0?overlap/taskTerms.size:0;
    return score>0?[{taskId:task.taskId,score}]:[];
  });
}

/** Exact-current task-only retrieval. SQL ranks every eligible chunk before
 * taking the six best tasks; no project rebuild or pre-ranking row limit. */
export async function readMeetingTaskRagMatches(port:ActorQueryPort,scope:MeetingTaskCandidateScope,
  sources:readonly MeetingTaskRagSource[],vector:readonly number[]):Promise<MeetingTaskRagMatches>{
  scopeIds(scope);
  if(!Array.isArray(vector)||vector.length!==3072||vector.some(value=>!Number.isFinite(value)))invalid();
  const rounded=vector.map(Math.fround);
  if(rounded.some(value=>!Number.isFinite(value))||rounded.every(value=>value===0))invalid();
  const seen=new Set<string>();
  const corpus=sources.map(source=>{
    requireUuid(source.taskId,'taskId');
    if(seen.has(source.taskId)||typeof source.content!=='string'||typeof source.contentHash!=='string'
      ||!HASH.test(source.taskStateHash)||!Number.isSafeInteger(source.indexedContentLength)||source.indexedContentLength<1
      ||source.indexedContentLength!==normalizeRagChunkContent(source.content).length)invalid();
    seen.add(source.taskId);
    return {task_id:source.taskId,content:source.content,content_hash:source.contentHash,task_state_hash:source.taskStateHash,
      indexed_content_length:source.indexedContentLength};
  });
  await authorize(port,scope);
  const result=await port.query<{total_tasks:number;indexed_tasks:number;task_id:string|null;score:number|null}>(`
    WITH current_sources AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset($3::jsonb) source(task_id uuid,content text,content_hash text,task_state_hash text,indexed_content_length integer)
    ), task_scope AS MATERIALIZED (
      SELECT task.id,${TASK_STATE_SQL} AS task_state_hash FROM projed_core.wbs_items task ${TASK_TAGS_SQL}
        WHERE task.tenant_id=$1::uuid AND task.project_id=$2::uuid AND NOT task.archived
          AND(task.node_type IN('task','milestone') OR task.node_type IS NULL)
    ), fresh_documents AS MATERIALIZED (
      SELECT task.id AS task_id,document.id AS document_id,latest.id AS version_id,source.content_hash,source.indexed_content_length
        FROM task_scope task JOIN current_sources source ON source.task_id=task.id AND source.task_state_hash=task.task_state_hash
        JOIN projed_core.documents document ON document.tenant_id=$1::uuid AND document.project_id=$2::uuid
          AND document.source_id=task.id AND document.source_table='wbs_items' AND document.source_type='wbs_item'
          AND document.rag_enabled AND document.content_hash=source.content_hash
        JOIN LATERAL(SELECT version.id,version.content_hash,version.content FROM projed_core.document_versions version
          WHERE version.tenant_id=$1::uuid AND version.document_id=document.id ORDER BY version.version DESC LIMIT 1) latest
          ON latest.content_hash=source.content_hash AND latest.content=source.content
    ), chunk_ranges AS MATERIALIZED (
      SELECT document.document_id,chunk.chunk_index,chunk.metadata->>'sourceContentHash' AS content_hash,
        CASE WHEN jsonb_typeof(chunk.metadata->'startChar')='number' THEN
          CASE WHEN(chunk.metadata->>'startChar')::numeric BETWEEN 0 AND 2147483647
            AND trunc((chunk.metadata->>'startChar')::numeric)=(chunk.metadata->>'startChar')::numeric
            THEN(chunk.metadata->>'startChar')::bigint END END AS start_char,
        CASE WHEN jsonb_typeof(chunk.metadata->'endChar')='number' THEN
          CASE WHEN(chunk.metadata->>'endChar')::numeric BETWEEN 0 AND 2147483647
            AND trunc((chunk.metadata->>'endChar')::numeric)=(chunk.metadata->>'endChar')::numeric
            THEN(chunk.metadata->>'endChar')::bigint END END AS end_char
        FROM fresh_documents document JOIN projed_core.document_chunks chunk ON chunk.tenant_id=$1::uuid
          AND chunk.document_id=document.document_id AND chunk.document_version_id=document.version_id
    ), ordered_ranges AS MATERIALIZED (
      SELECT ranges.*,lag(end_char) OVER(PARTITION BY document_id ORDER BY chunk_index) AS previous_end FROM chunk_ranges ranges
    ), indexed_documents AS MATERIALIZED (
      SELECT document.* FROM fresh_documents document JOIN LATERAL(
        SELECT count(*)>0 AND min(ranges.chunk_index)=0 AND max(ranges.chunk_index)::bigint+1=count(*)
          AND min(ranges.start_char)=0 AND max(ranges.end_char)=document.indexed_content_length
          AND bool_and(ranges.start_char IS NOT NULL AND ranges.end_char IS NOT NULL
            AND ranges.end_char>ranges.start_char AND ranges.end_char<=document.indexed_content_length
            AND(ranges.chunk_index=0 OR ranges.previous_end>=ranges.start_char)
            AND ranges.content_hash IS NOT DISTINCT FROM document.content_hash) AS complete
          FROM ordered_ranges ranges WHERE ranges.document_id=document.document_id
      ) coverage ON coverage.complete
      WHERE NOT EXISTS(SELECT 1 FROM projed_core.document_chunks chunk
          WHERE chunk.tenant_id=$1::uuid AND chunk.document_id=document.document_id AND chunk.document_version_id=document.version_id
            AND NOT EXISTS(SELECT 1 FROM projed_core.document_embeddings embedding
              WHERE embedding.tenant_id=$1::uuid AND embedding.chunk_id=chunk.id AND embedding.provider='google'
                AND embedding.model='gemini-embedding-001' AND embedding.dimensions=3072 AND embedding.content_hash=document.content_hash))
    ), scored_chunks AS (
      SELECT document.task_id,cosine.score FROM indexed_documents document
        JOIN projed_core.document_chunks chunk ON chunk.tenant_id=$1::uuid AND chunk.document_id=document.document_id
          AND chunk.document_version_id=document.version_id
        JOIN projed_core.document_embeddings embedding ON embedding.tenant_id=$1::uuid AND embedding.chunk_id=chunk.id
          AND embedding.provider='google' AND embedding.model='gemini-embedding-001' AND embedding.dimensions=3072
          AND embedding.content_hash=document.content_hash
        CROSS JOIN LATERAL(SELECT least(1::double precision,greatest(-1::double precision,
          sum(query.value::double precision*stored.value::double precision)/nullif(
            sqrt(sum(query.value::double precision*query.value::double precision))*
            sqrt(sum(stored.value::double precision*stored.value::double precision)),0))) AS score
          FROM unnest($4::real[]) WITH ORDINALITY query(value,position)
          JOIN unnest(embedding.embedding) WITH ORDINALITY stored(value,position) USING(position)) cosine
    ), ranked AS (SELECT task_id,max(score) AS score FROM scored_chunks WHERE score>0 GROUP BY task_id),
    bounded AS (SELECT task_id,score FROM ranked ORDER BY score DESC,task_id LIMIT 6),
    coverage AS (SELECT(SELECT count(*)::integer FROM task_scope) AS total_tasks,
      (SELECT count(DISTINCT task_id)::integer FROM indexed_documents) AS indexed_tasks)
    SELECT coverage.*,bounded.task_id::text,bounded.score FROM coverage LEFT JOIN bounded ON true
      ORDER BY bounded.score DESC NULLS LAST,bounded.task_id`,[...scopeIds(scope),JSON.stringify(corpus),rounded]);
  const first=result.rows[0];
  if(!first||!Number.isSafeInteger(first.total_tasks)||!Number.isSafeInteger(first.indexed_tasks)
    ||first.total_tasks<0||first.indexed_tasks<0||first.indexed_tasks>first.total_tasks||result.rows.length>6)boundary();
  const signals=result.rows.flatMap(row=>{
    if(row.total_tasks!==first.total_tasks||row.indexed_tasks!==first.indexed_tasks)boundary();
    if(row.task_id===null){if(row.score!==null)boundary();return [];}
    requireUuid(row.task_id,'taskId');
    if(typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<=0||row.score>1)boundary();
    return [{taskId:row.task_id,score:row.score}];
  });
  return {signals,totalTasks:first.total_tasks,indexedTasks:first.indexed_tasks,incomplete:first.indexed_tasks<first.total_tasks};
}

export async function readMeetingTaskPointerSignals(port:ActorQueryPort,input:{scope:MeetingTaskCandidateScope;
  captureId:string;sourceVersion:number;startOffsetMs:number;endOffsetMs:number}):Promise<readonly MeetingTaskCandidateSignal[]>{
  const {captureId,sourceVersion,startOffsetMs,endOffsetMs}=input;
  requireUuid(captureId,'captureId');scopeIds(input.scope);
  if(!Number.isSafeInteger(sourceVersion)||sourceVersion<1||!Number.isSafeInteger(startOffsetMs)||startOffsetMs<0
    ||!Number.isSafeInteger(endOffsetMs)||endOffsetMs<=startOffsetMs||endOffsetMs-startOffsetMs>30000)invalid();
  const result=await port.query<{task_id:string;score:number}>(`SELECT pointer.canonical_task_id::text AS task_id,
    least(1::double precision,sum(least(pointer.ended_offset_ms,$6::bigint)-greatest(pointer.started_offset_ms,$5::bigint))::double precision/
      ($6::bigint-$5::bigint)) AS score
    FROM projed_core.meeting_pointer_intervals pointer JOIN projed_core.meeting_capture_sessions capture ON capture.id=pointer.capture_id
    JOIN projed_core.wbs_items task ON task.id=pointer.canonical_task_id AND task.tenant_id=capture.tenant_id AND task.project_id=capture.project_id
    WHERE capture.id=$3::uuid AND capture.source_version=$4::integer AND capture.tenant_id=$1::uuid AND capture.project_id=$2::uuid
      AND pointer.visible AND pointer.started_offset_ms<$6::bigint AND pointer.ended_offset_ms>$5::bigint
      AND NOT task.archived AND(task.node_type IN('task','milestone') OR task.node_type IS NULL)
    GROUP BY pointer.canonical_task_id ORDER BY score DESC,pointer.canonical_task_id`,
  [...scopeIds(input.scope),captureId,sourceVersion,startOffsetMs,endOffsetMs]);
  return result.rows.map(row=>{
    requireUuid(row.task_id,'taskId');if(!Number.isFinite(row.score)||row.score<=0||row.score>1)boundary();
    return {taskId:row.task_id,score:row.score};
  });
}
