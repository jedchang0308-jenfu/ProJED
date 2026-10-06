import { mkdirSync, writeFileSync } from 'node:fs';
import {
  listMeetingProjectChangeDelta,
  projectMeetingProjectChangeImportMetadata,
  resolveMeetingProjectChangeImportCutoff,
  resolveMeetingProjectChangeImportWindow,
  type MeetingProjectChangeImportV1,
} from '../src/utils/meetingProjectChangeImport';
import type { ActivityEvent } from '../src/types';

const failures: string[] = [];
const assert = (label: string, condition: boolean) => {
  if (!condition) failures.push(label);
};

const batch = {
  batchId: 'batch-1',
  mode: 'default' as const,
  scope: 'board' as const,
  rangeStartedAt: 100,
  rangeEndedAt: 200,
  startBoundary: 'exclusive' as const,
  endBoundary: 'inclusive' as const,
  sourceEventIds: ['event-1'],
  evidenceFingerprint: 'event evidence',
  beforeContentSignature: 'before',
  importedAt: 201,
  representation: 'protected_block' as const,
};
const metadata: MeetingProjectChangeImportV1 = { schemaVersion: 1, boardId: 'board-A', batches: [batch] };
const records = [
  { id: 'meeting-old', type: 'meeting' as const, status: 'published' as const, boardId: 'board-A', updatedAt: 10, metadata: { meetingProjectChangeImport: { ...metadata, effectiveCutoffAt: 150 } } },
  { id: 'meeting-last', type: 'meeting' as const, status: 'published' as const, boardId: 'board-A', updatedAt: 20, metadata: { meetingProjectChangeImport: { ...metadata, effectiveCutoffAt: 200 } } },
  { id: 'wrong-board', type: 'meeting' as const, status: 'published' as const, boardId: 'board-B', updatedAt: 999, metadata: { meetingProjectChangeImport: { ...metadata, boardId: 'board-B', effectiveCutoffAt: 999 } } },
];
assert('latest published cutoff uses updatedAt then stable identity', resolveMeetingProjectChangeImportCutoff(records, 'board-A') === 200);
assert('first-use window uses draft occurredAt minus seven days', resolveMeetingProjectChangeImportWindow({ draftOccurredAt: 1_000, clickedAt: 2_000, records: [], boardId: 'board-A' }).rangeStartedAt === 1_000 - 7 * 24 * 60 * 60 * 1_000);
assert('custom gap is accepted without comparing prior cutoff', resolveMeetingProjectChangeImportWindow({ mode: 'custom', customStartedAt: 500, customEndedAt: 600, clickedAt: 1_000, records, boardId: 'board-A' }).rangeStartedAt === 500);
assert('custom rollback is accepted without warning', resolveMeetingProjectChangeImportWindow({ mode: 'custom', customStartedAt: 50, customEndedAt: 80, clickedAt: 1_000, records, boardId: 'board-A' }).rangeEndedAt === 80);

const event = (id: string): ActivityEvent => ({ id, workspaceId: 'workspace-A', boardId: 'board-A', eventType: 'task_status_changed', entityTable: 'tasks', payload: {}, createdAt: 150 });
assert('duplicate response IDs are reduced to one new event', listMeetingProjectChangeDelta([event('event-1'), event('event-2'), event('event-2')], ['event-1']).length === 1);
try {
  listMeetingProjectChangeDelta([{ ...event('missing'), id: undefined }, event('event-3')], []);
  failures.push('missing stable event ID must fail closed');
} catch {
  // expected typed failure
}
const projected = projectMeetingProjectChangeImportMetadata({ meetingProjectChangeImport: metadata }, 'board-A', 'published');
assert('published projection writes the last successful batch end', (projected?.meetingProjectChangeImport as { effectiveCutoffAt?: number } | undefined)?.effectiveCutoffAt === 200);

if (failures.length) {
  console.error('DEV-094 pure verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
mkdirSync('output/qa/dev-094', { recursive: true });
writeFileSync('output/qa/dev-094/pure-result.json', JSON.stringify({ devId: 'DEV-094', status: 'PASS', checks: 7 }, null, 2));
console.log('DEV-094 pure verification passed (7 checks).');
