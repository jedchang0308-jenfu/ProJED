/** Candidate Google Cloud Standard PayGo schedule. Dispatch additionally needs
 * the selected project's actual pricing/ZDR qualification; these are buffered
 * budget estimates, never a provider invoice or an increase to the month cap. */
export const MEETING_LLM_CONFIG_VERSION='dev139.meeting-llm.v1';
export const MEETING_LLM_PRICE_VERSION='google-cloud-meeting-standard-buffered-2026-10-30-v1';
export type MeetingLlmStage='retrieve'|'match'|'compose';
export interface MeetingLlmUsage {
  readonly promptTokens?:number;
  readonly candidateTokens?:number;
  readonly thoughtTokens?:number;
  readonly totalTokens?:number;
  readonly cachedTokens?:number;
  readonly tokenCount?:number;
  readonly billableCharacterCount?:number|null;
}

// Global 3.5 Flash: $1.50 input / $9 response+reasoning per million tokens,
// existing 40 TWD/USD buffer => 60 / 360 microTWD per token. Reserve the whole
// model context and a separate full output allowance for EACH output component;
// this avoids assuming that the smaller requested cap includes reasoning.
const MAX_PROMPT_TOKENS=1_048_576;
const MAX_OUTPUT_COMPONENT_TOKENS=65_536;
const GENERATION_RESERVE_MICROS=111_000_000n;
// Cloud embedding's table says $0.00015 / 1000 "count" without defining that
// unit. 4096 covers this app's <=800-codepoint query (<=3200 UTF8 bytes), the
// model's 2048-token limit and the reported billable-character count. Use the
// greatest known measure at 6 microTWD/count, not an invented token invoice.
const MAX_EMBEDDING_UNITS=4096;
const EMBEDDING_RESERVE_MICROS=30_000n;

function integer(value:unknown,max:number):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
}
export function meetingLlmReservation(stage:MeetingLlmStage):bigint{
  if(stage==='retrieve')return EMBEDDING_RESERVE_MICROS;
  if(stage==='match'||stage==='compose')return GENERATION_RESERVE_MICROS;
  throw new Error('Meeting LLM stage is invalid');
}

/** null means no defensible estimate: keep the reservation and do not resend. */
export function meetingLlmCharge(stage:MeetingLlmStage,usage:MeetingLlmUsage|null,queryUtf8Bytes=0):bigint|null{
  if(!usage||typeof usage!=='object')return null;
  if(stage==='retrieve'){
    if(!integer(queryUtf8Bytes,3200)||queryUtf8Bytes<1||!integer(usage.tokenCount,2048)||usage.tokenCount<1
      ||(usage.billableCharacterCount!==undefined&&usage.billableCharacterCount!==null
        &&!integer(usage.billableCharacterCount,MAX_EMBEDDING_UNITS)))return null;
    return BigInt(Math.max(queryUtf8Bytes,usage.tokenCount,usage.billableCharacterCount??0))*6n;
  }
  if(stage!=='match'&&stage!=='compose')return null;
  const {promptTokens,candidateTokens=0,thoughtTokens=0,totalTokens,cachedTokens=0}=usage;
  if(!integer(promptTokens,MAX_PROMPT_TOKENS)||!integer(candidateTokens,MAX_OUTPUT_COMPONENT_TOKENS)
    ||!integer(thoughtTokens,MAX_OUTPUT_COMPONENT_TOKENS)||!integer(totalTokens,MAX_PROMPT_TOKENS+2*MAX_OUTPUT_COMPONENT_TOKENS)
    ||!integer(cachedTokens,MAX_PROMPT_TOKENS)||cachedTokens>promptTokens
    ||totalTokens!==promptTokens+candidateTokens+thoughtTokens)return null;
  const charge=BigInt(promptTokens)*60n+BigInt(candidateTokens+thoughtTokens)*360n;
  // Deliberately claim no cache discount. Cached content is unusable under the
  // selected privacy path; its accounting still uses an undiscounted upper estimate.
  return charge<=GENERATION_RESERVE_MICROS?charge:null;
}
