export type AsyncRefreshRequestOptions = {
  immediate?: boolean;
};

export type CoalescedAsyncRefresh = {
  request: (options?: AsyncRefreshRequestOptions) => void;
  cancel: () => void;
};

export type CoalescedAsyncRefreshOptions = {
  delayMs?: number;
  onError?: (error: unknown) => void;
};

/**
 * Runs at most one refresh at a time and collapses a burst into one trailing run.
 * This keeps realtime event storms from creating overlapping reads whose results
 * could otherwise arrive out of order.
 */
export const createCoalescedAsyncRefresh = (
  refresh: () => Promise<void>,
  options: CoalescedAsyncRefreshOptions = {},
): CoalescedAsyncRefresh => {
  const delayMs = Math.max(0, options.delayMs ?? 40);
  let cancelled = false;
  let running = false;
  let rerunRequested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const run = async () => {
    if (cancelled || running) return;
    running = true;

    try {
      await refresh();
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
      if (rerunRequested && !cancelled) {
        rerunRequested = false;
        schedule(delayMs);
      }
    }
  };

  const schedule = (waitMs: number) => {
    if (cancelled) return;
    clearPendingTimer();

    if (waitMs === 0) {
      void run();
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      void run();
    }, waitMs);
  };

  return {
    request: ({ immediate = false }: AsyncRefreshRequestOptions = {}) => {
      if (cancelled) return;
      if (running) {
        rerunRequested = true;
        return;
      }
      schedule(immediate ? 0 : delayMs);
    },
    cancel: () => {
      cancelled = true;
      rerunRequested = false;
      clearPendingTimer();
    },
  };
};
