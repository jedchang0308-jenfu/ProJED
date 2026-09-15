const QUICK_WORKBENCH_QUERY = 'quick_workbench';
const QUICK_WORKBENCH_STORAGE = 'projed:quick-workbench-intent:v1';
const QUICK_WORKBENCH_TTL_MS = 15 * 60_000;

export const captureQuickWorkbenchIntent = (locationLike: Location = window.location) => {
  if (locationLike.search === '') return false;
  const params = new URLSearchParams(locationLike.search);
  if (params.get(QUICK_WORKBENCH_QUERY) !== '1') return false;
  try {
    sessionStorage.setItem(QUICK_WORKBENCH_STORAGE, JSON.stringify({ expiresAt: Date.now() + QUICK_WORKBENCH_TTL_MS }));
    const next = new URL(locationLike.href);
    next.searchParams.delete(QUICK_WORKBENCH_QUERY);
    history.replaceState(history.state, '', `${next.pathname}${next.search}${next.hash}`);
    return true;
  } catch {
    return false;
  }
};

export const consumeQuickWorkbenchIntent = () => {
  try {
    const raw = sessionStorage.getItem(QUICK_WORKBENCH_STORAGE);
    if (!raw) return false;
    sessionStorage.removeItem(QUICK_WORKBENCH_STORAGE);
    const parsed = JSON.parse(raw) as { expiresAt?: unknown };
    return typeof parsed.expiresAt === 'number' && parsed.expiresAt >= Date.now();
  } catch {
    return false;
  }
};

export const QUICK_WORKBENCH_INTENT_STORAGE = QUICK_WORKBENCH_STORAGE;
