import React from 'react';
import {
  KANBAN_LARGE_VIEW_ENABLED,
  normalizeKanbanViewSize,
  readKanbanViewSize,
  writeKanbanViewSize,
  type KanbanViewSize,
  type KanbanViewSizeChangeOrigin,
} from './kanbanViewSize';
import type { KanbanViewportAdapter } from './kanbanViewSizeAnchor';

interface KanbanViewSizeContextValue {
  viewSize: KanbanViewSize;
  requestViewSize: (next: KanbanViewSize, origin: KanbanViewSizeChangeOrigin) => boolean;
  registerViewportAdapter: (adapter: KanbanViewportAdapter | null) => void;
}

const KanbanViewSizeContext = React.createContext<KanbanViewSizeContextValue | null>(null);

interface KanbanViewSizeProviderProps {
  accountId: string | null | undefined;
  children: React.ReactNode;
}

export const KanbanViewSizeProvider: React.FC<KanbanViewSizeProviderProps> = ({ accountId, children }) => {
  const [viewSize, setViewSize] = React.useState<KanbanViewSize>(() => readKanbanViewSize(accountId));
  const viewSizeRef = React.useRef(viewSize);
  const accountRef = React.useRef(accountId);
  const adapterRef = React.useRef<KanbanViewportAdapter | null>(null);
  const transactionRef = React.useRef(0);
  React.useLayoutEffect(() => {
    viewSizeRef.current = viewSize;
  }, [viewSize]);

  React.useEffect(() => {
    accountRef.current = accountId;
    transactionRef.current += 1;
    adapterRef.current?.clear();
    adapterRef.current = null;
    const next = readKanbanViewSize(accountId);
    viewSizeRef.current = next;
    setViewSize(next);
  }, [accountId]);

  React.useEffect(() => () => {
    transactionRef.current += 1;
    adapterRef.current?.clear();
    adapterRef.current = null;
  }, []);

  const registerViewportAdapter = React.useCallback((adapter: KanbanViewportAdapter | null) => {
    adapterRef.current = adapter;
  }, []);

  const requestViewSize = React.useCallback((next: KanbanViewSize, origin: KanbanViewSizeChangeOrigin) => {
    const normalized = normalizeKanbanViewSize(next);
    if (!KANBAN_LARGE_VIEW_ENABLED || !accountRef.current || normalized === viewSizeRef.current) return false;
    const adapter = adapterRef.current;
    const anchor = adapter?.capture(origin) || null;
    const transaction = ++transactionRef.current;
    writeKanbanViewSize(accountRef.current, normalized);
    viewSizeRef.current = normalized;
    setViewSize(normalized);
    if (anchor && adapter) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (transaction !== transactionRef.current || adapterRef.current !== adapter) return;
          adapter.restore(anchor);
        });
      });
    }
    return true;
  }, []);

  const value = React.useMemo<KanbanViewSizeContextValue>(() => ({
    viewSize,
    requestViewSize,
    registerViewportAdapter,
  }), [registerViewportAdapter, requestViewSize, viewSize]);

  return <KanbanViewSizeContext.Provider value={value}>{children}</KanbanViewSizeContext.Provider>;
};

export const useKanbanViewSize = (): KanbanViewSizeContextValue => {
  const value = React.useContext(KanbanViewSizeContext);
  if (!value) throw new Error('useKanbanViewSize must be used within KanbanViewSizeProvider');
  return value;
};
