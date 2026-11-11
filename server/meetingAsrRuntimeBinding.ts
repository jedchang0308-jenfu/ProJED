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
