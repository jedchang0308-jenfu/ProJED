const encoder = new TextEncoder();

const compareUtf8 = (left: string, right: string) => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
};

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error('Task collection canonical JSON only accepts finite safe integers.');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    Object.keys(record).sort(compareUtf8).forEach(key => {
      const item = record[key];
      if (item === undefined) throw new Error(`Undefined value is not allowed in canonical JSON: ${key}`);
      result[key] = canonicalize(item);
    });
    return result;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
};

export const canonicalizeTaskCollectionJson = (value: unknown): unknown => canonicalize(value);
export const canonicalJsonStringify = (value: unknown): string => JSON.stringify(canonicalize(value));

export const sha256Hex = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const canonicalJsonSha256 = async (value: unknown): Promise<string> => sha256Hex(canonicalJsonStringify(value));
