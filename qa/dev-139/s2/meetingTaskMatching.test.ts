import assert from 'node:assert/strict';
import test from 'node:test';

import {KernelError} from '../../../server/errors.js';
import {buildMeetingTaskMatchPrompt,parseMeetingTaskMatchResponse,
  type MeetingTaskModelMatch} from '../../../server/meetingTaskMatching.js';
import type {MeetingDiscussionSegment} from '../../../server/meetingDiscussionAssembly.js';
import type {MeetingTaskCandidateSnapshot} from '../../../server/meetingTaskCandidates.js';

const SOURCE_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_ONE='11111111-1111-4111-8111-111111111111';
const TASK_TWO='22222222-2222-4222-8222-222222222222';
const TASK_OTHER='33333333-3333-4333-8333-333333333333';
const SOURCE_HASH='a'.repeat(64);
const TASK_SOURCE_HASH='fnv1a32:deadbeef';
const TASK_SNAPSHOT_HASH='c'.repeat(64);

function discussion(overrides:Partial<MeetingDiscussionSegment>={}):MeetingDiscussionSegment{
  const words=[
    {text:'不要',start_ms:1000,end_ms:1100,source_audio_segment_id:SOURCE_ID,source_word_index:40},
    {text:'合併',start_ms:1120,end_ms:1200,source_audio_segment_id:SOURCE_ID,source_word_index:41},
    {text:'API',start_ms:1210,end_ms:1300,source_audio_segment_id:SOURCE_ID,source_word_index:42},
    {text:'保留',start_ms:1400,end_ms:1480,source_audio_segment_id:SOURCE_ID,source_word_index:43},
    {text:'舊資料',start_ms:1490,end_ms:1600,source_audio_segment_id:SOURCE_ID,source_word_index:44},
  ];
  return {segmentIndex:7,rawText:'不要合併API；保留舊資料',normalizedText:'不要合併API；保留舊資料',
    startOffsetMs:1000,endOffsetMs:1600,wordOffsets:words,
    sourceAudioRanges:[{source_audio_segment_id:SOURCE_ID,from_word:40,to_word:44,start_ms:1000,end_ms:1600}],
    sourceHash:SOURCE_HASH,...overrides};
}

function candidate(taskId:string,text:string):MeetingTaskCandidateSnapshot{
  return {taskId,text,updatedAt:'2026-10-29T00:00:00.000Z',sourceHash:TASK_SOURCE_HASH,snapshotHash:TASK_SNAPSHOT_HASH};
}

function fixture(){
  return {discussion:discussion(),candidates:[candidate(TASK_ONE,'資料庫遷移'),candidate(TASK_TWO,'API 相容性')]};
}

function expectProviderInvalid(action:()=>unknown):void{
  assert.throws(action,error=>error instanceof KernelError
    &&error.code==='RAG_PROVIDER_INVALID_RESPONSE'&&error.httpStatus===502);
}

test('prompt bounds adjacent context and keeps it separate from current segment evidence',()=>{
  const input={...fixture(),previousRawText:`OUTSIDE-PREVIOUS${'p'.repeat(400)}`,
    nextRawText:`${'n'.repeat(400)}OUTSIDE-NEXT`};
  const prompt=buildMeetingTaskMatchPrompt(input);

  assert.ok(prompt.includes('p'.repeat(400)));
  assert.ok(prompt.includes('n'.repeat(400)));
  assert.ok(!prompt.includes('OUTSIDE-PREVIOUS'));
  assert.ok(!prompt.includes('OUTSIDE-NEXT'));
  assert.match(prompt,/絕不可作為引文或本段證據/u);
  assert.match(prompt,/保留原句的肯定、否定/u);
  assert.match(prompt,/建立或修改任務/u);
  assert.match(prompt,/localIndex/u);
  assert.ok(!prompt.includes(TASK_SNAPSHOT_HASH));
});

test('parses multiple task matches with current discussion local word indices and preserves negation relation',()=>{
  const input=fixture();
  const response=JSON.stringify([
    {candidateTaskId:TASK_ONE,quote:{fromWord:0,toWord:2},relation:'decision',evidenceScore:0.73},
    {candidateTaskId:TASK_TWO,quote:{fromWord:3,toWord:4},relation:'action',evidenceScore:0.61},
  ]);
  const original=structuredClone(input);
  const matches=parseMeetingTaskMatchResponse(response,input);

  assert.deepEqual(matches,[
    {candidateTaskId:TASK_ONE,quote:{fromWord:0,toWord:2},relation:'decision',evidenceScore:0.73},
    {candidateTaskId:TASK_TWO,quote:{fromWord:3,toWord:4},relation:'action',evidenceScore:0.61},
  ] satisfies readonly MeetingTaskModelMatch[]);
  assert.deepEqual(input,original);
});

test('quote indexes are local to the discussion, not the source-wide word indexes',()=>{
  const input=fixture();
  const local=JSON.stringify([{candidateTaskId:TASK_ONE,quote:{fromWord:1,toWord:2},relation:'related',evidenceScore:0.5}]);
  assert.equal(parseMeetingTaskMatchResponse(local,input)[0]?.quote.fromWord,1);

  const sourceWide=JSON.stringify([{candidateTaskId:TASK_ONE,quote:{fromWord:40,toWord:42},relation:'related',evidenceScore:0.5}]);
  expectProviderInvalid(()=>parseMeetingTaskMatchResponse(sourceWide,input));
});

test('an empty result is valid even when candidate retrieval returned no candidates',()=>{
  const input={discussion:discussion(),candidates:[]};
  assert.deepEqual(parseMeetingTaskMatchResponse('[]',input),[]);
  assert.match(buildMeetingTaskMatchPrompt(input),/沒有結果時回傳 \[\]/u);
});

test('accepts the existing bounded fnv1a32 WBS source hash while validating snapshot hash separately',()=>{
  const input={discussion:discussion(),candidates:[candidate(TASK_ONE,'Task')]};
  assert.equal(input.candidates[0]?.sourceHash,'fnv1a32:deadbeef');
  assert.doesNotThrow(()=>buildMeetingTaskMatchPrompt(input));
  assert.deepEqual(parseMeetingTaskMatchResponse('[]',input),[]);
});

test('rejects malformed JSON, unknown fields or IDs, duplicates, invalid ranges and uncalibrated score bounds',()=>{
  const input=fixture();
  const valid={candidateTaskId:TASK_ONE,quote:{fromWord:0,toWord:1},relation:'related',evidenceScore:0.5};
  const cases=[
    '{not json}',
    JSON.stringify([{...valid,extra:'unexpected'}]),
    JSON.stringify([{...valid,quote:{...valid.quote,extra:1}}]),
    JSON.stringify([{...valid,candidateTaskId:TASK_OTHER}]),
    JSON.stringify([valid,valid]),
    JSON.stringify([{...valid,quote:{fromWord:1,toWord:0}}]),
    JSON.stringify([{...valid,quote:{fromWord:0,toWord:5}}]),
    JSON.stringify([{...valid,relation:'blocker'}]),
    JSON.stringify([{...valid,evidenceScore:1.01}]),
    JSON.stringify([{...valid,evidenceScore:'0.5'}]),
  ];
  for(const providerText of cases)expectProviderInvalid(()=>parseMeetingTaskMatchResponse(providerText,input));
});

test('rejects invalid source word anchors with a fixed input error',()=>{
  const badDiscussion=discussion({wordOffsets:discussion().wordOffsets.map((word,index)=>index===2
    ?{...word,source_word_index:-1}:word)});
  assert.throws(()=>buildMeetingTaskMatchPrompt({discussion:badDiscussion,candidates:[candidate(TASK_ONE,'Task')]}),
    error=>error instanceof KernelError&&error.code==='DOMAIN_DATA_INVALID'&&!error.message.includes('-1'));
});

test('provider response errors never echo provider text',()=>{
  const raw='private model output with unknown task text';
  assert.throws(()=>parseMeetingTaskMatchResponse(raw,fixture()),error=>error instanceof KernelError
    &&error.code==='RAG_PROVIDER_INVALID_RESPONSE'&&!error.message.includes(raw));
});
