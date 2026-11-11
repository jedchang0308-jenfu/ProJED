/**
 * Conservative pricing reservation for single-channel Cloud Speech-to-Text V1.
 * Official V1 pricing lists Standard without-data-logging at $0.024/min and
 * rounds each request up to one-second increments:
 * https://cloud.google.com/speech-to-text/pricing
 * V1 release notes record the change from 15-second rounding to one second:
 * https://cloud.google.com/speech-to-text/docs/release-notes
 *
 * This is a budget estimate, not an invoice calculator or a retry policy. The
 * two-attempt multiplier reserves an upper bound only; an unknown request
 * outcome must be resolved by its caller and is never made retryable here.
 */

export const GOOGLE_CLOUD_SPEECH_V1_PRICE_VERSION = 'google-cloud-speech-v1-standard-no-data-logging-2026-10-29' as const;
export const GOOGLE_CLOUD_SPEECH_V1_USD_MICROS_PER_MINUTE = 24_000n;
export const GOOGLE_CLOUD_SPEECH_V1_FX_RESERVE_TWD_PER_USD = 40n;
export const GOOGLE_CLOUD_SPEECH_V1_BILLING_GRANULARITY_SECONDS = 1n;
export const GOOGLE_CLOUD_SPEECH_V1_SAMPLE_RATE_HZ = 16_000n;
export const GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SECONDS = 50n;
export const GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES =
  GOOGLE_CLOUD_SPEECH_V1_SAMPLE_RATE_HZ * GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SECONDS;
export const GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT = 2 as const;

const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const MAX_CHUNKS = 4096;
const MICRO_TWD_PER_BILLED_SECOND =
  GOOGLE_CLOUD_SPEECH_V1_USD_MICROS_PER_MINUTE
  * GOOGLE_CLOUD_SPEECH_V1_FX_RESERVE_TWD_PER_USD / 60n;

export interface GoogleCloudSpeechV1PricingChunk {
  /** Number of mono PCM samples at 16 kHz for this single provider request. */
  readonly pcmSamples16k: bigint;
  /** Raw totalBilledTime values, one per observed provider request attempt. */
  readonly billedTimes?: readonly (string | null | undefined)[];
}

export interface GoogleCloudSpeechV1PricingInput {
  readonly chunks: readonly GoogleCloudSpeechV1PricingChunk[];
}

export interface GoogleCloudSpeechV1PricingEstimate {
  readonly priceVersion: typeof GOOGLE_CLOUD_SPEECH_V1_PRICE_VERSION;
  readonly currencyUnit: 'microTWD';
  /** Budget conversion estimate, not an exchange rate or an invoiced rate. */
  readonly fxReserveTwdPerUsd: typeof GOOGLE_CLOUD_SPEECH_V1_FX_RESERVE_TWD_PER_USD;
  readonly billingGranularitySeconds: typeof GOOGLE_CLOUD_SPEECH_V1_BILLING_GRANULARITY_SECONDS;
  readonly freeAllowanceApplied: false;
  readonly reservation: {
    readonly microTwd: bigint;
    /** A conservative cost ceiling per chunk; this value grants no retry. */
    readonly maxAttemptsPerUnit: typeof GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT;
    readonly chunks: readonly {
      readonly pcmSamples16k: bigint;
      readonly secondsPerAttempt: bigint;
      readonly microTwd: bigint;
    }[];
  };
  readonly estimatedCharge: {
    readonly status: 'COMPLETE_BILLING_METADATA' | 'MISSING_BILLING_METADATA';
    /** Null means usage metadata is incomplete; it never means a zero charge. */
    readonly microTwd: bigint | null;
    readonly billedSeconds: bigint | null;
  };
}

export interface SuccessfulGoogleCloudSpeechV1ChargeInput {
  /** Exact mono 16 kHz PCM samples sent in one successful V1 Recognize request. */
  readonly pcmSamples16k: bigint;
  /** Optional totalBilledTime from that successful response. */
  readonly billedTime?: string;
}

export interface SuccessfulGoogleCloudSpeechV1ChargeEstimate {
  readonly microTwd: bigint;
  readonly billedSeconds: bigint;
  readonly source: 'provider_metadata' | 'validated_pcm_upper_bound';
  readonly classification: 'budget_estimate_not_invoice';
}

function invalidInput(): never {
  throw new TypeError('Cloud Speech V1 pricing input is invalid');
}

function invalidBilledTime(): never {
  throw new TypeError('Cloud Speech V1 billed-time metadata is invalid');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

/**
 * Parse a V1 response totalBilledTime Duration and round it to V1's billed
 * one-second increments. Missing metadata stays null; it is not treated as
 * zero usage. V1 pricing and rounding differ from V2.
 */
export function parseGoogleCloudSpeechV1BilledTime(value: unknown): bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalidBilledTime();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?s$/u.exec(value);
  if (!match || match[1]!.length > 2) invalidBilledTime();

  const wholeSeconds = BigInt(match[1]!);
  const fractionalNanos = BigInt((match[2] ?? '').padEnd(9, '0') || '0');
  const totalNanos = wholeSeconds * NANOSECONDS_PER_SECOND + fractionalNanos;
  if (totalNanos <= 0n || totalNanos > GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SECONDS * NANOSECONDS_PER_SECOND) {
    invalidBilledTime();
  }
  return ceilDiv(totalNanos, NANOSECONDS_PER_SECOND);
}

/**
 * Estimate the budget charge for one successful V1 Recognize result. Missing
 * totalBilledTime falls back to the upper bound from the exact mono PCM samples
 * sent in that request; callers must not use this for an unknown/failed request.
 */
export function estimateSuccessfulGoogleCloudSpeechV1Charge(
  input: SuccessfulGoogleCloudSpeechV1ChargeInput,
): SuccessfulGoogleCloudSpeechV1ChargeEstimate {
  if (!isRecord(input) || !hasOnlyKeys(input, ['pcmSamples16k', 'billedTime'])
      || typeof input.pcmSamples16k !== 'bigint' || input.pcmSamples16k < 1n
      || input.pcmSamples16k > GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES) invalidInput();

  const pcmUpperBoundSeconds = ceilDiv(input.pcmSamples16k, GOOGLE_CLOUD_SPEECH_V1_SAMPLE_RATE_HZ);
  const hasBilledTime = Object.hasOwn(input, 'billedTime') && input.billedTime !== undefined;
  if (hasBilledTime && typeof input.billedTime !== 'string') invalidBilledTime();
  const providerBilledSeconds = hasBilledTime
    ? parseGoogleCloudSpeechV1BilledTime(input.billedTime)
    : null;
  if (providerBilledSeconds !== null && providerBilledSeconds > pcmUpperBoundSeconds) invalidBilledTime();

  const billedSeconds = providerBilledSeconds ?? pcmUpperBoundSeconds;
  return {
    microTwd: billedSeconds * MICRO_TWD_PER_BILLED_SECOND,
    billedSeconds,
    source: providerBilledSeconds === null ? 'validated_pcm_upper_bound' : 'provider_metadata',
    classification: 'budget_estimate_not_invoice',
  };
}

function validateInput(input: GoogleCloudSpeechV1PricingInput): GoogleCloudSpeechV1PricingChunk[] {
  if (!isRecord(input) || !hasOnlyKeys(input, ['chunks']) || !Array.isArray(input.chunks)
      || input.chunks.length < 1 || input.chunks.length > MAX_CHUNKS) invalidInput();

  const chunks: GoogleCloudSpeechV1PricingChunk[] = [];
  for (const value of input.chunks) {
    if (!isRecord(value) || !hasOnlyKeys(value, ['pcmSamples16k', 'billedTimes'])
        || typeof value.pcmSamples16k !== 'bigint' || value.pcmSamples16k < 1n
        || value.pcmSamples16k > GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES) invalidInput();

    if (value.billedTimes !== undefined
        && (!Array.isArray(value.billedTimes)
          || value.billedTimes.length > GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT)) invalidInput();

    chunks.push(value as unknown as GoogleCloudSpeechV1PricingChunk);
  }
  return chunks;
}

/**
 * Estimate one reservation and, when every observed request includes billing
 * metadata, an estimated charge. Every chunk is priced independently because
 * V1 rounds each request up to a whole second. No free minutes are deducted.
 */
export function estimateGoogleCloudSpeechV1Cost(
  input: GoogleCloudSpeechV1PricingInput,
): GoogleCloudSpeechV1PricingEstimate {
  const chunks = validateInput(input);
  let reservationMicroTwd = 0n;
  let observedBilledSeconds = 0n;
  let billingMetadataComplete = true;
  const reservationChunks = chunks.map(chunk => {
    const secondsPerAttempt = ceilDiv(chunk.pcmSamples16k, GOOGLE_CLOUD_SPEECH_V1_SAMPLE_RATE_HZ);
    const microTwd = secondsPerAttempt
      * MICRO_TWD_PER_BILLED_SECOND
      * BigInt(GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT);
    reservationMicroTwd += microTwd;

    if (!chunk.billedTimes || chunk.billedTimes.length === 0) {
      billingMetadataComplete = false;
    } else {
      for (const billedTime of chunk.billedTimes) {
        const billedSeconds = parseGoogleCloudSpeechV1BilledTime(billedTime);
        if (billedSeconds === null) billingMetadataComplete = false;
        else observedBilledSeconds += billedSeconds;
      }
    }
    return { pcmSamples16k: chunk.pcmSamples16k, secondsPerAttempt, microTwd };
  });

  return {
    priceVersion: GOOGLE_CLOUD_SPEECH_V1_PRICE_VERSION,
    currencyUnit: 'microTWD',
    fxReserveTwdPerUsd: GOOGLE_CLOUD_SPEECH_V1_FX_RESERVE_TWD_PER_USD,
    billingGranularitySeconds: GOOGLE_CLOUD_SPEECH_V1_BILLING_GRANULARITY_SECONDS,
    freeAllowanceApplied: false,
    reservation: {
      microTwd: reservationMicroTwd,
      maxAttemptsPerUnit: GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT,
      chunks: reservationChunks,
    },
    estimatedCharge: billingMetadataComplete
      ? {
        status: 'COMPLETE_BILLING_METADATA',
        billedSeconds: observedBilledSeconds,
        microTwd: observedBilledSeconds * MICRO_TWD_PER_BILLED_SECOND,
      }
      : {
        status: 'MISSING_BILLING_METADATA',
        billedSeconds: null,
        microTwd: null,
      },
  };
}
