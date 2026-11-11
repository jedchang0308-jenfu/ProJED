import { useCallback, useEffect, useRef, useState } from 'react';
import { useWbsStore } from '../../store/useWbsStore';

const recoveryDelays = [350, 750, 1_500, 3_000, 6_000, 10_000];
const pendingMessage = '正在確認前一筆操作結果…';

export function useMindMapBatchRecovery(boardId: string) {
  const recoverNodeBatch = useWbsStore(state => state.recoverNodeBatch);
  const [message, setMessage] = useState<string | null>(null);
  const enqueueRef = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    setMessage(null);
    if (!boardId) return;

    const pending = new Map([[boardId, 0]]);
    let sequence = 0;
    let attempt = 0;
    let timer: number | undefined;
    let running = false;
    let queued = false;
    let active = true;

    const check = async () => {
      running = true;
      queued = false;
      const results = await Promise.all([...pending].map(async ([id, generation]) => {
        try {
          return { id, generation, outcome: await recoverNodeBatch(id) };
        } catch {
          return {
            id, generation,
            outcome: { status: 'indeterminate', error: pendingMessage, retryable: true } as const,
          };
        }
      }));
      running = false;
      if (!active) return;

      const unresolved = results.filter(({ id, generation, outcome }) => {
        if (pending.get(id) !== generation) return false;
        if (outcome?.status === 'indeterminate') return true;
        pending.delete(id);
        return false;
      });
      if (!pending.size) {
        setMessage(null);
        return;
      }
      if (queued) {
        schedule(recoveryDelays[0]);
        return;
      }
      setMessage(unresolved[0]?.outcome?.error || pendingMessage);
      if (attempt < recoveryDelays.length || unresolved.some(({ outcome }) => outcome?.retryable)) {
        schedule(recoveryDelays[Math.min(attempt++, recoveryDelays.length - 1)]);
      }
    };

    function schedule(delay: number) {
      window.clearTimeout(timer);
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      timer = window.setTimeout(() => void check(), delay);
    }

    const resume = () => {
      if (!pending.size) return;
      attempt = 0;
      if (running) queued = true;
      else schedule(0);
    };
    enqueueRef.current = id => {
      pending.set(id, ++sequence);
      attempt = 0;
      if (running) queued = true;
      else schedule(recoveryDelays[0]);
    };

    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    schedule(0);
    return () => {
      active = false;
      enqueueRef.current = () => {};
      window.clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [boardId, recoverNodeBatch]);

  const request = useCallback((id: string, error?: string) => {
    setMessage(error || pendingMessage);
    enqueueRef.current(id);
  }, []);

  return { message, request };
}
