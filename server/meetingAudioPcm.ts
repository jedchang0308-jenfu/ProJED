import { spawn, type SpawnOptionsWithStdioTuple } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { KernelError } from './errors.js';
import { MAX_AUDIO_SEGMENT_BYTES } from './meetingAudioInput.js';
import { requireAudioMime } from './meetingCaptureInput.js';

const FFMPEG_PATH = '/usr/bin/ffmpeg';
const MAX_SOURCE_DURATION_MS = 5 * 60 * 1000;
const MAX_DURATION_SLACK_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_STDERR_BYTES = 16 * 1024;
const SAMPLE_RATE_HZ = 16_000;
const BYTES_PER_SAMPLE = 2;
const MAX_CHUNK_SECONDS = 50;
const MAX_CHUNK_SAMPLES = SAMPLE_RATE_HZ * MAX_CHUNK_SECONDS;
const PCM_BYTES_PER_MS = SAMPLE_RATE_HZ * BYTES_PER_SAMPLE / 1000;

const FFMPEG_ARGS = [
  '-hide_banner', '-loglevel', 'error', '-nostdin',
  '-protocol_whitelist', 'pipe',
  '-i', 'pipe:0', '-map', '0:a:0', '-vn', '-sn', '-dn',
  '-threads', '1', '-ac', '1', '-ar', String(SAMPLE_RATE_HZ),
  '-sample_fmt', 's16', '-f', 's16le', 'pipe:1',
] as const;

type FfmpegSpawnOptions = SpawnOptionsWithStdioTuple<'pipe', 'pipe', 'pipe'> & {
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
  readonly windowsHide: true;
};

interface MeetingAudioPcmChild {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export type MeetingAudioPcmSpawnPort = (
  command: string,
  args: readonly string[],
  options: FfmpegSpawnOptions,
) => MeetingAudioPcmChild;

export interface MeetingAudioPcmDependencies {
  /** Test seam for child lifecycle behavior. Production always uses the fixed ffmpeg path and arguments. */
  readonly spawn?: MeetingAudioPcmSpawnPort;
  /** Bounded test seam; production defaults to 30 seconds and cannot exceed 60 seconds. */
  readonly timeoutMs?: number;
}

export interface DecodeMeetingAudioToPcmInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly expectedDurationMs: number;
  readonly signal?: AbortSignal;
}

export interface MeetingPcmChunk {
  readonly bytes: Uint8Array;
  readonly startSample: number;
  readonly endSample: number;
}

function invalidInput(): never {
  throw new KernelError('DOMAIN_DATA_INVALID', 'Meeting audio input is invalid', 400);
}

function decoderUnavailable(): KernelError {
  return new KernelError('MEETING_AUDIO_DECODER_UNAVAILABLE', 'Meeting audio decoder is unavailable', 503);
}

function decodeFailed(): KernelError {
  return new KernelError('MEETING_AUDIO_DECODE_FAILED', 'Meeting audio could not be decoded', 422);
}

function inputOutputLimit(): KernelError {
  return new KernelError('MEETING_AUDIO_DECODE_LIMIT', 'Meeting audio decode exceeded its duration limit', 413);
}

function decodeTimedOut(): KernelError {
  return new KernelError('MEETING_AUDIO_DECODE_TIMEOUT', 'Meeting audio decode timed out', 504);
}

function decodeAborted(): KernelError {
  return new KernelError('MEETING_AUDIO_DECODE_ABORTED', 'Meeting audio decode was cancelled', 503);
}

function spawnFfmpeg(command: string, args: readonly string[], options: FfmpegSpawnOptions): MeetingAudioPcmChild {
  return spawn(command, [...args], options);
}

function validateInput(input: DecodeMeetingAudioToPcmInput): {
  minOutputBytes: number;
  maxOutputBytes: number;
} {
  if (!input || typeof input !== 'object' || !(input.bytes instanceof Uint8Array)
      || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_AUDIO_SEGMENT_BYTES
      || !Number.isSafeInteger(input.expectedDurationMs) || input.expectedDurationMs < 1
      || input.expectedDurationMs > MAX_SOURCE_DURATION_MS + MAX_DURATION_SLACK_MS) invalidInput();
  requireAudioMime(input.mimeType);
  return {
    // Mono s16le at 16 kHz is exactly 32 bytes per millisecond. Two seconds
    // absorbs encoder/timer jitter without trimming source samples or allowing
    // a decoder to expand the bounded source beyond its declared duration.
    minOutputBytes: Math.max(0, input.expectedDurationMs - MAX_DURATION_SLACK_MS) * PCM_BYTES_PER_MS,
    maxOutputBytes: Math.ceil((input.expectedDurationMs + MAX_DURATION_SLACK_MS) * PCM_BYTES_PER_MS),
  };
}

/** Decode one verified-by-caller source segment entirely in memory. */
export async function decodeMeetingAudioToPcm(
  input: DecodeMeetingAudioToPcmInput,
  dependencies: MeetingAudioPcmDependencies = {},
): Promise<Uint8Array> {
  const { minOutputBytes, maxOutputBytes } = validateInput(input);
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new KernelError('CONFIG_INVALID', 'Meeting audio decoder timeout is invalid', 503);
  }
  if (input.signal?.aborted) throw decodeAborted();

  let child: MeetingAudioPcmChild;
  try {
    child = (dependencies.spawn ?? spawnFfmpeg)(FFMPEG_PATH, FFMPEG_ARGS, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    });
  } catch {
    throw decoderUnavailable();
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let stderrBytes = 0;
    let firstFailure: KernelError | undefined;
    let closed = false;
    const timeout = setTimeout(() => fail(decodeTimedOut()), timeoutMs);
    timeout.unref();

    const cleanup = () => {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', onAbort);
    };

    const stopOwnedChild = () => {
      try { child.kill('SIGKILL'); } catch { /* Preserve the first failure and wait for close. */ }
    };

    const fail = (error: KernelError) => {
      if (firstFailure) return;
      firstFailure = error;
      stopOwnedChild();
    };

    const onAbort = () => fail(decodeAborted());

    child.stdout.on('data', (value: Buffer | Uint8Array) => {
      if (firstFailure) return;
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      outputBytes += bytes.byteLength;
      if (outputBytes > maxOutputBytes) {
        fail(inputOutputLimit());
        return;
      }
      chunks.push(bytes);
    });

    // Drain diagnostics so ffmpeg cannot block on stderr. Never retain or expose them.
    child.stderr.on('data', (value: Buffer | Uint8Array) => {
      if (firstFailure) return;
      stderrBytes += value.byteLength;
      if (stderrBytes > MAX_STDERR_BYTES) fail(decodeFailed());
    });

    child.stdin.on('error', () => {
      // ffmpeg may close stdin early for malformed media; report only its safe exit result.
    });

    child.once('error', () => fail(decoderUnavailable()));
    child.once('close', (code) => {
      if (closed) return;
      closed = true;
      cleanup();
      if (firstFailure) {
        reject(firstFailure);
      } else if (code !== 0 || outputBytes === 0 || outputBytes % BYTES_PER_SAMPLE !== 0
          || outputBytes < minOutputBytes) {
        reject(decodeFailed());
      } else {
        resolve(Buffer.concat(chunks, outputBytes));
      }
    });

    input.signal?.addEventListener('abort', onAbort, { once: true });
    if (input.signal?.aborted) onAbort();
    try {
      child.stdin.end(input.bytes);
    } catch {
      fail(decoderUnavailable());
    }
  });
}

/** Split PCM on exact sample boundaries; no silence trimming or overlap is applied. */
export function splitMeetingPcm(pcm: Uint8Array): MeetingPcmChunk[] {
  if (!(pcm instanceof Uint8Array) || pcm.byteLength === 0 || pcm.byteLength % BYTES_PER_SAMPLE !== 0) {
    throw decodeFailed();
  }
  const totalSamples = pcm.byteLength / BYTES_PER_SAMPLE;
  const chunks: MeetingPcmChunk[] = [];
  for (let startSample = 0; startSample < totalSamples; startSample += MAX_CHUNK_SAMPLES) {
    const endSample = Math.min(startSample + MAX_CHUNK_SAMPLES, totalSamples);
    chunks.push({
      bytes: pcm.subarray(startSample * BYTES_PER_SAMPLE, endSample * BYTES_PER_SAMPLE),
      startSample,
      endSample,
    });
  }
  return chunks;
}
