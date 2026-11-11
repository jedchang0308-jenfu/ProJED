import assert from 'node:assert/strict';
import test from 'node:test';

import {createGoogleCloudMeetingProvider,MeetingCloudProviderError,
  type GoogleCloudMeetingProviderOptions, type MeetingCloudProviderErrorCode} from '../../../server/googleCloudMeetingProvider.js';

const TOKEN='fixture.oauth.token';
const EMBEDDING_URL='https://us-central1-aiplatform.googleapis.com/v1/projects/projed-cc78d/locations/us-central1/publishers/google/models/gemini-embedding-001:predict';
const GENERATION_BASE='https://aiplatform.googleapis.com/v1/projects/projed-cc78d/locations/global/publishers/google/models/gemini-3.5-flash';
const USAGE={promptTokenCount:20,candidatesTokenCount:5,thoughtsTokenCount:2,totalTokenCount:27,cachedContentTokenCount:0};

type ResponseFactory=()=>Response|Promise<Response>;
interface RecordedRequest {readonly url:string;readonly init:RequestInit;}
type FetchInput=Parameters<typeof fetch>[0];

function jsonResponse(value:unknown,status=200,headers:Record<string,string>={'content-type':'application/json; charset=utf-8'}):Response{
  return new Response(JSON.stringify(value),{status,headers});
}

function embeddingWire(overrides:{readonly values?:readonly unknown[];readonly truncated?:unknown;
  readonly metadata?:unknown;readonly statistics?:unknown}={}):unknown{
  const statistics=Object.hasOwn(overrides,'statistics')?overrides.statistics:{truncated:overrides.truncated??false,token_count:12};
  return {predictions:[{embeddings:{values:overrides.values??Array<number>(3072).fill(.25),statistics}}],
    ...(overrides.metadata===undefined?{}:{metadata:overrides.metadata})};
}

function generationWire(overrides:Record<string,unknown>={}):unknown{
  return {usageMetadata:USAGE,responseId:'resp-123',modelVersion:'gemini-3.5-flash-002',candidates:[{
    finishReason:'STOP',content:{parts:[{text:'{"matched":true}'}]},
  }],...overrides};
}

function scriptedFetch(factories:readonly ResponseFactory[]):{readonly fetchImpl:typeof fetch;readonly requests:RecordedRequest[]}{
  const requests:RecordedRequest[]=[];
  const fetchImpl=(async(input:FetchInput,init?:RequestInit):Promise<Response>=>{
    requests.push({url:String(input),init:init??{}});
    const factory=factories[requests.length-1];
    if(!factory)throw new Error('unexpected provider request');
    return factory();
  }) as typeof fetch;
  return {fetchImpl,requests};
}

function provider(fetchImpl:typeof fetch,options:Partial<GoogleCloudMeetingProviderOptions>={}){
  return createGoogleCloudMeetingProvider({getAccessToken:async()=>TOKEN,fetchImpl,...options});
}

function providerFailure(code?:MeetingCloudProviderErrorCode,sent?:boolean,status?:number){
  return (error:unknown):error is MeetingCloudProviderError=>error instanceof MeetingCloudProviderError
    &&(code===undefined||error.code===code)&&(sent===undefined||error.requestSent===sent)
    &&(status===undefined||error.httpStatus===status);
}

function assertCommonRequest(request:RecordedRequest):void{
  const headers=new Headers(request.init.headers);
  assert.equal(request.init.method,'POST');
  assert.equal(request.init.redirect,'error');
  assert.equal(request.init.cache,'no-store');
  assert.equal(request.init.credentials,'omit');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.equal(headers.get('authorization'),`Bearer ${TOKEN}`);
  assert.equal(headers.get('accept'),'application/json');
  assert.equal(headers.get('content-type'),'application/json');
  assert.equal(headers.get('x-goog-user-project'),'projed-cc78d');
}

test('uses the fixed OAuth endpoints and one POST with the expected request bodies',async()=>{
  const fake=scriptedFetch([
    ()=>jsonResponse({totalTokens:42}),
    ()=>jsonResponse(embeddingWire({metadata:{billableCharacterCount:7}})),
    ()=>jsonResponse(generationWire({candidates:[{finishReason:'STOP',content:{parts:[
      {text:'hidden reasoning',thought:true,thoughtSignature:'opaque-signature'},
      {text:'{"summary":"Visible only"}',thought:false},
    ]}}]})),
  ]);
  const subject=provider(fake.fetchImpl);
  const count=await subject.countTokens({prompt:'count this',maxOutputTokens:256});
  const embedding=await subject.embedQuery({text:'query text'});
  const generated=await subject.generateJson({prompt:'return JSON',maxOutputTokens:128});

  assert.equal(count,42);
  assert.equal(embedding.values.length,3072);
  assert.equal(embedding.values[0],Math.fround(.25));
  assert.equal(embedding.tokenCount,12);
  assert.equal(embedding.billableCharacterCount,7);
  assert.deepEqual(generated,{outcome:'generated',text:'{"summary":"Visible only"}',usage:{promptTokens:20,
    candidateTokens:5,thoughtTokens:2,totalTokens:27,cachedTokens:0},responseId:'resp-123',modelVersion:'gemini-3.5-flash-002'});
  assert.equal(generated.text?.includes('hidden reasoning'),false);

  assert.equal(fake.requests.length,3);
  assert.deepEqual(fake.requests.map(request=>request.url),[
    `${GENERATION_BASE}:countTokens`,EMBEDDING_URL,`${GENERATION_BASE}:generateContent`,
  ]);
  for(const request of fake.requests)assertCommonRequest(request);
  assert.deepEqual(JSON.parse(String(fake.requests[0]?.init.body)),{
    contents:[{role:'user',parts:[{text:'count this'}]}],
    generationConfig:{candidateCount:1,maxOutputTokens:256,responseMimeType:'application/json',temperature:0},
  });
  assert.deepEqual(JSON.parse(String(fake.requests[1]?.init.body)),{
    instances:[{content:'query text',task_type:'RETRIEVAL_QUERY'}],
    parameters:{autoTruncate:false,outputDimensionality:3072},
  });
  assert.deepEqual(JSON.parse(String(fake.requests[2]?.init.body)),{
    contents:[{role:'user',parts:[{text:'return JSON'}]}],
    generationConfig:{candidateCount:1,maxOutputTokens:128,responseMimeType:'application/json',temperature:0},
  });
});

test('preserves validated usage when sent embedding output is unusable',async()=>{
  const cases:unknown[]=[
    embeddingWire({truncated:true,metadata:{billableCharacterCount:9}}),
    embeddingWire({values:Array<number>(3071).fill(.25),metadata:{billableCharacterCount:9}}),
    embeddingWire({values:Array<number>(3072).fill(.25).map((value,index)=>index===17?Number.NaN:value),metadata:{billableCharacterCount:9}}),
    embeddingWire({values:Array<number>(3072).fill(0),metadata:{billableCharacterCount:9}}),
    embeddingWire({values:Array<number>(3072).fill(1e-100),metadata:{billableCharacterCount:9}}),
  ];
  for(const wire of cases){
    const fake=scriptedFetch([()=>jsonResponse(wire)]);
    await assert.rejects(provider(fake.fetchImpl).embedQuery({text:'query'}),error=>{
      assert.ok(providerFailure('LLM_PROVIDER_INVALID_RESPONSE',true,200)(error));
      assert.equal((error as MeetingCloudProviderError).usageUnknown,false);
      assert.deepEqual((error as MeetingCloudProviderError).embeddingUsage,
        {tokenCount:12,billableCharacterCount:9});
      return true;
    });
    assert.equal(fake.requests.length,1);
  }
});

test('missing or invalid embedding usage remains unknown even with a malformed vector',async()=>{
  const cases:unknown[]=[
    embeddingWire({values:Array<number>(3071).fill(.25),statistics:{truncated:false}}),
    embeddingWire({values:Array<number>(3071).fill(.25),statistics:{truncated:false,token_count:0}}),
    embeddingWire({values:Array<number>(3071).fill(.25),statistics:{truncated:false,token_count:2049}}),
    embeddingWire({values:Array<number>(3071).fill(.25),statistics:{truncated:false,token_count:12.5}}),
    embeddingWire({values:Array<number>(3071).fill(.25),metadata:{billableCharacterCount:'9'}}),
    embeddingWire({values:Array<number>(3071).fill(.25),metadata:{billableCharacterCount:4097}}),
    embeddingWire({values:Array<number>(3071).fill(.25),metadata:'malformed'}),
  ];
  for(const wire of cases){
    const fake=scriptedFetch([()=>jsonResponse(wire)]);
    await assert.rejects(provider(fake.fetchImpl).embedQuery({text:'query'}),error=>{
      assert.ok(providerFailure('LLM_PROVIDER_INVALID_RESPONSE',true,200)(error));
      assert.equal((error as MeetingCloudProviderError).usageUnknown,true);
      assert.equal((error as MeetingCloudProviderError).embeddingUsage,undefined);
      return true;
    });
    assert.equal(fake.requests.length,1);
  }
});

test('keeps usage for token and safety blocked generations while marking output unusable',async()=>{
  for(const finishReason of ['MAX_TOKENS','SAFETY']){
    const fake=scriptedFetch([()=>jsonResponse(generationWire({candidates:[{
      finishReason,content:{parts:[{text:'provider text must not be accepted'}]},
    }]}))]);
    const result=await provider(fake.fetchImpl).generateJson({prompt:'prompt',maxOutputTokens:100});
    assert.deepEqual(result,{outcome:'unusable',text:null,usage:{promptTokens:20,candidateTokens:5,thoughtTokens:2,
      totalTokens:27,cachedTokens:0},responseId:'resp-123',modelVersion:'gemini-3.5-flash-002'});
    assert.equal(fake.requests.length,1);
  }
});

test('marks missing usage, cached tokens and model drift unusable without discarding available usage',async()=>{
  const cachedUsage={...USAGE,cachedContentTokenCount:3};
  const cases:[Record<string,unknown>,unknown][]=[
    [{usageMetadata:undefined},null],
    [{usageMetadata:cachedUsage},{promptTokens:20,candidateTokens:5,thoughtTokens:2,totalTokens:27,cachedTokens:3}],
    [{modelVersion:'gemini-4-flash-001'}, {promptTokens:20,candidateTokens:5,thoughtTokens:2,totalTokens:27,cachedTokens:0}],
    [{modelVersion:'gemini-3.5-flash-preview-06-17'}, {promptTokens:20,candidateTokens:5,thoughtTokens:2,totalTokens:27,cachedTokens:0}],
  ];
  for(const [override,expectedUsage] of cases){
    const fake=scriptedFetch([()=>jsonResponse(generationWire(override))]);
    const result=await provider(fake.fetchImpl).generateJson({prompt:'prompt',maxOutputTokens:100});
    assert.equal(result.outcome,'unusable');
    assert.equal(result.text,null);
    assert.deepEqual(result.usage,expectedUsage);
    assert.equal(fake.requests.length,1);
  }
});

test('auth failure and an already-aborted signal do not dispatch requests',async()=>{
  let tokenCalls=0,fetchCalls=0;
  const fetchImpl=(async()=>{fetchCalls+=1;return jsonResponse({totalTokens:1});}) as typeof fetch;
  const authFailure=createGoogleCloudMeetingProvider({fetchImpl,getAccessToken:async()=>{
    tokenCalls+=1;throw new Error('secret credential detail');
  }});
  await assert.rejects(authFailure.countTokens({prompt:'prompt',maxOutputTokens:100}),error=>{
    assert.ok(providerFailure('LLM_AUTH_UNAVAILABLE',false)(error));
    assert.equal((error as Error).message.includes('secret credential detail'),false);
    return true;
  });

  const controller=new AbortController();controller.abort();
  const preAborted=createGoogleCloudMeetingProvider({fetchImpl,getAccessToken:async()=>{tokenCalls+=1;return TOKEN;}});
  await assert.rejects(preAborted.embedQuery({text:'query',signal:controller.signal}),error=>
    providerFailure('LLM_REQUEST_ABORTED',false)(error));
  assert.equal(tokenCalls,1);
  assert.equal(fetchCalls,0);
});

test('caller cancellation while acquiring a token prevents a late token from dispatching',async()=>{
  let resolveToken!:(token:string)=>void;
  let tokenCalls=0,fetchCalls=0;
  const pendingToken=new Promise<string>(resolve=>{resolveToken=resolve;});
  const subject=createGoogleCloudMeetingProvider({getAccessToken:()=>{tokenCalls+=1;return pendingToken;},
    fetchImpl:(async()=>{fetchCalls+=1;return jsonResponse({totalTokens:1});}) as typeof fetch});
  const controller=new AbortController();
  const operation=subject.countTokens({prompt:'prompt',maxOutputTokens:100,signal:controller.signal});
  assert.equal(tokenCalls,1);
  controller.abort();
  await assert.rejects(operation,error=>providerFailure('LLM_REQUEST_ABORTED',false)(error));

  resolveToken(TOKEN);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCalls,0);
});

test('fetch and response-body timeouts are bounded and remain usage-unknown after dispatch',async()=>{
  let fetchCalls=0;
  const hangingFetch=(async(_input:FetchInput,init?:RequestInit):Promise<Response>=>{
    fetchCalls+=1;
    return new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>
      reject(new Error('private transport detail')),{once:true}));
  }) as typeof fetch;
  const fetchTimeout=provider(hangingFetch,{timeoutMs:20});
  await assert.rejects(fetchTimeout.countTokens({prompt:'prompt',maxOutputTokens:100}),error=>{
    assert.ok(providerFailure('LLM_REQUEST_TIMEOUT',true)(error));
    assert.equal((error as MeetingCloudProviderError).usageUnknown,true);
    assert.equal((error as Error).message.includes('private transport detail'),false);
    return true;
  });
  assert.equal(fetchCalls,1);

  const hangingBodyFetch=(async():Promise<Response>=>{
    fetchCalls+=1;
    const body=new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(new TextEncoder().encode('{"totalTokens":'));},
      pull(){return new Promise<void>(()=>undefined);},
    });
    return new Response(body,{status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
  await assert.rejects(provider(hangingBodyFetch,{timeoutMs:20}).countTokens({prompt:'prompt',maxOutputTokens:100}),error=>{
    assert.ok(providerFailure('LLM_REQUEST_TIMEOUT',true)(error));
    assert.equal((error as MeetingCloudProviderError).usageUnknown,true);
    return true;
  });
  assert.equal(fetchCalls,2);
});

test('bounds declared and streamed response bodies and rejects invalid JSON or UTF-8 safely',async()=>{
  const oversizedStream=()=>new Response(new ReadableStream<Uint8Array>({
    start(controller){controller.enqueue(new Uint8Array(512*1024+1).fill(0x20));controller.close();},
  }),{status:200,headers:{'content-type':'application/json'}});
  const declaredOversize=()=>new Response('{"totalTokens":1}',{status:200,headers:{
    'content-type':'application/json','content-length':String(512*1024+1),
  }});
  const invalidJson=()=>new Response('{"totalTokens": private body detail}',{status:200,headers:{'content-type':'application/json'}});
  const invalidUtf8=()=>new Response(new Uint8Array([0xff,0xfe]),{status:200,headers:{'content-type':'application/json'}});

  for(const factory of [declaredOversize,oversizedStream,invalidJson,invalidUtf8]){
    const fake=scriptedFetch([factory]);
    await assert.rejects(provider(fake.fetchImpl).countTokens({prompt:'prompt',maxOutputTokens:100}),error=>{
      assert.ok(providerFailure('LLM_PROVIDER_INVALID_RESPONSE',true,200)(error));
      assert.equal((error as MeetingCloudProviderError).usageUnknown,true);
      assert.equal((error as Error).message.includes('private body detail'),false);
      assert.equal((error as Error).message.includes('totalTokens'),false);
      return true;
    });
    assert.equal(fake.requests.length,1);
  }
});

test('non-200 response is not retried and its body never enters the safe error',async()=>{
  const secret='private transcript and provider diagnostic';
  const fake=scriptedFetch([()=>new Response(secret,{status:503,headers:{'content-type':'text/plain'}})]);
  await assert.rejects(provider(fake.fetchImpl).generateJson({prompt:'prompt',maxOutputTokens:100}),error=>{
    assert.ok(providerFailure('LLM_PROVIDER_REJECTED',true,503)(error));
    assert.equal((error as MeetingCloudProviderError).usageUnknown,true);
    assert.equal((error as Error).message.includes(secret),false);
    return true;
  });
  assert.equal(fake.requests.length,1);
});

test('rejects prompts and query text above fixed bounds before token lookup or POST',async()=>{
  let tokenCalls=0,fetchCalls=0;
  const subject=createGoogleCloudMeetingProvider({getAccessToken:async()=>{tokenCalls+=1;return TOKEN;},fetchImpl:(async()=>{
    fetchCalls+=1;return jsonResponse({});
  }) as typeof fetch});
  const prompts=[
    {prompt:'x'.repeat(128*1024+1),maxOutputTokens:100},
    {prompt:'valid',maxOutputTokens:8193},
  ];
  for(const input of prompts)await assert.rejects(subject.generateJson(input),error=>
    providerFailure('LLM_INVALID_INPUT',false)(error));
  await assert.rejects(subject.embedQuery({text:'a'.repeat(801)}),error=>
    providerFailure('LLM_INVALID_INPUT',false)(error));
  assert.equal(tokenCalls,0);
  assert.equal(fetchCalls,0);
});
