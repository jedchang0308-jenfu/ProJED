import assert from 'node:assert/strict';
import test from 'node:test';

import {buildMeetingComposePrompt,createMeetingComposePlan,parseMeetingComposeOutput,
  type MeetingComposePlan,type MeetingComposeResult} from '../../../server/meetingCompose.js';

const CONFIG='dev139.compose.test.v1';

function sourceId(index:number):string{
  return `00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
}

function leaves(count:number,summaryFor:(index:number)=>string= index=>`Discussion ${index+1}`){
  return Array.from({length:count},(_,index)=>({sourceId:sourceId(index),summary:summaryFor(index)}));
}

function runPlan(plan:MeetingComposePlan):Map<string,MeetingComposeResult>{
  const results=new Map<string,MeetingComposeResult>();
  for(const node of plan.nodes){
    const request=buildMeetingComposePrompt(plan,node.id,results);
    const result=parseMeetingComposeOutput(request,JSON.stringify({summary:`Merged ${node.id}`,coveredInputIds:request.childIds}));
    results.set(node.id,result);
  }
  return results;
}

function rootRequestForLeafCount(count:number){
  const plan=createMeetingComposePlan({configVersion:CONFIG,leaves:leaves(count)});
  const root=plan.nodes.at(-1)!;
  const results=new Map<string,MeetingComposeResult>();
  for(const node of plan.nodes.slice(0,-1)){
    const request=buildMeetingComposePrompt(plan,node.id,results);
    results.set(node.id,parseMeetingComposeOutput(request,JSON.stringify({summary:'Bounded child summary',
      coveredInputIds:request.childIds})));
  }
  return {plan,root,request:buildMeetingComposePrompt(plan,root.id,results)};
}

test('9 leaves merge through bounded nodes and preserve tail coverage deterministically',()=>{
  const input=leaves(9),plan=createMeetingComposePlan({configVersion:CONFIG,leaves:input});
  const replay=createMeetingComposePlan({configVersion:CONFIG,leaves:input});
  assert.deepEqual(replay,plan);
  assert.equal(plan.nodes.length,2);
  assert.ok(plan.nodes.every(node=>node.children.length<=8));
  assert.deepEqual(plan.nodes[0]?.sourceIds,input.slice(0,8).map(leaf=>leaf.sourceId));
  assert.deepEqual(plan.final?.sourceIds,input.map(leaf=>leaf.sourceId));
  assert.equal(plan.nodes[0]?.sourceIds.includes(input[8]!.sourceId),false);
  const result=runPlan(plan).get(plan.final!.id);
  assert.deepEqual(result?.sourceIds,input.map(leaf=>leaf.sourceId));
  assert.equal(result?.hash,runPlan(replay).get(replay.final!.id)?.hash);
});

test('65 leaves terminate through fanout-eight levels without dropping the final source',()=>{
  const input=leaves(65),plan=createMeetingComposePlan({configVersion:CONFIG,leaves:input});
  assert.ok(plan.nodes.length>1);
  assert.ok(plan.nodes.every(node=>node.children.length>=2&&node.children.length<=8));
  assert.ok(plan.nodes.every(node=>new Set(node.sourceIds).size===node.sourceIds.length));
  assert.deepEqual(plan.final?.sourceIds,input.map(leaf=>leaf.sourceId));
  const results=runPlan(plan),final=results.get(plan.final!.id);
  assert.deepEqual(final?.sourceIds,input.map(leaf=>leaf.sourceId));
  assert.ok(final?.summary && Array.from(final.summary).length<=2000);
  assert.ok(plan.nodes.some(node=>node.sourceIds.includes(input[64]!.sourceId)));
});

test('a node prompt contains only its at-most-eight bounded child inputs',()=>{
  const input=leaves(9,()=> 'x'.repeat(2000));
  const plan=createMeetingComposePlan({configVersion:CONFIG,leaves:input});
  const request=buildMeetingComposePrompt(plan,plan.nodes[0]!.id);
  assert.ok(request.prompt.includes(input[0]!.summary));
  assert.deepEqual(request.childIds,input.slice(0,8).map(leaf=>leaf.sourceId));
  assert.ok(request.prompt.includes(request.childIds[7]!));
  assert.ok(!request.prompt.includes(input[8]!.sourceId));
  assert.ok(!request.prompt.includes(request.childHash));
  assert.ok(request.prompt.length<20_000);
});

test('65- and 513-leaf root prompts stay bounded to direct child summaries without full leaf IDs',()=>{
  const small=rootRequestForLeafCount(65),large=rootRequestForLeafCount(513);
  for(const {plan,root,request} of [small,large]){
    assert.ok(root.children.length<=8);
    assert.deepEqual(request.childIds,root.children.map(child=>child.id));
    assert.ok(request.sourceIds.length===plan.leaves.length);
    const directSourceIds=new Set(root.children.filter(child=>child.kind==='source').map(child=>child.id));
    assert.ok(plan.sourceIds.filter(sourceId=>!directSourceIds.has(sourceId))
      .every(sourceId=>!request.prompt.includes(sourceId)));
    assert.ok(request.childIds.every(childId=>request.prompt.includes(childId)));
    assert.ok(request.prompt.includes('Bounded child summary'));
    assert.ok(!request.prompt.includes(request.childHash));
    assert.ok(request.prompt.length<2_000);
    const result=parseMeetingComposeOutput(request,JSON.stringify({summary:'Root summary',
      coveredInputIds:request.childIds}));
    assert.deepEqual(result.sourceIds,plan.sourceIds);
    assert.match(result.hash,/^[a-f0-9]{64}$/u);
  }
  assert.ok(Math.abs(small.request.prompt.length-large.request.prompt.length)<256);
});

test('one leaf passes through and an empty meeting is explicit without a synthetic summary',()=>{
  const empty=createMeetingComposePlan({configVersion:CONFIG,leaves:[]});
  assert.equal(empty.empty,true);
  assert.deepEqual(empty.nodes,[]);
  assert.equal(empty.final,null);
  assert.deepEqual(empty.sourceIds,[]);

  const [leaf]=leaves(1);
  const single=createMeetingComposePlan({configVersion:CONFIG,leaves:[leaf!]});
  assert.equal(single.empty,false);
  assert.deepEqual(single.nodes,[]);
  assert.deepEqual(single.final,{kind:'source',id:leaf!.sourceId,sourceIds:[leaf!.sourceId],leafIndex:0});
});

test('compose output requires exact keys, nonempty bounded Unicode summary, and exact direct child coverage',()=>{
  const plan=createMeetingComposePlan({configVersion:CONFIG,leaves:leaves(2)});
  const request=buildMeetingComposePrompt(plan,plan.final!.id);
  const valid=JSON.stringify({summary:'Résumé 😀',coveredInputIds:request.childIds});
  const parsed=parseMeetingComposeOutput(request,valid);
  assert.deepEqual(parseMeetingComposeOutput(request,valid),parsed);
  assert.match(parsed.hash,/^[a-f0-9]{64}$/u);
  assert.notEqual(parsed.hash,parseMeetingComposeOutput({...request,configVersion:'another-config'},valid).hash);
  const reverse=parseMeetingComposeOutput(request,JSON.stringify({summary:'Résumé 😀',
    coveredInputIds:[...request.childIds].reverse()}));
  assert.deepEqual(reverse.sourceIds,request.sourceIds);
  assert.equal(reverse.hash,parsed.hash);

  assert.throws(()=>parseMeetingComposeOutput(request,JSON.stringify({summary:'summary',coveredInputIds:request.childIds,extra:true})));
  assert.throws(()=>parseMeetingComposeOutput(request,JSON.stringify({summary:' ',coveredInputIds:request.childIds})));
  assert.throws(()=>parseMeetingComposeOutput(request,JSON.stringify({summary:'😀'.repeat(2001),coveredInputIds:request.childIds})));
  assert.match(request.prompt,/Any order is valid/u);
  assert.throws(()=>parseMeetingComposeOutput(request,JSON.stringify({summary:'summary',sourceIds:request.sourceIds})));
  assert.throws(()=>parseMeetingComposeOutput(request,'x'.repeat(16*1024+1)));

  const eightLeafPlan=createMeetingComposePlan({configVersion:CONFIG,leaves:leaves(8)});
  const eightLeafRequest=buildMeetingComposePrompt(eightLeafPlan,eightLeafPlan.final!.id);
  const largeValidResponse=JSON.stringify({summary:'😀'.repeat(2000),coveredInputIds:eightLeafRequest.childIds});
  assert.ok(Buffer.byteLength(largeValidResponse,'utf8')<16*1024);
  assert.equal(parseMeetingComposeOutput(eightLeafRequest,largeValidResponse).summary,'😀'.repeat(2000));
  const overByteLimit=`${JSON.stringify({summary:'summary',coveredInputIds:request.childIds})}${'€'.repeat(6000)}`;
  assert.ok(overByteLimit.length<16*1024);
  assert.ok(Buffer.byteLength(overByteLimit,'utf8')>16*1024);
  assert.throws(()=>parseMeetingComposeOutput(request,overByteLimit));
});

test('duplicate, unknown, and missing direct child IDs are rejected',()=>{
  const plan=createMeetingComposePlan({configVersion:CONFIG,leaves:leaves(3)});
  const request=buildMeetingComposePrompt(plan,plan.final!.id);
  const [first,second,third]=request.childIds;
  for(const coveredInputIds of [[first,first,third],[first,second,sourceId(100)],[first,second]]){
    assert.throws(()=>parseMeetingComposeOutput(request,JSON.stringify({summary:'summary',coveredInputIds})));
  }

  const nestedPlan=createMeetingComposePlan({configVersion:CONFIG,leaves:leaves(9)});
  const firstNode=nestedPlan.nodes[0]!;
  const firstRequest=buildMeetingComposePrompt(nestedPlan,firstNode.id);
  const firstResult=parseMeetingComposeOutput(firstRequest,JSON.stringify({summary:'first level',
    coveredInputIds:firstRequest.childIds}));
  const sparseCoverage:string[]=[];
  sparseCoverage.length=firstResult.sourceIds.length;
  for(let index=0;index<sparseCoverage.length-1;index++)sparseCoverage[index]=firstResult.sourceIds[index]!;
  const tampered={...firstResult,sourceIds:sparseCoverage};
  assert.throws(()=>buildMeetingComposePrompt(nestedPlan,nestedPlan.nodes[1]!.id,
    new Map([[firstResult.nodeId,tampered]])),'intermediate results cannot omit coverage through sparse arrays');
  const badHash={...firstResult,hash:'0'.repeat(64)};
  assert.throws(()=>buildMeetingComposePrompt(nestedPlan,nestedPlan.nodes[1]!.id,
    new Map([[firstResult.nodeId,badHash]])),'intermediate result hash must bind the validated child coverage');
});

test('planning rejects duplicate or invalid source identities and overlong child summaries',()=>{
  const [first,second]=leaves(2);
  assert.throws(()=>createMeetingComposePlan({configVersion:CONFIG,leaves:[first!,first!]}));
  assert.throws(()=>createMeetingComposePlan({configVersion:CONFIG,leaves:[{sourceId:'not-a-uuid',summary:'text'}]}));
  assert.throws(()=>createMeetingComposePlan({configVersion:CONFIG,leaves:[{...second!,summary:'😀'.repeat(2001)}]}));
  const sparseLeaves=leaves(2) as Array<{sourceId:string;summary:string}>;
  delete sparseLeaves[1];
  assert.throws(()=>createMeetingComposePlan({configVersion:CONFIG,leaves:sparseLeaves}));
});
