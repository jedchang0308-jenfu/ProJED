import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {KernelError} from '../../../server/errors.js';
import {MeetingCloudProviderError,type GoogleCloudMeetingProvider,type MeetingCloudGeneration,
  type MeetingCloudEmbedding} from '../../../server/googleCloudMeetingProvider.js';
import {MEETING_LLM_CONFIG_VERSION,type MeetingLlmStage} from '../../../server/meetingLlmPricing.js';
import {prepareMeetingLlmUnit,type MeetingLlmClaim,
  type MeetingLlmReceipt,type MeetingLlmSettlement} from '../../../server/meetingLlmRepository.js';
import {buildMeetingTaskMatchPrompt} from '../../../server/meetingTaskMatching.js';
import {buildMeetingComposePrompt,createMeetingComposePlan} from '../../../server/meetingCompose.js';
import {runMeetingLlmUnit,type MeetingLlmWorkerDependencies,type MeetingLlmWorkerRepository} from '../../../server/meetingLlmWorker.js';
import type {MeetingDiscussionSegment} from '../../../server/meetingDiscussionAssembly.js';
import type {MeetingTaskCandidateSnapshot} from '../../../server/meetingTaskCandidates.js';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const generationUsage={promptTokens:20,candidateTokens:2,thoughtTokens:0,totalTokens:22,cachedTokens:0};

function fixture(stage:MeetingLlmStage,unitKey:string,body:Record<string,unknown>,leaseMs=100_000){
  const now=100_000,runId=randomUUID(),captureId=randomUUID(),transcriptRevisionId=randomUUID(),leaseToken=randomUUID();
  const prepared=prepareMeetingLlmUnit(stage,unitKey,{configVersion:MEETING_LLM_CONFIG_VERSION,sourceVersion:7,
    transcriptRevisionId,body});
  const claim:MeetingLlmClaim=Object.freeze({...prepared,status:'claimed',runId,captureId,sourceVersion:7,
    transcriptRevisionId,leaseToken,leaseExpiresAtMs:now+leaseMs,attemptId:`${runId}:${stage}:${unitKey}:attempt:1`});
  const events:string[]=[],settlements:MeetingLlmSettlement[]=[],dispatchModes:boolean[]=[];
  let claimResult:MeetingLlmClaim|null|'awaiting_budget'=claim;
  let dispatchResult=true;
  let beforeMark:(()=>void)|undefined;
  let settleImpl:((claim:MeetingLlmClaim,payload:MeetingLlmSettlement)=>Promise<MeetingLlmReceipt>)|undefined;
  let readImpl:((claim:MeetingLlmClaim)=>Promise<MeetingLlmReceipt|null>)|undefined;
  const receiptFor=(payload:MeetingLlmSettlement):MeetingLlmReceipt=>({kind:payload.kind,
    published:payload.kind==='completed',chargeMicros:payload.kind==='usage_unknown'?null:12_345,
    requestHash:claim.inputHash,costBasis:'budget_estimate_not_invoice',
    ...(payload.kind==='completed'?{resultHash:sha(payload.resultText)}:{})});
  const repository:MeetingLlmWorkerRepository={
    async claim(unit){events.push('claim');assert.deepEqual(unit,prepared);return claimResult;},
    async markDispatch(input,readOnly=false){events.push('dispatch');assert.equal(input.leaseToken,leaseToken);
      dispatchModes.push(readOnly);beforeMark?.();return dispatchResult;},
    async settle(input,payload){events.push('settle');assert.equal(input.leaseToken,leaseToken);settlements.push(payload);
      return settleImpl?settleImpl(input,payload):receiptFor(payload);},
    async readSettlement(input){events.push('read-settlement');assert.equal(input.leaseToken,leaseToken);
      return readImpl?readImpl(input):null;},
  };
  const calls={embed:0,generate:0,countTokens:0,embedInputs:[] as string[],generateInputs:[] as string[]};
  let embedImpl:()=>Promise<MeetingCloudEmbedding>=async()=>{throw new Error('unexpected embedding call');};
  let generateImpl:()=>Promise<MeetingCloudGeneration>=async()=>{throw new Error('unexpected generation call');};
  const provider:GoogleCloudMeetingProvider={
    async countTokens(){calls.countTokens++;throw new Error('countTokens is not part of dispatch');},
    async embedQuery(input){calls.embed++;calls.embedInputs.push(input.text);return embedImpl();},
    async generateJson(input){calls.generate++;calls.generateInputs.push(input.prompt);return generateImpl();},
  };
  const deps:MeetingLlmWorkerDependencies={repository,provider,now:()=>now};
  return {prepared,claim,events,settlements,dispatchModes,calls,deps,repository,receiptFor,
    setClaim(value:typeof claimResult){claimResult=value;},setDispatch(value:boolean){dispatchResult=value;},
    setBeforeMark(value:()=>void){beforeMark=value;},setEmbed(value:()=>Promise<MeetingCloudEmbedding>){embedImpl=value;},
    setGenerate(value:()=>Promise<MeetingCloudGeneration>){generateImpl=value;},
    setSettle(value:typeof settleImpl){settleImpl=value;},setRead(value:typeof readImpl){readImpl=value;}};
}

function validGeneration(text:string):MeetingCloudGeneration{
  return {outcome:'generated',text,usage:generationUsage,responseId:'response-fixture-1',modelVersion:'gemini-3.5-flash-001'};
}

function matchFixture(){
  const taskId=randomUUID(),sourceAudioId=randomUUID();
  const candidate:MeetingTaskCandidateSnapshot={taskId,text:'更新採購閥門',updatedAt:'2026-10-30T00:00:00.000Z',
    sourceHash:'synthetic-source',snapshotHash:sha('candidate')};
  const discussion:MeetingDiscussionSegment={segmentIndex:0,rawText:'閥門更新',normalizedText:'閥門更新',
    startOffsetMs:1000,endOffsetMs:2500,wordOffsets:[
      {text:'閥門',start_ms:1000,end_ms:1750,source_audio_segment_id:sourceAudioId,source_word_index:12},
      {text:'更新',start_ms:1750,end_ms:2500,source_audio_segment_id:sourceAudioId,source_word_index:13},
    ],sourceAudioRanges:[{source_audio_segment_id:sourceAudioId,from_word:12,to_word:13,start_ms:1000,end_ms:2500}],
    sourceHash:sha('discussion')};
  const previousRawText='上一段內容';
  const prompt=buildMeetingTaskMatchPrompt({discussion,candidates:[candidate],previousRawText});
  const body={discussion,candidates:[candidate],previousRawText,prompt};
  const f=fixture('match','match:segment:0',body);
  return {...f,taskId,discussion,candidate};
}

test('retrieve dispatch stores a valid 3072-value embedding checkpoint with provider billing metadata',async()=>{
  const f=fixture('retrieve','query:0',{queryText:'閥門更新'});
  const values=Array<number>(3072).fill(0);values[0]=0.1;
  f.setEmbed(async()=>({values,tokenCount:3,billableCharacterCount:4}));

  const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);

  assert.equal(result.state,'settled');assert.equal(f.calls.embed,1);assert.equal(f.calls.generate,0);assert.equal(f.calls.countTokens,0);
  assert.deepEqual(f.calls.embedInputs,['閥門更新']);
  const payload=f.settlements[0];assert.equal(payload?.kind,'completed');
  if(payload?.kind!=='completed')return;
  assert.deepEqual(payload.usage,{tokenCount:3,billableCharacterCount:4});
  const stored=JSON.parse(payload.resultText) as {embedding:number[]};
  assert.equal(stored.embedding.length,3072);assert.equal(stored.embedding[0],Math.fround(0.1));
  assert.equal(stored.embedding.slice(1).every(value=>value===0),true);
});

test('invalid embedding response with provider-validated usage settles unusable at known cost',async()=>{
  const f=fixture('retrieve','query:0-invalid',{queryText:'閥門更新'});
  const usage={tokenCount:4,billableCharacterCount:9};
  f.setEmbed(async()=>{throw new MeetingCloudProviderError('LLM_PROVIDER_INVALID_RESPONSE',true,200,usage);});

  const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);

  assert.equal(result.state,'settled');assert.equal(f.calls.embed,1);assert.equal(f.settlements.length,1);
  assert.deepEqual(f.settlements[0],{kind:'unusable',code:'LLM_RESULT_INVALID',usage,modelVersion:'gemini-embedding-001'});
  if(result.state==='settled')assert.equal(result.receipt.chargeMicros,12_345);
});

test('match uses the real parser and preserves inclusive local quote indexes',async()=>{
  const f=matchFixture();
  const providerText=JSON.stringify([{candidateTaskId:f.taskId,quote:{fromWord:0,toWord:1},relation:'action',evidenceScore:0.8}]);
  f.setGenerate(async()=>validGeneration(providerText));

  const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);

  assert.equal(result.state,'settled');assert.equal(f.calls.generate,1);
  const preparedInput=JSON.parse(f.prepared.inputText) as {body:{prompt:string}};
  assert.equal(f.calls.generateInputs[0],preparedInput.body.prompt);
  const payload=f.settlements[0];assert.equal(payload?.kind,'completed');
  if(payload?.kind!=='completed')return;
  const stored=JSON.parse(payload.resultText) as {matches:Array<{candidateTaskId:string;quote:{fromWord:number;toWord:number};relation:string}>};
  assert.deepEqual(stored.matches,[{candidateTaskId:f.taskId,quote:{fromWord:0,toWord:1},relation:'action',evidenceScore:0.8}]);
  assert.equal(f.discussion.wordOffsets[0]?.source_word_index,12); // quote indexes remain local, not source indexes.
});

test('compose uses the real parser and accepts exact unordered direct-child coverage',async()=>{
  const leaves=[{sourceId:randomUUID(),summary:'採購閥門規格已確認。'},{sourceId:randomUUID(),summary:'下週由工程組追蹤交期。'}];
  const plan=createMeetingComposePlan({configVersion:MEETING_LLM_CONFIG_VERSION,leaves});
  const request=buildMeetingComposePrompt(plan,plan.nodes.at(-1)!.id);
  const f=fixture('compose',request.nodeId,{request,prompt:request.prompt});
  const response=JSON.stringify({summary:'已確認閥門規格，工程組下週追蹤交期。',coveredInputIds:[...request.childIds].reverse()});
  f.setGenerate(async()=>validGeneration(response));

  const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);

  assert.equal(result.state,'settled');assert.equal(f.calls.generate,1);
  const payload=f.settlements[0];assert.equal(payload?.kind,'completed');
  if(payload?.kind!=='completed')return;
  const stored=JSON.parse(payload.resultText) as {result:{summary:string;sourceIds:string[];hash:string}};
  assert.equal(stored.result.summary,'已確認閥門規格，工程組下週追蹤交期。');
  assert.deepEqual(stored.result.sourceIds,leaves.map(leaf=>leaf.sourceId));assert.match(stored.result.hash,/^[a-f0-9]{64}$/u);
});

test('idle, awaiting budget, pre-abort, and lease headroom make no provider call',async()=>{
  for(const claimResult of [null,'awaiting_budget'] as const){
    const f=fixture('retrieve','query:1',{queryText:'會議查詢'});f.setClaim(claimResult);
    const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);
    assert.equal(result.state,claimResult===null?'idle':'awaiting_budget');assert.equal(f.events.length,1);
    assert.deepEqual(f.calls,{embed:0,generate:0,countTokens:0,embedInputs:[],generateInputs:[]});
  }
  const aborted=fixture('retrieve','query:2',{queryText:'會議查詢'}),controller=new AbortController();controller.abort();
  await assert.rejects(runMeetingLlmUnit(aborted.deps,aborted.prepared,controller.signal),
    error=>error instanceof KernelError&&error.code==='TRANSACTION_USAGE_INVALID');
  assert.deepEqual(aborted.events,[]);assert.equal(aborted.calls.embed+aborted.calls.generate,0);

  const shortLease=fixture('retrieve','query:3',{queryText:'會議查詢'},9_000);
  const leaseResult=await runMeetingLlmUnit(shortLease.deps,shortLease.prepared,new AbortController().signal);
  assert.equal(leaseResult.state,'settled');assert.deepEqual(shortLease.events,['claim','settle']);
  assert.equal(shortLease.calls.embed+shortLease.calls.generate,0);assert.deepEqual(shortLease.settlements,[
    {kind:'not_sent',code:'LLM_REQUEST_NOT_SENT'},
  ]);
});

test('dispatch denial and uncertain dispatch use read-only confirmation before provider authorization',async()=>{
  const denied=fixture('retrieve','query:4',{queryText:'會議查詢'});denied.setDispatch(false);
  const deniedResult=await runMeetingLlmUnit(denied.deps,denied.prepared,new AbortController().signal);
  assert.equal(deniedResult.state,'settled');assert.deepEqual(denied.dispatchModes,[false]);
  assert.deepEqual(denied.settlements,[{kind:'not_sent',code:'LLM_DISPATCH_UNAVAILABLE'}]);
  assert.equal(denied.calls.embed+denied.calls.generate,0);

  const unknown=fixture('retrieve','query:5',{queryText:'會議查詢'});let marks=0;
  unknown.setBeforeMark(()=>{marks++;if(marks===1)throw new KernelError('DB_COMMIT_UNKNOWN','synthetic unknown commit');});
  unknown.setDispatch(false);
  const unknownResult=await runMeetingLlmUnit(unknown.deps,unknown.prepared,new AbortController().signal);
  assert.equal(unknownResult.state,'settled');assert.deepEqual(unknown.dispatchModes,[false,true]);
  assert.deepEqual(unknown.events,['claim','dispatch','dispatch','settle']);
  assert.deepEqual(unknown.settlements,[{kind:'not_sent',code:'LLM_DISPATCH_UNAVAILABLE'}]);
  assert.equal(unknown.calls.embed+unknown.calls.generate,0);

  const confirmed=fixture('retrieve','query:5b',{queryText:'會議查詢'});let attempts=0;
  const embedding=Array<number>(3072).fill(0);embedding[0]=1;
  confirmed.setEmbed(async()=>({values:embedding,tokenCount:1,billableCharacterCount:1}));
  confirmed.setBeforeMark(()=>{attempts++;if(attempts===1)throw new KernelError('DB_COMMIT_UNKNOWN','synthetic unknown commit');});
  const confirmedResult=await runMeetingLlmUnit(confirmed.deps,confirmed.prepared,new AbortController().signal);
  assert.equal(confirmedResult.state,'settled');assert.deepEqual(confirmed.dispatchModes,[false,true]);
  assert.equal(confirmed.calls.embed,1);assert.equal(confirmed.events.filter(event=>event==='dispatch').length,2);
});

test('known pre-send failure releases as not-sent while sent transport failure remains usage-unknown',async()=>{
  const cases=[
    {requestSent:false,kind:'not_sent' as const,code:'LLM_REQUEST_NOT_SENT'},
    {requestSent:true,kind:'usage_unknown' as const,code:'LLM_USAGE_UNAVAILABLE'},
  ];
  for(const item of cases){
    const f=matchFixture();f.setGenerate(async()=>{throw new MeetingCloudProviderError('LLM_TRANSPORT_UNKNOWN',item.requestSent);});
    const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);
    assert.equal(result.state,'settled');assert.equal(f.calls.generate,1);
    assert.deepEqual(f.settlements,[{kind:item.kind,code:item.code}]);
    if(result.state==='settled')assert.equal(result.receipt.chargeMicros,item.kind==='usage_unknown'?null:12_345);
  }
});

test('missing or invalid generation usage remains reserved; unusable and invalid parse retain known usage',async()=>{
  const missing=matchFixture();missing.setGenerate(async()=>({outcome:'generated',text:'[]',usage:null,
    responseId:'response-unknown',modelVersion:'gemini-3.5-flash-001'}));
  const missingResult=await runMeetingLlmUnit(missing.deps,missing.prepared,new AbortController().signal);
  assert.equal(missingResult.state,'settled');assert.deepEqual(missing.settlements,[{kind:'usage_unknown',code:'LLM_USAGE_UNAVAILABLE'}]);
  if(missingResult.state==='settled')assert.equal(missingResult.receipt.chargeMicros,null);

  const wrongModel=matchFixture();wrongModel.setGenerate(async()=>({...validGeneration('[]'),modelVersion:'gemini-3.5-flash-preview'}));
  const modelResult=await runMeetingLlmUnit(wrongModel.deps,wrongModel.prepared,new AbortController().signal);
  assert.equal(modelResult.state,'settled');assert.deepEqual(wrongModel.settlements,[{kind:'usage_unknown',code:'LLM_USAGE_UNAVAILABLE'}]);

  const unusable=matchFixture();unusable.setGenerate(async()=>({outcome:'unusable',text:null,usage:generationUsage,
    responseId:'response-unusable',modelVersion:'gemini-3.5-flash-001'}));
  await runMeetingLlmUnit(unusable.deps,unusable.prepared,new AbortController().signal);
  assert.deepEqual(unusable.settlements,[{kind:'unusable',code:'LLM_RESULT_UNUSABLE',usage:generationUsage,
    modelVersion:'gemini-3.5-flash-001',responseId:'response-unusable'}]);

  const invalidOutput=matchFixture();invalidOutput.setGenerate(async()=>validGeneration('{not-json'));
  await runMeetingLlmUnit(invalidOutput.deps,invalidOutput.prepared,new AbortController().signal);
  assert.deepEqual(invalidOutput.settlements,[{kind:'unusable',code:'LLM_RESULT_INVALID',usage:generationUsage,
    modelVersion:'gemini-3.5-flash-001',responseId:'response-fixture-1'}]);
  for(const f of [unusable,invalidOutput])assert.equal(f.settlements[0]?.kind==='unusable'
    ?f.receiptFor(f.settlements[0]).chargeMicros: null,12_345);
});

test('settlement commit uncertainty reads first then replays the same payload at most once without provider resend',async()=>{
  const response=JSON.stringify([{candidateTaskId:'00000000-0000-4000-8000-000000000001',
    quote:{fromWord:0,toWord:0},relation:'related',evidenceScore:0.5}]);
  for(const readback of ['existing','missing'] as const){
    const f=matchFixture();f.setGenerate(async()=>validGeneration(response));let settleCalls=0;
    f.setSettle(async(_claim,payload)=>{
      settleCalls++;if(settleCalls===1)throw new KernelError('DB_COMMIT_UNKNOWN','synthetic unknown commit');
      return f.receiptFor(payload);
    });
    const authoritativeReceipt:MeetingLlmReceipt={kind:'usage_unknown',published:false,chargeMicros:null,
      requestHash:f.claim.inputHash,costBasis:'budget_estimate_not_invoice'};
    f.setRead(async()=>readback==='existing'?authoritativeReceipt:null);
    const result=await runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal);
    assert.equal(result.state,'settled');assert.equal(f.calls.generate,1);assert.equal(settleCalls,readback==='existing'?1:2);
    assert.equal(f.events.filter(event=>event==='read-settlement').length,1);
    assert.equal(f.settlements.length,readback==='existing'?1:2);
    assert.deepEqual(f.settlements[0],f.settlements[1]??f.settlements[0]);
    if(result.state==='settled')assert.deepEqual(result.receipt,
      readback==='existing'?authoritativeReceipt:f.receiptFor(f.settlements[1]!));
  }
});

test('non-commit settlement failure fails fast without readback or settlement retry',async()=>{
  const f=matchFixture();f.setGenerate(async()=>validGeneration('[]'));let settles=0;
  f.setSettle(async()=>{settles++;throw new KernelError('DB_BOUNDARY_INVALID','synthetic SQL failure');});
  await assert.rejects(runMeetingLlmUnit(f.deps,f.prepared,new AbortController().signal),
    error=>error instanceof KernelError&&error.code==='DB_BOUNDARY_INVALID');
  assert.equal(f.calls.generate,1);assert.equal(settles,1);assert.equal(f.events.includes('read-settlement'),false);
});

test('caller abort after dispatch but before provider invocation settles proven not-sent',async()=>{
  const f=fixture('retrieve','query:6',{queryText:'會議查詢'}),controller=new AbortController();
  f.setBeforeMark(()=>controller.abort());

  const result=await runMeetingLlmUnit(f.deps,f.prepared,controller.signal);

  assert.equal(result.state,'settled');assert.deepEqual(f.events,['claim','dispatch','settle']);
  assert.equal(f.calls.embed+f.calls.generate,0);assert.deepEqual(f.settlements,[
    {kind:'not_sent',code:'LLM_REQUEST_NOT_SENT'},
  ]);
});
