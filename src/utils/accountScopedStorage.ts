export const getAccountScopedStorageKey = (
  baseKey: string,
  accountId: string | null | undefined,
): string | null => (
  accountId ? `${baseKey}:account:${encodeURIComponent(accountId)}` : null
);

export const getAccountBoardScopedStorageKey = (
  baseKey: string,
  accountId: string | null | undefined,
  boardId: string | null | undefined,
): string | null => (
  accountId && boardId
    ? `${baseKey}:account:${encodeURIComponent(accountId)}:board:${encodeURIComponent(boardId)}`
    : null
);

export const readStorageJson = <T>(key: string | null): T | null => {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
};

export const writeStorageJson = (key: string | null, value: unknown): boolean => {
  if (typeof window === 'undefined' || !key) return false;
  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
    return window.localStorage.getItem(key) === serialized;
  } catch {
    // Local persistence is best-effort only.
    return false;
  }
};

export const removeStorageKey = (key: string | null): boolean => {
  if (typeof window === 'undefined' || !key) return false;
  try {
    window.localStorage.removeItem(key);
    return window.localStorage.getItem(key) === null;
  } catch {
    // Local persistence is best-effort only.
    return false;
  }
};
