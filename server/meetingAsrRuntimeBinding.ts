import { MANAGED_MEETING_AUDIO_BUCKET } from '../shared/dev139MeetingAudio.mjs';

/** Filled only from the selected project's actual provider/bucket qualification.
 * An environment flag cannot attest that content logging is disabled. */
export interface MeetingAsrRuntimeBinding {
  readonly projectId:'projed-cc78d';
  readonly provider:'google-cloud-speech-v1';
  readonly model:'default';
  readonly dataLogging:'disabled';
  readonly audioBucket:string;
  readonly qualificationEvidenceRef:string;
}
export const CURRENT_MEETING_ASR_BINDING:MeetingAsrRuntimeBinding|null=null;

export function hasQualifiedMeetingAsrBinding(binding: MeetingAsrRuntimeBinding | null, configuredBucket: string | undefined): boolean {
  return binding !== null && configuredBucket === MANAGED_MEETING_AUDIO_BUCKET
    && binding.audioBucket === configuredBucket && binding.projectId === 'projed-cc78d'
    && binding.provider === 'google-cloud-speech-v1' && binding.model === 'default'
    && binding.dataLogging === 'disabled' && typeof binding.qualificationEvidenceRef === 'string'
    && binding.qualificationEvidenceRef.trim().length > 0;
}
