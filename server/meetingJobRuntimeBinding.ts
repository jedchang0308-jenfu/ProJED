export const MEETING_ANALYSIS_JOB_RESOURCE =
  'projects/projed-cc78d/locations/asia-east1/jobs/projed-meeting-analysis';

/** Explicit evidence reference that this fixed Job's invocation target and IAM
 * capability were qualified. It says nothing about Speech or LLM providers. */
export interface MeetingJobRuntimeBinding {
  readonly resource: string;
  readonly qualificationEvidenceRef: string;
}

/** Kept unpublished until the target Job and its invocation grant are qualified. */
export const CURRENT_MEETING_JOB_BINDING: MeetingJobRuntimeBinding | null = null;
