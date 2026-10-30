import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import type pg from 'pg';

import {runActorTransaction,type ActorQueryPort,type ServerActorV1} from '../../../server/actorTransaction.js';
import type {RuntimeConfig} from '../../../server/config.js';
import type {RuntimeDatabase} from '../../../server/db.js';
import {PostgresAppSessionStore} from '../../../server/postgresAppSessionStore.js';
import {runMeetingMaintenanceTransaction} from '../../../server/meetingAsrRepository.js';
import {buildMeetingTaskMatchPrompt} from '../../../server/meetingTaskMatching.js';
import {readMeetingTaskSources,scoreMeetingTaskLexical} from '../../../server/meetingTaskRead.js';
import {MEETING_LLM_CONFIG_VERSION} from '../../../server/meetingLlmPricing.js';
import {createPostgresMeetingLlmPipeline} from '../../../server/meetingLlmPipeline.js';
import {prepareMeetingLlmUnit,type MeetingLlmEnvelope,type MeetingLlmPreparedUnit} from '../../../server/meetingLlmRepository.js';
import {createPostgresMeetingLlmPlanner} from '../../../server/meetingLlmPlan.js';
import type {GoogleCloudMeetingProvider} from '../../../server/googleCloudMeetingProvider.js';
import type {MeetingDiscussionSegment} from '../../../server/meetingDiscussionAssembly.js';
import type {MeetingTaskCandidateScope} from '../../../server/meetingTaskCandidates.js';
import {insertTask,seedCurrentDocument} from './verify-meeting-task-read-pg.js';

interface SourceRow {
  readonly record_id:string;readonly tenant_id:string;readonly project_id:string;readonly source_version:number;
  readonly transcript_revision_id:string;readonly segment_id:string;readonly segment_index:number;
  readonly raw_text:string;readonly discussion:MeetingDiscussionSegment;
}
interface BudgetRow {
  readonly budget_month:string;readonly limit_twd_micros:string;readonly reserved_twd_micros:string;
  readonly spent_twd_micros:string;
}
interface StateRow {
  readonly run_state:string;readonly capture_state:string;readonly active_transcript_revision_id:string|null;
  readonly total_checkpoints:number;readonly resolution_count:number;readonly match_count:number;readonly final_count:number;
  readonly usage_count:number;
}
interface RecordRow {readonly id:string;readonly title:string;readonly content:string;readonly metadata:unknown;readonly updated_at:string;}
interface HumanResolutionRow {
  readonly id:string;readonly capture_id:string;readonly transcript_segment_id:string;readonly candidate_snapshot:unknown;
  readonly latest_run_id:string;readonly resolution_state:string;readonly revision:string;readonly human_reviewed:boolean;
  readonly human_empty_decision:boolean;readonly protected_source_ranges:unknown;readonly config_version:string;readonly created_at:string;
  readonly updated_at:string;
}
interface SuggestedMatchRow {
  readonly task_id:string;readonly quote_range:unknown;readonly semantic_score:string;readonly decision:string;readonly decision_source:string;
}

function sqlState(error:unknown):string|undefined{
  let current:unknown=error;
  for(let depth=0;depth<5;depth++){
    if(typeof current!=='object'||current===null)return undefined;
    const row=current as Record<string,unknown>;
    if(typeof row.code==='string'&&/^[0-9A-Z]{5}$/u.test(row.code))return row.code;
    current=row.cause;
  }
  return undefined;
}

function deny42501(error:unknown):boolean{return sqlState(error)==='42501';}

function testProvider(calls:{embeddings:number;generations:number;matchGenerations:number;composeGenerations:number;prompts:string[]}):GoogleCloudMeetingProvider{
  return {
    async countTokens(){return 1;},
    async embedQuery(){
      calls.embeddings++;
      return {values:Array<number>(3072).fill(.25),tokenCount:12,billableCharacterCount:6};
    },
    async generateJson(input){
      calls.generations++;calls.prompts.push(input.prompt);
      const lastLine=input.prompt.slice(input.prompt.lastIndexOf('\n')+1);
      let text:string;
      if(lastLine.startsWith('children: ')){
        calls.composeGenerations++;
        const children:unknown=JSON.parse(lastLine.slice('children: '.length));
        if(!Array.isArray(children)||children.some(child=>typeof child!=='object'||child===null||Array.isArray(child)
            ||typeof (child as Record<string,unknown>).id!=='string'))throw new Error('synthetic compose prompt is invalid');
        text=JSON.stringify({summary:'測試會議摘要',coveredInputIds:children.map(child=>(child as {id:string}).id)});
      }else{
        calls.matchGenerations++;
        const sourceData:unknown=JSON.parse(lastLine);
        if(typeof sourceData!=='object'||sourceData===null||Array.isArray(sourceData)
            ||!Array.isArray((sourceData as Record<string,unknown>).candidates))throw new Error('synthetic match prompt is invalid');
        const candidate=(sourceData as {candidates:unknown[]}).candidates[0];
        if(typeof candidate!=='object'||candidate===null||Array.isArray(candidate)
            ||typeof (candidate as Record<string,unknown>).candidateTaskId!=='string')throw new Error('synthetic match candidate is missing');
        text=JSON.stringify([{candidateTaskId:(candidate as {candidateTaskId:string}).candidateTaskId,
          quote:{fromWord:0,toWord:0},relation:'related',evidenceScore:0.8}]);
      }
      return {outcome:'generated',text,usage:{promptTokens:12,candidateTokens:2,thoughtTokens:0,totalTokens:14,cachedTokens:0},
        responseId:calls.generations===1?'a'.repeat(256):`qa-synthetic:${calls.generations}`,modelVersion:'gemini-3.5-flash-001'};
    },
  };
}

/** Native publication verification uses a real ASR/assembly fixture and real SQL.
 * The provider is deterministic and local to this helper; no Google request is made. */
export async function verifyMeetingPublicationPostgres(database:RuntimeDatabase,config:RuntimeConfig,admin:pg.Client,
  actor:ServerActorV1,otherActor:ServerActorV1,outsider:ServerActorV1,runId:string,captureId:string):Promise<void>{
  const nonce=randomUUID();
  const sourceResult=await admin.query<SourceRow>(`
    SELECT capture.record_id::text,capture.tenant_id::text,capture.project_id::text,run.source_version,
      run.transcript_revision_id::text,segment.id::text AS segment_id,segment.segment_index,segment.raw_text,
      jsonb_build_object('segmentIndex',segment.segment_index,'rawText',segment.raw_text,'normalizedText',segment.normalized_text,
        'startOffsetMs',segment.start_offset_ms,'endOffsetMs',segment.end_offset_ms,'wordOffsets',segment.word_offsets,
        'sourceAudioRanges',segment.source_audio_ranges,'sourceHash',segment.source_hash) AS discussion
    FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
    JOIN projed_core.meeting_transcript_segments segment ON segment.capture_id=run.capture_id
      AND segment.producer_run_id=run.id AND segment.transcript_revision_id=run.transcript_revision_id
    WHERE run.id=$1::uuid AND capture.id=$2::uuid AND run.state='queued' AND run.resume_stage='retrieve'
      AND run.deadline_at>clock_timestamp() AND run.transcript_revision_id IS NOT NULL
      AND run.stage_cursor#>'{asr,done}'='true'::jsonb AND run.stage_cursor#>'{assembly,done}'='true'::jsonb
      AND capture.state='queued' AND capture.active_transcript_revision_id IS NULL
      AND capture.source_frozen_at IS NOT NULL AND capture.source_completeness='complete'
    ORDER BY segment.segment_index`,[runId,captureId]);
  assert.equal(sourceResult.rowCount,2,'the caller supplies two live ASR and assembly discussions');
  const sources=sourceResult.rows;
  const source=sources[0]!,secondSource=sources[1]!;
  assert.deepEqual(sources.map(row=>row.segment_index),[0,1]);
  assert.notEqual(source.segment_id,secondSource.segment_id);
  assert.equal(source.source_version,secondSource.source_version);
  assert.equal(source.transcript_revision_id,secondSource.transcript_revision_id);
  const recordBeforeResult=await admin.query<RecordRow>(`SELECT id::text,title,content,metadata,updated_at::text
    FROM projed_core.knowledge_records WHERE id=$1::uuid AND tenant_id=$2::uuid AND project_id=$3::uuid`,
  [source.record_id,source.tenant_id,source.project_id]);
  assert.equal(recordBeforeResult.rowCount,1,'the source record belongs to this isolated capture');
  const recordBefore=recordBeforeResult.rows[0]!;

  // Give this isolated workspace cascade a current WBS source and a real
  // current embedding. This makes retrieval and the candidate-backed match
  // generation deterministic without fabricating reader hashes or task proof.
  const publicationTask={id:randomUUID(),legacyId:'測試',title:`測試 publication ${nonce}`,
    status:'todo' as const,nodeType:'task' as const,archived:false,parentId:null,sortOrder:0};
  await insertTask(admin,source.tenant_id,source.project_id,publicationTask);
  const taskScope:MeetingTaskCandidateScope={tenantId:source.tenant_id,projectId:source.project_id};
  const taskSources=await runActorTransaction(database,config,actor,port=>readMeetingTaskSources(port,taskScope));
  const publicationRagSource=taskSources.ragSources.find(row=>row.taskId===publicationTask.id);
  assert.ok(publicationRagSource,'the true task reader returns the nonce task canonical RAG source');
  assert.ok(scoreMeetingTaskLexical(source.raw_text,taskSources.tasks).some(signal=>signal.taskId===publicationTask.id),
    'the nonce task is a real lexical candidate for the source discussion');
  const seededTaskDocument=await seedCurrentDocument(admin,source.tenant_id,source.project_id,publicationTask,publicationRagSource,1);

  const getBudget=async():Promise<BudgetRow>=>{
    const result=await admin.query<BudgetRow>(`SELECT budget.budget_month::text,budget.limit_twd_micros::text,
      budget.reserved_twd_micros::text,budget.spent_twd_micros::text FROM projed_core.meeting_ai_budget_months budget
      JOIN projed_core.meeting_analysis_runs run ON run.budget_month=budget.budget_month WHERE run.id=$1::uuid`,[runId]);
    assert.equal(result.rowCount,1,'the source fixture has its existing monthly budget row');return result.rows[0]!;
  };
  const getState=async():Promise<StateRow>=>{
    const result=await admin.query<StateRow>(`SELECT run.state AS run_state,capture.state AS capture_state,
      capture.active_transcript_revision_id::text,
      (SELECT count(*)::integer FROM projed_core.meeting_llm_unit_checkpoints checkpoint WHERE checkpoint.run_id=run.id) AS total_checkpoints,
      (SELECT count(*)::integer FROM projed_core.meeting_segment_resolutions resolution
        WHERE resolution.capture_id=capture.id AND resolution.transcript_segment_id IN(
          SELECT segment.id FROM projed_core.meeting_transcript_segments segment
          WHERE segment.producer_run_id=run.id AND segment.transcript_revision_id=run.transcript_revision_id)) AS resolution_count,
      (SELECT count(*)::integer FROM projed_core.meeting_task_match_results match
        JOIN projed_core.meeting_segment_resolutions resolution ON resolution.id=match.resolution_id
        WHERE resolution.capture_id=capture.id AND resolution.transcript_segment_id IN(
          SELECT segment.id FROM projed_core.meeting_transcript_segments segment
          WHERE segment.producer_run_id=run.id AND segment.transcript_revision_id=run.transcript_revision_id)) AS match_count,
      (SELECT count(*)::integer FROM projed_core.meeting_llm_unit_checkpoints checkpoint WHERE checkpoint.run_id=run.id
        AND checkpoint.stage='compose' AND checkpoint.unit_key='final' AND checkpoint.slot='result') AS final_count,
      (SELECT count(*)::integer FROM projed_core.meeting_ai_usage_attempts usage WHERE usage.run_id=run.id) AS usage_count
      FROM projed_core.meeting_analysis_runs run JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
      WHERE run.id=$1::uuid AND capture.id=$2::uuid`,[runId,captureId]);
    assert.equal(result.rowCount,1);return result.rows[0]!;
  };
  const beforeState=await getState();
  assert.equal(beforeState.active_transcript_revision_id,null);
  assert.notEqual(beforeState.run_state,'ready');assert.notEqual(beforeState.capture_state,'ready');

  const options={runId,database,config,resolveActor:async(id:string)=>{
    assert.equal(id,runId);return actor;
  }};
  const planner=createPostgresMeetingLlmPlanner(options);
  const pipeline=createPostgresMeetingLlmPipeline(options);
  const fakeCalls={embeddings:0,generations:0,matchGenerations:0,composeGenerations:0,prompts:[] as string[]};
  const provider=testProvider(fakeCalls);
  const signal=()=>new AbortController().signal;
  const withAuthorizedActor=<T>(who:ServerActorV1,operation:(port:ActorQueryPort)=>Promise<T>)=>
    runActorTransaction(database,config,who,async port=>{
      await port.authorizeMeetingCaptureMutation(source.record_id,captureId);
      return operation(port);
    });

  // This nonce-bound local unit uses the actual immutable discussion and the
  // production prompt/hash builder; it records an explicit empty result only.
  const localPrompt=buildMeetingTaskMatchPrompt({discussion:source.discussion,candidates:[]});
  const localEnvelope:MeetingLlmEnvelope={configVersion:MEETING_LLM_CONFIG_VERSION,sourceVersion:source.source_version,
    transcriptRevisionId:source.transcript_revision_id,body:{discussion:source.discussion,candidates:[],prompt:localPrompt}};
  const localUnit=prepareMeetingLlmUnit('match',source.segment_id,localEnvelope);
  const originalLive=await withAuthorizedActor(actor,port=>port.query<{live:boolean}>(
    'SELECT projed_core.meeting_llm_live_v1($1::uuid) AS live',[runId]));
  assert.equal(originalLive.rows[0]?.live,true,'local rejection cases start with the real original Session and a live source');
  const localBudgetBefore=await getBudget();
  const localUsageBefore=beforeState.usage_count;
  const commitLocal=(who:ServerActorV1,unit:MeetingLlmPreparedUnit,authorized=true)=>runActorTransaction(database,config,who,async port=>{
    if(authorized)await port.authorizeMeetingCaptureMutation(source.record_id,captureId);
    const result=await port.query<{saved:boolean}>('SELECT projed_core.commit_meeting_local_match_v1($1::uuid,$2::jsonb) AS saved',
      [runId,JSON.stringify(unit)]);
    assert.equal(result.rowCount,1);return result.rows[0]?.saved===true;
  });
  const responseIdProbe=(responseId:unknown)=>withAuthorizedActor(actor,async port=>{
    const live=await port.query<{live:boolean}>('SELECT projed_core.meeting_llm_live_v1($1::uuid) AS live',[runId]);
    assert.equal(live.rows[0]?.live,true,'the original bound Session sees the live source before responseId validation');
    const result=await port.query<{receipt:unknown}>('SELECT projed_core.settle_meeting_llm_unit_v1($1::uuid,$2::uuid,$3::jsonb) AS receipt',
      [runId,randomUUID(),JSON.stringify({kind:'unusable',code:'LLM_OUTPUT_INVALID',
        usage:{promptTokens:1,candidateTokens:0,thoughtTokens:0,totalTokens:1,cachedTokens:0},
        modelVersion:'gemini-3.5-flash-001',responseId})]);
    assert.equal(result.rowCount,1);return result.rows[0]!.receipt;
  });
  await assert.rejects(responseIdProbe('x'.repeat(257)),deny42501,'a 257-character responseId is rejected');
  await assert.rejects(responseIdProbe('qa*synthetic'),deny42501,'responseId characters outside the exact allowlist are rejected');
  await assert.rejects(responseIdProbe(null),deny42501,'a null responseId is rejected');
  await assert.rejects(responseIdProbe(''),deny42501,'an empty responseId is rejected');
  assert.equal(await responseIdProbe('a'.repeat(256)),null,
    'a legal 256-character responseId passes validation when its synthetic token has no usage row');
  const wrongSource={...source.discussion,sourceHash:source.discussion.sourceHash==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64)};
  const wrongPrompt=buildMeetingTaskMatchPrompt({discussion:wrongSource,candidates:[]});
  const wrongSourceUnit=prepareMeetingLlmUnit('match',source.segment_id,{...localEnvelope,
    body:{discussion:wrongSource,candidates:[],prompt:wrongPrompt}});
  await assert.rejects(commitLocal(actor,wrongSourceUnit),deny42501,'wrong source hash cannot create a local result');
  assert.equal(await commitLocal(otherActor,localUnit),false,'a different Session cannot publish the original run local result');
  assert.equal(await commitLocal(outsider,localUnit,false),false,'an outsider cannot publish a local result');
  assert.equal(await commitLocal(actor,localUnit),true,'the original Session can commit an empty local match result');
  assert.equal(await commitLocal(actor,localUnit),true,'the same local input/result replays idempotently');
  const localStored=await admin.query<{slots:number;result_text:string|null}>(`SELECT count(*)::integer AS slots,
    max(payload_text) FILTER(WHERE slot='result') AS result_text FROM projed_core.meeting_llm_unit_checkpoints
    WHERE run_id=$1::uuid AND stage='match' AND unit_key=$2 AND input_hash=$3`,[runId,source.segment_id,localUnit.inputHash]);
  assert.equal(localStored.rows[0]?.slots,2);assert.equal(localStored.rows[0]?.result_text,'{"matches":[]}');
  assert.deepEqual(await getBudget(),localBudgetBefore,'local empty matches do not reserve or spend');
  assert.equal((await getState()).usage_count,localUsageBefore,'local empty matches create no usage ledger row');

  const assertNotReady=async(label:string)=>{
    const state=await getState();
    assert.equal(state.active_transcript_revision_id,null,`${label}: active revision remains unset`);
    assert.notEqual(state.capture_state,'ready',`${label}: capture is not ready`);
    assert.notEqual(state.run_state,'ready',`${label}: run is not ready`);
    return state;
  };

  let complete:Extract<Awaited<ReturnType<typeof planner>>,{kind:'complete'}>|undefined;
  for(let step=0;step<8;step++){
    await assertNotReady(`before planner/pipeline step ${step+1}`);
    const work=await planner();
    if(work.kind==='complete'){complete=work;break;}
    assert.ok(work.kind==='local'||work.kind==='paid',`planner step ${step+1} is actionable`);
    const result=await pipeline(provider,signal());
    assert.ok(['local_completed','settled'].includes(result.state),`pipeline step ${step+1} persists one planned unit`);
    if(result.state==='settled')assert.equal(result.checkpointPublished,true,'the valid fake result is stored as its private checkpoint');
  }
  assert.ok(complete,'the two-discussion planner completes within eight durable steps');
  assert.equal(complete.runId,runId);assert.equal(complete.captureId,captureId);
  assert.equal(complete.sourceVersion,source.source_version);assert.equal(complete.transcriptRevisionId,source.transcript_revision_id);
  assert.equal(complete.summary,'測試會議摘要','two discussions are summarized by one composed node');
  assert.equal(complete.discussions.length,2);
  assert.deepEqual(complete.discussions.map(discussion=>discussion.segmentId),sources.map(row=>row.segment_id));
  assert.ok(complete.discussions.every(discussion=>discussion.candidates.some(candidate=>candidate.taskId===publicationTask.id)),
    'the nonce task is selected from the current WBS for both source discussions');
  assert.equal(complete.proofs.filter(proof=>proof.stage==='retrieve').length,2);
  assert.equal(complete.proofs.filter(proof=>proof.stage==='match').length,2);
  assert.equal(complete.proofs.filter(proof=>proof.stage==='compose').length,1);
  assert.equal(fakeCalls.embeddings,2,'two indexed discussions use two paid retrieval embeddings');
  assert.equal(fakeCalls.generations,3,'two matches and one compose use exactly three paid generations');
  assert.equal(fakeCalls.matchGenerations,2);assert.equal(fakeCalls.composeGenerations,1);
  const maxResponseId=await admin.query<{count:number}>(`SELECT count(*)::integer AS count FROM projed_core.meeting_ai_usage_attempts
    WHERE run_id=$1::uuid AND llm_manifest#>>'{settlement,responseId}'=$2`,[runId,'a'.repeat(256)]);
  assert.equal(maxResponseId.rows[0]?.count,1,'a real native positive settlement accepts and retains exactly 256 legal characters');
  for(const discussion of complete.discussions){
    assert.equal(discussion.matches.length,1);
    assert.equal(discussion.matches[0]?.candidateTaskId,discussion.candidates[0]?.taskId);
    assert.deepEqual(discussion.matches[0]?.quote,{fromWord:0,toWord:0});
    assert.equal(discussion.matches[0]?.relation,'related');assert.equal(discussion.matches[0]?.evidenceScore,0.8);
  }
  assert.ok(fakeCalls.prompts.filter(prompt=>prompt.startsWith('你是會議逐字稿')).every(prompt=>prompt.includes('JSON')),
    'synthetic match generations follow JSON-only prompts');
  assert.ok(fakeCalls.prompts.filter(prompt=>prompt.startsWith('Compress only')).every(prompt=>prompt.includes('coveredInputIds')),
    'the compose generation receives bounded direct-child coverage instructions');

  const originalComplete=complete;
  const oldMatchInputHashes=new Map(originalComplete.proofs.filter(proof=>proof.stage==='match')
    .map(proof=>[proof.unitKey,proof.inputHash]));
  const oldComposeProof=originalComplete.proofs.find(proof=>proof.stage==='compose');
  assert.equal(oldMatchInputHashes.size,2);assert.ok(oldComposeProof);
  const revisedTaskTitle=`${publicationTask.title} revised`;
  const taskUpdate=await admin.query<{id:string;updated_at:string}>(`UPDATE projed_core.wbs_items
    SET title=$4,updated_at=clock_timestamp() WHERE id=$1::uuid AND tenant_id=$2::uuid AND project_id=$3::uuid
      AND title=$5 RETURNING id::text,updated_at::text`,
  [publicationTask.id,source.tenant_id,source.project_id,revisedTaskTitle,publicationTask.title]);
  assert.equal(taskUpdate.rowCount,1,'only the nonce-owned task is renamed inside its exact project');
  assert.equal(taskUpdate.rows[0]?.id,publicationTask.id);
  const revisedTaskSources=await runActorTransaction(database,config,actor,port=>readMeetingTaskSources(port,taskScope));
  const revisedRagSource=revisedTaskSources.ragSources.find(row=>row.taskId===publicationTask.id);
  assert.ok(revisedRagSource);
  assert.notEqual(revisedRagSource.contentHash,seededTaskDocument.source.contentHash,
    'the indexed document is now stale after the current WBS title changes');
  assert.notEqual(revisedRagSource.taskStateHash,seededTaskDocument.source.taskStateHash,
    'the current reader emits a new task state hash');

  const beforeDeferred=await getState(),budgetBeforeDeferred=await getBudget();
  const staleMatchWork=await planner();
  assert.equal(staleMatchWork.kind,'paid');
  assert.equal(staleMatchWork.unit.stage,'match','the changed task snapshot invalidates match input only');
  assert.ok(oldMatchInputHashes.has(staleMatchWork.unit.unitKey));
  assert.notEqual(staleMatchWork.unit.inputHash,oldMatchInputHashes.get(staleMatchWork.unit.unitKey));
  const withoutProvider=await pipeline(null,signal());
  assert.deepEqual(withoutProvider,{state:'deferred'},'changed WBS match work waits without dispatch when provider is absent');
  const afterDeferred=await assertNotReady('after WBS invalidation without provider');
  assert.equal(afterDeferred.total_checkpoints,beforeDeferred.total_checkpoints);
  assert.equal(afterDeferred.usage_count,beforeDeferred.usage_count);
  assert.deepEqual(await getBudget(),budgetBeforeDeferred,'WBS revalidation and provider absence do not change budget');

  let refreshedComplete:Extract<Awaited<ReturnType<typeof planner>>,{kind:'complete'}>|undefined;
  for(let step=0;step<4;step++){
    await assertNotReady(`before refreshed match step ${step+1}`);
    const work=await planner();
    if(work.kind==='complete'){refreshedComplete=work;break;}
    assert.equal(work.kind,'paid');assert.equal(work.unit.stage,'match','only changed match inputs need new paid results');
    const result=await pipeline(provider,signal());
    assert.equal(result.state,'settled');assert.equal(result.checkpointPublished,true);
  }
  assert.ok(refreshedComplete,'both WBS-revalidated matches complete within four durable steps');
  complete=refreshedComplete;
  assert.equal(complete.summary,'測試會議摘要','unchanged source summaries reuse the existing compose result');
  assert.equal(fakeCalls.embeddings,2,'retrieval embeddings are reused after WBS-only changes');
  assert.equal(fakeCalls.matchGenerations,4,'each changed discussion gets one fresh match generation');
  assert.equal(fakeCalls.composeGenerations,1,'unchanged source summaries reuse compose without a new provider call');
  assert.equal(fakeCalls.generations,5);
  for(const proof of complete.proofs.filter(item=>item.stage==='match')){
    assert.notEqual(proof.inputHash,oldMatchInputHashes.get(proof.unitKey),`${proof.unitKey} uses a fresh WBS-bound input`);
  }
  const refreshedComposeProof=complete.proofs.find(proof=>proof.stage==='compose');
  assert.ok(refreshedComposeProof);
  assert.equal(refreshedComposeProof.inputHash,oldComposeProof.inputHash);
  assert.equal(refreshedComposeProof.resultHash,oldComposeProof.resultHash);
  for(const discussion of complete.discussions){
    const refreshedCandidate=discussion.candidates.find(candidate=>candidate.taskId===publicationTask.id);
    assert.ok(refreshedCandidate);
    assert.ok(refreshedCandidate.text.includes(revisedTaskTitle));
    assert.ok(refreshedCandidate.lexicalScore>0,'the stale index falls back to current lexical WBS evidence');
    assert.equal(refreshedCandidate.ragScore,0,'stale embedding content is not presented as current retrieval evidence');
  }

  const publishPayload={sourceVersion:complete.sourceVersion,transcriptRevisionId:complete.transcriptRevisionId,
    summary:complete.summary,discussions:complete.discussions.map(({segmentId,candidates,matches})=>({segmentId,candidates,matches})),
    proofs:complete.proofs};
  const publishDirect=(payload:typeof publishPayload)=>withAuthorizedActor(actor,async port=>{
    const result=await port.query<{saved:boolean}>('SELECT projed_core.publish_meeting_analysis_v1($1::uuid,$2::jsonb) AS saved',
      [runId,JSON.stringify(payload)]);
    assert.equal(result.rowCount,1);return result.rows[0]?.saved===true;
  });
  const budgetBeforeInvalid=await getBudget();
  const expectedUsageBeforeInvalid=(await getState()).usage_count;
  const expectedCheckpointCount=(await getState()).total_checkpoints;
  const rejectPayload=async(payload:typeof publishPayload,label:string)=>{
    await assert.rejects(publishDirect(payload),deny42501,label);
    const state=await assertNotReady(label);
    assert.equal(state.total_checkpoints,expectedCheckpointCount,`${label}: no partial private publication checkpoint`);
    assert.equal(state.resolution_count,beforeState.resolution_count,`${label}: no partial resolution`);
    assert.equal(state.match_count,beforeState.match_count,`${label}: no partial match row`);
    assert.equal(state.final_count,beforeState.final_count,`${label}: no final summary`);
    assert.equal(state.usage_count,expectedUsageBeforeInvalid,`${label}: no usage ledger change`);
    assert.deepEqual(await getBudget(),budgetBeforeInvalid,`${label}: no budget change`);
  };
  await rejectPayload({...publishPayload,proofs:publishPayload.proofs.filter(proof=>proof.stage!=='match')},
    'missing match proof rejects before publication');
  await rejectPayload({...publishPayload,discussions:[]},'incomplete discussion coverage rejects before publication');

  // A zero-reserve legacy unknown row is enough to fail closed. It is owned by
  // this nonce and is always removed exactly; no existing charge is rewritten.
  const unknownAttempt=`qa-publication:${nonce}`;
  let unknownInserted=false;
  try{
    const inserted=await admin.query(`INSERT INTO projed_core.meeting_ai_usage_attempts(attempt_id,capture_id,run_id,unit_identity,
      dispatch_month,provider,model,price_version,reserved_twd_micros,actual_twd_micros,usage_state,outcome)
      SELECT $1,capture.id,run.id,'qa-publication-legacy:'||$2,run.budget_month,'qa-legacy','qa-legacy','qa-publication-v1',0,NULL,
        'unknown','qa_synthetic_legacy_unknown' FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
      WHERE run.id=$3::uuid AND capture.id=$4::uuid RETURNING attempt_id`,[unknownAttempt,nonce,runId,captureId]);
    assert.equal(inserted.rowCount,1,'the isolated zero-reserve unknown attempt was inserted');unknownInserted=true;
    assert.deepEqual(await getBudget(),budgetBeforeInvalid,'synthetic unknown row carries no reserve or charge');
    const callsBeforeUnknown={...fakeCalls};
    await assert.rejects(pipeline(provider,signal()),deny42501,'even complete proofs cannot publish with unresolved legacy usage');
    const unknownBlockedState=await assertNotReady('unresolved legacy unknown blocks ready');
    assert.equal(unknownBlockedState.total_checkpoints,expectedCheckpointCount,'blocked publication writes no checkpoint');
    assert.equal(unknownBlockedState.resolution_count,beforeState.resolution_count,'blocked publication writes no resolution');
    assert.equal(unknownBlockedState.match_count,beforeState.match_count,'blocked publication writes no match row');
    assert.equal(unknownBlockedState.final_count,beforeState.final_count,'blocked publication writes no final summary');
    assert.equal(unknownBlockedState.usage_count,expectedUsageBeforeInvalid+1,'only the nonce-owned zero-reserve unknown row is present');
    assert.deepEqual(await getBudget(),budgetBeforeInvalid,'blocked publication leaves the budget unchanged');
    assert.deepEqual(fakeCalls,callsBeforeUnknown,'the blocked publication does not call a provider');
  }finally{
    if(unknownInserted){
      const removed=await admin.query(`DELETE FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=$1 AND run_id=$2::uuid
        AND capture_id=$3::uuid AND unit_identity=$4 AND provider='qa-legacy' AND model='qa-legacy'
        AND price_version='qa-publication-v1' AND reserved_twd_micros=0 AND actual_twd_micros IS NULL
        AND usage_state='unknown' AND outcome='qa_synthetic_legacy_unknown' RETURNING attempt_id`,
      [unknownAttempt,runId,captureId,`qa-publication-legacy:${nonce}`]);
      assert.equal(removed.rowCount,1,'only the exact nonce-owned synthetic unknown row is cleaned up');
    }
  }

  const humanResolutionId=randomUUID();
  const humanCandidateSnapshot:readonly unknown[]=[];
  const firstWord=source.discussion.wordOffsets[0];assert.ok(firstWord,'the source discussion has one anchored word');
  const humanProtectedRanges=[{source_audio_segment_id:firstWord.source_audio_segment_id,
    from_word:firstWord.source_word_index,to_word:firstWord.source_word_index,qaNonce:nonce}];
  let humanInserted=false;
  try{
    const humanResult=await admin.query(`INSERT INTO projed_core.meeting_segment_resolutions(id,capture_id,transcript_segment_id,
      candidate_snapshot,latest_run_id,resolution_state,revision,human_reviewed,human_empty_decision,protected_source_ranges,config_version)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::uuid,'needs_review',7,true,true,$6::jsonb,$7) RETURNING id::text`,
    [humanResolutionId,captureId,source.segment_id,JSON.stringify(humanCandidateSnapshot),runId,JSON.stringify(humanProtectedRanges),`qa-publication:${nonce}`]);
    assert.equal(humanResult.rowCount,1,'the helper owns one nonce-marked human clear-all/protected resolution');humanInserted=true;
    const beforeHuman=await admin.query<HumanResolutionRow>(`SELECT id::text,capture_id::text,transcript_segment_id::text,candidate_snapshot,
      latest_run_id::text,resolution_state,revision::text,human_reviewed,human_empty_decision,protected_source_ranges,config_version,
      created_at::text,updated_at::text FROM projed_core.meeting_segment_resolutions WHERE id=$1::uuid AND capture_id=$2::uuid
        AND transcript_segment_id=$3::uuid AND config_version=$4`,
    [humanResolutionId,captureId,source.segment_id,`qa-publication:${nonce}`]);
    assert.equal(beforeHuman.rowCount,1);

    await assertNotReady('before final publication');
    const published=await pipeline(provider,signal());
    assert.deepEqual(published,{state:'published'},'the real planner/pipeline publishes after all proofs and fees validate');
    const finalState=await getState();
    assert.equal(finalState.run_state,'ready');assert.equal(finalState.capture_state,'ready');
    assert.equal(finalState.active_transcript_revision_id,source.transcript_revision_id);
    assert.equal(finalState.final_count,1,'publication stores one private compose/final summary checkpoint');
    assert.equal(finalState.resolution_count,2,'publication preserves the first human row and inserts the second discussion review');
    assert.equal(finalState.match_count,1,'the second discussion publishes one non-empty AI suggestion');
    const afterHuman=await admin.query<HumanResolutionRow>(`SELECT id::text,capture_id::text,transcript_segment_id::text,candidate_snapshot,
      latest_run_id::text,resolution_state,revision::text,human_reviewed,human_empty_decision,protected_source_ranges,config_version,
      created_at::text,updated_at::text FROM projed_core.meeting_segment_resolutions WHERE id=$1::uuid AND capture_id=$2::uuid
        AND transcript_segment_id=$3::uuid AND config_version=$4`,
    [humanResolutionId,captureId,source.segment_id,`qa-publication:${nonce}`]);
    assert.deepEqual(afterHuman.rows,beforeHuman.rows,'publication preserves the complete human-owned resolution row');
    const resolutionMatches=await admin.query<{count:number}>('SELECT count(*)::integer AS count FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid',
      [humanResolutionId]);
    assert.equal(resolutionMatches.rows[0]?.count,0,'clear-all human work remains untouched');

    const secondDiscussion=complete.discussions[1]!;
    const secondMatch=secondDiscussion.matches[0];assert.ok(secondMatch,'the second discussion has one validated model match');
    const aiResolution=await admin.query<HumanResolutionRow>(`SELECT id::text,capture_id::text,transcript_segment_id::text,candidate_snapshot,
      latest_run_id::text,resolution_state,revision::text,human_reviewed,human_empty_decision,protected_source_ranges,config_version,
      created_at::text,updated_at::text FROM projed_core.meeting_segment_resolutions WHERE capture_id=$1::uuid
        AND transcript_segment_id=$2::uuid AND latest_run_id=$3::uuid`,[captureId,secondSource.segment_id,runId]);
    assert.equal(aiResolution.rowCount,1,'the second discussion gets its own current-run review row');
    assert.equal(aiResolution.rows[0]?.resolution_state,'needs_review');assert.equal(aiResolution.rows[0]?.revision,'0');
    assert.equal(aiResolution.rows[0]?.human_reviewed,false);assert.equal(aiResolution.rows[0]?.human_empty_decision,false);
    const aiCandidateSnapshot=aiResolution.rows[0]?.candidate_snapshot;
    assert.ok(Array.isArray(aiCandidateSnapshot));
    const aiCandidate=aiCandidateSnapshot.find(value=>typeof value==='object'&&value!==null&&!Array.isArray(value)
      &&(value as Record<string,unknown>).taskId===secondMatch.candidateTaskId);
    assert.ok(aiCandidate,'the reviewed candidate snapshot retains the selected model task');
    assert.equal((aiCandidate as Record<string,unknown>).modelRelation,'related');
    const publishedMatch=await admin.query<SuggestedMatchRow>(`SELECT task_id::text,quote_range,semantic_score::text,decision,decision_source
      FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid AND task_id=$2::uuid` ,
    [aiResolution.rows[0]!.id,secondMatch.candidateTaskId]);
    assert.equal(publishedMatch.rowCount,1);
    assert.deepEqual(publishedMatch.rows[0],{task_id:secondMatch.candidateTaskId,quote_range:{fromWord:0,toWord:0},
      semantic_score:'0.8',decision:'suggested',decision_source:'ai'},
    'publication stores the actual local quote, model score, and non-accepted suggestion');
    const matchInsertGrants=await admin.query<{quote:boolean;score:boolean;pointer:boolean}>(`SELECT
      has_column_privilege('projed_runtime_disposable','projed_core.meeting_task_match_results','quote_range','INSERT') AS quote,
      has_column_privilege('projed_runtime_disposable','projed_core.meeting_task_match_results','semantic_score','INSERT') AS score,
      has_column_privilege('projed_runtime_disposable','projed_core.meeting_task_match_results','pointer_feature','INSERT') AS pointer`);
    assert.deepEqual(matchInsertGrants.rows[0],{quote:true,score:true,pointer:true},
      'runtime has only the publication-required quote and score insert columns');

    const summary=await admin.query<{payload_text:string;attempt_id:string|null}>(`SELECT payload_text,attempt_id
      FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=$1::uuid AND capture_id=$2::uuid AND stage='compose'
        AND unit_key='final' AND slot='result'`,[runId,captureId]);
    assert.equal(summary.rowCount,1);assert.deepEqual(JSON.parse(summary.rows[0]!.payload_text),{summary:'測試會議摘要'});
    assert.equal(summary.rows[0]?.attempt_id,`publication:${runId}`);

    const otherRead=await runActorTransaction(database,config,otherActor,async port=>{
      await port.authorizeMeetingCaptureMutation(source.record_id,captureId);
      return port.query<{payload_text:string}>(`SELECT payload_text FROM projed_core.meeting_llm_unit_checkpoints
        WHERE run_id=$1::uuid AND capture_id=$2::uuid AND stage='compose' AND unit_key='final' AND slot='result'`,[runId,captureId]);
    });
    assert.equal(otherRead.rowCount,1,'another current record editor can read the published summary');
    assert.deepEqual(JSON.parse(otherRead.rows[0]!.payload_text),{summary:'測試會議摘要'});

    const outsiderRead=await runActorTransaction(database,config,outsider,port=>port.query<{payload_text:string}>(
      `SELECT payload_text FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=$1::uuid AND capture_id=$2::uuid
        AND stage='compose' AND unit_key='final' AND slot='result'`,[runId,captureId]));
    assert.equal(outsiderRead.rowCount,0,'an outsider cannot read the published summary checkpoint');
    const maintenanceRead=await runMeetingMaintenanceTransaction(database,config,query=>query<{payload_text:string}>(
      `SELECT payload_text FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=$1::uuid AND capture_id=$2::uuid
        AND stage='compose' AND unit_key='final' AND slot='result'`,[runId,captureId]));
    assert.equal(maintenanceRead.rowCount,0,'metadata maintenance cannot read private summary content');

    assert.equal(await new PostgresAppSessionStore(database).readMeetingRunSession(runId),null,
      'a terminal ready run no longer resolves its work Session');
    const recordAfterResult=await admin.query<RecordRow>(`SELECT id::text,title,content,metadata,updated_at::text
      FROM projed_core.knowledge_records WHERE id=$1::uuid AND tenant_id=$2::uuid AND project_id=$3::uuid`,
    [source.record_id,source.tenant_id,source.project_id]);
    assert.deepEqual(recordAfterResult.rows[0],recordBefore,'publication leaves record title/content/metadata unchanged');
  }finally{
    if(humanInserted){
      const removed=await admin.query(`DELETE FROM projed_core.meeting_segment_resolutions WHERE id=$1::uuid AND capture_id=$2::uuid
        AND transcript_segment_id=$3::uuid AND latest_run_id=$4::uuid AND config_version=$5
        AND candidate_snapshot='[]'::jsonb AND human_reviewed AND human_empty_decision
        AND protected_source_ranges @> $6::jsonb RETURNING id::text`,
      [humanResolutionId,captureId,source.segment_id,runId,`qa-publication:${nonce}`,JSON.stringify([{qaNonce:nonce}])]);
      assert.equal(removed.rowCount,1,'only the exact nonce-owned human review fixture is removed');
    }
  }
}
