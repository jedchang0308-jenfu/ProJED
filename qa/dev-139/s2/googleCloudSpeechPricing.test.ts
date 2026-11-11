import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateGoogleCloudSpeechV1Cost,
  estimateSuccessfulGoogleCloudSpeechV1Charge,
  GOOGLE_CLOUD_SPEECH_V1_BILLING_GRANULARITY_SECONDS,
  GOOGLE_CLOUD_SPEECH_V1_FX_RESERVE_TWD_PER_USD,
  GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT,
  GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES,
  GOOGLE_CLOUD_SPEECH_V1_PRICE_VERSION,
  GOOGLE_CLOUD_SPEECH_V1_USD_MICROS_PER_MINUTE,
  parseGoogleCloudSpeechV1BilledTime,
} from '../../../server/googleCloudSpeechPricing.js';

test('estimates a successful silent response from exact PCM upper bound when billed time is omitted', () => {
  const estimate = estimateSuccessfulGoogleCloudSpeechV1Charge({ pcmSamples16k: 16_001n });

  assert.deepEqual(estimate, {
    microTwd: 32_000n,
    billedSeconds: 2n,
    source: 'validated_pcm_upper_bound',
    classification: 'budget_estimate_not_invoice',
  });
});

test('requires a positive exact PCM sample count within the provider chunk limit', () => {
  for (const pcmSamples16k of [0n, GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES + 1n]) {
    assert.throws(() => estimateSuccessfulGoogleCloudSpeechV1Charge({ pcmSamples16k }), /pricing input is invalid/u);
  }
});

test('uses validated provider billed time and rejects metadata above exact PCM upper bound', () => {
  const estimate = estimateSuccessfulGoogleCloudSpeechV1Charge({
    pcmSamples16k: 34_000n,
    billedTime: '2.5s',
  });

  assert.deepEqual(estimate, {
    microTwd: 48_000n,
    billedSeconds: 3n,
    source: 'provider_metadata',
    classification: 'budget_estimate_not_invoice',
  });
  assert.throws(() => estimateSuccessfulGoogleCloudSpeechV1Charge({
    pcmSamples16k: 34_000n,
    billedTime: '4s',
  }), /billed-time metadata is invalid/u);
  assert.throws(() => estimateSuccessfulGoogleCloudSpeechV1Charge({
    pcmSamples16k: 34_000n,
    billedTime: null as never,
  }), /billed-time metadata is invalid/u);
});

test('pins the V1 no-data-logging price, one-second request rounding, FX reserve, and no-free allowance', () => {
  assert.equal(GOOGLE_CLOUD_SPEECH_V1_PRICE_VERSION,
    'google-cloud-speech-v1-standard-no-data-logging-2026-10-29');
  assert.equal(GOOGLE_CLOUD_SPEECH_V1_USD_MICROS_PER_MINUTE, 24_000n);
  assert.equal(GOOGLE_CLOUD_SPEECH_V1_BILLING_GRANULARITY_SECONDS, 1n);
  assert.equal(GOOGLE_CLOUD_SPEECH_V1_FX_RESERVE_TWD_PER_USD, 40n);

  const estimate = estimateGoogleCloudSpeechV1Cost({ chunks: [{ pcmSamples16k: 16_000n }] });
  assert.equal(estimate.currencyUnit, 'microTWD');
  assert.equal(estimate.fxReserveTwdPerUsd, 40n);
  assert.equal(estimate.freeAllowanceApplied, false);
  assert.equal(estimate.estimatedCharge.status, 'MISSING_BILLING_METADATA');
  assert.equal(estimate.estimatedCharge.microTwd, null);
});

test('rounds every request separately and reserves at most two attempts per unit', () => {
  const estimate = estimateGoogleCloudSpeechV1Cost({
    chunks: [
      { pcmSamples16k: 1n },
      { pcmSamples16k: 16_000n },
      { pcmSamples16k: 16_001n },
      { pcmSamples16k: GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES },
    ],
  });

  assert.equal(GOOGLE_CLOUD_SPEECH_V1_MAX_ATTEMPTS_PER_UNIT, 2);
  assert.equal(estimate.reservation.maxAttemptsPerUnit, 2);
  assert.deepEqual(estimate.reservation.chunks.map(chunk => chunk.secondsPerAttempt), [1n, 1n, 2n, 50n]);
  assert.deepEqual(estimate.reservation.chunks.map(chunk => chunk.microTwd), [32_000n, 32_000n, 64_000n, 1_600_000n]);
  assert.equal(estimate.reservation.microTwd, 1_728_000n);
  assert.equal('retryAllowed' in estimate, false);
});

test('estimates usage only from complete V1 totalBilledTime metadata and rounds each attempt upward', () => {
  const estimate = estimateGoogleCloudSpeechV1Cost({
    chunks: [
      { pcmSamples16k: 1n, billedTimes: ['1.2s'] },
      { pcmSamples16k: 800_000n, billedTimes: ['0.000000001s', '1s'] },
    ],
  });

  assert.equal(estimate.estimatedCharge.status, 'COMPLETE_BILLING_METADATA');
  assert.equal(estimate.estimatedCharge.billedSeconds, 4n);
  assert.equal(estimate.estimatedCharge.microTwd, 64_000n);
  assert.equal('actualCharge' in estimate, false);
});

test('missing billing metadata never becomes a zero charge or retry decision', () => {
  for (const chunks of [
    [{ pcmSamples16k: 16_000n }],
    [{ pcmSamples16k: 16_000n, billedTimes: [] }],
    [{ pcmSamples16k: 16_000n, billedTimes: ['1s', null] }],
  ]) {
    const estimate = estimateGoogleCloudSpeechV1Cost({ chunks });
    assert.equal(estimate.estimatedCharge.status, 'MISSING_BILLING_METADATA');
    assert.equal(estimate.estimatedCharge.billedSeconds, null);
    assert.equal(estimate.estimatedCharge.microTwd, null);
    assert.equal('retryAllowed' in estimate, false);
  }
});

test('parses V1 Duration metadata with BigInt nanoseconds and rejects empty or over-bound values', () => {
  assert.equal(parseGoogleCloudSpeechV1BilledTime(undefined), null);
  assert.equal(parseGoogleCloudSpeechV1BilledTime(null), null);
  assert.equal(parseGoogleCloudSpeechV1BilledTime('0.000000001s'), 1n);
  assert.equal(parseGoogleCloudSpeechV1BilledTime('1.000000001s'), 2n);
  assert.equal(parseGoogleCloudSpeechV1BilledTime('50s'), 50n);

  for (const invalid of [0, true, '', '0s', '1', '01s', '1.1234567890s', '50.000000001s', '51s']) {
    assert.throws(() => parseGoogleCloudSpeechV1BilledTime(invalid), /billed-time metadata is invalid/u);
  }
});

test('rejects unsafe chunk shapes, invalid sample counts, excessive attempts, and unbounded chunk lists', () => {
  const invalidInputs: unknown[] = [
    null,
    {},
    { chunks: [] },
    { chunks: [{ pcmSamples16k: 0n }] },
    { chunks: [{ pcmSamples16k: 1 }] },
    { chunks: [{ pcmSamples16k: GOOGLE_CLOUD_SPEECH_V1_MAX_CHUNK_SAMPLES + 1n }] },
    { chunks: [{ pcmSamples16k: 1n, billedTimes: ['1s', '1s', '1s'] }] },
    { chunks: [{ pcmSamples16k: 1n, overrideRate: 0 }] },
    { chunks: [{ pcmSamples16k: 1n }], freeAllowanceMinutes: 60 },
    { chunks: Array.from({ length: 4097 }, () => ({ pcmSamples16k: 1n })) },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => estimateGoogleCloudSpeechV1Cost(input as never), /pricing input is invalid/u);
  }
});
