import { installQuickDraftEditor } from '../../../src/features/quickTaskCapture/editor';
import { listQuickCaptureDrafts } from '../../../src/features/quickTaskCapture/outbox';

export const verifyEarlyInput = async () => {
  const input = document.querySelector<HTMLInputElement>('#early-input')!;
  const text = '在程式載入前開始記事';
  input.value = text;
  // No input event is replayed, and no blur/pagehide/flush may rescue the test.
  const saved = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('EARLY_INPUT_NOT_CHECKPOINTED')), 3000);
    installQuickDraftEditor(input, status => {
      if (status === 'local') { clearTimeout(timer); resolve(); }
    });
  });
  await saved;
  const records = await listQuickCaptureDrafts(null, `http:${location.origin}`);
  const record = records.find(row => row.title === text);
  if (!record || record.accountId !== null || record.lastErrorCode !== 'LOCAL_EDITING_DRAFT') {
    throw new Error('EARLY_INPUT_NOT_AN_UNBOUND_LOCAL_DRAFT');
  }
  return { savedWithoutAnotherEvent: true, unbound: true, state: record.state };
};
