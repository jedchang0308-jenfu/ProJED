import { MANAGED_PROJECT_ID } from '../shared/dev139DeploymentTarget.mjs';

export const MEETING_ANALYSIS_JOB_RESOURCE =
  `projects/${MANAGED_PROJECT_ID}/locations/asia-east1/jobs/projed-meeting-analysis`;

/** Explicit evidence reference that this fixed Job's invocation target and IAM
 * capability were qualified. It says nothing about Speech or LLM providers. */
export interface MeetingJobRuntimeBinding {
  readonly resource: string;
  readonly qualificationEvidenceRef: string;
}

/** Real runtime SA invocation and empty-queue SQL transport were verified.
 * Provider and Session qualification remain independent. */
export const CURRENT_MEETING_JOB_BINDING: MeetingJobRuntimeBinding | null = Object.freeze({
  resource: MEETING_ANALYSIS_JOB_RESOURCE,
  qualificationEvidenceRef: 'config/dev-139/meeting-job-qualification.json#sha256=e004b81fc1869926d36a9376f3dea8c8dd0253d43b99aec2f5e9a29d929eadeb',
});
