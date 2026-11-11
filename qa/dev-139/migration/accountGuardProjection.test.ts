import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectAccountAuthorizationGuards,
  validateAuthUserSourceColumns,
  type AccountGuardProofRow,
  type AccountGuardSourceRow,
  type AuthUserSourceColumnContractRow,
} from '../../../scripts/lib/dev139-account-guard-projection.js';

const owner = '11111111-1111-4111-8111-111111111111';
const guest = '22222222-2222-4222-8222-222222222222';
const authUserColumns = (): AuthUserSourceColumnContractRow[] => [
  { relation_kind: 'r', column_name: 'id', data_type: 'uuid', schema_usage: true, column_select: true },
  { relation_kind: 'r', column_name: 'banned_until', data_type: 'timestamp with time zone', schema_usage: true, column_select: true },
  { relation_kind: 'r', column_name: 'deleted_at', data_type: 'timestamp with time zone', schema_usage: true, column_select: true },
];

const account = (local_user_id: string, overrides: Partial<AccountGuardSourceRow> = {}): AccountGuardSourceRow => ({
  local_user_id,
  updated_at: '2026-01-02T00:00:00+00:00',
  ...overrides,
});

function assertCode(code: string, action: () => unknown): void {
  assert.throws(action, error => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code));
}

test('auth.users schema and reader grants must cover only the required typed columns', () => {
  validateAuthUserSourceColumns(authUserColumns());
  assertCode('SOURCE_GOOGLE_USER_SCHEMA_INVALID', () => validateAuthUserSourceColumns([
    ...authUserColumns().slice(0, 2),
    { ...authUserColumns()[2]!, data_type: 'timestamp without time zone' },
  ]));
  assertCode('SOURCE_GOOGLE_USER_SCHEMA_INVALID', () => validateAuthUserSourceColumns([
    ...authUserColumns().slice(0, 2),
  ]));
  assertCode('SOURCE_GOOGLE_USER_PERMISSION_INVALID', () => validateAuthUserSourceColumns([
    ...authUserColumns().slice(0, 2),
    { ...authUserColumns()[2]!, column_select: false },
  ]));
  assertCode('SOURCE_GOOGLE_USER_PERMISSION_INVALID', () => validateAuthUserSourceColumns([
    ...authUserColumns().slice(0, 2),
    { ...authUserColumns()[2]!, schema_usage: false },
  ]));
});

test('one active revision-one guard is projected for each Google proof and no other profile', () => {
  const guards = projectAccountAuthorizationGuards(
    [account(owner)],
    [{ local_user_id: owner } satisfies AccountGuardProofRow],
  );
  assert.deepEqual(guards, [{
    local_user_id: owner,
    active: true,
    revision: '1',
    updated_at: '2026-01-02T00:00:00+00:00',
  }]);
  assert.deepEqual(projectAccountAuthorizationGuards([], []), []);
});

test('guard projection rejects missing, extra, or malformed Google proof coverage and deduplicates same-user proofs', () => {
  assertCode('SOURCE_ACCOUNT_GUARD_INVALID', () => projectAccountAuthorizationGuards(
    [], [{ local_user_id: owner }],
  ));
  assertCode('SOURCE_ACCOUNT_GUARD_INVALID', () => projectAccountAuthorizationGuards(
    [account(owner)], [],
  ));
  assertCode('SOURCE_ACCOUNT_GUARD_INVALID', () => projectAccountAuthorizationGuards(
    [account(owner), account(owner)], [{ local_user_id: owner }],
  ));
  assert.deepEqual(projectAccountAuthorizationGuards(
    [account(owner)], [{ local_user_id: owner }, { local_user_id: owner }],
  ), [{ local_user_id: owner, active: true, revision: '1', updated_at: '2026-01-02T00:00:00+00:00' }]);
  assertCode('SOURCE_ACCOUNT_GUARD_INVALID', () => projectAccountAuthorizationGuards(
    [account(guest)], [{ local_user_id: owner }],
  ));
  assertCode('SOURCE_ACCOUNT_GUARD_INVALID', () => projectAccountAuthorizationGuards(
    [account(owner, { updated_at: null })], [{ local_user_id: owner }],
  ));
  assertCode('SOURCE_ACCOUNT_GUARD_INVALID', () => projectAccountAuthorizationGuards(
    [account(owner)], [{ local_user_id: 'not-a-uuid' }],
  ));
});
