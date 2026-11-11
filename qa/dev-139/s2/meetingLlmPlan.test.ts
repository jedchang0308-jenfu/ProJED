import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import type {ActorQueryPort} from '../../../server/actorTransaction.js';
import {KernelError} from '../../../server/errors.js';
import {MEETING_LLM_CONFIG_VERSION,type MeetingLlmStage} from '../../../server/meetingLlmPricing.js';
import {prepareMeetingLlmUnit,type MeetingLlmPreparedUnit} from '../../../server/meetingLlmRepository.js';
import {planMeetingLlmWork} from '../../../server/meetingLlmPlan.js';
import {buildMeetingTaskMatchPrompt} from '../../../server/meetingTaskMatching.js';
import {buildMeetingComposePrompt,createMeetingComposePlan,parseMeetingComposeOutput,
  type MeetingComposeRequest} from '../../../server/meetingCompose.js';
import {readMeetingTaskSources,scoreMeetingTaskLexical} from '../../../server/meetingTaskRead.js';
import {selectMeetingTaskCandidates,type MeetingTaskCandidateScope,type MeetingTaskCandidateSnapshot} from '../../../server/meetingTaskCandidates.js';
import type {MeetingDiscussionSegment} from '../../../server/meetingDiscussionAssembly.js';

const RUN_ID='11111111-1111-4111-8111-111111111111';
const CAPTURE_ID='22222222-2222-4222-8222-222222222222';
const TRANSCRIPT_ID='33333333-3333-4333-8333-333333333333';
const TENANT_ID='44444444-4444-4444-8444-444444444444';
const PROJECT_ID='55555555-5555-4555-8555-555555555555';
const SCOPE:MeetingTaskCandidateScope={tenantId:TENANT_ID,projectId:PROJECT_ID};
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');

interface SegmentRow extends Record<string,unknown> {readonly id:string;readonly segment_index:number;readonly discussion:MeetingDiscussionSegment}
interface TaskRow extends Record<string,unknown> {
  id:string;parent_id:string|null;legacy_task_id:string;title:string;description:string|null;detail_notes:unknown;
  status:string;start_date:string|null;end_date:string|null;node_type:'task'|'milestone'|'group'|null;
  archived:boolean;updated_at:string;tag_names:string[];task_state_hash:string;
}
interface PlanFixture {
  readonly run?:Record<string,unknown>|null;
  readonly segments?:readonly SegmentRow[];
  readonly checkpoints?:readonly Record<string,unknown>[];
  readonly tasks?:readonly TaskRow[];
  readonly coverage?:readonly Record<string,unknown>[];
  readonly matches?:readonly Record<string,unknown>[];
}

function discussion(segmentIndex:number,rawText=`第${segmentIndex+1}段討論`):MeetingDiscussionSegment{
  const sourceId=randomUUID(),startOffsetMs=10_000+segmentIndex*2_000,endOffsetMs=startOffsetMs+1_000;
  return {segmentIndex,rawText,normalizedText:rawText,startOffsetMs,endOffsetMs,
    wordOffsets:[{text:rawText,start_ms:startOffsetMs,end_ms:endOffsetMs,source_audio_segment_id:sourceId,source_word_index:0}],
    sourceAudioRanges:[{source_audio_segment_id:sourceId,from_word:0,to_word:0,start_ms:startOffsetMs,end_ms:endOffsetMs}],
    sourceHash:sha(`discussion:${segmentIndex}:${rawText}`)};
}

function segmentRows(count:number,rawText=(index:number)=>`第${index+1}段討論`):SegmentRow[]{
  return Array.from({length:count},(_,index)=>({id:randomUUID(),segment_index:index,discussion:discussion(index,rawText(index))}));
}

function taskRow(input:{id?:string;title:string;legacyTaskId?:string;updatedAt?:string;stateHash?:string;parentId?:string|null}):TaskRow{
  return {id:input.id??randomUUID(),parent_id:input.parentId??null,legacy_task_id:input.legacyTaskId??'TASK-1',title:input.title,
    description:'合成的任務描述',detail_notes:[],status:'todo',start_date:null,end_date:null,node_type:'task',archived:false,
    updated_at:input.updatedAt??'2026-10-30T00:00:00.000Z',tag_names:[],task_state_hash:input.stateHash??sha(`task:${input.title}`)};
}

function harness(input:PlanFixture={}){
  const calls:{readonly sql:string;readonly values:readonly unknown[]}[]=[];
  const run=input.run===undefined?{id:RUN_ID,capture_id:CAPTURE_ID,source_version:1,transcript_revision_id:TRANSCRIPT_ID,
    state:'queued',lease_token:null,lease_expires_at:null,live:true}:input.run;
  const segments=input.segments??[],checkpoints=input.checkpoints??[],tasks=input.tasks??[];
  const coverage=input.coverage??[{total_tasks:0,indexed_tasks:0,task_id:null,score:null}];
  const matches=input.matches??[{total_tasks:0,indexed_tasks:0,task_id:null,score:null}];
  const port={async query<R extends Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
    calls.push({sql,values:[...values]});let rows:readonly Record<string,unknown>[];
    if(sql.includes('FROM projed_core.meeting_analysis_runs WHERE id=$1::uuid'))rows=run?[run]:[];
    else if(sql.includes('FROM projed_core.meeting_transcript_segments WHERE producer_run_id'))rows=segments;
    else if(sql.includes('FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id'))rows=checkpoints;
    else if(sql.includes('actor_has_board_capability_v1'))rows=[{allowed:true}];
    else if(sql.includes('FROM projed_core.meeting_pointer_intervals'))rows=[];
    else if(sql.includes('WITH current_sources AS MATERIALIZED'))rows=Array.isArray(values[3])?matches:coverage;
    else if(sql.includes('FROM projed_core.wbs_items task'))rows=tasks;
    else throw new Error(`Unexpected planner SQL: ${sql}`);
    return {rows:rows as R[],rowCount:rows.length};
  }} as unknown as ActorQueryPort;
  return {port,calls};
}

function prepared(stage:MeetingLlmStage,unitKey:string,body:Readonly<Record<string,unknown>>):MeetingLlmPreparedUnit{
  return prepareMeetingLlmUnit(stage,unitKey,{configVersion:MEETING_LLM_CONFIG_VERSION,sourceVersion:1,
    transcriptRevisionId:TRANSCRIPT_ID,body});
}

function checkpoint(unit:MeetingLlmPreparedUnit,slot:'input'|'result',payloadText:string){
  return {stage:unit.stage,unit_key:unit.unitKey,input_hash:unit.inputHash,slot,payload_text:payloadText,payload_hash:sha(payloadText)};
}

function unitCheckpoints(unit:MeetingLlmPreparedUnit,resultText:string){
  return [checkpoint(unit,'input',unit.inputText),checkpoint(unit,'result',resultText)];
}

function matchUnit(row:SegmentRow,candidates:readonly MeetingTaskCandidateSnapshot[],rows:readonly SegmentRow[]):MeetingLlmPreparedUnit{
  const index=row.segment_index,previousRawText=rows[index-1]?.discussion.rawText,nextRawText=rows[index+1]?.discussion.rawText;
  const prompt=buildMeetingTaskMatchPrompt({discussion:row.discussion,candidates,previousRawText,nextRawText});
  return prepared('match',row.id,{discussion:row.discussion,candidates,previousRawText,nextRawText,prompt});
}

function emptyMatchCheckpoints(rows:readonly SegmentRow[]):Record<string,unknown>[]{
  return rows.flatMap(row=>unitCheckpoints(matchUnit(row,[],rows),'{"matches":[]}'));
}

async function taskCandidates(rows:readonly TaskRow[],row:SegmentRow):Promise<MeetingTaskCandidateSnapshot[]>{
  const port=harness({tasks:rows}).port;
  const sources=await readMeetingTaskSources(port,SCOPE);
  return selectMeetingTaskCandidates({scope:SCOPE,liveTasks:sources.tasks,
    lexical:scoreMeetingTaskLexical(row.discussion.rawText,sources.tasks),rag:[],pointer:[]})
    .map(({taskId,text,updatedAt,sourceHash,snapshotHash})=>({taskId,text,updatedAt,sourceHash,snapshotHash}));
}

function baseRun(overrides:Record<string,unknown>={}){
  return {id:RUN_ID,capture_id:CAPTURE_ID,source_version:1,transcript_revision_id:TRANSCRIPT_ID,
    state:'queued',lease_token:null,lease_expires_at:null,live:true,...overrides};
}

function retrievalUnit(row:SegmentRow):MeetingLlmPreparedUnit{
  return prepared('retrieve',row.id,{discussion:row.discussion,queryText:row.discussion.rawText});
}

function coverage(total:number,indexed:number){return [{total_tasks:total,indexed_tasks:indexed,task_id:null,score:null}];}

test('missing, non-live, and leased runs return idle before reading segments or checkpoints',async()=>{
  const row=segmentRows(1)[0]!;
  const fixtures=[
    harness({run:null,segments:[row]}),
    harness({run:baseRun({live:false}),segments:[row]}),
    harness({run:baseRun({state:'running',lease_token:randomUUID(),lease_expires_at:new Date().toISOString()}),segments:[row]}),
  ];
  for(const fixture of fixtures){
    assert.deepEqual(await planMeetingLlmWork(fixture.port,SCOPE,RUN_ID),{kind:'idle'});
    assert.equal(fixture.calls.length,1);
    assert.match(fixture.calls[0]!.sql,/meeting_analysis_runs/u);
  }
});

test('an empty complete discussion returns a null summary without retrieval, match, or compose work',async()=>{
  const fixture=harness({segments:[]});
  const result=await planMeetingLlmWork(fixture.port,SCOPE,RUN_ID);
  assert.deepEqual(result,{kind:'complete',runId:RUN_ID,captureId:CAPTURE_ID,sourceVersion:1,
    transcriptRevisionId:TRANSCRIPT_ID,summary:null,discussions:[],proofs:[]});
  assert.equal(fixture.calls.some(call=>call.sql.includes('wbs_items')),false);
  assert.equal(fixture.calls.some(call=>call.sql.includes('meeting_llm_unit_checkpoints')),true);
});

test('an existing current index makes retrieval the first paid unit',async()=>{
  const row=segmentRows(1)[0]!,fixture=harness({segments:[row],tasks:[taskRow({title:'無關任務'})],coverage:coverage(1,1)});
  const result=await planMeetingLlmWork(fixture.port,SCOPE,RUN_ID);
  assert.equal(result.kind,'paid');if(result.kind!=='paid')return;
  assert.equal(result.unit.stage,'retrieve');assert.equal(result.unit.unitKey,row.id);
  const body=JSON.parse(result.unit.inputText) as {body:{discussion:MeetingDiscussionSegment;queryText:string}};
  assert.deepEqual(body.body.discussion,row.discussion);assert.equal(body.body.queryText,row.discussion.rawText);
  assert.equal(fixture.calls.some(call=>call.sql.includes('meeting_pointer_intervals')),false);
});

test('without indexed task data, candidates need paid match while no candidates stay local',async()=>{
  const text='TASK-42 採購閥門',row=segmentRows(1,()=>text)[0]!;
  const withCandidate=harness({segments:[row],tasks:[taskRow({title:'採購閥門',legacyTaskId:'TASK-42'})],coverage:coverage(1,0)});
  const paid=await planMeetingLlmWork(withCandidate.port,SCOPE,RUN_ID);
  assert.equal(paid.kind,'paid');if(paid.kind!=='paid')return;
  assert.equal(paid.unit.stage,'match');
  const matchBody=JSON.parse(paid.unit.inputText) as {body:{candidates:readonly MeetingTaskCandidateSnapshot[];prompt:string}};
  assert.equal(matchBody.body.candidates.length,1);assert.match(matchBody.body.prompt,/採購閥門/u);

  const noCandidate=harness({segments:[row],tasks:[],coverage:coverage(0,0)});
  assert.deepEqual(await planMeetingLlmWork(noCandidate.port,SCOPE,RUN_ID),{
    kind:'local',unit:matchUnit(row,[],[row]),resultText:'{"matches":[]}',reason:'no_candidates',
  });
  assert.equal(noCandidate.calls.some(call=>call.sql.includes('meeting_pointer_intervals')),true);
});

test('valid retrieve and match input/result checkpoints are reused; a single leaf passes through',async()=>{
  const row=segmentRows(1)[0]!,vector=Array<number>(3072).fill(0);vector[0]=0.5;
  const retrieval=retrievalUnit(row),matching=matchUnit(row,[],[row]);
  const retrievalResult=JSON.stringify({embedding:vector}),matchingResult='{"matches":[]}';
  const checkpoints=[...unitCheckpoints(retrieval,retrievalResult),...unitCheckpoints(matching,matchingResult)];
  const fixture=harness({segments:[row],checkpoints,tasks:[],matches:coverage(0,0)});
  const result=await planMeetingLlmWork(fixture.port,SCOPE,RUN_ID);
  assert.equal(result.kind,'complete');if(result.kind!=='complete')return;
  assert.equal(result.summary,row.discussion.rawText);
  assert.equal(result.discussions.length,1);assert.equal(result.discussions[0]?.matches.length,0);
  assert.deepEqual(result.proofs,[
    {stage:'retrieve',unitKey:row.id,inputHash:retrieval.inputHash,resultHash:sha(retrievalResult)},
    {stage:'match',unitKey:row.id,inputHash:matching.inputHash,resultHash:sha(matchingResult)},
  ]);
  assert.equal(fixture.calls.filter(call=>call.sql.includes('meeting_llm_unit_checkpoints')).length,1);
  assert.equal(fixture.calls.some(call=>call.sql.includes('WITH current_sources AS MATERIALIZED')),true);
});

test('multi-leaf composition reuses a validated child result and returns the next node with its child hash',async()=>{
  const rows=segmentRows(9),compose=createMeetingComposePlan({configVersion:MEETING_LLM_CONFIG_VERSION,
    leaves:rows.map(row=>({sourceId:row.id,summary:row.discussion.rawText}))});
  assert.equal(compose.nodes.length,2);
  const first=compose.nodes[0]!,second=compose.nodes[1]!;
  const firstRequest=buildMeetingComposePrompt(compose,first.id);
  const firstResponse=JSON.stringify({summary:'前八段已確認',coveredInputIds:[...firstRequest.childIds].reverse()});
  const firstResult=parseMeetingComposeOutput(firstRequest,firstResponse);
  const firstUnit=prepared('compose',first.id,{request:firstRequest,prompt:firstRequest.prompt});
  const checkpoints=[...emptyMatchCheckpoints(rows),...unitCheckpoints(firstUnit,JSON.stringify({result:firstResult}))];
  const fixture=harness({segments:rows,checkpoints,tasks:[],coverage:coverage(0,0)});

  const result=await planMeetingLlmWork(fixture.port,SCOPE,RUN_ID);

  assert.equal(result.kind,'paid');if(result.kind!=='paid')return;
  assert.equal(result.unit.stage,'compose');assert.equal(result.unit.unitKey,second.id);
  const secondRequest=buildMeetingComposePrompt(compose,second.id,new Map([[first.id,firstResult]]));
  const body=JSON.parse(result.unit.inputText) as {body:{request:MeetingComposeRequest;prompt:string}};
  assert.equal(body.body.request.nodeId,second.id);assert.equal(body.body.request.childHash,secondRequest.childHash);
  assert.deepEqual(body.body.request.sourceIds,compose.sourceIds);assert.equal(body.body.prompt,secondRequest.prompt);

  const secondResponse=JSON.stringify({summary:'九段完整摘要',coveredInputIds:secondRequest.childIds});
  const secondResult=parseMeetingComposeOutput(secondRequest,secondResponse);
  const secondUnit=prepared('compose',second.id,{request:secondRequest,prompt:secondRequest.prompt});
  const allCheckpoints=[...checkpoints,...unitCheckpoints(secondUnit,JSON.stringify({result:secondResult}))];
  const complete=await planMeetingLlmWork(harness({segments:rows,checkpoints:allCheckpoints,tasks:[],coverage:coverage(0,0)}).port,SCOPE,RUN_ID);
  assert.equal(complete.kind,'complete');if(complete.kind!=='complete')return;
  const emptyMatchesHash=sha('{"matches":[]}');
  assert.equal(complete.proofs.length,rows.length+2);
  for(const row of rows)assert.ok(complete.proofs.some(proof=>proof.stage==='match'&&proof.unitKey===row.id
    &&proof.resultHash===emptyMatchesHash),'match receipt proofs bind to the saved result payload hash');
  assert.ok(complete.proofs.some(proof=>proof.stage==='compose'&&proof.unitKey===first.id
    &&proof.inputHash===firstUnit.inputHash&&proof.resultHash===sha(JSON.stringify({result:firstResult}))));
  assert.ok(complete.proofs.some(proof=>proof.stage==='compose'&&proof.unitKey===second.id
    &&proof.inputHash===secondUnit.inputHash&&proof.resultHash===sha(JSON.stringify({result:secondResult}))));
  assert.equal(complete.summary,'九段完整摘要');
});

test('corrupt checkpoint hashes and orphan result checkpoints are rejected',async()=>{
  const row=segmentRows(1)[0]!,unit=retrievalUnit(row),resultText=JSON.stringify({embedding:[1]});
  const input=checkpoint(unit,'input',unit.inputText),result=checkpoint(unit,'result',resultText);
  for(const checkpoints of [
    [{...input,payload_hash:'f'.repeat(64)},result],
    [result],
  ]){
    const fixture=harness({segments:[row],checkpoints});
    await assert.rejects(planMeetingLlmWork(fixture.port,SCOPE,RUN_ID),
      error=>error instanceof KernelError&&error.code==='DB_BOUNDARY_INVALID');
  }
});

test('a changed current WBS snapshot and prompt do not reuse the old match result',async()=>{
  const row=segmentRows(1,()=>'TASK-42 採購閥門')[0]!;
  const taskId=randomUUID(),oldTask=taskRow({id:taskId,title:'採購閥門',legacyTaskId:'TASK-42',stateHash:sha('old-state')});
  const currentTask=taskRow({id:taskId,title:'採購閥門新版',legacyTaskId:'TASK-42',stateHash:sha('current-state'),
    updatedAt:'2026-10-30T00:01:00.000Z'});
  const oldCandidates=await taskCandidates([oldTask],row);
  assert.equal(oldCandidates.length,1);
  const oldUnit=matchUnit(row,oldCandidates,[row]);
  const oldMatch=JSON.stringify({matches:[{candidateTaskId:taskId,quote:{fromWord:0,toWord:0},relation:'related',evidenceScore:0.75}]});
  const fixture=harness({segments:[row],tasks:[currentTask],coverage:coverage(1,0),
    checkpoints:unitCheckpoints(oldUnit,oldMatch)});

  const result=await planMeetingLlmWork(fixture.port,SCOPE,RUN_ID);

  assert.equal(result.kind,'paid');if(result.kind!=='paid')return;
  assert.equal(result.unit.stage,'match');assert.notEqual(result.unit.inputHash,oldUnit.inputHash);
  const body=JSON.parse(result.unit.inputText) as {body:{candidates:readonly MeetingTaskCandidateSnapshot[];prompt:string}};
  assert.equal(body.body.candidates.length,1);assert.notEqual(body.body.candidates[0]?.snapshotHash,oldCandidates[0]?.snapshotHash);
  assert.notEqual(body.body.candidates[0]?.text,oldCandidates[0]?.text);assert.match(body.body.prompt,/採購閥門新版/u);
});
