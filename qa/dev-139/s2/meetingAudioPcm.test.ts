import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { PassThrough } from 'node:stream';

import { KernelError } from '../../../server/errors.js';
import { MAX_AUDIO_SEGMENT_BYTES } from '../../../server/meetingAudioInput.js';
import {
  decodeMeetingAudioToPcm,
  splitMeetingPcm,
  type MeetingAudioPcmSpawnPort,
} from '../../../server/meetingAudioPcm.js';

const AUDIO = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

interface FakeOutcome {
  readonly code?: number;
  readonly pcm?: Uint8Array;
  readonly stderr?: Uint8Array;
  readonly hang?: boolean;
}

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly killSignals: string[] = [];
  closed = false;
  private closeScheduled = false;

  kill(signal: NodeJS.Signals = 'SIGKILL'): boolean {
    this.killSignals.push(signal);
    this.close(null, signal);
    return true;
  }

  close(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.closed || this.closeScheduled) return;
    this.closeScheduled = true;
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => {
      this.closed = true;
      this.emit('close', code, signal);
    });
  }
}

function harness(outcome: FakeOutcome) {
  const calls: Array<{ command: string; args: readonly string[]; options: Parameters<MeetingAudioPcmSpawnPort>[2] }> = [];
  const children: FakeChild[] = [];
  const spawnPort: MeetingAudioPcmSpawnPort = (command, args, options) => {
    calls.push({ command, args: [...args], options });
    const child = new FakeChild();
    children.push(child);
    child.stdin.once('finish', () => {
      if (outcome.hang) return;
      if (outcome.pcm) child.stdout.write(outcome.pcm);
      if (outcome.stderr) child.stderr.write(outcome.stderr);
      child.close(outcome.code ?? 0);
    });
    return child;
  };
  return { spawnPort, calls, children };
}

function isKernelCode(code: string) {
  return (error: unknown): error is KernelError => error instanceof KernelError && error.code === code;
}

function input(overrides: Partial<Parameters<typeof decodeMeetingAudioToPcm>[0]> = {}) {
  return {
    bytes: AUDIO,
    mimeType: 'audio/webm; codecs=opus',
    expectedDurationMs: 10,
    ...overrides,
  };
}

test('decode uses fixed pipe-only ffmpeg arguments, a clean environment, and returns bounded PCM', async () => {
  const pcm = new Uint8Array(320);
  pcm[0] = 0x34;
  pcm[1] = 0x12;
  const fake = harness({ pcm });

  const decoded = await decodeMeetingAudioToPcm(input(), { spawn: fake.spawnPort });

  assert.deepEqual(Array.from(decoded), Array.from(pcm));
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]?.command, '/usr/bin/ffmpeg');
  assert.deepEqual(fake.calls[0]?.args, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'pipe',
    '-i', 'pipe:0', '-map', '0:a:0', '-vn', '-sn', '-dn', '-threads', '1',
    '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-f', 's16le', 'pipe:1',
  ]);
  assert.equal(fake.calls[0]?.options.shell, false);
  assert.deepEqual(fake.calls[0]?.options.stdio, ['pipe', 'pipe', 'pipe']);
  assert.deepEqual(fake.calls[0]?.options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
  assert.equal(fake.children[0]?.killSignals.length, 0);
});

test('splitMeetingPcm returns exact sample offsets and chunks of at most 50 seconds', () => {
  const totalSamples = 800_000 + 16;
  const pcm = new Uint8Array(totalSamples * 2);

  const chunks = splitMeetingPcm(pcm);

  assert.deepEqual(chunks.map(({ startSample, endSample, bytes }) => ({
    startSample, endSample, byteLength: bytes.byteLength,
  })), [
    { startSample: 0, endSample: 800_000, byteLength: 1_600_000 },
    { startSample: 800_000, endSample: 800_016, byteLength: 32 },
  ]);
  assert.equal(chunks[0]?.bytes.buffer, pcm.buffer);
  assert.throws(() => splitMeetingPcm(new Uint8Array()), isKernelCode('MEETING_AUDIO_DECODE_FAILED'));
  assert.throws(() => splitMeetingPcm(new Uint8Array([1])), isKernelCode('MEETING_AUDIO_DECODE_FAILED'));
});

test('rejects unsupported MIME, oversized input, and duration outside the source segment rule before spawn', async () => {
  const fake = harness({ pcm: new Uint8Array(2) });

  await assert.rejects(decodeMeetingAudioToPcm(input({ mimeType: 'text/plain' }), { spawn: fake.spawnPort }),
    isKernelCode('DOMAIN_DATA_INVALID'));
  await assert.rejects(decodeMeetingAudioToPcm(input({ bytes: new Uint8Array(MAX_AUDIO_SEGMENT_BYTES + 1) }), { spawn: fake.spawnPort }),
    isKernelCode('DOMAIN_DATA_INVALID'));
  await assert.rejects(decodeMeetingAudioToPcm(input({ expectedDurationMs: 302_001 }), { spawn: fake.spawnPort }),
    isKernelCode('DOMAIN_DATA_INVALID'));
  assert.equal(fake.calls.length, 0);
});

test('accepts output within two seconds of expected duration and metadata up to five minutes plus slack', async () => {
  for (const actualDurationMs of [8_000, 12_000]) {
    const pcm = new Uint8Array(actualDurationMs * 32);
    const fake = harness({ pcm });
    const decoded = await decodeMeetingAudioToPcm(input({ expectedDurationMs: 10_000 }), { spawn: fake.spawnPort });
    assert.equal(decoded.byteLength, pcm.byteLength);
  }

  const maxMetadataPcm = new Uint8Array(300_000 * 32);
  const maxMetadataFake = harness({ pcm: maxMetadataPcm });
  const decodedMaxMetadata = await decodeMeetingAudioToPcm(
    input({ expectedDurationMs: 302_000 }), { spawn: maxMetadataFake.spawnPort },
  );
  assert.equal(decodedMaxMetadata.byteLength, maxMetadataPcm.byteLength);
});

test('rejects output beyond positive slack and output more than two seconds shorter than expected', async () => {
  const tooLongFake = harness({ pcm: new Uint8Array(12_001 * 32) });
  await assert.rejects(
    decodeMeetingAudioToPcm(input({ expectedDurationMs: 10_000 }), { spawn: tooLongFake.spawnPort }),
    isKernelCode('MEETING_AUDIO_DECODE_LIMIT'),
  );
  assert.deepEqual(tooLongFake.children[0]?.killSignals, ['SIGKILL']);

  const tooShortFake = harness({ pcm: new Uint8Array(7_999 * 32) });
  await assert.rejects(
    decodeMeetingAudioToPcm(input({ expectedDurationMs: 10_000 }), { spawn: tooShortFake.spawnPort }),
    isKernelCode('MEETING_AUDIO_DECODE_FAILED'),
  );
  assert.equal(tooShortFake.children[0]?.killSignals.length, 0);
});

test('rejects oversized decoder output and kills only its owned child', async () => {
  const fake = harness({ pcm: new Uint8Array((1_000 + 2_000) * 32 + 2) });

  await assert.rejects(
    decodeMeetingAudioToPcm(input({ expectedDurationMs: 1_000 }), { spawn: fake.spawnPort }),
    isKernelCode('MEETING_AUDIO_DECODE_LIMIT'),
  );

  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.children[0]?.killSignals, ['SIGKILL']);
  assert.equal(fake.children[0]?.closed, true);
});

test('maps decoder failure without exposing stderr content', async () => {
  const privateDiagnostic = new TextEncoder().encode('sensitive decoder diagnostic that must not escape');
  const fake = harness({ code: 1, stderr: privateDiagnostic });

  await assert.rejects(decodeMeetingAudioToPcm(input(), { spawn: fake.spawnPort }), (error: unknown) => {
    assert.ok(error instanceof KernelError);
    assert.equal(error.code, 'MEETING_AUDIO_DECODE_FAILED');
    assert.equal(error.message.includes('sensitive'), false);
    assert.equal(error.message.includes('decoder diagnostic'), false);
    return true;
  });
  assert.equal(fake.children[0]?.killSignals.length, 0);
});

test('abort and timeout kill their own child and reject only after close', async () => {
  const abortFake = harness({ hang: true });
  const controller = new AbortController();
  const aborted = decodeMeetingAudioToPcm(input({ signal: controller.signal }), { spawn: abortFake.spawnPort });
  await new Promise<void>(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(aborted, isKernelCode('MEETING_AUDIO_DECODE_ABORTED'));
  assert.deepEqual(abortFake.children[0]?.killSignals, ['SIGKILL']);
  assert.equal(abortFake.children[0]?.closed, true);
  assert.equal(abortFake.children.length, 1);

  const timeoutFake = harness({ hang: true });
  await assert.rejects(
    decodeMeetingAudioToPcm(input(), { spawn: timeoutFake.spawnPort, timeoutMs: 5 }),
    isKernelCode('MEETING_AUDIO_DECODE_TIMEOUT'),
  );
  assert.deepEqual(timeoutFake.children[0]?.killSignals, ['SIGKILL']);
  assert.equal(timeoutFake.children[0]?.closed, true);
  assert.equal(timeoutFake.children.length, 1);
});
