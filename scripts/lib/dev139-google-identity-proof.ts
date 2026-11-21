export interface GoogleIdentityColumnContractRow extends Record<string, unknown> {
  readonly relation_kind: unknown;
  readonly column_name: unknown;
  readonly data_type: unknown;
}

export interface GoogleIdentitySourceRow {
  readonly local_user_id: unknown;
  readonly google_subject: unknown;
  readonly identity_data_type: unknown;
  readonly identity_data_has_sub: unknown;
  readonly identity_data_sub_type: unknown;
  readonly identity_data_sub: unknown;
}

export interface GoogleIdentityProofRow extends Record<string, unknown> {
  readonly google_subject: string;
  readonly local_user_id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/u;
const REQUIRED_COLUMNS = new Map([
  ['provider', 'text'],
  ['user_id', 'uuid'],
  ['provider_id', 'text'],
  ['identity_data', 'jsonb'],
]);

function fail(code: string): never {
  throw Object.assign(new Error('Google identity source contract is invalid'), { code });
}

function canonicalSubject(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= 255 && value.trim() === value && !CONTROL_RE.test(value);
}

export function validateGoogleIdentitySourceColumns(rows: readonly GoogleIdentityColumnContractRow[]): void {
  if (rows.length === 0 || rows.some(row => row.relation_kind !== 'r' && row.relation_kind !== 'p')) {
    fail('SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID');
  }

  const columns = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.column_name !== 'string' || typeof row.data_type !== 'string') {
      fail('SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID');
    }
    columns.set(row.column_name, row.data_type);
  }
  for (const [name, expectedType] of REQUIRED_COLUMNS) {
    if (columns.get(name) !== expectedType) fail('SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID');
  }
}

export function projectGoogleIdentityProofs(
  rows: readonly GoogleIdentitySourceRow[],
  profileIds: ReadonlySet<string>,
): GoogleIdentityProofRow[] {
  const result: GoogleIdentityProofRow[] = [];
  const localUserBySubject = new Map<string, string>();

  for (const row of rows) {
    if (typeof row.local_user_id !== 'string' || !UUID_RE.test(row.local_user_id)
        || !canonicalSubject(row.google_subject)
        || row.identity_data_type !== 'object'
        || typeof row.identity_data_has_sub !== 'boolean') {
      fail('SOURCE_GOOGLE_IDENTITY_INVALID');
    }
    if (row.identity_data_has_sub) {
      if (row.identity_data_sub_type !== 'string'
          || typeof row.identity_data_sub !== 'string'
          || row.identity_data_sub !== row.google_subject) {
        fail('SOURCE_GOOGLE_IDENTITY_SUB_MISMATCH');
      }
    } else if (row.identity_data_sub_type !== null || row.identity_data_sub !== null) {
      fail('SOURCE_GOOGLE_IDENTITY_INVALID');
    }
    if (!profileIds.has(row.local_user_id)) fail('SOURCE_GOOGLE_IDENTITY_ORPHAN');

    if (localUserBySubject.has(row.google_subject)) {
      fail('SOURCE_GOOGLE_IDENTITY_AMBIGUOUS');
    }
    localUserBySubject.set(row.google_subject, row.local_user_id);
    result.push({ google_subject: row.google_subject, local_user_id: row.local_user_id });
  }

  return result.sort((a, b) => a.google_subject.localeCompare(b.google_subject));
}
