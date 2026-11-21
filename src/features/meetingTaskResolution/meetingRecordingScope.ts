export type MeetingRecordingScope = {
  accountId: string | null;
  authContextId: string | null;
  tenantId: string | null;
  projectId: string | null;
  recordId: string | null;
  captureId: string | null;
};

export const meetingRecordingScopeKey = (scope: MeetingRecordingScope) => JSON.stringify([
  scope.accountId, scope.authContextId, scope.tenantId, scope.projectId, scope.recordId, scope.captureId,
]);

/** One operation owns this fence. Returning to an earlier scope cannot revive it. */
export class MeetingRecordingScopeFence {
  private expected: MeetingRecordingScope;
  private readonly controller = new AbortController();

  constructor(scope: MeetingRecordingScope, private readonly readCurrent: () => MeetingRecordingScope) {
    this.expected = { ...scope };
  }

  get signal() { return this.controller.signal; }

  isCurrent = (): boolean => {
    if (this.signal.aborted) return false;
    if (meetingRecordingScopeKey(this.expected) !== meetingRecordingScopeKey(this.readCurrent())) {
      this.invalidate();
      return false;
    }
    return true;
  };

  assertCurrent = (): void => {
    if (!this.isCurrent()) throw new Error('錄音的帳號或會議已變更；未確認的音訊保留於原帳號本機暫存。');
  };

  /** Only the synchronous publication of this begin receipt may replace capture scope. */
  publishCapture(captureId: string, publish: () => void): void {
    this.assertCurrent();
    this.expected = { ...this.expected, captureId };
    publish();
    this.assertCurrent();
  }

  invalidate(): void { this.controller.abort(); }
}
