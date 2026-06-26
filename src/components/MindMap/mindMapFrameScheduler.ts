interface PendingWindowHandleRef {
  current: number | null;
}

export const clearPendingTimeoutRef = (timerRef: PendingWindowHandleRef) => {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
};

export const cancelPendingAnimationFrameRef = (frameRef: PendingWindowHandleRef) => {
  if (frameRef.current === null) return;
  window.cancelAnimationFrame(frameRef.current);
  frameRef.current = null;
};

export const scheduleCoalescedAnimationFrame = (
  frameRef: PendingWindowHandleRef,
  callback: () => void,
) => {
  if (frameRef.current !== null) return;
  frameRef.current = window.requestAnimationFrame(() => {
    frameRef.current = null;
    callback();
  });
};
