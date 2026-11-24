import { MANAGED_PROJECT_ID } from '../shared/dev139DeploymentTarget.mjs';
import {MEETING_LLM_PRICE_VERSION} from './meetingLlmPricing.js';
/** Source-bound proof of the actual project. An env flag or the separate Speech
 * qualification cannot attest that Cloud model content retention is disabled. */
export interface MeetingLlmRuntimeBinding {
  readonly projectId:typeof MANAGED_PROJECT_ID;readonly provider:'google-cloud-meeting';
  readonly embeddingModel:'gemini-embedding-001';readonly generationModel:'gemini-3.5-flash';
  readonly abuseMonitoring:'exempt';readonly cache:'disabled';readonly requestResponseLogging:'disabled';
  readonly priceVersion:typeof MEETING_LLM_PRICE_VERSION;readonly qualificationEvidenceRef:string;
}
export const CURRENT_MEETING_LLM_BINDING:MeetingLlmRuntimeBinding|null=null;

export function hasQualifiedMeetingLlmBinding(binding:MeetingLlmRuntimeBinding|null):binding is MeetingLlmRuntimeBinding{
  return binding!==null&&binding.projectId===MANAGED_PROJECT_ID&&binding.provider==='google-cloud-meeting'
    &&binding.embeddingModel==='gemini-embedding-001'&&binding.generationModel==='gemini-3.5-flash'
    &&binding.abuseMonitoring==='exempt'&&binding.cache==='disabled'&&binding.requestResponseLogging==='disabled'
    &&binding.priceVersion===MEETING_LLM_PRICE_VERSION&&typeof binding.qualificationEvidenceRef==='string'
    &&binding.qualificationEvidenceRef.trim().length>0;
}
