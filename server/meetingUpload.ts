import type { ActorQueryPort } from './actorTransaction.js';
import { KernelError } from './errors.js';
import { normalizeMeetingUploadCompletion } from './meetingUploadInput.js';

const CONFLICTS = new Set([
  'MEETING_UPLOAD_SOURCE_CONFLICT', 'MEETING_UPLOAD_CAPTURE_NOT_READY',
  'MEETING_UPLOAD_AUDIO_EXPIRED', 'MEETING_UPLOAD_MANIFEST_CONFLICT',
]);

export class MeetingUploadRepository {
  constructor(private readonly options:{readonly cloudSpeech?:boolean}={}){}
  async execute(port: ActorQueryPort, body: unknown): Promise<unknown> {
    const input = normalizeMeetingUploadCompletion(body);
    const visible = await port.query<{ record_id: string }>(
      'SELECT record_id::text FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid', [input.captureId],
    );
    if (visible.rows.length !== 1) throw new KernelError('RESOURCE_NOT_FOUND', 'Meeting capture is unavailable', 404);
    // The transaction kernel locks and reauthorizes the current source record.
    await port.authorizeMeetingCaptureMutation(visible.rows[0]!.record_id, input.captureId);
    try {
      const result = await port.query<{ data: unknown }>(`
        SELECT projed_core.complete_meeting_upload_v1($1::uuid,$2::integer,$3::jsonb,$4,$5,$6) AS data
      `, [input.captureId, input.expectedSourceVersion, JSON.stringify(input.audioManifest),
        input.audioManifestHash, input.pointerManifestHash, input.sourceCompleteness]);
      if (result.rows.length !== 1 || !result.rows[0]?.data) {
        throw new KernelError('DB_UNAVAILABLE', 'Meeting completion did not return a receipt');
      }
      const data=result.rows[0].data;
      if(this.options.cloudSpeech){
        if(typeof data!=='object'||data===null||Array.isArray(data))
          throw new KernelError('DB_UNAVAILABLE','Meeting completion receipt is invalid',503);
        const receipt=data as Record<string,unknown>;
        if(receipt.sourceComplete===true){
          if(typeof receipt.runId!=='string')throw new KernelError('DB_UNAVAILABLE','Meeting run receipt is invalid',503);
          const prepared=await port.query<{data:Record<string,unknown>}>(
            'SELECT projed_core.prepare_meeting_cloud_speech_v1($1::uuid) AS data',[receipt.runId]);
          if(prepared.rows.length!==1||!prepared.rows[0]?.data)
            throw new KernelError('DB_UNAVAILABLE','Meeting ASR reservation did not return a receipt',503);
          return {...receipt,...prepared.rows[0].data,providerMode:'cloud-speech-v1'};
        }
      }
      return data;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P0001'
          && 'message' in error && typeof error.message === 'string' && CONFLICTS.has(error.message)) {
        throw new KernelError('REVISION_CONFLICT', 'Meeting source is no longer ready for this completion', 409, { cause: error });
      }
      // Integrity failures and unknown COMMIT outcomes remain failures. Never
      // turn them into a successful replay or reserve another attempt here.
      throw error;
    }
  }
}
