/** Foreground transitions renew once. Polling and hidden tabs never extend a login. */
export function installForegroundSessionRenewal(
  renew: (signal: AbortSignal) => Promise<void>,
  events: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  visibility: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document,
): () => void {
  let pending = false;
  let stopped = false;
  let lastSuccess = -Infinity;
  const controller = new AbortController();
  const onForeground = () => {
    if (stopped || pending || visibility.visibilityState !== 'visible' || Date.now() - lastSuccess < 12 * 60 * 60_000) return;
    pending = true;
    void renew(controller.signal).then(() => { lastSuccess = Date.now(); }, () => {
      // Caller distinguishes revoked identity from transient network failures.
    }).finally(() => { pending = false; });
  };
  events.addEventListener('focus', onForeground);
  events.addEventListener('online', onForeground);
  visibility.addEventListener('visibilitychange', onForeground);
  onForeground();
  return () => {
    stopped = true;
    controller.abort();
    events.removeEventListener('focus', onForeground);
    events.removeEventListener('online', onForeground);
    visibility.removeEventListener('visibilitychange', onForeground);
  };
}
