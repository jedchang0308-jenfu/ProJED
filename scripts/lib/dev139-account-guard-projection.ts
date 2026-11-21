export interface AuthUserSourceColumnContractRow extends Record<string, unknown> {
  readonly relation_kind: unknown;
  readonly column_name: unknown;
  readonly data_type: unknown;
  readonly schema_usage: unknown;
  readonly column_select: unknown;
}

export interface AccountGuardSourceRow extends Record<string, unknown> {
  readonly local_user_id: unknown;
  readonly updated_at: unknown;
}

export interface AccountGuardProofRow extends Record<string, unknown> {
  readonly local_user_id: unknown;
}

export interface AccountAuthorizationGuardRow extends Record<string, unknown> {
  readonly local_user_id: string;
  readonly active: true;
  readonly revision: string;
  readonly updated_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const REQUIRED_AUTH_USER_COLUMNS = new Map([
  ['id', 'uuid'],
  ['banned_until', 'timestamp with time zone'],
  ['deleted_at', 'timestamp with time zone'],
]);

function fail(code: string): never {
  throw Object.assign(new Error('Account guard source contract is invalid'), { code });
}

export function validateAuthUserSourceColumns(rows: readonly AuthUserSourceColumnContractRow[]): void {
  if (rows.length !== REQUIRED_AUTH_USER_COLUMNS.size
      || rows.some(row => row.relation_kind !== 'r' && row.relation_kind !== 'p')) {
    fail('SOURCE_GOOGLE_USER_SCHEMA_INVALID');
  }

  const columns = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.column_name !== 'string' || typeof row.data_type !== 'string'
        || columns.has(row.column_name)) {
      fail('SOURCE_GOOGLE_USER_SCHEMA_INVALID');
    }
    columns.set(row.column_name, row.data_type);
    if (row.schema_usage !== true || row.column_select !== true) {
      fail('SOURCE_GOOGLE_USER_PERMISSION_INVALID');
    }
  }
  for (const [name, expectedType] of REQUIRED_AUTH_USER_COLUMNS) {
    if (columns.get(name) !== expectedType) fail('SOURCE_GOOGLE_USER_SCHEMA_INVALID');
  }
}

export function projectAccountAuthorizationGuards(
  sourceRows: readonly AccountGuardSourceRow[],
  proofRows: readonly AccountGuardProofRow[],
): AccountAuthorizationGuardRow[] {
  const expectedIds = new Set<string>();
  for (const row of proofRows) {
    if (typeof row.local_user_id !== 'string' || !UUID_RE.test(row.local_user_id)) {
      fail('SOURCE_ACCOUNT_GUARD_INVALID');
    }
    expectedIds.add(row.local_user_id);
  }

  const actualIds = new Set<string>();
  const result: AccountAuthorizationGuardRow[] = [];
  for (const row of sourceRows) {
    if (typeof row.local_user_id !== 'string' || !UUID_RE.test(row.local_user_id)
        || typeof row.updated_at !== 'string' || row.updated_at.length === 0
        || actualIds.has(row.local_user_id)) {
      fail('SOURCE_ACCOUNT_GUARD_INVALID');
    }
    actualIds.add(row.local_user_id);
    result.push({ local_user_id: row.local_user_id, active: true, revision: '1', updated_at: row.updated_at });
  }

  if (actualIds.size !== expectedIds.size || [...expectedIds].some(id => !actualIds.has(id))) {
    fail('SOURCE_ACCOUNT_GUARD_INVALID');
  }
  return result.sort((a, b) => a.local_user_id.localeCompare(b.local_user_id));
}
