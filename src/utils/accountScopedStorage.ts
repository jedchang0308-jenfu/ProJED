export const getAccountScopedStorageKey = (
  baseKey: string,
  accountId: string | null | undefined,
): string | null => (
  accountId ? `${baseKey}:account:${encodeURIComponent(accountId)}` : null
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

export const writeStorageJson = (key: string | null, value: unknown): void => {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is best-effort only.
  }
};

export const removeStorageKey = (key: string | null): void => {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local persistence is best-effort only.
  }
};
