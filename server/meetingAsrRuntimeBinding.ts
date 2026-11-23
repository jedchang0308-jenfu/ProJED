import { MANAGED_PROJECT_ID } from '../shared/dev139DeploymentTarget.mjs';
import { MANAGED_MEETING_AUDIO_BUCKET } from '../shared/dev139MeetingAudio.mjs';

/** Filled only from the selected project's actual provider/bucket qualification.
 * An environment flag cannot attest that content logging is disabled. */
export interface MeetingAsrRuntimeBinding {
  readonly projectId:typeof MANAGED_PROJECT_ID;
  readonly provider:'google-cloud-speech-v1';
  readonly model:'default';
  readonly dataLogging:'disabled';
  readonly audioBucket:string;
  readonly qualificationEvidenceRef:string;
}
// Human-approved SPEC-139 3.0.6: real runtime silence probe and private audio
// foundation were read back. Recognition quality and Session publication are
// separate; runtime paid dispatch still requires the original identity fences.
export const CURRENT_MEETING_ASR_BINDING:MeetingAsrRuntimeBinding|null=Object.freeze({
  projectId:MANAGED_PROJECT_ID,provider:'google-cloud-speech-v1',model:'default',dataLogging:'disabled',
  audioBucket:MANAGED_MEETING_AUDIO_BUCKET,
  qualificationEvidenceRef:'config/dev-139/speech-qualification.json#sha256=5af1fd87a21f8b5c8312160610266d3083ab63038f76201263e20a87b8517037',
});

export function hasQualifiedMeetingAsrBinding(binding: MeetingAsrRuntimeBinding | null, configuredBucket: string | undefined): boolean {
  return binding !== null && configuredBucket === MANAGED_MEETING_AUDIO_BUCKET
    && binding.audioBucket === configuredBucket && binding.projectId === MANAGED_PROJECT_ID
    && binding.provider === 'google-cloud-speech-v1' && binding.model === 'default'
    && binding.dataLogging === 'disabled' && typeof binding.qualificationEvidenceRef === 'string'
    && binding.qualificationEvidenceRef.trim().length > 0;
}
