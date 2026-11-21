import { createGoogleCloudMeetingProvider, MeetingCloudProviderError,
  type GoogleCloudMeetingProvider, type GoogleCloudMeetingProviderOptions } from './googleCloudMeetingProvider.js';
import { KernelError } from './errors.js';
import { meetingLlmCharge } from './meetingLlmPricing.js';
import { hasQualifiedMeetingLlmBinding, type MeetingLlmRuntimeBinding } from './meetingLlmRuntimeBinding.js';
import type { MeetingSynthesisModel, MeetingSynthesisProvider } from './meetingSynthesisHttp.js';

const FIXED_MODEL: MeetingSynthesisModel = 'gemini-3.5-flash';
const MAX_GENERATED_BYTES = 64 * 1024;

export interface MeetingSynthesisCloudProviderOptions {
  readonly binding: MeetingLlmRuntimeBinding | null;
  readonly getAccessToken: () => Promise<string>;
  /** Test seam. Production uses the fixed Google Cloud provider. */
  readonly createProvider?: (options: GoogleCloudMeetingProviderOptions) => GoogleCloudMeetingProvider;
}

function invalidResponse(): KernelError {
  return new KernelError('SYNTHESIS_INVALID_RESPONSE', 'Meeting provider returned an invalid response', 502);
}

function unavailable(): KernelError {
  return new KernelError('RAG_PROVIDER_UNAVAILABLE', 'Meeting provider is unavailable', 503);
}

function mapProviderError(error: unknown): KernelError {
  if (!(error instanceof MeetingCloudProviderError)) return unavailable();
  if (error.code === 'LLM_REQUEST_ABORTED' || error.code === 'LLM_REQUEST_TIMEOUT') {
    return new KernelError('RAG_TIMEOUT', 'Meeting provider request timed out', 504);
  }
  if (error.code === 'LLM_PROVIDER_INVALID_RESPONSE' || error.code === 'LLM_INVALID_INPUT') {
    return invalidResponse();
  }
  if (error.code === 'LLM_PROVIDER_REJECTED' && error.httpStatus === 429) {
    return new KernelError('RAG_QUOTA_EXCEEDED', 'Meeting provider quota is temporarily unavailable', 429);
  }
  // This deliberately never maps to RAG_MODEL_UNAVAILABLE: the HTTP dispatcher
  // must not retry another model after a Cloud request fails.
  return unavailable();
}

/** Creates the synchronous legacy endpoint adapter only with this source-bound
 * Cloud qualification. A null binding performs no provider or token setup. */
export function createQualifiedMeetingSynthesisProvider(
  options: MeetingSynthesisCloudProviderOptions,
): MeetingSynthesisProvider | undefined {
  if (options.binding === null) return undefined;
  if (!hasQualifiedMeetingLlmBinding(options.binding) || typeof options.getAccessToken !== 'function') {
    throw new KernelError('CONFIG_INVALID', 'Meeting Cloud qualification is invalid', 503);
  }

  let cloud: GoogleCloudMeetingProvider;
  try {
    cloud = (options.createProvider ?? createGoogleCloudMeetingProvider)({ getAccessToken: options.getAccessToken });
  } catch {
    throw unavailable();
  }

  return {
    async generate(input, signal): Promise<string> {
      if (input.model !== FIXED_MODEL || input.responseMimeType !== 'application/json'
          || (input.temperature !== undefined && input.temperature !== 0.2)) {
        throw new KernelError('CONFIG_INVALID', 'Meeting synthesis model is fixed', 503);
      }
      if (signal?.aborted) throw new KernelError('RAG_TIMEOUT', 'Meeting provider request timed out', 504);

      let result;
      try {
        result = await cloud.generateJson({ prompt: input.prompt, maxOutputTokens: 8192, signal });
      } catch (error) {
        throw mapProviderError(error);
      }

      if (result.outcome !== 'generated' || typeof result.text !== 'string'
          || !result.text.trim() || Buffer.byteLength(result.text, 'utf8') > MAX_GENERATED_BYTES
          || Buffer.from(result.text, 'utf8').toString('utf8') !== result.text
          || result.modelVersion === null || !/^gemini-3\.5-flash(?:-\d{3})?$/u.test(result.modelVersion)
          || result.usage === null || result.usage.cachedTokens !== 0
          || meetingLlmCharge('compose', result.usage) === null) {
        throw invalidResponse();
      }
      if (signal?.aborted) throw new KernelError('RAG_TIMEOUT', 'Meeting provider request timed out', 504);
      return result.text;
    },
  };
}
