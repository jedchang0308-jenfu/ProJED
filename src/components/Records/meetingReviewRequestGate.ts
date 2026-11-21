export type MeetingReviewScope = {
  accountId: string | null;
  authContextId: string | null;
  workspaceId: string | null;
  boardId: string | null;
  recordId: string | null;
  captureId: string | null;
  scopeGeneration: number;
};

export type MeetingReviewCallbackBinding = MeetingReviewScope & {
  draftSignature: string;
  requestGeneration: number;
  requestId: number;
};

export type CurrentMeetingReviewBinding = MeetingReviewScope & {
  draftSignature: string;
};

export type MeetingReviewRequestToken = {
  scopeKey: string;
  generation: number;
  requestId: number;
  slot: string;
};

export const meetingReviewScopeKey = (scope: MeetingReviewScope): string => JSON.stringify([
  scope.accountId,
  scope.authContextId,
  scope.workspaceId,
  scope.boardId,
  scope.recordId,
  scope.captureId,
  scope.scopeGeneration,
]);

export const matchesMeetingReviewCallbackBinding = (
  binding: MeetingReviewCallbackBinding,
  current: CurrentMeetingReviewBinding,
): boolean => binding.requestGeneration > 0
  && binding.requestId > 0
  && binding.draftSignature.length > 0
  && meetingReviewScopeKey(binding) === meetingReviewScopeKey(current)
  && binding.draftSignature === current.draftSignature;

export class MeetingReviewRequestGate {
  private currentScopeKey: string | null = null;
  private generation = 0;
  private nextRequestId = 0;
  private readonly activeRequests = new Map<string, number>();
  private disposed = false;

  reconcile(scope: MeetingReviewScope): boolean {
    if (this.disposed) return false;
    const nextKey = meetingReviewScopeKey(scope);
    if (nextKey === this.currentScopeKey) return false;
    this.currentScopeKey = nextKey;
    this.generation += 1;
    this.activeRequests.clear();
    return true;
  }

  begin(scope: MeetingReviewScope, slot: string): MeetingReviewRequestToken {
    this.reconcile(scope);
    const requestId = ++this.nextRequestId;
    const token = {
      scopeKey: meetingReviewScopeKey(scope),
      generation: this.generation,
      requestId,
      slot,
    };
    if (!this.disposed) this.activeRequests.set(slot, requestId);
    return token;
  }

  isCurrent(token: MeetingReviewRequestToken, scope: MeetingReviewScope): boolean {
    const key = meetingReviewScopeKey(scope);
    return !this.disposed
      && token.generation === this.generation
      && token.scopeKey === key
      && this.currentScopeKey === key
      && this.activeRequests.get(token.slot) === token.requestId;
  }

  cancelPending(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.activeRequests.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.activeRequests.clear();
  }
}
