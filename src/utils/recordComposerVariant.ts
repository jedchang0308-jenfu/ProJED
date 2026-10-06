import type { EditableKnowledgeRecordType } from '../types';

export type RecordComposerVariant = 'live-meeting' | 'meeting-record' | 'work-log' | 'empty' | 'invalid';

type RecordComposerDraft = Pick<{ type: EditableKnowledgeRecordType }, 'type'> | null | undefined;

/**
 * Keeps the record sidebar's visible mode in one place. `isMeetingMode` means
 * an active capture session; it must not be used to classify an existing
 * meeting record opened from the records library.
 */
export const getRecordComposerVariant = (
  draft: RecordComposerDraft,
  isMeetingMode: boolean,
): RecordComposerVariant => {
  if (!draft) return isMeetingMode ? 'invalid' : 'empty';
  if (draft.type === 'meeting') return isMeetingMode ? 'live-meeting' : 'meeting-record';
  if (draft.type === 'work_log') return isMeetingMode ? 'invalid' : 'work-log';
  return 'invalid';
};
