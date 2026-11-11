import {createHash} from 'node:crypto';
import type {ActorQueryPort} from './actorTransaction.js';
import {KernelError} from './errors.js';
import {requireUuid} from './meetingCaptureInput.js';
import {MEETING_LLM_CONFIG_VERSION,type MeetingLlmStage} from './meetingLlmPricing.js';
import {prepareMeetingLlmUnit,readMeetingLlmEnvelope,createPostgresMeetingLlmTransactions,
  type MeetingLlmPostgresOptions,type MeetingLlmPreparedUnit} from './meetingLlmRepository.js';
import type {MeetingDiscussionSegment} from './meetingDiscussionAssembly.js';
import {buildMeetingTaskMatchPrompt,parseMeetingTaskMatchResponse,type MeetingTaskModelMatch} from './meetingTaskMatching.js';
import {selectMeetingTaskCandidates,type MeetingTaskCandidate,type MeetingTaskCandidateScope} from './meetingTaskCandidates.js';
import {readMeetingTaskSources,readMeetingTaskRagCoverage,readMeetingTaskRagMatches,readMeetingTaskPointerSignals,
  scoreMeetingTaskLexical} from './meetingTaskRead.js';
import {createMeetingComposePlan,buildMeetingComposePrompt,parseMeetingComposeOutput,type MeetingComposeResult} from './meetingCompose.js';

export interface MeetingLlmResolvedDiscussion {
  readonly segmentId:string;readonly discussion:MeetingDiscussionSegment;
  readonly candidates:readonly MeetingTaskCandidate[];readonly matches:readonly MeetingTaskModelMatch[];
}
export interface MeetingLlmResultProof {
  readonly stage:MeetingLlmStage;readonly unitKey:string;readonly inputHash:string;readonly resultHash:string;
}
export type MeetingLlmNextWork=
  |{readonly kind:'idle'}
  |{readonly kind:'paid';readonly unit:MeetingLlmPreparedUnit}
  |{readonly kind:'local';readonly unit:MeetingLlmPreparedUnit;readonly resultText:string;readonly reason:'no_candidates'}
  |{readonly kind:'complete';readonly runId:string;readonly captureId:string;readonly sourceVersion:number;
      readonly transcriptRevisionId:string;readonly summary:string|null;readonly discussions:readonly MeetingLlmResolvedDiscussion[];
      readonly proofs:readonly MeetingLlmResultProof[]};
interface RunRow {id:string;capture_id:string;source_version:number;transcript_revision_id:string;
  state:string;lease_token:string|null;lease_expires_at:unknown;live:boolean;}
interface SegmentRow {id:string;segment_index:number;discussion:MeetingDiscussionSegment;}
interface CheckpointRow {stage:MeetingLlmStage;unit_key:string;input_hash:string;slot:'input'|'result';payload_text:string;payload_hash:string;}
function invalid():never{throw new KernelError('DB_BOUNDARY_INVALID','Meeting LLM plan source is invalid',503);}
function object(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function hash(value:string):string{return createHash('sha256').update(value,'utf8').digest('hex');}
function json(text:string):Record<string,unknown>{
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>1048576)invalid();
  let value:unknown;try{value=JSON.parse(text);}catch{invalid();}if(!object(value))invalid();return value;
}
function checkpointKey(stage:MeetingLlmStage,key:string,inputHash:string):string{return `${stage}|${key}|${inputHash}`;}

/** Reads only the original Session's private source and current WBS in one actor
 * transaction. It never claims, pays, stores a result, activates or publishes. */
export async function planMeetingLlmWork(port:ActorQueryPort,scope:MeetingTaskCandidateScope,runId:string):Promise<MeetingLlmNextWork>{
  requireUuid(runId,'runId');
  const runRows=await port.query<RunRow>(`SELECT id::text,capture_id::text,source_version,transcript_revision_id::text,
    state,lease_token::text,lease_expires_at,projed_core.meeting_llm_live_v1(id) AS live
    FROM projed_core.meeting_analysis_runs WHERE id=$1::uuid`,[runId]);
  if(runRows.rows.length>1)invalid();const run=runRows.rows[0];
  if(!run)return {kind:'idle'};
  if(typeof run.live!=='boolean')invalid();
  if(!run.live||!['queued','awaiting_budget'].includes(run.state)||run.lease_token!==null||run.lease_expires_at!==null)return {kind:'idle'};
  requireUuid(run.capture_id,'captureId');requireUuid(run.transcript_revision_id,'transcriptRevisionId');
  if(run.id!==runId||!Number.isSafeInteger(run.source_version)||run.source_version<1)invalid();
  const segments=await port.query<SegmentRow>(`SELECT id::text,segment_index,jsonb_build_object(
    'segmentIndex',segment_index,'rawText',raw_text,'normalizedText',normalized_text,'startOffsetMs',start_offset_ms,
    'endOffsetMs',end_offset_ms,'wordOffsets',word_offsets,'sourceAudioRanges',source_audio_ranges,'sourceHash',source_hash) AS discussion
    FROM projed_core.meeting_transcript_segments WHERE producer_run_id=$1::uuid AND transcript_revision_id=$2::uuid
    ORDER BY segment_index`,[runId,run.transcript_revision_id]);
  const ids=new Set<string>();
  segments.rows.forEach((row,index)=>{
    requireUuid(row.id,'segmentId');if(ids.has(row.id)||row.segment_index!==index||row.discussion.segmentIndex!==index)invalid();ids.add(row.id);
    // Reuse literal word alignment, immutable source ranges and text bounds.
    buildMeetingTaskMatchPrompt({discussion:row.discussion,candidates:[]});
  });
  const checkpoints=await port.query<CheckpointRow>(`SELECT stage,unit_key,input_hash,slot,payload_text,payload_hash
    FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=$1::uuid AND transcript_revision_id=$2::uuid
      AND source_version=$3::integer ORDER BY created_at,id`,[runId,run.transcript_revision_id,run.source_version]);
  const inputs=new Map<string,string>(),results=new Map<string,Record<string,unknown>>(),resultHashes=new Map<string,string>();
  for(const row of checkpoints.rows){
    if(!['retrieve','match','compose'].includes(row.stage)||!['input','result'].includes(row.slot)
      ||hash(row.payload_text)!==row.payload_hash)invalid();
    const key=checkpointKey(row.stage,row.unit_key,row.input_hash);
    if(row.slot==='input'){
      if(inputs.has(key))invalid();
      const input=readMeetingLlmEnvelope({stage:row.stage,unitKey:row.unit_key,inputHash:row.input_hash,inputText:row.payload_text});
      if(input.sourceVersion!==run.source_version||input.transcriptRevisionId!==run.transcript_revision_id)invalid();
      inputs.set(key,row.payload_text);
    }else{if(results.has(key))invalid();results.set(key,json(row.payload_text));resultHashes.set(key,row.payload_hash);}
  }
  for(const key of results.keys())if(!inputs.has(key))invalid();
  const unit=(stage:MeetingLlmStage,key:string,body:Readonly<Record<string,unknown>>)=>prepareMeetingLlmUnit(stage,key,{
    configVersion:MEETING_LLM_CONFIG_VERSION,sourceVersion:run.source_version,transcriptRevisionId:run.transcript_revision_id,body});
  const proofs:MeetingLlmResultProof[]=[];
  const stored=(prepared:MeetingLlmPreparedUnit)=>{
    const key=checkpointKey(prepared.stage,prepared.unitKey,prepared.inputHash);
    const prior=inputs.get(key);if(prior!==undefined&&prior!==prepared.inputText)invalid();
    const result=results.get(key);
    if(result)proofs.push({stage:prepared.stage,unitKey:prepared.unitKey,inputHash:prepared.inputHash,resultHash:resultHashes.get(key)!});
    return result;
  };
  const resolved:MeetingLlmResolvedDiscussion[]=[];
  const sources=segments.rows.length===0?null:await readMeetingTaskSources(port,scope);
  let coverage:Awaited<ReturnType<typeof readMeetingTaskRagCoverage>>|undefined;
  for(const [index,row] of segments.rows.entries()){
    if(!sources)invalid();
    const retrieval=unit('retrieve',row.id,{discussion:row.discussion,queryText:row.discussion.rawText});
    const retrievalResult=stored(retrieval);let vector:readonly number[]|null=null;
    if(retrievalResult){
      const values=retrievalResult.embedding;
      if(Object.keys(retrievalResult).length!==1||!Array.isArray(values)||values.length!==3072
        ||values.some(value=>typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(Math.fround(value)))
        ||values.every(value=>Math.fround(value)===0))invalid();vector=values as number[];
    }else{
      coverage??=await readMeetingTaskRagCoverage(port,scope,sources.ragSources);
      if(coverage.indexedTasks>0)return {kind:'paid',unit:retrieval};
    }
    const rag=vector===null?[]:(await readMeetingTaskRagMatches(port,scope,sources.ragSources,vector)).signals;
    const selected=selectMeetingTaskCandidates({scope,liveTasks:sources.tasks,
      lexical:scoreMeetingTaskLexical(row.discussion.rawText,sources.tasks),rag,
      pointer:await readMeetingTaskPointerSignals(port,{scope,captureId:run.capture_id,sourceVersion:run.source_version,
        startOffsetMs:row.discussion.startOffsetMs,endOffsetMs:row.discussion.endOffsetMs})});
    // Only prompt semantics enter the hash. Index counts and score fluctuations
    // must not invalidate an identical selected task snapshot/prompt.
    const candidates=selected.map(({taskId,text,updatedAt,sourceHash,snapshotHash})=>({taskId,text,updatedAt,sourceHash,snapshotHash}));
    const previousRawText=segments.rows[index-1]?.discussion.rawText,nextRawText=segments.rows[index+1]?.discussion.rawText;
    const prompt=buildMeetingTaskMatchPrompt({discussion:row.discussion,candidates,previousRawText,nextRawText});
    const matching=unit('match',row.id,{discussion:row.discussion,candidates,previousRawText,nextRawText,prompt});
    const matchingResult=stored(matching);
    if(!matchingResult)return candidates.length===0?{kind:'local',unit:matching,resultText:'{"matches":[]}',reason:'no_candidates'}
      :{kind:'paid',unit:matching};
    if(Object.keys(matchingResult).length!==1||!Array.isArray(matchingResult.matches))invalid();
    const matches=parseMeetingTaskMatchResponse(JSON.stringify(matchingResult.matches),{discussion:row.discussion,candidates});
    resolved.push({segmentId:row.id,discussion:row.discussion,candidates:selected,matches});
  }
  const compose=createMeetingComposePlan({configVersion:MEETING_LLM_CONFIG_VERSION,
    leaves:segments.rows.map(row=>({sourceId:row.id,summary:row.discussion.rawText}))});
  const composeResults=new Map<string,MeetingComposeResult>();
  for(const node of compose.nodes){
    const request=buildMeetingComposePrompt(compose,node.id,composeResults);
    const composing=unit('compose',node.id,{request,prompt:request.prompt}),saved=stored(composing);
    if(!saved)return {kind:'paid',unit:composing};
    if(Object.keys(saved).length!==1||!object(saved.result)||typeof saved.result.summary!=='string')invalid();
    const result=parseMeetingComposeOutput(request,JSON.stringify({summary:saved.result.summary,coveredInputIds:request.childIds}));
    if(Object.keys(saved.result).length!==6||saved.result.nodeId!==result.nodeId||saved.result.configVersion!==result.configVersion
      ||saved.result.childHash!==result.childHash||saved.result.hash!==result.hash
      ||JSON.stringify(saved.result.sourceIds)!==JSON.stringify(result.sourceIds))invalid();
    composeResults.set(node.id,result);
  }
  const final=compose.final;
  const summary=final===null?null:final.kind==='source'?compose.leaves[final.leafIndex]!.summary:composeResults.get(final.id)!.summary;
  return {kind:'complete',runId,captureId:run.capture_id,sourceVersion:run.source_version,
    transcriptRevisionId:run.transcript_revision_id,summary,discussions:resolved,proofs};
}

/** The same original-Session transaction factory used by unit persistence. */
export function createPostgresMeetingLlmPlanner(options:MeetingLlmPostgresOptions):()=>Promise<MeetingLlmNextWork>{
  const transactions=createPostgresMeetingLlmTransactions(options);
  return ()=>transactions.actor((port,scope)=>planMeetingLlmWork(port,scope,options.runId));
}
