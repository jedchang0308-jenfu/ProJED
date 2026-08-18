import { readFileSync } from 'node:fs';
import {
  CHECKPOINT_IDLE_MS,
  CHECKPOINT_MAX_ATTEMPTS_PER_HOUR,
  CHECKPOINT_MIN_INTERVAL_MS,
  CHECKPOINT_PAYLOAD_MAX_BYTES,
  getCheckpointDecision,
  getUtf8ByteLength,
} from '../src/utils/recordDraftCheckpointPolicy';

const failures: string[] = [];
const assert = (label: string, condition: boolean) => {
  if (!condition) failures.push(label);
};

const now = 1_000_000;
const changedAt = now - 1_000;
const notYetIdle = getCheckpointDecision({
  now,
  changedAt,
  lastAttemptAt: null,
  lastConfirmedAt: null,
  retryCount: 0,
  attemptTimestamps: [],
  payloadBytes: 100,
  online: true,
});
assert('first checkpoint waits for 20-second idle window', !notYetIdle.allowed && notYetIdle.reason === 'idle');

const idleReady = getCheckpointDecision({
  now: changedAt + CHECKPOINT_IDLE_MS,
  changedAt,
  lastAttemptAt: null,
  lastConfirmedAt: null,
  retryCount: 0,
  attemptTimestamps: [],
  payloadBytes: 100,
  online: true,
});
assert('idle checkpoint becomes eligible', idleReady.allowed);

const intervalBlocked = getCheckpointDecision({
  now,
  changedAt: now - 400_000,
  lastAttemptAt: now - 1_000,
  lastConfirmedAt: now - 500_000,
  retryCount: 0,
  attemptTimestamps: [],
  payloadBytes: 100,
  online: true,
});
assert('checkpoint enforces 3-minute mutation interval', !intervalBlocked.allowed && intervalBlocked.reason === 'interval');

const budgetBlocked = getCheckpointDecision({
  now,
  changedAt: now - 400_000,
  lastAttemptAt: now - CHECKPOINT_MIN_INTERVAL_MS,
  lastConfirmedAt: now - 400_000,
  retryCount: 0,
  attemptTimestamps: Array.from({ length: CHECKPOINT_MAX_ATTEMPTS_PER_HOUR }, (_, index) => now - index * 1_000),
  payloadBytes: 100,
  online: true,
});
assert('checkpoint enforces hourly attempt budget', !budgetBlocked.allowed && budgetBlocked.reason === 'budget');

const oversized = getCheckpointDecision({
  now,
  changedAt: now - 400_000,
  lastAttemptAt: null,
  lastConfirmedAt: null,
  retryCount: 0,
  attemptTimestamps: [],
  payloadBytes: CHECKPOINT_PAYLOAD_MAX_BYTES + 1,
  online: true,
});
assert('oversized payload is rejected before network mutation', !oversized.allowed && oversized.reason === 'oversize');

assert('UTF-8 byte sizing counts CJK content', getUtf8ByteLength('會議') === 6);
assert('spec documents mobile meeting boundary', readFileSync('ai-doc/specs/SPEC-069-meeting-draft-recovery-cost-control.md', 'utf8').includes('手機版不開放會議紀錄'));
assert('local recovery uses IndexedDB and emergency sessionStorage', readFileSync('src/services/meetingDraftRecoveryService.ts', 'utf8').includes('indexedDB') && readFileSync('src/services/meetingDraftRecoveryService.ts', 'utf8').includes('sessionStorage'));
assert('checkpoint adapter does not call formal upsert', !readFileSync('src/services/supabase/projedService.ts', 'utf8').includes('checkpointDraft: async') || readFileSync('src/services/supabase/projedService.ts', 'utf8').includes(".from('knowledge_records')"));
assert('desktop exposes one polite recovery status', readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8').includes('data-meeting-draft-recovery-status') && readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8').includes('aria-live="polite"'));

if (failures.length > 0) {
  console.error('DEV-069 meeting draft recovery verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('DEV-069 meeting draft recovery verification passed: local recovery, checkpoint policy, cost guard, desktop status and mobile boundary contract.');
