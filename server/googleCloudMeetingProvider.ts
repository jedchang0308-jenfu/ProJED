/** Google Cloud transport only. The durable worker must additionally require
 * the actual project's zero-retention qualification, actor fence and budget.
 * Importing/constructing this adapter does not contact Google or attest ZDR. */
const PROJECT='projed-cc78d';
const EMBEDDING_URL=`https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/publishers/google/models/gemini-embedding-001:predict`;
const GENERATION_BASE=`https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/gemini-3.5-flash`;
const MAX_RESPONSE_BYTES=512*1024;
const MAX_PROMPT_BYTES=128*1024;
const MAX_OUTPUT_TOKENS=8192;

export interface MeetingCloudTokenUsage {
  readonly promptTokens:number;
  readonly candidateTokens:number;
  readonly thoughtTokens:number;
  readonly totalTokens:number;
  readonly cachedTokens:number;
}
export interface MeetingCloudGeneration {
  /** Unusable content may still be billed; retain factual usage for settlement. */
  readonly outcome:'generated'|'unusable';
  readonly text:string|null;
  readonly usage:MeetingCloudTokenUsage|null;
  readonly responseId:string|null;
  readonly modelVersion:string|null;
}
export interface MeetingCloudEmbedding {
  readonly values:readonly number[];
  readonly tokenCount:number;
  /** Metadata, not an invoice or an assumed pricing unit. */
  readonly billableCharacterCount:number|null;
}
export interface MeetingCloudEmbeddingUsage {
  readonly tokenCount:number;
  readonly billableCharacterCount:number|null;
}
export interface MeetingCloudGenerationInput {
  readonly prompt:string;
  readonly maxOutputTokens:number;
  readonly signal?:AbortSignal;
}
export interface GoogleCloudMeetingProvider {
  countTokens(input:MeetingCloudGenerationInput):Promise<number>;
  embedQuery(input:{readonly text:string;readonly signal?:AbortSignal}):Promise<MeetingCloudEmbedding>;
  generateJson(input:MeetingCloudGenerationInput):Promise<MeetingCloudGeneration>;
}
export type MeetingCloudProviderErrorCode='LLM_INVALID_INPUT'|'LLM_AUTH_UNAVAILABLE'|'LLM_REQUEST_ABORTED'
  |'LLM_REQUEST_TIMEOUT'|'LLM_PROVIDER_REJECTED'|'LLM_PROVIDER_INVALID_RESPONSE'|'LLM_TRANSPORT_UNKNOWN';
export class MeetingCloudProviderError extends Error {
  /** requestSent means dispatch was attempted and may have reached Google;
   * only httpStatus demonstrates that a provider response was received. */
  constructor(readonly code:MeetingCloudProviderErrorCode,readonly requestSent:boolean,readonly httpStatus?:number,
    readonly embeddingUsage?:MeetingCloudEmbeddingUsage){
    super('Meeting Cloud provider operation failed');this.name='MeetingCloudProviderError';
  }
  /** A sent request is never retried/refunded merely from its HTTP failure. */
  get usageUnknown():boolean{return this.requestSent&&this.embeddingUsage===undefined;}
}
export interface GoogleCloudMeetingProviderOptions {
  readonly getAccessToken:()=>Promise<string>;
  readonly fetchImpl?:typeof fetch;
  readonly timeoutMs?:number;
}

function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function integer(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
function wellFormed(value:string):boolean{return Buffer.from(value,'utf8').toString('utf8')===value;}
function fail(code:MeetingCloudProviderErrorCode,sent:boolean,status?:number,embeddingUsage?:MeetingCloudEmbeddingUsage):never{
  throw new MeetingCloudProviderError(code,sent,status,embeddingUsage);
}
function textInput(value:string,maxBytes:number):void{
  if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value,'utf8')>maxBytes
    ||!wellFormed(value))fail('LLM_INVALID_INPUT',false);
}
function generationBody(input:MeetingCloudGenerationInput){
  textInput(input.prompt,MAX_PROMPT_BYTES);
  if(!Number.isSafeInteger(input.maxOutputTokens)||input.maxOutputTokens<1||input.maxOutputTokens>MAX_OUTPUT_TOKENS){
    fail('LLM_INVALID_INPUT',false);
  }
  // One text-only turn; no Files, interactions, tools, cachedContent or history.
  return {contents:[{role:'user',parts:[{text:input.prompt}]}],generationConfig:{
    candidateCount:1,maxOutputTokens:input.maxOutputTokens,responseMimeType:'application/json',temperature:0,
  }};
}
function tokenUsage(value:unknown):MeetingCloudTokenUsage|null{
  if(!record(value)||!integer(value.promptTokenCount)||!integer(value.totalTokenCount))return null;
  const candidateTokens=value.candidatesTokenCount??0,thoughtTokens=value.thoughtsTokenCount??0;
  const cachedTokens=value.cachedContentTokenCount??0,toolTokens=value.toolUsePromptTokenCount??0;
  if(!integer(candidateTokens)||!integer(thoughtTokens)||!integer(cachedTokens)||!integer(toolTokens)
    ||toolTokens!==0||cachedTokens>value.promptTokenCount
    ||value.totalTokenCount!==value.promptTokenCount+candidateTokens+thoughtTokens)return null;
  return {promptTokens:value.promptTokenCount,candidateTokens,thoughtTokens,totalTokens:value.totalTokenCount,cachedTokens};
}
function identifier(value:unknown):string|null{
  return typeof value==='string'&&value.length>0&&value.length<=256&&/^[a-zA-Z0-9._:/=-]+$/u.test(value)?value:null;
}
function generationResult(wire:unknown):MeetingCloudGeneration{
  if(!record(wire))fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
  const usage=tokenUsage(wire.usageMetadata),responseId=identifier(wire.responseId),modelVersion=identifier(wire.modelVersion);
  const unusable:MeetingCloudGeneration={outcome:'unusable',text:null,usage,responseId,modelVersion};
  // Missing cost metadata is preserved as unknown, not zero. Do not accept
  // cached context or an unrequested model as a valid result under this path.
  if(usage===null||usage.cachedTokens!==0||!modelVersion
    ||!/^gemini-3\.5-flash(?:-\d{3})?$/u.test(modelVersion)
    ||!Array.isArray(wire.candidates)||wire.candidates.length!==1)return unusable;
  const candidate=wire.candidates[0];
  if(!record(candidate)||candidate.finishReason!=='STOP'||!record(candidate.content)
    ||!Array.isArray(candidate.content.parts)||candidate.content.parts.length===0)return unusable;
  const parts:string[]=[];
  for(const part of candidate.content.parts){
    if(!record(part)||typeof part.text!=='string'
      ||Object.keys(part).some(key=>!['text','thought','thoughtSignature'].includes(key)))return unusable;
    if(part.thought===true)continue; // Thought text is neither result nor log data.
    if(part.thought!==undefined&&part.thought!==false)return unusable;
    parts.push(part.text);
  }
  const text=parts.join('');
  if(!text.trim()||!wellFormed(text)||Buffer.byteLength(text,'utf8')>64*1024||usage.candidateTokens<1)return unusable;
  return {outcome:'generated',text,usage,responseId,modelVersion};
}
function embeddingUsage(wire:Record<string,unknown>,statistics:unknown):MeetingCloudEmbeddingUsage|null{
  if(!record(statistics)||!integer(statistics.token_count)||statistics.token_count<1||statistics.token_count>2048)return null;
  let billableCharacterCount:number|null=null;
  if(wire.metadata!==undefined&&wire.metadata!==null){
    if(!record(wire.metadata))return null;
    const value=wire.metadata.billableCharacterCount;
    if(value!==undefined&&value!==null){
      if(!integer(value)||value>4096)return null;
      billableCharacterCount=value;
    }
  }
  return {tokenCount:statistics.token_count,billableCharacterCount};
}
function embeddingResult(wire:unknown):MeetingCloudEmbedding{
  if(!record(wire)||!Array.isArray(wire.predictions)||wire.predictions.length!==1)fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
  const prediction=wire.predictions[0];
  if(!record(prediction)||!record(prediction.embeddings))fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
  const {values,statistics}=prediction.embeddings;
  const usage=embeddingUsage(wire,statistics);
  if(!usage)fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
  if(!Array.isArray(values)||values.length!==3072||values.some(value=>typeof value!=='number'||!Number.isFinite(value))
    ||!record(statistics)||statistics.truncated!==false)fail('LLM_PROVIDER_INVALID_RESPONSE',true,200,usage);
  const rounded=(values as number[]).map(Math.fround);
  if(rounded.some(value=>!Number.isFinite(value))||rounded.every(value=>value===0))fail('LLM_PROVIDER_INVALID_RESPONSE',true,200,usage);
  return {values:rounded,...usage};
}

/** No SDK retry, redirect, alternate model or endpoint. Each method makes at
 * most one POST. The caller reserves before invoking a paid method. */
export function createGoogleCloudMeetingProvider(options:GoogleCloudMeetingProviderOptions):GoogleCloudMeetingProvider{
  const {getAccessToken,fetchImpl=globalThis.fetch,timeoutMs=60_000}=options;
  if(typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)
    ||timeoutMs<1||timeoutMs>60_000)fail('LLM_INVALID_INPUT',false);

  const post=async(url:string,body:unknown,parent?:AbortSignal):Promise<unknown>=>{
    const controller=new AbortController();
    let sent=false,aborted=false,code:MeetingCloudProviderErrorCode='LLM_REQUEST_ABORTED';
    let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    let rejectAbort!:(error:MeetingCloudProviderError)=>void;
    const interrupted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
    const cancelBody=()=>{
      if(reader)void reader.cancel().catch(()=>undefined);
      else if(response)void response.body?.cancel().catch(()=>undefined);
    };
    const abort=(reason:MeetingCloudProviderErrorCode)=>{
      if(aborted)return;aborted=true;code=reason;controller.abort();cancelBody();
      rejectAbort(new MeetingCloudProviderError(code,sent));
    };
    const onAbort=()=>abort('LLM_REQUEST_ABORTED');
    const timer=setTimeout(()=>abort('LLM_REQUEST_TIMEOUT'),timeoutMs);
    parent?.addEventListener('abort',onAbort,{once:true});
    const work=async()=>{
      if(parent?.aborted)onAbort();
      if(aborted)fail(code,false);
      let token:string;
      try{token=await getAccessToken();}catch{fail('LLM_AUTH_UNAVAILABLE',false);}
      if(aborted)fail(code,false);
      if(typeof token!=='string'||token.length>16_384||!/^[A-Za-z0-9\-._~+/]+=*$/u.test(token))fail('LLM_AUTH_UNAVAILABLE',false);
      sent=true;
      response=await fetchImpl(url,{method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/json',
        'content-type':'application/json','x-goog-user-project':PROJECT},body:JSON.stringify(body),
        redirect:'error',cache:'no-store',credentials:'omit',signal:controller.signal});
      if(aborted){cancelBody();fail(code,true);}
      if(response.status!==200||!response.ok||response.redirected){cancelBody();fail('LLM_PROVIDER_REJECTED',true,response.status);}
      if(!response.body||!(response.headers.get('content-type')??'').toLowerCase().includes('application/json')){
        cancelBody();fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
      }
      const declared=response.headers.get('content-length');
      if(declared!==null&&(!/^\d+$/u.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>MAX_RESPONSE_BYTES)){
        cancelBody();fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
      }
      reader=response.body.getReader();
      const chunks:Uint8Array[]=[];let size=0;
      while(true){
        const next=await reader.read();if(aborted)fail(code,true);if(next.done)break;
        size+=next.value.byteLength;
        if(size>MAX_RESPONSE_BYTES){cancelBody();fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);}
        chunks.push(next.value);
      }
      if(declared!==null&&Number(declared)!==size)fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
      try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size))) as unknown;}
      catch{fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);}
    };
    try{return await Promise.race([work(),interrupted]);}
    catch(error){
      if(error instanceof MeetingCloudProviderError)throw error;
      fail(aborted?code:sent?'LLM_TRANSPORT_UNKNOWN':'LLM_AUTH_UNAVAILABLE',sent);
    }finally{
      clearTimeout(timer);parent?.removeEventListener('abort',onAbort);
      if(reader){try{reader.releaseLock();}catch{/* In-flight cancellation owns this reader. */}}
    }
  };
  return {
    async countTokens(input){
      const body=generationBody(input),wire=await post(`${GENERATION_BASE}:countTokens`,body,input.signal);
      if(!record(wire)||!integer(wire.totalTokens)||wire.totalTokens<1)fail('LLM_PROVIDER_INVALID_RESPONSE',true,200);
      return wire.totalTokens;
    },
    async embedQuery(input){
      textInput(input.text,3200); // One <=800-codepoint discussion; no silent truncation.
      if(Array.from(input.text).length>800)fail('LLM_INVALID_INPUT',false);
      return embeddingResult(await post(EMBEDDING_URL,{instances:[{content:input.text,task_type:'RETRIEVAL_QUERY'}],
        parameters:{autoTruncate:false,outputDimensionality:3072}},input.signal));
    },
    async generateJson(input){
      return generationResult(await post(`${GENERATION_BASE}:generateContent`,generationBody(input),input.signal));
    },
  };
}
